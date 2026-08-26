// src/worker.js - Detective Map V2.0 Living Learning Map Backend
// Cloudflare Worker + SQLite Durable Objects + Workers AI + Realtime WebSockets

import { ASSETS_MANIFEST } from "./assets-bundle.js";
import { chunkSourceText, validateAndSanitizeOperations, validateProposalSubset } from "../shared/engine-core.js";

export class DetectiveMapWorkspace {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sessions = new Map(); // ws -> { authenticated: boolean, deviceToken: string, workspaceId: string }
    this.initDatabase();
  }

  initDatabase() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS system_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        archived INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT,
        text TEXT NOT NULL,
        url TEXT,
        capturedAt TEXT NOT NULL,
        contentHash TEXT,
        processingStatus TEXT NOT NULL DEFAULT 'completed'
      );

      CREATE TABLE IF NOT EXISTS concepts (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        x REAL NOT NULL,
        y REAL NOT NULL,
        width REAL DEFAULT 240,
        pinned INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        sourceRefs TEXT,
        createdBy TEXT DEFAULT 'ai'
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        fromId TEXT NOT NULL,
        toId TEXT NOT NULL,
        relation TEXT,
        label TEXT,
        sourceRefs TEXT,
        createdBy TEXT DEFAULT 'ai'
      );

      CREATE TABLE IF NOT EXISTS ink_strokes (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        tool TEXT NOT NULL,
        width REAL NOT NULL,
        opacity REAL NOT NULL,
        color TEXT NOT NULL,
        points TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        baseRevision INTEGER NOT NULL,
        sourceId TEXT,
        summary TEXT,
        operations TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        token TEXT PRIMARY KEY,
        deviceName TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pairing_pins (
        pin TEXT PRIMARY KEY,
        expiresAt INTEGER NOT NULL
      );
    `);

    // Ensure default workspace exists
    const wsCount = this.sql.exec(`SELECT COUNT(*) as count FROM workspaces`).toArray()[0].count;
    if (wsCount === 0) {
      const now = new Date().toISOString();
      this.sql.exec(`
        INSERT INTO workspaces (id, title, createdAt, updatedAt, revision, archived)
        VALUES ('ws_default', 'My Learning Map', '${now}', '${now}', 1, 0);
      `);
    }

    // CRITICAL 1: Durable Auth Migration (Invalidate all pre-v2.1 tokens exactly once)
    const meta = this.sql.exec(`SELECT value FROM system_meta WHERE key = 'auth_version'`).toArray();
    if (meta.length === 0 || meta[0].value !== 'v2.1_hardened') {
      this.sql.exec(`DELETE FROM auth_tokens;`);
      this.sql.exec(`DELETE FROM pairing_pins;`);
      this.sql.exec(`INSERT OR REPLACE INTO system_meta (key, value) VALUES ('auth_version', 'v2.1_hardened');`);
    }

    // Purge expired pairing pins
    this.sql.exec(`DELETE FROM pairing_pins WHERE expiresAt <= ${Date.now()}`);
  }

  isAuthorized(token) {
    if (!token) return false;
    const res = this.sql.exec(`SELECT token FROM auth_tokens WHERE token = ?`, token).toArray();
    return res.length > 0;
  }

  generateDeviceToken(deviceName = 'Unknown Device') {
    const token = 'dt_' + crypto.randomUUID().replace(/-/g, '');
    this.sql.exec(`
      INSERT INTO auth_tokens (token, deviceName, createdAt)
      VALUES (?, ?, ?)
    `, token, deviceName, new Date().toISOString());
    return token;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 1. Secure Bootstrap PIN Endpoint (/api/auth/bootstrap-pin)
    // CRITICAL 2: Requires Cloudflare Secret (DM_BOOTSTRAP_SECRET)
    if (url.pathname === '/api/auth/bootstrap-pin' && request.method === 'POST') {
      const expectedSecret = this.env.DM_BOOTSTRAP_SECRET || this.env.BOOTSTRAP_SECRET;
      let clientSecret = request.headers.get('X-Bootstrap-Secret');
      if (!clientSecret) {
        try {
          const body = await request.clone().json();
          clientSecret = body.bootstrapSecret;
        } catch {}
      }

      if (!expectedSecret || !clientSecret || clientSecret !== expectedSecret) {
        return jsonResponse({ error: 'Forbidden. Valid bootstrap secret required.' }, 403);
      }

      // Generate a dynamic one-time PIN
      const pin = 'PIN-' + Math.floor(100000 + Math.random() * 900000);
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
      this.sql.exec(`INSERT INTO pairing_pins (pin, expiresAt) VALUES (?, ?)`, pin, expiresAt);

      return jsonResponse({ success: true, pin, expiresAt });
    }

    // 2. Device Pairing Endpoint (/api/auth/pair & /api/pair)
    if ((url.pathname === '/api/auth/pair' || url.pathname === '/api/pair') && request.method === 'POST') {
      try {
        const body = await request.json();
        const inputPin = (body.pairingCode || body.pin || '').trim().toUpperCase();

        if (!inputPin || inputPin === 'MAP-2026') {
          return jsonResponse({ success: false, error: 'Invalid or expired Pairing Code' }, 401);
        }

        const pins = this.sql.exec(
          `SELECT pin FROM pairing_pins WHERE pin = ? AND expiresAt > ?`,
          inputPin, Date.now()
        ).toArray();

        if (pins.length > 0) {
          // ATOMIC CONSUMPTION: Delete PIN immediately upon verification
          this.sql.exec(`DELETE FROM pairing_pins WHERE pin = ?`, inputPin);

          const deviceToken = this.generateDeviceToken(body.deviceName || 'Client Device');
          return jsonResponse({
            success: true,
            token: deviceToken,
            message: 'Device paired successfully!'
          });
        }

        return jsonResponse({ success: false, error: 'Invalid or expired Pairing Code' }, 401);
      } catch (err) {
        return jsonResponse({ error: err.message }, 400);
      }
    }

    // 3. Generate New One-Time Pairing PIN (/api/auth/generate-pin)
    // Requires an authorized device token
    if (url.pathname === '/api/auth/generate-pin' && request.method === 'POST') {
      const auth = this.checkAuthHeader(request);
      if (!auth) return jsonResponse({ error: 'Unauthorized' }, 401);

      const randomPin = 'PIN-' + Math.floor(100000 + Math.random() * 900000);
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins
      this.sql.exec(`INSERT INTO pairing_pins (pin, expiresAt) VALUES (?, ?)`, randomPin, expiresAt);
      return jsonResponse({ success: true, pin: randomPin, expiresAt });
    }

    // 4. WebSocket Upgrade (/api/ws)
    if (url.pathname === '/api/ws' || url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      this.sessions.set(server, { authenticated: false, deviceToken: null, workspaceId: 'ws_default' });

      server.addEventListener('message', async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await this.handleWebSocketMessage(server, msg);
        } catch (e) {
          console.warn('[WS Parse Error]', e);
        }
      });

      server.addEventListener('close', () => {
        this.sessions.delete(server);
      });

      server.addEventListener('error', () => {
        this.sessions.delete(server);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // 5. Authenticated REST Endpoints (Require Bearer Token)
    const token = this.checkAuthHeader(request);
    if (!token) {
      return jsonResponse({ error: 'Unauthorized. Valid Bearer device token required.' }, 401);
    }

    // GET /api/state
    if (url.pathname === '/api/state' && request.method === 'GET') {
      const workspaceId = url.searchParams.get('workspaceId') || 'ws_default';
      const state = this.getFullWorkspaceState(workspaceId);
      return jsonResponse(state);
    }

    // GET /api/workspaces (CRITICAL 2: Cross-Device Workspace Sync)
    if (url.pathname === '/api/workspaces' && request.method === 'GET') {
      const workspaces = this.sql.exec(`SELECT * FROM workspaces WHERE archived = 0 ORDER BY updatedAt DESC`).toArray();
      return jsonResponse({ workspaces });
    }

    // POST /api/workspaces
    if (url.pathname === '/api/workspaces' && request.method === 'POST') {
      const body = await request.json();
      const id = body.id || 'ws_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const title = (body.title || 'Untitled Map').trim();
      const now = new Date().toISOString();

      this.sql.exec(`
        INSERT INTO workspaces (id, title, createdAt, updatedAt, revision, archived)
        VALUES (?, ?, ?, ?, 1, 0)
      `, id, title, now, now);

      const wsObj = { id, title, createdAt: now, updatedAt: now, revision: 1 };
      this.broadcast({ type: 'WORKSPACE_CREATED', workspace: wsObj });
      return jsonResponse({ success: true, workspace: wsObj });
    }

    // POST /api/sources & /api/quote
    if ((url.pathname === '/api/sources' || url.pathname === '/api/quote') && request.method === 'POST') {
      try {
        const body = await request.json();
        const workspaceId = body.workspaceId || 'ws_default';
        const sourceId = body.id || 'src_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const now = new Date().toISOString();

        this.sql.exec(`
          INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing')
        `, sourceId, workspaceId, body.type || 'chatgpt_selection', body.title || 'Source Evidence', body.text || '', body.url || '', now, '');

        const newSource = {
          id: sourceId,
          workspaceId,
          type: body.type || 'chatgpt_selection',
          title: body.title || 'Source Evidence',
          text: body.text || '',
          url: body.url || '',
          capturedAt: now,
          processingStatus: 'processing'
        };

        this.broadcast({ type: 'SOURCE_ADDED', source: newSource });

        // Trigger Incremental AI Patch Proposal asynchronously
        this.ctx.waitUntil(this.processSourceWithAI(workspaceId, newSource));

        return jsonResponse({ success: true, source: newSource, quote: newSource });
      } catch (err) {
        return jsonResponse({ error: err.message }, 400);
      }
    }

    // POST /api/proposals/apply (CRITICAL 3 & 4 & 6: Stale check & safe subset validation)
    if (url.pathname === '/api/proposals/apply' && request.method === 'POST') {
      const body = await request.json();
      const { proposalId, operations } = body;

      const proposalRows = this.sql.exec(`SELECT * FROM proposals WHERE id = ?`, proposalId).toArray();
      if (proposalRows.length === 0) {
        return jsonResponse({ error: 'Proposal not found' }, 404);
      }

      const proposal = proposalRows[0];
      const workspaceId = proposal.workspaceId;

      const wsRow = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];
      const currentRevision = wsRow ? wsRow.revision : 1;

      if (proposal.baseRevision !== currentRevision) {
        // Mark proposal as stale in SQLite so it does not reappear
        this.sql.exec(`UPDATE proposals SET status = 'stale' WHERE id = ?`, proposalId);
        return jsonResponse({
          error: 'PROPOSAL_STALE',
          baseRevision: proposal.baseRevision,
          currentRevision: currentRevision,
          message: 'Map changed since this proposal was created. Re-analyze.'
        }, 409);
      }

      const opsToApply = operations || JSON.parse(proposal.operations);
      const applyResult = this.applyProposalOperations(workspaceId, opsToApply, proposal.sourceId);

      this.sql.exec(`UPDATE proposals SET status = 'applied' WHERE id = ?`, proposalId);

      this.broadcast({
        type: 'PROPOSAL_APPLIED',
        proposalId,
        workspaceId,
        revision: applyResult.revision,
        appliedConcepts: applyResult.concepts,
        appliedEdges: applyResult.edges
      });

      return jsonResponse({ success: true, ...applyResult });
    }

    // POST /api/proposals/reject (CRITICAL 6: Persist proposal rejection)
    if (url.pathname === '/api/proposals/reject' && request.method === 'POST') {
      const body = await request.json();
      const { proposalId } = body;
      if (!proposalId) return jsonResponse({ error: 'proposalId required' }, 400);

      this.sql.exec(`UPDATE proposals SET status = 'rejected' WHERE id = ?`, proposalId);
      this.broadcast({ type: 'PROPOSAL_REJECTED', proposalId });
      return jsonResponse({ success: true, proposalId });
    }

    // POST /api/concepts (CRITICAL 3: Authoritative Single-Write Mutation)
    if (url.pathname === '/api/concepts' && request.method === 'POST') {
      const body = await request.json();
      const workspaceId = body.workspaceId || 'ws_default';
      const conceptId = body.id || 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const now = new Date().toISOString();

      const existing = this.sql.exec(`SELECT * FROM concepts WHERE id = ? AND workspaceId = ?`, conceptId, workspaceId).toArray()[0];
      if (existing) {
        const label = body.label !== undefined ? body.label : existing.label;
        const description = body.description !== undefined ? body.description : existing.description;
        const x = body.x !== undefined ? body.x : existing.x;
        const y = body.y !== undefined ? body.y : existing.y;
        const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned;
        const sourceRefs = body.sourceRefs ? JSON.stringify(body.sourceRefs) : existing.sourceRefs;

        this.sql.exec(`
          UPDATE concepts
          SET label = ?, description = ?, x = ?, y = ?, pinned = ?, sourceRefs = ?, updatedAt = ?
          WHERE id = ? AND workspaceId = ?
        `, label, description, x, y, pinned, sourceRefs, now, conceptId, workspaceId);
      } else {
        this.sql.exec(`
          INSERT INTO concepts (id, workspaceId, label, description, x, y, width, pinned, createdAt, updatedAt, sourceRefs, createdBy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, conceptId, workspaceId, body.label, body.description || '', body.x || 150, body.y || 150, body.width || 240, body.pinned ? 1 : 0, now, now, JSON.stringify(body.sourceRefs || []), body.createdBy || 'user');
      }

      this.incrementRevision(workspaceId);
      const wsRow = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];
      const concept = { ...body, id: conceptId, workspaceId, updatedAt: now };

      this.broadcast({ type: 'CONCEPT_UPDATED', concept, workspaceId, revision: wsRow.revision });
      return jsonResponse({ success: true, concept, revision: wsRow.revision });
    }

    // POST /api/concepts/delete (CRITICAL 3: Authoritative Single-Write Delete)
    if (url.pathname === '/api/concepts/delete' && request.method === 'POST') {
      const body = await request.json();
      const { conceptId, workspaceId = 'ws_default' } = body;

      if (!conceptId) return jsonResponse({ error: 'conceptId required' }, 400);

      const deletedEdges = this.sql.exec(
        `SELECT id FROM edges WHERE (fromId = ? OR toId = ?) AND workspaceId = ?`,
        conceptId, conceptId, workspaceId
      ).toArray().map(e => e.id);

      this.sql.exec(`DELETE FROM edges WHERE (fromId = ? OR toId = ?) AND workspaceId = ?`, conceptId, conceptId, workspaceId);
      this.sql.exec(`DELETE FROM concepts WHERE id = ? AND workspaceId = ?`, conceptId, workspaceId);

      this.incrementRevision(workspaceId);
      const wsRow = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];

      this.broadcast({
        type: 'CONCEPT_DELETED',
        conceptId,
        deletedEdgeIds: deletedEdges,
        workspaceId,
        revision: wsRow.revision
      });

      return jsonResponse({ success: true, conceptId, deletedEdgeIds: deletedEdges, revision: wsRow.revision });
    }

    // POST /api/edges (CRITICAL 3: Authoritative Single-Write Edge Add)
    if (url.pathname === '/api/edges' && request.method === 'POST') {
      const body = await request.json();
      const workspaceId = body.workspaceId || 'ws_default';
      const edgeId = body.id || 'e_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const fromId = body.fromId || body.from;
      const toId = body.toId || body.to;

      if (!fromId || !toId) return jsonResponse({ error: 'from and to required' }, 400);

      this.sql.exec(`
        INSERT OR REPLACE INTO edges (id, workspaceId, fromId, toId, relation, label, sourceRefs, createdBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, edgeId, workspaceId, fromId, toId, body.relation || 'relates', body.label || '', JSON.stringify(body.sourceRefs || []), body.createdBy || 'user');

      this.incrementRevision(workspaceId);
      const wsRow = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];
      const edge = { id: edgeId, workspaceId, fromId, toId, relation: body.relation || 'relates', label: body.label || '' };

      this.broadcast({ type: 'EDGE_ADDED', edge, workspaceId, revision: wsRow.revision });
      return jsonResponse({ success: true, edge, revision: wsRow.revision });
    }

    // POST /api/edges/delete (CRITICAL 3: Authoritative Single-Write Edge Delete)
    if (url.pathname === '/api/edges/delete' && request.method === 'POST') {
      const body = await request.json();
      const { edgeId, workspaceId = 'ws_default' } = body;

      if (!edgeId) return jsonResponse({ error: 'edgeId required' }, 400);

      this.sql.exec(`DELETE FROM edges WHERE id = ? AND workspaceId = ?`, edgeId, workspaceId);
      this.incrementRevision(workspaceId);
      const wsRow = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];

      this.broadcast({ type: 'EDGE_DELETED', edgeId, workspaceId, revision: wsRow.revision });
      return jsonResponse({ success: true, edgeId, revision: wsRow.revision });
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  }

  checkAuthHeader(request) {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (this.isAuthorized(token)) return token;
    return null;
  }

  async handleWebSocketMessage(ws, msg) {
    const session = this.sessions.get(ws);
    if (!session) return;

    // 1. Authentication Handshake
    if (msg.type === 'AUTH') {
      const token = (msg.token || '').trim();
      if (this.isAuthorized(token)) {
        session.authenticated = true;
        session.deviceToken = token;
        session.workspaceId = msg.workspaceId || 'ws_default';

        ws.send(JSON.stringify({
          type: 'AUTH_SUCCESS',
          workspaceId: session.workspaceId
        }));

        const state = this.getFullWorkspaceState(session.workspaceId);
        ws.send(JSON.stringify({
          type: 'INIT_STATE',
          ...state
        }));
        return;
      } else {
        ws.send(JSON.stringify({ type: 'AUTH_ERROR', message: 'Unauthorized device token' }));
        ws.close(4401, 'Unauthorized');
        return;
      }
    }

    if (!session.authenticated) {
      ws.send(JSON.stringify({ type: 'AUTH_REQUIRED', message: 'Send AUTH message first' }));
      return;
    }

    // 2. Switch Workspace (CRITICAL E)
    if (msg.type === 'SWITCH_WORKSPACE' && msg.workspaceId) {
      const wsCheck = this.sql.exec(`SELECT id FROM workspaces WHERE id = ? AND archived = 0`, msg.workspaceId).toArray();
      if (wsCheck.length > 0) {
        session.workspaceId = msg.workspaceId;
        const newState = this.getFullWorkspaceState(msg.workspaceId);
        ws.send(JSON.stringify({
          type: 'WORKSPACE_SWITCHED',
          workspaceId: msg.workspaceId,
          ...newState
        }));
      }
      return;
    }

    const wsId = session.workspaceId;

    // 3. Real-time Ink Strokes (WebSocket handles ink drawing stream)
    if (msg.type === 'ADD_INK_STROKE' && msg.stroke) {
      const s = msg.stroke;
      this.sql.exec(`
        INSERT OR REPLACE INTO ink_strokes (id, workspaceId, tool, width, opacity, color, points)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, s.id, wsId, s.tool, s.width, s.opacity, s.color, JSON.stringify(s.points));

      this.broadcastExcept(ws, { type: 'INK_STROKE_ADDED', stroke: s, workspaceId: wsId });
    } else if (msg.type === 'DELETE_INK_STROKES' && Array.isArray(msg.strokeIds)) {
      for (const id of msg.strokeIds) {
        this.sql.exec(`DELETE FROM ink_strokes WHERE id = ? AND workspaceId = ?`, id, wsId);
      }
      this.broadcastExcept(ws, { type: 'INK_STROKES_DELETED', strokeIds: msg.strokeIds, workspaceId: wsId });
    }

    // 4. Drag Position Preview (Broadcasts cursor position without triggering DB increment)
    if (msg.type === 'MOVE_CONCEPT_PREVIEW' && msg.id) {
      this.broadcastExcept(ws, { type: 'CONCEPT_MOVED', id: msg.id, x: msg.x, y: msg.y, workspaceId: wsId });
    }

    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG' }));
    }
  }

  getFullWorkspaceState(workspaceId) {
    const workspaces = this.sql.exec(`SELECT * FROM workspaces WHERE archived = 0 ORDER BY updatedAt DESC`).toArray();
    const wsRow = workspaces.find(w => w.id === workspaceId) || { id: workspaceId, title: 'My Learning Map', revision: 1 };
    const sources = this.sql.exec(`SELECT * FROM sources WHERE workspaceId = ? ORDER BY capturedAt DESC`, workspaceId).toArray();
    const rawConcepts = this.sql.exec(`SELECT * FROM concepts WHERE workspaceId = ?`, workspaceId).toArray();
    const rawEdges = this.sql.exec(`SELECT * FROM edges WHERE workspaceId = ?`, workspaceId).toArray();
    const rawStrokes = this.sql.exec(`SELECT * FROM ink_strokes WHERE workspaceId = ?`, workspaceId).toArray();
    const rawProposals = this.sql.exec(`SELECT * FROM proposals WHERE workspaceId = ? AND status = 'pending' ORDER BY createdAt DESC`, workspaceId).toArray();

    return {
      workspaces,
      workspace: wsRow,
      sources,
      concepts: rawConcepts.map(c => ({
        ...c,
        pinned: !!c.pinned,
        sourceRefs: safeParseJSON(c.sourceRefs, [])
      })),
      edges: rawEdges.map(e => ({
        ...e,
        sourceRefs: safeParseJSON(e.sourceRefs, [])
      })),
      inkStrokes: rawStrokes.map(s => ({
        ...s,
        points: safeParseJSON(s.points, [])
      })),
      proposals: rawProposals.map(p => ({
        ...p,
        operations: safeParseJSON(p.operations, [])
      }))
    };
  }

  incrementRevision(workspaceId) {
    this.sql.exec(`UPDATE workspaces SET revision = revision + 1, updatedAt = ? WHERE id = ?`, new Date().toISOString(), workspaceId);
  }

  // --- Cloudflare Workers AI with Deterministic Chunking & Strict Schema Validation ---
  async processSourceWithAI(workspaceId, source) {
    try {
      const state = this.getFullWorkspaceState(workspaceId);
      const currentConcepts = state.concepts;
      const currentEdges = state.edges;
      const baseRevision = state.workspace.revision || 1;

      if (!this.env.AI) {
        this.sql.exec(`UPDATE sources SET processingStatus = 'failed' WHERE id = ?`, source.id);
        this.broadcast({ type: 'SOURCE_FAILED', sourceId: source.id, error: 'Workers AI binding not configured.' });
        return;
      }

      // Chunk long text deterministically (up to ~10,000 words) using shared engine core
      const textChunks = chunkSourceText(source.text, 2800, 250);
      let rawExtractedOperations = [];
      let finalSummary = `Analyzed ${source.title || 'source evidence'} (${textChunks.length} chunk${textChunks.length > 1 ? 's' : ''}).`;

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        const chunkIndexText = textChunks.length > 1 ? `[Part ${i + 1}/${textChunks.length}] ` : '';

        const systemPrompt = `You are the core extraction engine of Detective Map.
Your goal: Compare new learning material to existing concepts and generate an INCREMENTAL JSON PATCH.

RULES:
1. ONLY return valid JSON object matching the exact schema below.
2. If an idea is already represented by an existing concept, use "enrich_concept". DO NOT duplicate.
3. Only use "add_concept" for genuinely new key ideas. Keep labels concise (2-6 words).
4. Use "add_edge" to link concepts logically (relation like "enhances", "causes", "requires", "contrasts").
5. Do NOT include Markdown code fences or extra text. Output pure JSON.

SCHEMA:
{
  "summary": "1 concise sentence explaining the addition",
  "operations": [
    { "op": "add_concept", "tempId": "tmp_1", "label": "Concept Title", "description": "1 sentence explanation" },
    { "op": "enrich_concept", "conceptId": "<existing_concept_id>", "addition": "new insight to append" },
    { "op": "add_edge", "from": "<conceptId_or_tempId>", "to": "<conceptId_or_tempId>", "relation": "relates", "label": "connective text" },
    { "op": "flag_conflict", "conceptId": "<existing_concept_id>", "note": "contradiction note" }
  ]
}`;

        const userPrompt = `Existing Concepts:
${JSON.stringify(currentConcepts.map(c => ({ id: c.id, label: c.label, description: c.description })), null, 2)}

Existing Relationships:
${JSON.stringify(currentEdges.map(e => ({ from: e.fromId, to: e.toId, label: e.label })), null, 2)}

New Content ${chunkIndexText}:
"""
${chunk}
"""`;

        try {
          const aiResponse = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 1200
          });

          let rawText = '';
          if (aiResponse && typeof aiResponse === 'object') {
            rawText = aiResponse.response || aiResponse.text || JSON.stringify(aiResponse);
          } else if (typeof aiResponse === 'string') {
            rawText = aiResponse;
          }

          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed && Array.isArray(parsed.operations)) {
              rawExtractedOperations.push(...parsed.operations);
              if (parsed.summary && i === 0) finalSummary = parsed.summary;
            }
          }
        } catch (chunkErr) {
          console.warn(`[AI Chunk ${i + 1} Error]`, chunkErr.message);
        }
      }

      // CRITICAL C: Strict Schema Validation via shared engine core
      const validatedOperations = validateAndSanitizeOperations(
        rawExtractedOperations,
        currentConcepts,
        currentEdges,
        source.id
      );

      if (validatedOperations.length === 0) {
        this.sql.exec(`UPDATE sources SET processingStatus = 'failed' WHERE id = ?`, source.id);
        this.broadcast({ type: 'SOURCE_FAILED', sourceId: source.id, error: 'AI could not extract structured insights from this text.' });
        return;
      }

      // Save valid ChangeProposal in SQLite
      const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const now = new Date().toISOString();

      this.sql.exec(`
        INSERT INTO proposals (id, workspaceId, baseRevision, sourceId, summary, operations, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `, proposalId, workspaceId, baseRevision, source.id, finalSummary, JSON.stringify(validatedOperations), now);

      this.sql.exec(`UPDATE sources SET processingStatus = 'completed' WHERE id = ?`, source.id);

      const proposal = {
        id: proposalId,
        workspaceId,
        baseRevision,
        sourceId: source.id,
        summary: finalSummary,
        operations: validatedOperations,
        status: 'pending',
        createdAt: now
      };

      this.broadcast({ type: 'PROPOSAL_CREATED', proposal, sourceId: source.id });
    } catch (err) {
      console.error('[AI Processing Fatal Error]', err);
      this.sql.exec(`UPDATE sources SET processingStatus = 'failed' WHERE id = ?`, source.id);
      this.broadcast({ type: 'SOURCE_FAILED', sourceId: source.id, error: err.message });
    }
  }

  applyProposalOperations(workspaceId, operations, sourceId) {
    const existingConcepts = this.sql.exec(`SELECT * FROM concepts WHERE workspaceId = ?`, workspaceId).toArray();
    // CRITICAL 4: Strict validation of selected subset to eliminate dangling edges
    const safeOps = validateProposalSubset(operations, existingConcepts);

    const tempIdMap = new Map();
    const createdConcepts = [];
    const createdEdges = [];
    const now = new Date().toISOString();
    const existingConceptIdSet = new Set(existingConcepts.map(c => c.id));
    let nextX = 150 + (existingConcepts.length % 5) * 260;
    let nextY = 150 + Math.floor(existingConcepts.length / 5) * 200;

    // Pass 1: Apply Concepts
    for (const op of safeOps) {
      if (op.op === 'add_concept') {
        const realId = 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
        if (op.tempId) tempIdMap.set(op.tempId, realId);
        existingConceptIdSet.add(realId);

        const label = (op.label || 'New Concept').trim();
        const description = (op.description || '').trim();
        const refs = JSON.stringify(op.sourceRefs || (sourceId ? [sourceId] : []));

        this.sql.exec(`
          INSERT INTO concepts (id, workspaceId, label, description, x, y, width, pinned, createdAt, updatedAt, sourceRefs, createdBy)
          VALUES (?, ?, ?, ?, ?, ?, 240, 0, ?, ?, ?, 'ai')
        `, realId, workspaceId, label, description, nextX, nextY, now, now, refs);

        createdConcepts.push({ id: realId, workspaceId, label, description, x: nextX, y: nextY, sourceRefs: [sourceId] });
        nextX += 260;
      } else if (op.op === 'enrich_concept' && op.conceptId) {
        if (existingConceptIdSet.has(op.conceptId)) {
          const current = this.sql.exec(`SELECT * FROM concepts WHERE id = ?`, op.conceptId).toArray()[0];
          if (current) {
            const newDesc = current.description ? `${current.description}\n• ${op.addition}` : op.addition;
            const refs = safeParseJSON(current.sourceRefs, []);
            if (sourceId && !refs.includes(sourceId)) refs.push(sourceId);

            this.sql.exec(`
              UPDATE concepts SET description = ?, sourceRefs = ?, updatedAt = ? WHERE id = ?
            `, newDesc, JSON.stringify(refs), now, op.conceptId);
          }
        }
      }
    }

    // Pass 2: Apply Edges with guaranteed real endpoints
    for (const op of safeOps) {
      if (op.op === 'add_edge') {
        const fromId = tempIdMap.get(op.from) || op.from;
        const toId = tempIdMap.get(op.to) || op.to;

        if (existingConceptIdSet.has(fromId) && existingConceptIdSet.has(toId) && fromId !== toId) {
          const edgeId = 'e_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
          this.sql.exec(`
            INSERT OR REPLACE INTO edges (id, workspaceId, fromId, toId, relation, label, sourceRefs, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')
          `, edgeId, workspaceId, fromId, toId, op.relation || 'relates', op.label || '', JSON.stringify([sourceId]));

          createdEdges.push({ id: edgeId, workspaceId, fromId, toId, label: op.label || '' });
        }
      }
    }

    this.incrementRevision(workspaceId);
    const wsRow = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];

    return {
      revision: wsRow ? wsRow.revision : 1,
      concepts: createdConcepts,
      edges: createdEdges
    };
  }

  broadcast(msg) {
    const payload = JSON.stringify(msg);
    for (const [ws, session] of this.sessions) {
      if (session.authenticated) {
        try { ws.send(payload); } catch { this.sessions.delete(ws); }
      }
    }
  }

  broadcastExcept(senderWs, msg) {
    const payload = JSON.stringify(msg);
    for (const [ws, session] of this.sessions) {
      if (session.authenticated && ws !== senderWs) {
        try { ws.send(payload); } catch { this.sessions.delete(ws); }
      }
    }
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bootstrap-Secret'
    }
  });
}

function safeParseJSON(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : (str || fallback); } catch { return fallback; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bootstrap-Secret'
        }
      });
    }

    if (url.pathname.startsWith('/api/') || url.pathname === '/ws') {
      const id = env.DETECTIVE_WORKSPACE.idFromName('global_workspace_hub');
      const stub = env.DETECTIVE_WORKSPACE.get(id);
      return stub.fetch(request);
    }

    let pathname = url.pathname;
    if (pathname === '/' || pathname === '/canvas') {
      pathname = '/canvas.html';
    }

    const asset = ASSETS_MANIFEST[pathname];
    if (asset) {
      return new Response(asset.content, {
        headers: {
          'Content-Type': asset.mime,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
