// shared/storage.js - Unified chrome.storage.local & WebRTC Cloud Sync Layer

const STORAGE_KEYS = {
  QUOTES: 'detective_quotes',
  STROKES: 'detective_strokes',
  VIEWPORT: 'detective_viewport',
  CONFIG: 'detective_config',
  ROOM_ID: 'detective_room_id'
};

const DEFAULT_VIEWPORT = {
  panX: 100,
  panY: 100,
  zoom: 1.0
};

const DEFAULT_ROOM_ID = 'detective-map-room-v1';

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

// --- WebRTC Peer-to-Peer Realtime Sync Engine ---
class WebRTCSyncEngine {
  constructor() {
    this.peer = null;
    this.connections = new Set();
    this.roomId = DEFAULT_ROOM_ID;
    this.isHost = isChromeStorage; // Extension acts as host, Web/iPad acts as peer
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.statusListeners = [];
  }

  init() {
    if (typeof Peer === 'undefined') {
      console.log('[Sync] PeerJS not available, running in local-only mode.');
      return;
    }

    // Generate deterministic peer ID based on room
    const hostPeerId = `dm-host-${this.roomId}`;
    const clientPeerId = `dm-client-${Math.random().toString(36).substr(2, 6)}`;

    try {
      if (this.isHost) {
        // Host connects with stable ID
        this.peer = new Peer(hostPeerId, { debug: 1 });
      } else {
        // iPad client connects and targets host
        this.peer = new Peer(clientPeerId, { debug: 1 });
      }

      this.peer.on('open', (id) => {
        console.log('[Sync] Peer connected with ID:', id);
        this.setStatus('connecting');

        if (!this.isHost) {
          // Connect to Host
          this.connectToHost(hostPeerId);
        }
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('[Sync] Peer error:', err.type);
        if (err.type === 'unavailable-id' && this.isHost) {
          // Host ID already in use (e.g. reload), switch to secondary
          this.peer = new Peer(`dm-peer-${Math.random().toString(36).substr(2, 6)}`);
          this.peer.on('open', () => this.connectToHost(hostPeerId));
        }
      });
    } catch (e) {
      console.warn('[Sync] WebRTC init error:', e);
    }
  }

  connectToHost(hostId) {
    if (!this.peer) return;
    const conn = this.peer.connect(hostId, { reliable: true });
    this.handleConnection(conn);
  }

  handleConnection(conn) {
    conn.on('open', () => {
      console.log('[Sync] DataChannel opened with peer:', conn.peer);
      this.connections.add(conn);
      this.setStatus('connected');

      // Request / Send full initial state sync
      if (this.isHost) {
        Storage.getQuotes().then(quotes => {
          Storage.getStrokes().then(strokes => {
            conn.send({ type: 'FULL_SYNC', quotes, strokes });
          });
        });
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingMessage(data);
    });

    conn.on('close', () => {
      this.connections.delete(conn);
      if (this.connections.size === 0) {
        this.setStatus('connecting');
      }
    });

    conn.on('error', () => {
      this.connections.delete(conn);
    });
  }

  handleIncomingMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'FULL_SYNC') {
      if (Array.isArray(msg.quotes)) {
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(msg.quotes));
        triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: msg.quotes } });
      }
      if (Array.isArray(msg.strokes)) {
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(msg.strokes));
        triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: msg.strokes } });
      }
    } else if (msg.type === 'ADD_QUOTE') {
      Storage.getQuotes().then(existing => {
        const updated = [...existing.filter(q => q.id !== msg.quote.id), msg.quote];
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(updated));
        triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: updated } });
      });
    } else if (msg.type === 'UPDATE_QUOTES') {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(msg.quotes));
      triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: msg.quotes } });
    } else if (msg.type === 'ADD_STROKE') {
      Storage.getStrokes().then(existing => {
        const updated = [...existing.filter(s => s.id !== msg.stroke.id), msg.stroke];
        if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(updated));
        triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: updated } });
      });
    } else if (msg.type === 'UPDATE_STROKES') {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(msg.strokes));
      triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: msg.strokes } });
    }
  }

  broadcast(message) {
    for (const conn of this.connections) {
      try {
        if (conn.open) conn.send(message);
      } catch (e) {
        this.connections.delete(conn);
      }
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

const syncEngine = new WebRTCSyncEngine();

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    syncEngine.init();
  });
}

const Storage = {
  syncEngine,

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

    // Broadcast across WebRTC tunnel
    syncEngine.broadcast({ type: 'UPDATE_QUOTES', quotes });
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

    // Instant live push to iPad over WebRTC
    syncEngine.broadcast({ type: 'ADD_QUOTE', quote: newQuote });
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

    syncEngine.broadcast({ type: 'UPDATE_STROKES', strokes });
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

    // Live sync stroke to other devices
    syncEngine.broadcast({ type: 'ADD_STROKE', stroke: newStroke });
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
