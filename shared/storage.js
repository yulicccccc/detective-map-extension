// shared/storage.js - Unified chrome.storage.local & Zero-Admin LAN Sync Layer

const STORAGE_KEYS = {
  QUOTES: 'detective_quotes',
  STROKES: 'detective_strokes',
  VIEWPORT: 'detective_viewport',
  CONFIG: 'detective_config'
};

const DEFAULT_VIEWPORT = {
  panX: 100,
  panY: 100,
  zoom: 1.0
};

// Runtime environment detection
const isChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const hasLocalStorage = typeof localStorage !== 'undefined';
const isWebOrIpad = typeof window !== 'undefined' && !isChromeStorage;

// Determine Server API origin (e.g. http://localhost:3000 or http://192.168.x.x:3000)
function getServerOrigin() {
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

const memStore = {};
const changeListeners = [];

// Real-Time Server-Sent Events (SSE) for iPad Safari & Web Mode
let sseSource = null;
function initSse() {
  if (isWebOrIpad && typeof EventSource !== 'undefined' && !sseSource) {
    try {
      const serverOrigin = getServerOrigin();
      sseSource = new EventSource(`${serverOrigin}/api/events`);

      sseSource.addEventListener('init', (e) => {
        try {
          const state = JSON.parse(e.data);
          if (state) {
            triggerChange({
              [STORAGE_KEYS.QUOTES]: { newValue: state.quotes },
              [STORAGE_KEYS.STROKES]: { newValue: state.strokes }
            });
          }
        } catch {}
      });

      sseSource.addEventListener('quote_added', (e) => {
        try {
          const quote = JSON.parse(e.data);
          Storage.getQuotes().then(existing => {
            const updated = [...existing.filter(q => q.id !== quote.id), quote];
            triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: updated } });
          });
        } catch {}
      });

      sseSource.addEventListener('quotes_updated', (e) => {
        try {
          const quotes = JSON.parse(e.data);
          triggerChange({ [STORAGE_KEYS.QUOTES]: { newValue: quotes } });
        } catch {}
      });

      sseSource.addEventListener('stroke_added', (e) => {
        try {
          const stroke = JSON.parse(e.data);
          Storage.getStrokes().then(existing => {
            const updated = [...existing.filter(s => s.id !== stroke.id), stroke];
            triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: updated } });
          });
        } catch {}
      });

      sseSource.addEventListener('strokes_updated', (e) => {
        try {
          const strokes = JSON.parse(e.data);
          triggerChange({ [STORAGE_KEYS.STROKES]: { newValue: strokes } });
        } catch {}
      });
    } catch (err) {
      console.warn('[Storage] SSE connection failed, using local storage fallback.', err);
    }
  }
}

if (typeof window !== 'undefined') {
  initSse();
}

function triggerChange(changes) {
  changeListeners.forEach(cb => {
    try { cb(changes); } catch {}
  });
}

const Storage = {
  async getQuotes() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.QUOTES]);
      return res[STORAGE_KEYS.QUOTES] || [];
    } else if (isWebOrIpad) {
      try {
        const res = await fetch(`${getServerOrigin()}/api/state`);
        if (res.ok) {
          const state = await res.json();
          if (Array.isArray(state.quotes)) {
            if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(state.quotes));
            return state.quotes;
          }
        }
      } catch {}
      if (hasLocalStorage) {
        const data = localStorage.getItem(STORAGE_KEYS.QUOTES);
        return data ? JSON.parse(data) : [];
      }
      return memStore[STORAGE_KEYS.QUOTES] || [];
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
      // Non-blocking sync to LAN server so iPad updates
      fetch(`${getServerOrigin()}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotes)
      }).catch(() => {});
    } else if (isWebOrIpad) {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(quotes));
      fetch(`${getServerOrigin()}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotes)
      }).catch(() => {});
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(quotes));
    } else {
      memStore[STORAGE_KEYS.QUOTES] = quotes;
    }
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
      // Broadcast to iPad via LAN server
      fetch(`${getServerOrigin()}/api/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuote)
      }).catch(() => {});
    } else if (isWebOrIpad) {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(quotes));
      fetch(`${getServerOrigin()}/api/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuote)
      }).catch(() => {});
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.QUOTES, JSON.stringify(quotes));
    } else {
      memStore[STORAGE_KEYS.QUOTES] = quotes;
    }

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
    } else if (isWebOrIpad) {
      try {
        const res = await fetch(`${getServerOrigin()}/api/state`);
        if (res.ok) {
          const state = await res.json();
          if (Array.isArray(state.strokes)) {
            if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(state.strokes));
            return state.strokes;
          }
        }
      } catch {}
      if (hasLocalStorage) {
        const data = localStorage.getItem(STORAGE_KEYS.STROKES);
        return data ? JSON.parse(data) : [];
      }
      return memStore[STORAGE_KEYS.STROKES] || [];
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
      fetch(`${getServerOrigin()}/api/strokes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(strokes)
      }).catch(() => {});
    } else if (isWebOrIpad) {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(strokes));
      fetch(`${getServerOrigin()}/api/strokes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(strokes)
      }).catch(() => {});
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(strokes));
    } else {
      memStore[STORAGE_KEYS.STROKES] = strokes;
    }
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
      fetch(`${getServerOrigin()}/api/stroke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStroke)
      }).catch(() => {});
    } else if (isWebOrIpad) {
      if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(strokes));
      fetch(`${getServerOrigin()}/api/stroke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStroke)
      }).catch(() => {});
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.STROKES, JSON.stringify(strokes));
    } else {
      memStore[STORAGE_KEYS.STROKES] = strokes;
    }

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

    if (isWebOrIpad) {
      fetch(`${getServerOrigin()}/api/viewport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vp)
      }).catch(() => {});
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
