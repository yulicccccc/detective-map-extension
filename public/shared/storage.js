// shared/storage.js - Unified chrome.storage.local & Cloudflare WebSocket Sync Layer

const STORAGE_KEYS = {
  QUOTES: 'detective_quotes',
  STROKES: 'detective_strokes',
  VIEWPORT: 'detective_viewport',
  CONFIG: 'detective_config',
  DEVICE_TOKEN: 'detective_device_token',
  PAIRING_CODE: 'detective_pairing_code'
};

const DEFAULT_VIEWPORT = {
  panX: 100,
  panY: 100,
  zoom: 1.0
};

const CLOUDFLARE_BASE_URL = 'https://detectivemap.qchen9108.workers.dev';
const CLOUDFLARE_WS_URL = 'wss://detectivemap.qchen9108.workers.dev/api/ws';

// Runtime environment detection
const isChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const hasLocalStorage = typeof localStorage !== 'undefined';
const memStore = {};
const changeListeners = [];

function triggerChange(changes) {
  changeListeners.forEach(cb => {
    try { cb(changes); } catch {}
  });
}

// --- Cloudflare Durable Object WebSocket Realtime Sync Engine ---
class CloudflareSyncEngine {
  constructor() {
    this.ws = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.statusListeners = [];
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  async init() {
    if (typeof window === 'undefined') return;

    const token = await this.getToken();
    if (!token) {
      this.setStatus('unpaired');
      return;
    }

    this.connect(token);
  }

  async getToken() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.DEVICE_TOKEN, STORAGE_KEYS.PAIRING_CODE]);
      return res[STORAGE_KEYS.DEVICE_TOKEN] || res[STORAGE_KEYS.PAIRING_CODE] || 'MAP-2026';
    } else if (hasLocalStorage) {
      return localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN) || localStorage.getItem(STORAGE_KEYS.PAIRING_CODE);
    }
    return memStore[STORAGE_KEYS.DEVICE_TOKEN] || null;
  }

  async pairDevice(pairingCode) {
    const code = (pairingCode || '').trim().toUpperCase();
    try {
      const res = await fetch(`${CLOUDFLARE_BASE_URL}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: code })
      });
      const data = await res.json();
      if (data.success && data.token) {
        if (isChromeStorage) {
          await chrome.storage.local.set({
            [STORAGE_KEYS.DEVICE_TOKEN]: data.token,
            [STORAGE_KEYS.PAIRING_CODE]: code
          });
        }
        if (hasLocalStorage) {
          localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, data.token);
          localStorage.setItem(STORAGE_KEYS.PAIRING_CODE, code);
        }
        memStore[STORAGE_KEYS.DEVICE_TOKEN] = data.token;

        this.connect(data.token);
        return { success: true, token: data.token };
      }
      return { success: false, error: data.error || 'Pairing failed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  connect(token) {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.setStatus('connecting');
    try {
      const wsUrl = `${CLOUDFLARE_WS_URL}?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.addEventListener('open', () => {
        console.log('[Cloud Sync] WebSocket connected to Cloudflare Durable Object.');
        this.setStatus('connected');

        // Setup keepalive ping
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 25000);
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingMessage(msg);
        } catch (e) {
          console.warn('[Cloud Sync] Message parse error:', e);
        }
      });

      this.ws.addEventListener('close', () => {
        this.setStatus('disconnected');
        clearInterval(this.pingTimer);
        this.scheduleReconnect();
      });

      this.ws.addEventListener('error', () => {
        this.setStatus('disconnected');
      });
    } catch (err) {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      const token = await this.getToken();
      if (token) this.connect(token);
    }, 4000);
  }

  handleIncomingMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'INIT_STATE') {
      if (Array.isArray(msg.quotes)) {
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(msg.quotes));
        if (isChromeStorage) chrome.storage.local.set({ [STORAGE_KEYS.QUOTES]: msg.quotes });
        triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: msg.quotes } });
      }
      if (Array.isArray(msg.strokes)) {
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(msg.strokes));
        if (isChromeStorage) chrome.storage.local.set({ [STORAGE_KEYS.STROKES]: msg.strokes });
        triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: msg.strokes } });
      }
      if (msg.viewport) {
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.VIEWPORT, JSON.stringify(msg.viewport));
        if (isChromeStorage) chrome.storage.local.set({ [STORAGE_KEYS.VIEWPORT]: msg.viewport });
      }
    } else if (msg.type === 'QUOTE_ADDED' && msg.quote) {
      Storage.getQuotes().then(existing => {
        const updated = [...existing.filter(q => q.id !== msg.quote.id), msg.quote];
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(updated));
        if (isChromeStorage) chrome.storage.local.set({ [STORAGE_KEYS.QUOTES]: updated });
        triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: updated } });
      });
    } else if (msg.type === 'QUOTES_UPDATED' && Array.isArray(msg.quotes)) {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(msg.quotes));
      if (isChromeStorage) chrome.storage.local.set({ [STORAGE_KEYS.QUOTES]: msg.quotes });
      triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: msg.quotes } });
    } else if (msg.type === 'STROKE_ADDED' && msg.stroke) {
      Storage.getStrokes().then(existing => {
        const updated = [...existing.filter(s => s.id !== msg.stroke.id), msg.stroke];
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(updated));
        if (isChromeStorage) chrome.storage.local.set({ [STORAGE_KEYS.STROKES]: updated });
        triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: updated } });
      });
    } else if (msg.type === 'STROKES_UPDATED' && Array.isArray(msg.strokes)) {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(msg.strokes));
      if (isChromeStorage) chrome.storage.local.set({ [STORAGE_KEYS.STROKES]: msg.strokes });
      triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: msg.strokes } });
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e) {}
    }
  }

  setStatus(status) {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  onStatusChange(cb) {
    this.statusListeners.push(cb);
    cb(this.status);
  }
}

const cloudSync = new CloudflareSyncEngine();

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    cloudSync.init();
  });
}

const Storage = {
  cloudSync,

  async getQuotes() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.QUOTES]);
      return res[STORAGE_KEYS.QUOTES] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.QUOTES);
      return data ? JSON.parse(data) : [];
    } else {
      return memStore[STORAGE_KEYS.QUOTES] || [];
    }
  },

  async saveQuotes(quotes) {
    if (isChromeStorage) {
      await chrome.storage.local.set({ [STORAGE_KEYS.QUOTES]: quotes });
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(quotes));
    } else {
      memStore[STORAGE_KEYS.QUOTES] = quotes;
    }

    cloudSync.send({ type: 'UPDATE_QUOTES', quotes });
    return quotes;
  },

  async addQuote(quoteData) {
    const quotes = await this.getQuotes();
    const newQuote = {
      id: quoteData.id || `quote-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      type: 'quote',
      text: quoteData.text || '',
      sourceTitle: quoteData.sourceTitle || 'Web Capture',
      sourceUrl: quoteData.sourceUrl || '',
      capturedAt: quoteData.capturedAt || new Date().toISOString(),
      x: typeof quoteData.x === 'number' ? quoteData.x : 100 + (quotes.length % 5) * 40,
      y: typeof quoteData.y === 'number' ? quoteData.y : 100 + (quotes.length % 5) * 40,
      width: quoteData.width || 320,
      height: quoteData.height || 'auto',
      color: quoteData.color || 'default'
    };

    quotes.push(newQuote);

    if (isChromeStorage) {
      await chrome.storage.local.set({ [STORAGE_KEYS.QUOTES]: quotes });
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(quotes));
    } else {
      memStore[STORAGE_KEYS.QUOTES] = quotes;
    }

    cloudSync.send({ type: 'ADD_QUOTE', quote: newQuote });
    return newQuote;
  },

  async updateQuote(id, updates) {
    const quotes = await this.getQuotes();
    const index = quotes.findIndex(q => q.id === id);
    if (index !== -1) {
      quotes[index] = { ...quotes[index], ...updates };
      await this.saveQuotes(quotes);
      return quotes[index];
    }
    return null;
  },

  async deleteQuote(id) {
    const quotes = await this.getQuotes();
    const filtered = quotes.filter(q => q.id !== id);
    await this.saveQuotes(filtered);
    return filtered;
  },

  async getStrokes() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.STROKES]);
      return res[STORAGE_KEYS.STROKES] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.STROKES);
      return data ? JSON.parse(data) : [];
    } else {
      return memStore[STORAGE_KEYS.STROKES] || [];
    }
  },

  async saveStrokes(strokes) {
    if (isChromeStorage) {
      await chrome.storage.local.set({ [STORAGE_KEYS.STROKES]: strokes });
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(strokes));
    } else {
      memStore[STORAGE_KEYS.STROKES] = strokes;
    }

    cloudSync.send({ type: 'UPDATE_STROKES', strokes });
    return strokes;
  },

  async addStroke(strokeData) {
    const strokes = await this.getStrokes();
    const newStroke = {
      id: strokeData.id || `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      type: 'ink',
      tool: strokeData.tool || 'pen',
      width: strokeData.width || (strokeData.tool === 'highlighter' ? 20 : 3),
      opacity: typeof strokeData.opacity === 'number' ? strokeData.opacity : (strokeData.tool === 'highlighter' ? 0.35 : 1.0),
      color: strokeData.color || (strokeData.tool === 'highlighter' ? '#f59e0b' : '#38bdf8'),
      points: strokeData.points || []
    };

    strokes.push(newStroke);

    if (isChromeStorage) {
      await chrome.storage.local.set({ [STORAGE_KEYS.STROKES]: strokes });
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(strokes));
    } else {
      memStore[STORAGE_KEYS.STROKES] = strokes;
    }

    // Instant push to Cloudflare DO -> iPad receives stroke
    cloudSync.send({ type: 'ADD_STROKE', stroke: newStroke });
    return newStroke;
  },

  async deleteStroke(id) {
    const strokes = await this.getStrokes();
    const filtered = strokes.filter(s => s.id !== id);
    await this.saveStrokes(filtered);
    return filtered;
  },

  async deleteStrokes(ids) {
    const set = new Set(ids);
    const strokes = await this.getStrokes();
    const filtered = strokes.filter(s => !set.has(s.id));
    await this.saveStrokes(filtered);
    return filtered;
  },

  async getViewport() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.VIEWPORT]);
      return res[STORAGE_KEYS.VIEWPORT] || { ...DEFAULT_VIEWPORT };
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.VIEWPORT);
      return data ? JSON.parse(data) : { ...DEFAULT_VIEWPORT };
    } else {
      return memStore[STORAGE_KEYS.VIEWPORT] || { ...DEFAULT_VIEWPORT };
    }
  },

  async saveViewport(viewport) {
    const vp = {
      panX: typeof viewport.panX === 'number' ? viewport.panX : DEFAULT_VIEWPORT.panX,
      panY: typeof viewport.panY === 'number' ? viewport.panY : DEFAULT_VIEWPORT.panY,
      zoom: typeof viewport.zoom === 'number' ? viewport.zoom : DEFAULT_VIEWPORT.zoom
    };

    if (isChromeStorage) {
      await chrome.storage.local.set({ [STORAGE_KEYS.VIEWPORT]: vp });
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.VIEWPORT, JSON.stringify(vp));
    } else {
      memStore[STORAGE_KEYS.VIEWPORT] = vp;
    }

    cloudSync.send({ type: 'UPDATE_VIEWPORT', viewport: vp });
    return vp;
  },

  async exportAllData() {
    const [quotes, strokes, viewport] = await Promise.all([
      this.getQuotes(),
      this.getStrokes(),
      this.getViewport()
    ]);

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      generator: 'Detective Map Extension',
      data: {
        quotes,
        strokes,
        viewport
      }
    };
  },

  async importAllData(payload) {
    if (!payload || !payload.data) {
      throw new Error('Invalid Detective Map backup format.');
    }
    const { quotes, strokes, viewport } = payload.data;
    if (Array.isArray(quotes)) await this.saveQuotes(quotes);
    if (Array.isArray(strokes)) await this.saveStrokes(strokes);
    if (viewport && typeof viewport.zoom === 'number') await this.saveViewport(viewport);

    return {
      quoteCount: (quotes || []).length,
      strokeCount: (strokes || []).length
    };
  },

  async clearAll() {
    if (isChromeStorage) {
      await chrome.storage.local.remove([
        STORAGE_KEYS.QUOTES,
        STORAGE_KEYS.STROKES,
        STORAGE_KEYS.VIEWPORT
      ]);
    } else if (hasLocalStorage) {
      localStorage.removeItem(STORAGE_KEYS.QUOTES);
      localStorage.removeItem(STORAGE_KEYS.STROKES);
      localStorage.removeItem(STORAGE_KEYS.VIEWPORT);
    } else {
      delete memStore[STORAGE_KEYS.QUOTES];
      delete memStore[STORAGE_KEYS.STROKES];
      delete memStore[STORAGE_KEYS.VIEWPORT];
    }
  },

  onChanged(callback) {
    changeListeners.push(callback);

    if (isChromeStorage) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          callback(changes);
        }
      });
    } else if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        callback({ [e.key]: { newValue: e.newValue ? JSON.parse(e.newValue) : null } });
      });
    }
  }
};

// Export for module/script usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Storage, STORAGE_KEYS, DEFAULT_VIEWPORT };
}
