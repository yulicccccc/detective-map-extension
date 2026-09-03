// shared/storage.js - Detective Map V2.0 Unified Storage & WebSocket Sync Layer

const STORAGE_KEYS = {
  WORKSPACES: 'dm_workspaces_v2',
  ACTIVE_WS: 'dm_active_workspace_id_v2',
  SOURCES: 'dm_sources_v2',
  CONCEPTS: 'dm_concepts_v2',
  EDGES: 'dm_edges_v2',
  INK_STROKES: 'dm_ink_strokes_v2',
  PROPOSALS: 'dm_proposals_v2',
  STALE_PROPOSALS: 'dm_stale_proposals_v2',
  DISMISSED_FAILED: 'dm_dismissed_failed_v2',
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

const isTestMode = () => {
  if (typeof Storage !== 'undefined' && Storage._isTestMode) return true;
  if (typeof process !== 'undefined' && process.env && (process.env.DETECTIVE_TEST_MODE === 'true' || process.env.NODE_ENV === 'test')) return true;
  return false;
};

function triggerChange(changes) {
  changeListeners.forEach(cb => {
    try { cb(changes); } catch {}
  });
}

function mergeScopedItems(currentAll, incomingList, activeWsId) {
  const incomingMap = new Map((incomingList || []).map(item => [item.id, { ...item, workspaceId: item.workspaceId || activeWsId }]));
  const merged = [...incomingMap.values()];
  for (const item of (currentAll || [])) {
    if (item && item.id && !incomingMap.has(item.id)) {
      if (item.workspaceId && item.workspaceId !== activeWsId) {
        merged.push(item);
      }
    }
  }
  return merged;
}

class V2CloudSyncEngine {
  constructor() {
    this.ws = null;
    this.status = 'disconnected';
    this.statusListeners = [];
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.activeWorkspaceId = 'ws_default';
  }

  async init() {
    if (typeof window === 'undefined' || isTestMode()) return;

    await Storage.migrateLegacyDataIfNeeded();
    const token = await this.getToken();
    if (!token) {
      this.setStatus('unpaired');
      return;
    }

    const activeWsId = await Storage.getActiveWorkspaceId();
    this.activeWorkspaceId = activeWsId;

    this.connect(token);
  }

  async getToken() {
    if (isTestMode()) return null;

    let token = null;
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.DEVICE_TOKEN]);
      token = res[STORAGE_KEYS.DEVICE_TOKEN] || null;
    } else if (hasLocalStorage) {
      token = localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
    } else {
      token = memStore[STORAGE_KEYS.DEVICE_TOKEN] || null;
    }

    if (!token) {
      try {
        const pairRes = await this.pairDevice('KIRA-2026', 'Primary Chrome Client');
        if (pairRes && pairRes.success && pairRes.token) {
          token = pairRes.token;
        }
      } catch (e) {
        console.warn('[Auto-Pair Error]', e);
      }
    }

    return token;
  }

  async clearToken() {
    if (isChromeStorage) {
      await chrome.storage.local.remove([STORAGE_KEYS.DEVICE_TOKEN]);
    }
    if (hasLocalStorage) {
      localStorage.removeItem(STORAGE_KEYS.DEVICE_TOKEN);
    }
    delete memStore[STORAGE_KEYS.DEVICE_TOKEN];
  }

  async authenticatedFetch(urlOrPath, options = {}, allowRetry = true) {
    if (isTestMode()) {
      throw new Error(`[TEST ISOLATION GUARD] Network call to ${urlOrPath} is strictly forbidden in test mode.`);
    }

    const fullUrl = urlOrPath.startsWith('http') ? urlOrPath : `${CLOUDFLARE_BASE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
    let token = await this.getToken();

    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const mergedOptions = { ...options, headers };

    try {
      let res = await fetch(fullUrl, mergedOptions);

      if (res.status === 401 && allowRetry) {
        console.warn('[Auth 401] Token invalid/expired on', fullUrl, '— clearing token and auto-re-pairing with KIRA-2026');
        await this.clearToken();
        const pairRes = await this.pairDevice('KIRA-2026', 'Primary Chrome Client (Auto-Recovered)');
        if (pairRes && pairRes.success && pairRes.token) {
          headers.set('Authorization', `Bearer ${pairRes.token}`);
          res = await fetch(fullUrl, { ...options, headers });
        }
      }

      return res;
    } catch (err) {
      console.warn('[AuthenticatedFetch Network Error]', err);
      throw err;
    }
  }

  async pairDevice(pairingCodeOrSecret, deviceName = 'Web Client') {
    if (isTestMode()) {
      throw new Error('[TEST ISOLATION GUARD] pairDevice is strictly forbidden in test mode.');
    }
    const input = (pairingCodeOrSecret || '').trim();
    if (!input) return { success: false, error: 'Pairing PIN or Bootstrap Secret required' };

    try {
      // 1. Try standard PIN pair first
      let res = await fetch(`${CLOUDFLARE_BASE_URL}/api/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: input.toUpperCase(), deviceName })
      });
      let data = await res.json();

      // 2. If standard PIN failed, try secure bootstrap endpoint with input as X-Bootstrap-Secret
      if (!data.success && res.status !== 200) {
        const bootRes = await fetch(`${CLOUDFLARE_BASE_URL}/api/auth/bootstrap-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Secret': input },
          body: JSON.stringify({ bootstrapSecret: input })
        });
        if (bootRes.status === 200) {
          const bootData = await bootRes.json();
          if (bootData.success && bootData.pin) {
            // Pair immediately with the dynamically generated bootstrap PIN
            res = await fetch(`${CLOUDFLARE_BASE_URL}/api/auth/pair`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pairingCode: bootData.pin, deviceName })
            });
            data = await res.json();
          }
        }
      }

      if (data.success && data.token) {
        if (isChromeStorage) {
          await chrome.storage.local.set({ [STORAGE_KEYS.DEVICE_TOKEN]: data.token });
        }
        if (hasLocalStorage) {
          localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, data.token);
        }
        memStore[STORAGE_KEYS.DEVICE_TOKEN] = data.token;

        const activeWsId = await Storage.getActiveWorkspaceId();
        this.activeWorkspaceId = activeWsId;

        this.connect(data.token);
        await Storage.fetchRemoteWorkspaces();
        return { success: true, token: data.token };
      }
      return { success: false, error: data.error || 'Invalid or expired Pairing Code / Secret' };
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
      this.ws = new WebSocket(CLOUDFLARE_WS_URL);

      this.ws.addEventListener('open', () => {
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
      if (token) {
        const activeWsId = await Storage.getActiveWorkspaceId();
        this.activeWorkspaceId = activeWsId;
        this.connect(token);
      }
    }, 4000);
  }

  handleIncomingMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'AUTH_SUCCESS') {
      this.setStatus('connected');
      if (msg.workspaceId && msg.workspaceId !== this.activeWorkspaceId) {
        this.send({ type: 'SWITCH_WORKSPACE', workspaceId: this.activeWorkspaceId });
      }
      Storage.fetchRemoteWorkspaces();
    } else if (msg.type === 'AUTH_ERROR') {
      console.warn('[WS Auth Error] Invalid token — clearing token and attempting auto-recovery');
      this.clearToken();
      this.setStatus('disconnected');
      this.pairDevice('KIRA-2026', 'Primary Chrome Client (WS Recovered)').catch(() => {});
    } else if (msg.type === 'INIT_STATE' || msg.type === 'WORKSPACE_SWITCHED') {
      if (Array.isArray(msg.workspaces) && msg.workspaces.length > 0) {
        Storage.saveWorkspacesLocal(msg.workspaces);
        triggerChange({ [STORAGE_KEYS.WORKSPACES]: { newValue: msg.workspaces } });
      }
      if (msg.concepts) Storage.saveConceptsLocal(msg.concepts);
      if (msg.edges) Storage.saveEdgesLocal(msg.edges);
      if (msg.sources) Storage.saveSourcesLocal(msg.sources);
      if (msg.inkStrokes) Storage.saveStrokesLocal(msg.inkStrokes);
      if (msg.proposals) Storage.saveProposalsLocal(msg.proposals);
      if (msg.staleProposals) Storage.saveStaleProposalsLocal(msg.staleProposals);
      triggerChange({
        [STORAGE_KEYS.CONCEPTS]: { newValue: msg.concepts },
        [STORAGE_KEYS.EDGES]: { newValue: msg.edges },
        [STORAGE_KEYS.INK_STROKES]: { newValue: msg.inkStrokes },
        [STORAGE_KEYS.PROPOSALS]: { newValue: msg.proposals },
        [STORAGE_KEYS.STALE_PROPOSALS]: { newValue: msg.staleProposals }
      });
    } else if (msg.type === 'PROPOSALS_STALE_CLEARED') {
      Storage.getAllStaleProposalsLocal().then(existing => {
        const filtered = existing.filter(p => {
          if (msg.proposalId && p.id === msg.proposalId) return false;
          if (msg.sourceId && p.sourceId === msg.sourceId) return false;
          return true;
        });
        Storage.saveStaleProposalsLocal(filtered);
        triggerChange({ [STORAGE_KEYS.STALE_PROPOSALS]: { newValue: filtered } });
      });
    } else if (msg.type === 'PROPOSAL_STALE') {
      Storage.fetchRemoteState();
    } else if (msg.type === 'WORKSPACE_CREATED' && msg.workspace) {
      Storage.getWorkspaces().then(existing => {
        const updated = [msg.workspace, ...existing.filter(w => w.id !== msg.workspace.id)];
        Storage.saveWorkspacesLocal(updated);
        triggerChange({ [STORAGE_KEYS.WORKSPACES]: { newValue: updated } });
      });
    } else if (msg.type === 'SOURCE_ADDED' && msg.source) {
      Storage.getAllSourcesLocal().then(existing => {
        const updated = [msg.source, ...existing.filter(s => s.id !== msg.source.id)];
        Storage.saveSourcesLocal(updated);
        triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: updated } });
      });
    } else if (msg.type === 'SOURCE_UPDATED' && msg.source) {
      Storage.getAllSourcesLocal().then(existing => {
        const idx = existing.findIndex(s => s.id === msg.source.id);
        if (idx !== -1) {
          existing[idx] = { ...existing[idx], ...msg.source };
        } else {
          existing.unshift(msg.source);
        }
        Storage.saveSourcesLocal(existing);
        triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: existing } });
      });
    } else if (msg.type === 'SOURCE_FAILED' && msg.sourceId) {
      Storage.getAllSourcesLocal().then(existing => {
        const src = existing.find(s => s.id === msg.sourceId);
        if (src) {
          src.processingStatus = 'failed';
          src.processingError = msg.error || 'AI analysis could not complete.';
          Storage.saveSourcesLocal(existing);
          triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: existing } });
        }
      });
    } else if (msg.type === 'PROPOSAL_CREATED' && msg.proposal) {
      Storage.getAllProposalsLocal().then(existing => {
        const updated = [msg.proposal, ...existing.filter(p => p.id !== msg.proposal.id)];
        Storage.saveProposalsLocal(updated);
        triggerChange({ [STORAGE_KEYS.PROPOSALS]: { newValue: updated } });
      });
    } else if (msg.type === 'PROPOSAL_APPLIED' || msg.type === 'PROPOSAL_REJECTED') {
      Storage.fetchRemoteState();
    } else if (msg.type === 'INK_STROKE_ADDED' && msg.stroke) {
      Storage.getAllStrokesLocal().then(existing => {
        const updated = [...existing.filter(s => s.id !== msg.stroke.id), msg.stroke];
        Storage.saveStrokesLocal(updated);
        triggerChange({ [STORAGE_KEYS.INK_STROKES]: { newValue: updated } });
      });
    } else if (msg.type === 'INK_STROKES_DELETED' && Array.isArray(msg.strokeIds)) {
      Storage.getAllStrokesLocal().then(existing => {
        const set = new Set(msg.strokeIds);
        const updated = existing.filter(s => !set.has(s.id));
        Storage.saveStrokesLocal(updated);
        triggerChange({ [STORAGE_KEYS.INK_STROKES]: { newValue: updated } });
      });
    } else if (msg.type === 'CONCEPT_MOVED') {
      Storage.getAllConceptsLocal().then(existing => {
        const c = existing.find(item => item.id === msg.id);
        if (c) {
          c.x = msg.x;
          c.y = msg.y;
          Storage.saveConceptsLocal(existing);
          triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: existing } });
        }
      });
    } else if (msg.type === 'CONCEPT_UPDATED' && msg.concept) {
      Storage.getAllConceptsLocal().then(existing => {
        const idx = existing.findIndex(item => item.id === msg.concept.id);
        if (idx !== -1) {
          existing[idx] = { ...existing[idx], ...msg.concept };
        } else {
          existing.push(msg.concept);
        }
        Storage.saveConceptsLocal(existing);
        triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: existing } });
      });
    } else if (msg.type === 'CONCEPT_DELETED' && msg.conceptId) {
      Storage.getAllConceptsLocal().then(existing => {
        const filteredConcepts = existing.filter(c => c.id !== msg.conceptId);
        Storage.saveConceptsLocal(filteredConcepts);

        Storage.getAllEdgesLocal().then(existingEdges => {
          const edgeFilterSet = new Set(msg.deletedEdgeIds || []);
          const filteredEdges = existingEdges.filter(e =>
            !edgeFilterSet.has(e.id) &&
            e.fromId !== msg.conceptId &&
            e.toId !== msg.conceptId
          );
          Storage.saveEdgesLocal(filteredEdges);

          triggerChange({
            [STORAGE_KEYS.CONCEPTS]: { newValue: filteredConcepts },
            [STORAGE_KEYS.EDGES]: { newValue: filteredEdges }
          });
        });
      });
    } else if (msg.type === 'EDGE_ADDED' && msg.edge) {
      Storage.getAllEdgesLocal().then(existing => {
        const updated = [...existing.filter(e => e.id !== msg.edge.id), msg.edge];
        Storage.saveEdgesLocal(updated);
        triggerChange({ [STORAGE_KEYS.EDGES]: { newValue: updated } });
      });
    } else if (msg.type === 'EDGE_DELETED' && msg.edgeId) {
      Storage.getAllEdgesLocal().then(existing => {
        const updated = existing.filter(e => e.id !== msg.edgeId);
        Storage.saveEdgesLocal(updated);
        triggerChange({ [STORAGE_KEYS.EDGES]: { newValue: updated } });
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
  _isTestMode: false,
  enableTestMode() {
    this._isTestMode = true;
    this.resetMemStore();
    if (this.cloudSync) {
      this.cloudSync.status = 'disconnected';
    }
  },
  resetMemStore() {
    for (const k of Object.keys(memStore)) {
      delete memStore[k];
    }
  },

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
    if (cloudSync) {
      cloudSync.activeWorkspaceId = id;
      cloudSync.send({ type: 'SWITCH_WORKSPACE', workspaceId: id });
    }
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

  // CRITICAL 2: Cross-Device Workspace Sync
  async fetchRemoteWorkspaces() {
    if (isTestMode()) {
      return await this.getWorkspaces();
    }
    try {
      const res = await cloudSync.authenticatedFetch('/api/workspaces');
      if (res && res.status === 200) {
        const data = await res.json();
        if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
          await this.saveWorkspacesLocal(data.workspaces);
          triggerChange({ [STORAGE_KEYS.WORKSPACES]: { newValue: data.workspaces } });
          cloudSync.setStatus('connected');
          return data.workspaces;
        }
      }
      cloudSync.setStatus('disconnected');
    } catch (e) {
      console.warn('[Fetch Remote Workspaces Error]', e);
      cloudSync.setStatus('disconnected');
    }
    return await this.getWorkspaces();
  },

  async createWorkspace(title) {
    const cleanTitle = (title || 'New Learning Map').trim();

    if (!isTestMode()) {
      try {
        const res = await cloudSync.authenticatedFetch('/api/workspaces', {
          method: 'POST',
          body: JSON.stringify({ title: cleanTitle })
        });
        if (res && res.status === 200) {
          const data = await res.json();
          if (data.success && data.workspace) {
            const wsList = await this.getWorkspaces();
            const updated = [data.workspace, ...wsList.filter(w => w.id !== data.workspace.id)];
            await this.saveWorkspacesLocal(updated);
            await this.setActiveWorkspaceId(data.workspace.id);
            triggerChange({ [STORAGE_KEYS.WORKSPACES]: { newValue: updated } });
            return data.workspace;
          }
        }
      } catch (e) {
        console.warn('[Create WS Offline]', e);
      }
    }

    const localWs = {
      id: 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: cleanTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1
    };
    const list = await this.getWorkspaces();
    list.unshift(localWs);
    await this.saveWorkspacesLocal(list);
    await this.setActiveWorkspaceId(localWs.id);
    triggerChange({ [STORAGE_KEYS.WORKSPACES]: { newValue: list } });
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
    const all = await this.getAllSourcesLocal();
    return all.filter(s => (s.workspaceId || 'ws_default') === wsId);
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
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllSourcesLocal();
    const merged = mergeScopedItems(all, sources, wsId);
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.SOURCES]: merged });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify(merged));
    memStore[STORAGE_KEYS.SOURCES] = merged;
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

    const existing = await this.getAllSourcesLocal();
    existing.unshift(newSource);
    await this.saveSourcesLocal(existing);
    triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: existing } });

    if (!isTestMode()) {
      try {
        const res = await cloudSync.authenticatedFetch('/api/sources', {
          method: 'POST',
          body: JSON.stringify(newSource)
        });
        if (res && res.ok) {
          const data = await res.json();
          if (data.source) {
            const currentSources = await this.getAllSourcesLocal();
            const idx = currentSources.findIndex(s => s.id === newSource.id);
            if (idx !== -1) {
              currentSources[idx] = { ...currentSources[idx], ...data.source };
              await this.saveSourcesLocal(currentSources);
              triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: currentSources } });
            }
          }
        }
      } catch (err) {
        console.warn('[Add Source Cloud Error]', err);
      }
    }

    return newSource;
  },

  async retrySource(sourceId) {
    // Clear any stale proposals associated with this source locally
    const allStale = await this.getAllStaleProposalsLocal();
    const filteredStale = allStale.filter(p => p.sourceId !== sourceId);
    await this.saveStaleProposalsLocal(filteredStale);

    // Also update source status in local storage immediately
    const existing = await this.getAllSourcesLocal();
    const idx = existing.findIndex(s => s.id === sourceId);
    if (idx !== -1) {
      existing[idx] = {
        ...existing[idx],
        processingStatus: 'processing',
        processingStartedAt: new Date().toISOString()
      };
      delete existing[idx].processingError;
      await this.saveSourcesLocal(existing);
      triggerChange({
        [STORAGE_KEYS.SOURCES]: { newValue: existing },
        [STORAGE_KEYS.STALE_PROPOSALS]: { newValue: filteredStale }
      });
    }

    if (!isTestMode()) {
      try {
        const res = await cloudSync.authenticatedFetch('/api/sources/retry', {
          method: 'POST',
          body: JSON.stringify({ sourceId })
        });
        if (res && res.ok) {
          const data = await res.json();
          if (data.source) {
            const currentSources = await this.getAllSourcesLocal();
            const sIdx = currentSources.findIndex(s => s.id === sourceId);
            if (sIdx !== -1) {
              currentSources[sIdx] = { ...currentSources[sIdx], ...data.source };
              await this.saveSourcesLocal(currentSources);
              triggerChange({ [STORAGE_KEYS.SOURCES]: { newValue: currentSources } });
            }
          }
          return data;
        }
        return { success: false, error: `HTTP ${res?.status}` };
      } catch (err) {
        console.warn('[Retry Source Error]', err);
        return { success: false, error: err.message };
      }
    }
    return { success: true, local: true };
  },

  // --- Concepts ---
  async getConcepts() {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllConceptsLocal();
    return all.filter(c => (c.workspaceId || 'ws_default') === wsId);
  },

  async getAllConceptsLocal() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.CONCEPTS]);
      return res[STORAGE_KEYS.CONCEPTS] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.CONCEPTS);
      return data ? JSON.parse(data) : [];
    }
    return memStore[STORAGE_KEYS.CONCEPTS] || [];
  },

  async saveConceptsLocal(concepts) {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllConceptsLocal();
    const merged = mergeScopedItems(all, concepts, wsId);
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.CONCEPTS]: merged });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.CONCEPTS, JSON.stringify(merged));
    memStore[STORAGE_KEYS.CONCEPTS] = merged;
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

    const all = await this.getAllConceptsLocal();
    all.push(newConcept);
    await this.saveConceptsLocal(all);
    triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: all } });

    // Single Authoritative Mutation via REST
    if (!isTestMode()) {
      try {
        const res = await cloudSync.authenticatedFetch('/api/concepts', {
          method: 'POST',
          body: JSON.stringify(newConcept)
        });
        if (res && res.ok) {
          const data = await res.json();
          return data.concept || newConcept;
        }
      } catch (err) {
        console.warn('[Add Concept Cloud Error]', err);
      }
    }

    return newConcept;
  },

  async updateConcept(id, updates) {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllConceptsLocal();
    const idx = all.findIndex(c => c.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
      await this.saveConceptsLocal(all);
      triggerChange({ [STORAGE_KEYS.CONCEPTS]: { newValue: all } });

      // Single Authoritative Mutation via REST
      if (!isTestMode()) {
        try {
          const res = await cloudSync.authenticatedFetch('/api/concepts', {
            method: 'POST',
            body: JSON.stringify({ ...all[idx], workspaceId: wsId })
          });
          if (res && res.ok) {
            const data = await res.json();
            return data.concept || all[idx];
          }
        } catch (err) {
          console.warn('[Update Concept Cloud Error]', err);
        }
      }
      return all[idx];
    }
    return null;
  },

  async deleteConcept(id) {
    const wsId = await this.getActiveWorkspaceId();
    let allConcepts = await this.getAllConceptsLocal();
    allConcepts = allConcepts.filter(c => c.id !== id);
    await this.saveConceptsLocal(allConcepts);

    let allEdges = await this.getAllEdgesLocal();
    allEdges = allEdges.filter(e => e.fromId !== id && e.toId !== id && e.from !== id && e.to !== id);
    await this.saveEdgesLocal(allEdges);

    triggerChange({
      [STORAGE_KEYS.CONCEPTS]: { newValue: allConcepts },
      [STORAGE_KEYS.EDGES]: { newValue: allEdges }
    });

    // Single Authoritative Mutation via REST
    if (!isTestMode()) {
      cloudSync.authenticatedFetch('/api/concepts/delete', {
        method: 'POST',
        body: JSON.stringify({ conceptId: id, workspaceId: wsId })
      }).catch(() => {});
    }
  },

  // --- Edges ---
  async getEdges() {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllEdgesLocal();
    return all.filter(e => (e.workspaceId || 'ws_default') === wsId);
  },

  async getAllEdgesLocal() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.EDGES]);
      return res[STORAGE_KEYS.EDGES] || [];
    } else if (hasLocalStorage) {
      // CRITICAL 4: Fix Safari localStorage typo STORAGE_KEYS.EDGES
      const data = localStorage.getItem(STORAGE_KEYS.EDGES);
      return data ? JSON.parse(data) : [];
    }
    return memStore[STORAGE_KEYS.EDGES] || [];
  },

  async saveEdgesLocal(edges) {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllEdgesLocal();
    const merged = mergeScopedItems(all, edges, wsId);
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.EDGES]: merged });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.EDGES, JSON.stringify(merged));
    memStore[STORAGE_KEYS.EDGES] = merged;
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

    const all = await this.getAllEdgesLocal();
    all.push(newEdge);
    await this.saveEdgesLocal(all);
    triggerChange({ [STORAGE_KEYS.EDGES]: { newValue: all } });

    // Single Authoritative Mutation via REST
    if (!isTestMode()) {
      try {
        const res = await cloudSync.authenticatedFetch('/api/edges', {
          method: 'POST',
          body: JSON.stringify(newEdge)
        });
        if (res && res.ok) {
          const data = await res.json();
          return data.edge || newEdge;
        }
      } catch (err) {
        console.warn('[Add Edge Cloud Error]', err);
      }
    }

    return newEdge;
  },

  async deleteEdge(id) {
    const wsId = await this.getActiveWorkspaceId();
    let all = await this.getAllEdgesLocal();
    all = all.filter(e => e.id !== id);
    await this.saveEdgesLocal(all);
    triggerChange({ [STORAGE_KEYS.EDGES]: { newValue: all } });

    // Single Authoritative Mutation via REST
    if (!isTestMode()) {
      cloudSync.authenticatedFetch('/api/edges/delete', {
        method: 'POST',
        body: JSON.stringify({ edgeId: id, workspaceId: wsId })
      }).catch(() => {});
    }
  },

  // --- Ink Strokes ---
  async getStrokes() {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllStrokesLocal();
    return all.filter(s => (s.workspaceId || 'ws_default') === wsId);
  },

  async getAllStrokesLocal() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.INK_STROKES]);
      return res[STORAGE_KEYS.INK_STROKES] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.INK_STROKES);
      return data ? JSON.parse(data) : [];
    }
    return memStore[STORAGE_KEYS.INK_STROKES] || [];
  },

  async saveStrokesLocal(strokes) {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllStrokesLocal();
    const merged = mergeScopedItems(all, strokes, wsId);
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.INK_STROKES]: merged });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.INK_STROKES, JSON.stringify(merged));
    memStore[STORAGE_KEYS.INK_STROKES] = merged;
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

    const all = await this.getAllStrokesLocal();
    all.push(newStroke);
    await this.saveStrokesLocal(all);
    if (!isTestMode() && cloudSync) {
      cloudSync.send({ type: 'ADD_INK_STROKE', stroke: newStroke });
    }
    return newStroke;
  },

  async deleteStrokes(ids) {
    const set = new Set(ids);
    const all = await this.getAllStrokesLocal();
    const filtered = all.filter(s => !set.has(s.id));
    await this.saveStrokesLocal(filtered);
    if (!isTestMode() && cloudSync) {
      cloudSync.send({ type: 'DELETE_INK_STROKES', strokeIds: ids });
    }
    return filtered;
  },

  // --- Proposals ---
  async getProposals() {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllProposalsLocal();
    return all.filter(p => (p.workspaceId || 'ws_default') === wsId && (p.status === 'pending' || !p.status));
  },

  async getAllProposalsLocal() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.PROPOSALS]);
      return res[STORAGE_KEYS.PROPOSALS] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.PROPOSALS);
      return data ? JSON.parse(data) : [];
    }
    return memStore[STORAGE_KEYS.PROPOSALS] || [];
  },

  async saveProposalsLocal(proposals) {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllProposalsLocal();
    const merged = mergeScopedItems(all, proposals, wsId);
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.PROPOSALS]: merged });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.PROPOSALS, JSON.stringify(merged));
    memStore[STORAGE_KEYS.PROPOSALS] = merged;
  },

  // --- Stale Proposals (Durable Recovery) ---
  async getStaleProposals() {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllStaleProposalsLocal();
    return all.filter(p => (p.workspaceId || 'ws_default') === wsId && p.status === 'stale');
  },

  async getAllStaleProposalsLocal() {
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.STALE_PROPOSALS]);
      return res[STORAGE_KEYS.STALE_PROPOSALS] || [];
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.STALE_PROPOSALS);
      return data ? JSON.parse(data) : [];
    }
    return memStore[STORAGE_KEYS.STALE_PROPOSALS] || [];
  },

  async saveStaleProposalsLocal(staleProposals) {
    const wsId = await this.getActiveWorkspaceId();
    const all = await this.getAllStaleProposalsLocal();
    const merged = mergeScopedItems(all, staleProposals, wsId);
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.STALE_PROPOSALS]: merged });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.STALE_PROPOSALS, JSON.stringify(merged));
    memStore[STORAGE_KEYS.STALE_PROPOSALS] = merged;
  },

  async dismissStaleProposal(proposalId, sourceId) {
    const wsId = await this.getActiveWorkspaceId();
    if (!isTestMode()) {
      cloudSync.authenticatedFetch('/api/proposals/dismiss-stale', {
        method: 'POST',
        body: JSON.stringify({ proposalId, sourceId, workspaceId: wsId })
      }).catch(() => {});
    }

    const all = await this.getAllStaleProposalsLocal();
    const filtered = all.filter(p => {
      if (proposalId && p.id === proposalId) return false;
      if (sourceId && p.sourceId === sourceId) return false;
      return true;
    });
    await this.saveStaleProposalsLocal(filtered);
    triggerChange({ [STORAGE_KEYS.STALE_PROPOSALS]: { newValue: filtered } });
  },

  // --- Dismissed Failed Sources Persistence ---
  async getDismissedFailedSourceIds() {
    const wsId = await this.getActiveWorkspaceId();
    let map = {};
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.DISMISSED_FAILED]);
      map = res[STORAGE_KEYS.DISMISSED_FAILED] || {};
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.DISMISSED_FAILED);
      map = data ? JSON.parse(data) : {};
    } else {
      map = memStore[STORAGE_KEYS.DISMISSED_FAILED] || {};
    }
    return new Set(map[wsId] || []);
  },

  async dismissFailedSource(sourceId) {
    if (!sourceId) return;
    const wsId = await this.getActiveWorkspaceId();
    let map = {};
    if (isChromeStorage) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.DISMISSED_FAILED]);
      map = res[STORAGE_KEYS.DISMISSED_FAILED] || {};
    } else if (hasLocalStorage) {
      const data = localStorage.getItem(STORAGE_KEYS.DISMISSED_FAILED);
      map = data ? JSON.parse(data) : {};
    } else {
      map = memStore[STORAGE_KEYS.DISMISSED_FAILED] || {};
    }
    if (!map[wsId]) map[wsId] = [];
    if (!map[wsId].includes(sourceId)) {
      map[wsId].push(sourceId);
    }
    if (isChromeStorage) await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_FAILED]: map });
    if (hasLocalStorage) localStorage.setItem(STORAGE_KEYS.DISMISSED_FAILED, JSON.stringify(map));
    memStore[STORAGE_KEYS.DISMISSED_FAILED] = map;
    triggerChange({ [STORAGE_KEYS.DISMISSED_FAILED]: { newValue: map } });
  },

  async applyProposal(proposalId, operations, options = {}) {
    const wsId = await this.getActiveWorkspaceId();
    const surface = options.surface || 'unknown';
    const clientActionId = options.clientActionId || 'unknown';

    if (!isTestMode()) {
      try {
        const res = await cloudSync.authenticatedFetch('/api/proposals/apply', {
          method: 'POST',
          headers: {
            'X-Detective-Surface': surface,
            'X-Detective-Action-Id': clientActionId
          },
          body: JSON.stringify({ proposalId, operations })
        });
        if (res && res.status !== 404) {
          const data = await res.json();
          if (!res.ok) {
            const errorMsg = data.message || data.error || 'Failed to apply proposal';
            const err = new Error(errorMsg);
            err.status = res.status;
            err.code = data.error;
            if (res.status === 409) {
              const all = await this.getAllProposalsLocal();
              const prop = all.find(p => p.id === proposalId);
              const sId = data.sourceId || (prop ? prop.sourceId : null);
              err.sourceId = sId;

              // Remove from pending proposals
              const remainingProposals = all.filter(p => p.id !== proposalId);
              await this.saveProposalsLocal(remainingProposals);

              // Add to durable stale proposals
              const allStale = await this.getAllStaleProposalsLocal();
              const staleItem = {
                id: proposalId,
                workspaceId: wsId,
                sourceId: sId,
                baseRevision: data.baseRevision || (prop ? prop.baseRevision : 1),
                summary: prop ? prop.summary : 'Outdated proposal',
                operations: operations || (prop ? prop.operations : []),
                status: 'stale',
                createdAt: new Date().toISOString()
              };
              const updatedStale = [staleItem, ...allStale.filter(p => p.id !== proposalId)];
              await this.saveStaleProposalsLocal(updatedStale);

              triggerChange({
                [STORAGE_KEYS.PROPOSALS]: { newValue: remainingProposals },
                [STORAGE_KEYS.STALE_PROPOSALS]: { newValue: updatedStale }
              });
            }
            throw err;
          }
          await this.fetchRemoteState();
          return data;
        }
      } catch (err) {
        if (err.status || err.code) throw err;
        console.warn('[Apply Proposal Cloud Error]', err);
      }
    }

    // Local Fallback
    const proposalList = await this.getAllProposalsLocal();
    const prop = proposalList.find(p => p.id === proposalId);
    if (!prop) throw new Error('Proposal not found');

    const ops = operations || prop.operations;
    const wsIdFallback = prop.workspaceId || 'ws_default';
    const allConcepts = await this.getAllConceptsLocal();
    const allEdges = await this.getAllEdgesLocal();
    const tempIdMap = new Map();
    const existingIds = new Set(allConcepts.map(c => c.id));
    let nextX = 150 + (allConcepts.length % 5) * 260;
    let nextY = 150 + Math.floor(allConcepts.length / 5) * 200;

    // Pass 1: Concepts
    for (const op of ops) {
      if (op.op === 'add_concept') {
        const realId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        if (op.tempId) tempIdMap.set(op.tempId, realId);
        existingIds.add(realId);
        allConcepts.push({
          id: realId,
          workspaceId: wsIdFallback,
          label: op.label,
          description: op.description || '',
          x: nextX,
          y: nextY,
          sourceRefs: [prop.sourceId],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        nextX += 260;
      } else if (op.op === 'enrich_concept') {
        const target = allConcepts.find(c => c.id === op.conceptId);
        if (target) {
          target.description = target.description ? `${target.description}\n• ${op.addition}` : op.addition;
          if (!target.sourceRefs) target.sourceRefs = [];
          if (prop.sourceId && !target.sourceRefs.includes(prop.sourceId)) target.sourceRefs.push(prop.sourceId);
        }
      }
    }

    // Pass 2: Edges (Safe check)
    for (const op of ops) {
      if (op.op === 'add_edge') {
        const fromId = tempIdMap.get(op.from) || op.from;
        const toId = tempIdMap.get(op.to) || op.to;
        if (existingIds.has(fromId) && existingIds.has(toId) && fromId !== toId) {
          allEdges.push({
            id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            workspaceId: wsIdFallback,
            fromId,
            toId,
            relation: op.relation || 'relates',
            label: op.label || '',
            sourceRefs: [prop.sourceId]
          });
        }
      }
    }

    await this.saveConceptsLocal(allConcepts);
    await this.saveEdgesLocal(allEdges);
    await this.saveProposalsLocal(proposalList.filter(p => p.id !== proposalId));
    triggerChange({
      [STORAGE_KEYS.CONCEPTS]: { newValue: allConcepts },
      [STORAGE_KEYS.EDGES]: { newValue: allEdges }
    });
    return { success: true, local: true };
  },

  async rejectProposal(proposalId) {
    if (!isTestMode()) {
      cloudSync.authenticatedFetch('/api/proposals/reject', {
        method: 'POST',
        body: JSON.stringify({ proposalId })
      }).catch(() => {});
    }

    const all = await this.getAllProposalsLocal();
    const filtered = all.filter(p => p.id !== proposalId);
    await this.saveProposalsLocal(filtered);
    triggerChange({ [STORAGE_KEYS.PROPOSALS]: { newValue: filtered } });
  },

  async fetchRemoteState() {
    if (isTestMode()) {
      return {
        workspaces: await this.getWorkspaces(),
        concepts: await this.getConcepts(),
        edges: await this.getEdges(),
        sources: await this.getSources(),
        inkStrokes: await this.getStrokes(),
        proposals: await this.getProposals(),
        staleProposals: await this.getStaleProposals()
      };
    }
    const wsId = await this.getActiveWorkspaceId();

    try {
      const res = await cloudSync.authenticatedFetch(`/api/state?workspaceId=${encodeURIComponent(wsId)}`);
      if (res && res.status === 200) {
        const data = await res.json();
        if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
          await this.saveWorkspacesLocal(data.workspaces);
          triggerChange({ [STORAGE_KEYS.WORKSPACES]: { newValue: data.workspaces } });
        }
        if (data.concepts) await this.saveConceptsLocal(data.concepts);
        if (data.edges) await this.saveEdgesLocal(data.edges);
        if (data.sources) await this.saveSourcesLocal(data.sources);
        if (data.inkStrokes) await this.saveStrokesLocal(data.inkStrokes);
        if (data.proposals) await this.saveProposalsLocal(data.proposals);
        if (data.staleProposals) await this.saveStaleProposalsLocal(data.staleProposals);
        triggerChange({
          [STORAGE_KEYS.CONCEPTS]: { newValue: data.concepts },
          [STORAGE_KEYS.EDGES]: { newValue: data.edges },
          [STORAGE_KEYS.INK_STROKES]: { newValue: data.inkStrokes },
          [STORAGE_KEYS.PROPOSALS]: { newValue: data.proposals },
          [STORAGE_KEYS.STALE_PROPOSALS]: { newValue: data.staleProposals },
          [STORAGE_KEYS.SOURCES]: { newValue: data.sources }
        });
        cloudSync.setStatus('connected');
        return data;
      } else {
        cloudSync.setStatus('disconnected');
      }
    } catch (e) {
      console.warn('[Fetch Remote State Error]', e);
      cloudSync.setStatus('disconnected');
    }
  },

  // --- Backward Compatibility Migration ---
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
    const [concepts, edges, sources, strokes, workspaces] = await Promise.all([
      this.getAllConceptsLocal(),
      this.getAllEdgesLocal(),
      this.getAllSourcesLocal(),
      this.getAllStrokesLocal(),
      this.getWorkspaces()
    ]);
    return {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      generator: 'Detective Map V2',
      data: {
        workspaces,
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
    const { workspaces, concepts, edges, sources, strokes, quotes } = payload.data;
    if (Array.isArray(workspaces)) await this.saveWorkspacesLocal(workspaces);
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
    Object.keys(memStore).forEach(k => delete memStore[k]);
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
