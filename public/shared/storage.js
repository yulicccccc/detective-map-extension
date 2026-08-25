// shared/storage.js - Detective Map V2.0 Unified Storage & WebSocket Sync Layer

const STORAGE_KEYS = {
  WORKSPACES: 'dm_workspaces_v2',
  ACTIVE_WS: 'dm_active_workspace_id_v2',
  SOURCES: 'dm_sources_v2',
  CONCEPTS: 'dm_concepts_v2',
  EDGES: 'dm_edges_v2',
  INK_STROKES: 'dm_ink_strokes_v2',
  PROPOSALS: 'dm_proposals_v2',
  DEVICE_TOKEN: 'dm_device_token_v2',
  MIGRATION_DONE: 'dm_migration_v2_done',
  LEGACY_QUOTES: 'detective_quotes',
  LEGACY_STROKES: 'detective_strokes'
};

const CLOUDFLARE_BASE_URL = 'https://detectivemap.qchen9108.workers.dev';
const CLOUDFLARE_WS_URL = 'wss://detectivemap.qchen9108.workers.dev/api/ws';

const isChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const hasLocalStorage = typeof localStorage !== 'undefined';
const memStore = {};
const changeListeners = [];

function triggerChange(changes) {
  changeListeners.forEach(cb => {
    try { cb(changes); } catch {}
  });
}

class V2CloudSyncEngine {
  constructor() {
    this.ws = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'unpaired'
    this.statusListeners = [];
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.activeWorkspaceId = 'ws_default';
  }

  async init() {
    if (typeof window === 'undefined') return;

    await Storage.migrateLegacyDataIfNeeded();
    const token = await this.getToken();
    if (!token) {
      this.setStatus('unpaired');
      return;
    }

    this.connect(token);
  }

  async getToken() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.DEVICE_TOKEN]);
      return res[STORAGE_KEYS.DEVICE_TOKEN] || null;
    } else if (hasLocalStorage) {
      return localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
    }
    return memStore[STORAGE_KEYS.DEVICE_TOKEN] || null;
  }

  async pairDevice(pairingCode, deviceName = 'Web Client') {
    const code = (pairingCode || '').trim().toUpperCase();
    try {
      const res = await fetch(`${CLOUDFLARE_BASE_URL}/api/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: code, deviceName })
      });
      const data = await res.json();
      if (data.success && data.token) {
        if (isChromeStorage) {
          await chrome.storage.local.set({ [STORAGE_KEYS.DEVICE_TOKEN]: data.token });
        }
        if (hasLocalStorage) {
          localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, data.token);
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
      // Connect without token in URL query (Phase 0 security hardening)
      this.ws = new WebSocket(CLOUDFLARE_WS_URL);

      this.ws.addEventListener('open', () => {
        console.log('[Cloud Sync] WebSocket connected. Sending AUTH handshake...');
        // Handshake: first message is AUTH
        this.ws.send(JSON.stringify({
          type: 'AUTH',
          token: token,
          workspaceId: this.activeWorkspaceId
        }));

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
          console.warn('[Cloud Sync Parse Error]', e);
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

    if (msg.type === 'AUTH_SUCCESS') {
      console.log('[Cloud Sync] AUTH successful for workspace:', msg.workspaceId);
      this.setStatus('connected');
    } else if (msg.type === 'AUTH_ERROR') {
      console.warn('[Cloud Sync] AUTH failed. Pairing code required.');
      this.setStatus('unpaired');
    } else if (msg.type === 'INIT_STATE') {
      if (msg.concepts) Storage.saveConceptsLocal(msg.concepts);
      if (msg.edges) Storage.saveEdgesLocal(msg.edges);
      if (msg.sources) Storage.saveSourcesLocal(msg.sources);
      if (msg.inkStrokes) Storage.saveStrokesLocal(msg.inkStrokes);
      if (msg.proposals) Storage.saveProposalsLocal(msg.proposals);
      triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: msg.concepts } });
    } else if (msg.type === 'SOURCE_ADDED' && msg.source) {
      Storage.getSources().then(existing => {
        const updated = [msg.source, ...existing.filter(s => s.id !== msg.source.id)];
        Storage.saveSourcesLocal(updated);
        triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: updated } });
      });
    } else if (msg.type === 'PROPOSAL_CREATED' && msg.proposal) {
      Storage.getProposals().then(existing => {
        const updated = [msg.proposal, ...existing.filter(p => p.id !== msg.proposal.id)];
        Storage.saveProposalsLocal(updated);
        triggerChange({ [STORAGE_KEYS.PROPOSALS]: { newValue: updated } });
      });
    } else if (msg.type === 'PROPOSAL_APPLIED') {
      Storage.fetchRemoteState();
    } else if (msg.type === 'INK_STROKE_ADDED' && msg.stroke) {
      Storage.getStrokes().then(existing => {
        const updated = [...existing.filter(s => s.id !== msg.stroke.id), msg.stroke];
        Storage.saveStrokesLocal(updated);
        triggerChange({ [STORAGE_KEYS.INK_STROKES]: { newValue: updated } });
      });
    } else if (msg.type === 'INK_STROKES_DELETED' && Array.isArray(msg.strokeIds)) {
      Storage.getStrokes().then(existing => {
        const set = new Set(msg.strokeIds);
        const updated = existing.filter(s => !set.has(s.id));
        Storage.saveStrokesLocal(updated);
        triggerChange({ [STORAGE_KEYS.INK_STROKES]: { newValue: updated } });
      });
    } else if (msg.type === 'CONCEPT_MOVED') {
      Storage.getConcepts().then(existing => {
        const c = existing.find(item => item.id === msg.id);
        if (c) {
          c.x = msg.x;
          c.y = msg.y;
          Storage.saveConceptsLocal(existing);
          triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: existing } });
        }
      });
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(msg)); } catch (e) {}
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

const cloudSync = new V2CloudSyncEngine();

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    cloudSync.init();
  });
}

const Storage = {
  cloudSync,

  // --- Workspaces ---
  async getActiveWorkspaceId() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.ACTIVE_WS]);
      return res[STORAGE_KEYS.ACTIVE_WS] || 'ws_default';
    } else if (hasLocalStorage) {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_WS) || 'ws_default';
    }
    return memStore[STORAGE_KEYS.ACTIVE_WS] || 'ws_default';
  },

  async setActiveWorkspaceId(id) {
    if (isChromeStorage) {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_WS]: id });
    } else if (hasLocalStorage) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_WS, id);
    }
    memStore[STORAGE_KEYS.ACTIVE_WS] = id;
    cloudSync.activeWorkspaceId = id;
    await this.fetchRemoteState();
    triggerChange({ [STORAGE_KEYS.ACTIVE_WS]: { newValue: id } });
    return id;
  },

  async getWorkspaces() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.WORKSPACES]);
      return res[STORAGE_KEYS.WORKSPACES] || [{ id: 'ws_default', title: 'My Learning Map', revision: 1 }];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
      return data ? JSON.parse(data) : [{ id: 'ws_default', title: 'My Learning Map', revision: 1 }];
    }
    return memStore[STORAGE_KEYS.WORKSPACES] || [{ id: 'ws_default', title: 'My Learning Map', revision: 1 }];
  },

  async createWorkspace(title) {
    const token = await cloudSync.getToken();
    const cleanTitle = (title || 'New Learning Map').trim();

    try {
      if (token) {
        const res = await fetch(`${CLOUDFLARE_BASE_URL}/api/workspaces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: cleanTitle })
        });
        const data = await res.json();
        if (data.success && data.workspace) {
          const wsList = await this.getWorkspaces();
          wsList.unshift(data.workspace);
          await this.saveWorkspacesLocal(wsList);
          await this.setActiveWorkspaceId(data.workspace.id);
          return data.workspace;
        }
      }
    } catch (e) {
      console.warn('[Create WS Offline]', e);
    }

    const localWs = {
      id: 'ws_' + Date.now(),
      title: cleanTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1
    };
    const list = await this.getWorkspaces();
    list.unshift(localWs);
    await this.saveWorkspacesLocal(list);
    await this.setActiveWorkspaceId(localWs.id);
    return localWs;
  },

  async saveWorkspacesLocal(list) {
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.WORKSPACES]: list });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(list));
    memStore[STORAGE_KEYS.WORKSPACES] = list;
  },

  // --- Sources ---
  async getSources() {
    const wsId = await this.getActiveWorkspaceId();
    let all = [];
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.SOURCES]);
      all = res[STORAGE_KEYS.SOURCES] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.SOURCES);
      all = data ? JSON.parse(data) : [];
    } else {
      all = memStore[STORAGE_KEYS.SOURCES] || [];
    }
    return all.filter(s => (s.workspaceId || 'ws_default') === wsId);
  },

  async addSource(sourceData) {
    const wsId = sourceData.workspaceId || await this.getActiveWorkspaceId();
    const newSource = {
      id: sourceData.id || `src_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId: wsId,
      type: sourceData.type || 'chatgpt_selection',
      title: sourceData.title || 'Source Evidence',
      text: sourceData.text || '',
      url: sourceData.url || '',
      capturedAt: sourceData.capturedAt || new Date().toISOString(),
      processingStatus: 'processing'
    };

    // Save locally
    const existing = await this.getAllSourcesLocal();
    existing.unshift(newSource);
    await this.saveSourcesLocal(existing);
    triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: existing } });

    // Sync to Cloud
    const token = await cloudSync.getToken();
    if (token) {
      fetch(`${CLOUDFLARE_BASE_URL}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newSource)
      }).catch(err => console.warn('[Add Source Cloud Error]', err));
    }

    return newSource;
  },

  async getAllSourcesLocal() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.SOURCES]);
      return res[STORAGE_KEYS.SOURCES] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.SOURCES);
      return data ? JSON.parse(data) : [];
    }
    return memStore[STORAGE_KEYS.SOURCES] || [];
  },

  async saveSourcesLocal(sources) {
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.SOURCES]: sources });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify(sources));
    memStore[STORAGE_KEYS.SOURCES] = sources;
  },

  // --- Concepts ---
  async getConcepts() {
    const wsId = await this.getActiveWorkspaceId();
    let all = [];
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.CONCEPTS]);
      all = res[STORAGE_KEYS.CONCEPTS] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.CONCEPTS);
      all = data ? JSON.parse(data) : [];
    } else {
      all = memStore[STORAGE_KEYS.CONCEPTS] || [];
    }
    return all.filter(c => (c.workspaceId || 'ws_default') === wsId);
  },

  async saveConceptsLocal(concepts) {
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.CONCEPTS]: concepts });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.CONCEPTS, JSON.stringify(concepts));
    memStore[STORAGE_KEYS.CONCEPTS] = concepts;
  },

  async addConcept(conceptData) {
    const wsId = conceptData.workspaceId || await this.getActiveWorkspaceId();
    const newConcept = {
      id: conceptData.id || `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId: wsId,
      label: (conceptData.label || 'New Concept').trim(),
      description: (conceptData.description || '').trim(),
      x: typeof conceptData.x === 'number' ? conceptData.x : 150,
      y: typeof conceptData.y === 'number' ? conceptData.y : 150,
      width: conceptData.width || 240,
      pinned: !!conceptData.pinned,
      sourceRefs: conceptData.sourceRefs || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: conceptData.createdBy || 'user'
    };

    const list = await this.getConcepts();
    list.push(newConcept);
    await this.saveConceptsLocal(list);
    triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: list } });

    const token = await cloudSync.getToken();
    if (token) {
      fetch(`${CLOUDFLARE_BASE_URL}/api/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newConcept)
      }).catch(() => {});
    }

    return newConcept;
  },

  async updateConcept(id, updates) {
    const list = await this.getConcepts();
    const idx = list.findIndex(c => c.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      await this.saveConceptsLocal(list);
      triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: list } });

      if (typeof updates.x === 'number' && typeof updates.y === 'number') {
        cloudSync.send({ type: 'MOVE_CONCEPT', id, x: updates.x, y: updates.y });
      }
      return list[idx];
    }
    return null;
  },

  // --- Edges ---
  async getEdges() {
    const wsId = await this.getActiveWorkspaceId();
    let all = [];
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.EDGES]);
      all = res[STORAGE_KEYS.EDGES] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.EDGES);
      all = data ? JSON.parse(data) : [];
    } else {
      all = memStore[STORAGE_KEYS.EDGES] || [];
    }
    return all.filter(e => (e.workspaceId || 'ws_default') === wsId);
  },

  async saveEdgesLocal(edges) {
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.EDGES]: edges });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.EDGES, JSON.stringify(edges));
    memStore[STORAGE_KEYS.EDGES] = edges;
  },

  async addEdge(edgeData) {
    const wsId = edgeData.workspaceId || await this.getActiveWorkspaceId();
    const newEdge = {
      id: edgeData.id || `e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId: wsId,
      fromId: edgeData.fromId || edgeData.from,
      toId: edgeData.toId || edgeData.to,
      relation: edgeData.relation || 'relates',
      label: edgeData.label || '',
      sourceRefs: edgeData.sourceRefs || [],
      createdBy: edgeData.createdBy || 'user'
    };

    const list = await this.getEdges();
    list.push(newEdge);
    await this.saveEdgesLocal(list);
    triggerChange({ [STORAGE_KEYS.EDGES]: { newValue: list } });

    cloudSync.send({ type: 'ADD_EDGE', edge: newEdge });
    return newEdge;
  },

  // --- Ink Strokes ---
  async getStrokes() {
    const wsId = await this.getActiveWorkspaceId();
    let all = [];
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.INK_STROKES]);
      all = res[STORAGE_KEYS.INK_STROKES] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.INK_STROKES);
      all = data ? JSON.parse(data) : [];
    } else {
      all = memStore[STORAGE_KEYS.INK_STROKES] || [];
    }
    return all.filter(s => (s.workspaceId || 'ws_default') === wsId);
  },

  async saveStrokesLocal(strokes) {
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.INK_STROKES]: strokes });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.INK_STROKES, JSON.stringify(strokes));
    memStore[STORAGE_KEYS.INK_STROKES] = strokes;
  },

  async addStroke(strokeData) {
    const wsId = strokeData.workspaceId || await this.getActiveWorkspaceId();
    const newStroke = {
      id: strokeData.id || `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId: wsId,
      tool: strokeData.tool || 'pen',
      width: strokeData.width || (strokeData.tool === 'highlighter' ? 20 : 3),
      opacity: typeof strokeData.opacity === 'number' ? strokeData.opacity : (strokeData.tool === 'highlighter' ? 0.35 : 1.0),
      color: strokeData.color || (strokeData.tool === 'highlighter' ? '#f59e0b' : '#38bdf8'),
      points: strokeData.points || []
    };

    const list = await this.getStrokes();
    list.push(newStroke);
    await this.saveStrokesLocal(list);
    cloudSync.send({ type: 'ADD_INK_STROKE', stroke: newStroke });
    return newStroke;
  },

  async deleteStrokes(ids) {
    const set = new Set(ids);
    const list = await this.getStrokes();
    const filtered = list.filter(s => !set.has(s.id));
    await this.saveStrokesLocal(filtered);
    cloudSync.send({ type: 'DELETE_INK_STROKES', strokeIds: ids });
    return filtered;
  },

  // --- Proposals ---
  async getProposals() {
    const wsId = await this.getActiveWorkspaceId();
    let all = [];
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.PROPOSALS]);
      all = res[STORAGE_KEYS.PROPOSALS] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.PROPOSALS);
      all = data ? JSON.parse(data) : [];
    }
    return all.filter(p => (p.workspaceId || 'ws_default') === wsId && p.status === 'pending');
  },

  async saveProposalsLocal(proposals) {
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.PROPOSALS]: proposals });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.PROPOSALS, JSON.stringify(proposals));
    memStore[STORAGE_KEYS.PROPOSALS] = proposals;
  },

  async applyProposal(proposalId, operations) {
    const token = await cloudSync.getToken();
    if (token) {
      const res = await fetch(`${CLOUDFLARE_BASE_URL}/api/proposals/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ proposalId, operations })
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchRemoteState();
        return data;
      }
    }
    return { success: false };
  },

  async fetchRemoteState() {
    const token = await cloudSync.getToken();
    const wsId = await this.getActiveWorkspaceId();
    if (!token) return;

    try {
      const res = await fetch(`${CLOUDFLARE_BASE_URL}/api/state?workspaceId=${encodeURIComponent(wsId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data.concepts) await this.saveConceptsLocal(data.concepts);
        if (data.edges) await this.saveEdgesLocal(data.edges);
        if (data.sources) await this.saveSourcesLocal(data.sources);
        if (data.inkStrokes) await this.saveStrokesLocal(data.inkStrokes);
        if (data.proposals) await this.saveProposalsLocal(data.proposals);
        triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: data.concepts } });
      }
    } catch (e) {
      console.warn('[Fetch Remote State Error]', e);
    }
  },

  // --- Backward Compatibility Migration (Phase 16) ---
  async migrateLegacyDataIfNeeded() {
    let isMigrated = false;
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.MIGRATION_DONE, STORAGE_KEYS.LEGACY_QUOTES, STORAGE_KEYS.LEGACY_STROKES]);
      isMigrated = res[STORAGE_KEYS.MIGRATION_DONE];
      if (!isMigrated && res[STORAGE_KEYS.LEGACY_QUOTES]) {
        const quotes = res[STORAGE_KEYS.LEGACY_QUOTES] || [];
        const sources = quotes.map(q => ({
          id: q.id || `src_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          workspaceId: 'ws_default',
          type: 'chatgpt_selection',
          title: q.sourceTitle || 'Legacy Capture',
          text: q.text || '',
          url: q.sourceUrl || '',
          capturedAt: q.capturedAt || new Date().toISOString(),
          processingStatus: 'completed'
        }));
        await this.saveSourcesLocal(sources);

        if (res[STORAGE_KEYS.LEGACY_STROKES]) {
          const strokes = (res[STORAGE_KEYS.LEGACY_STROKES] || []).map(s => ({ ...s, workspaceId: 'ws_default' }));
          await this.saveStrokesLocal(strokes);
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.MIGRATION_DONE]: true });
        console.log('[Migration] Successfully migrated ' + sources.length + ' legacy quotes to Sources.');
      }
    } else if (hasLocalStorage) {
      isMigrated = localStorage.getItem(STORAGE_KEYS.MIGRATION_DONE);
      if (!isMigrated) {
        const legacyQuotesStr = localStorage.getItem(STORAGE_KEYS.LEGACY_QUOTES);
        if (legacyQuotesStr) {
          const quotes = JSON.parse(legacyQuotesStr);
          const sources = quotes.map(q => ({
            id: q.id || `src_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            workspaceId: 'ws_default',
            type: 'chatgpt_selection',
            title: q.sourceTitle || 'Legacy Capture',
            text: q.text || '',
            url: q.sourceUrl || '',
            capturedAt: q.capturedAt || new Date().toISOString(),
            processingStatus: 'completed'
          }));
          await this.saveSourcesLocal(sources);
          localStorage.setItem(STORAGE_KEYS.MIGRATION_DONE, 'true');
        }
      }
    }
  },

  async exportAllData() {
    const [concepts, edges, sources, strokes] = await Promise.all([
      this.getConcepts(),
      this.getEdges(),
      this.getSources(),
      this.getStrokes()
    ]);
    return {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      generator: 'Detective Map V2',
      data: {
        concepts,
        edges,
        sources,
        strokes,
        quotes: sources
      }
    };
  },

  async importAllData(payload) {
    if (!payload || !payload.data) {
      throw new Error('Invalid Detective Map backup format.');
    }
    const { concepts, edges, sources, strokes, quotes } = payload.data;
    if (Array.isArray(concepts)) await this.saveConceptsLocal(concepts);
    if (Array.isArray(edges)) await this.saveEdgesLocal(edges);
    if (Array.isArray(sources)) await this.saveSourcesLocal(sources);
    if (Array.isArray(quotes)) await this.saveSourcesLocal(quotes);
    if (Array.isArray(strokes)) await this.saveStrokesLocal(strokes);

    return {
      conceptCount: (concepts || []).length,
      quoteCount: (sources || quotes || []).length,
      strokeCount: (strokes || []).length
    };
  },

  async getQuotes() {
    return this.getSources();
  },

  async clearAll() {
    if (isChromeStorage) {
      await chrome.storage.local.clear();
    } else if (hasLocalStorage) {
      localStorage.clear();
    }
  },

  onChanged(callback) {
    changeListeners.push(callback);
    if (isChromeStorage) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') callback(changes);
      });
    } else if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        callback({ [e.key]: { newValue: e.newValue ? JSON.parse(e.newValue) : null } });
      });
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Storage, STORAGE_KEYS };
}
