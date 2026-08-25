// shared/storage.js - Unified chrome.storage.local Data Layer

const STORAGE_KEYS = {
  QUOTES: 'detective_quotes',
  STROKES: 'detective_strokes',
  VIEWPORT: 'detective_viewport',
  CONFIG: 'detective_config'
};

const DEFAULT_VIEWPORT = {
  panX: 0,
  panY: 0,
  zoom: 1.0
};

// Check runtime storage availability
const isChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const hasLocalStorage = typeof localStorage !== 'undefined';
const memStore = {};

const Storage = {
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
    await this.saveQuotes(quotes);
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
    return strokes;
  },

  async addStroke(strokeData) {
    const strokes = await this.getStrokes();
    const newStroke = {
      id: strokeData.id || `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      type: 'ink',
      tool: strokeData.tool || 'pen',
      width: strokeData.width || (strokeData.tool === 'highlighter' ? 18 : 3),
      opacity: typeof strokeData.opacity === 'number' ? strokeData.opacity : (strokeData.tool === 'highlighter' ? 0.35 : 1.0),
      color: strokeData.color || (strokeData.tool === 'highlighter' ? '#f59e0b' : '#38bdf8'),
      points: strokeData.points || []
    };

    strokes.push(newStroke);
    await this.saveStrokes(strokes);
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
