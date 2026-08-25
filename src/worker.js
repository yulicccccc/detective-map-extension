// src/worker.js - Detective Map V2.0 Living Learning Map Backend
// Cloudflare Worker + SQLite Durable Objects + Workers AI + Realtime WebSockets

import { ASSETS_MANIFEST } from "./assets-bundle.js";

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

    // Ensure initial pairing PIN is available (e.g. valid for first-time pairing)
    const pinCount = this.sql.exec(`SELECT COUNT(*) as count FROM pairing_pins WHERE expiresAt > ${Date.now()}`).toArray()[0].count;
    if (pinCount === 0) {
      // Create a clean active pairing pin
      const defaultPin = "MAP-2026";
      this.sql.exec(`
        INSERT OR REPLACE INTO pairing_pins (pin, expiresAt)
        VALUES ('${defaultPin}', ${Date.now() + 30 * 24 * 3600 * 1000});
      `);
    }
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

    // 1. Device Pairing Endpoint (/api/auth/pair & /api/pair)
    if ((url.pathname === '/api/auth/pair' || url.pathname === '/api/pair') && request.method === 'POST') {
      try {
        const body = await request.json();
        const inputPin = (body.pairingCode || body.pin || '').trim().toUpperCase();

        const pins = this.sql.exec(
          `SELECT pin FROM pairing_pins WHERE pin = ? AND expiresAt > ?`,
          inputPin, Date.now()
        ).toArray();

        if (pins.length > 0) {
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

    // 2. Generate New Pairing PIN (/api/auth/generate-pin)
    if (url.pathname === '/api/auth/generate-pin' && request.method === 'POST') {
      const auth = this.checkAuthHeader(request);
      if (!auth) return jsonResponse({ error: 'Unauthorized' }, 401);

      const randomPin = 'MAP-' + Math.floor(1000 + Math.random() * 9000);
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins
      this.sql.exec(`INSERT INTO pairing_pins (pin, expiresAt) VALUES (?, ?)`, randomPin, expiresAt);
      return jsonResponse({ success: true, pin: randomPin, expiresAt });
    }

    // 3. WebSocket Upgrade (/api/ws)
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

    // 4. Authenticated REST Endpoints (Require Bearer Token)
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

    // GET /api/workspaces
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

      this.broadcast({ type: 'WORKSPACE_CREATED', workspace: { id, title, createdAt: now, updatedAt: now, revision: 1 } });
      return jsonResponse({ success: true, workspace: { id, title, revision: 1 } });
    }

    // POST /api/sources & /api/quote (Ingest new Source & Trigger Incremental AI Update)
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

    // POST /api/proposals/apply
    if (url.pathname === '/api/proposals/apply' && request.method === 'POST') {
      const body = await request.json();
      const { proposalId, operations } = body;

      const proposalRows = this.sql.exec(`SELECT * FROM proposals WHERE id = ?`, proposalId).toArray();
      if (proposalRows.length === 0) {
        return jsonResponse({ error: 'Proposal not found' }, 404);
      }

      const proposal = proposalRows[0];
      const workspaceId = proposal.workspaceId;
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

    // POST /api/concepts (Manual CRUD)
    if (url.pathname === '/api/concepts' && request.method === 'POST') {
      const body = await request.json();
      const workspaceId = body.workspaceId || 'ws_default';
      const conceptId = body.id || 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const now = new Date().toISOString();

      this.sql.exec(`
        INSERT OR REPLACE INTO concepts (id, workspaceId, label, description, x, y, width, pinned, createdAt, updatedAt, sourceRefs, createdBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, conceptId, workspaceId, body.label, body.description || '', body.x || 150, body.y || 150, body.width || 240, body.pinned ? 1 : 0, now, now, JSON.stringify(body.sourceRefs || []), body.createdBy || 'user');

      this.incrementRevision(workspaceId);
      const concept = { ...body, id: conceptId, workspaceId, updatedAt: now };
      this.broadcast({ type: 'CONCEPT_UPDATED', concept });
      return jsonResponse({ success: true, concept });
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

    // 1. Authentication Handshake (Phase 0 Requirement)
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

        // Now safe to transmit full initial state
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

    // Must be authenticated for any subsequent messages
    if (!session.authenticated) {
      ws.send(JSON.stringify({ type: 'AUTH_REQUIRED', message: 'Send AUTH message first' }));
      return;
    }

    const wsId = session.workspaceId;

    // 2. Real-time Ink Strokes
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

    // 3. Move Concept Node
    if (msg.type === 'MOVE_CONCEPT' && msg.id) {
      this.sql.exec(`UPDATE concepts SET x = ?, y = ?, updatedAt = ? WHERE id = ? AND workspaceId = ?`, msg.x, msg.y, new Date().toISOString(), msg.id, wsId);
      this.broadcastExcept(ws, { type: 'CONCEPT_MOVED', id: msg.id, x: msg.x, y: msg.y, workspaceId: wsId });
    }

    // 4. Update Edge
    if (msg.type === 'ADD_EDGE' && msg.edge) {
      const e = msg.edge;
      this.sql.exec(`
        INSERT OR REPLACE INTO edges (id, workspaceId, fromId, toId, relation, label, sourceRefs, createdBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, e.id, wsId, e.fromId || e.from, e.toId || e.to, e.relation || 'relates', e.label || '', JSON.stringify(e.sourceRefs || []), e.createdBy || 'user');
      this.incrementRevision(wsId);
      this.broadcast({ type: 'EDGE_ADDED', edge: e, workspaceId: wsId });
    } else if (msg.type === 'DELETE_EDGE' && msg.edgeId) {
      this.sql.exec(`DELETE FROM edges WHERE id = ? AND workspaceId = ?`, msg.edgeId, wsId);
      this.incrementRevision(wsId);
      this.broadcast({ type: 'EDGE_DELETED', edgeId: msg.edgeId, workspaceId: wsId });
    }

    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG' }));
    }
  }

  getFullWorkspaceState(workspaceId) {
    const wsRow = this.sql.exec(`SELECT * FROM workspaces WHERE id = ?`, workspaceId).toArray()[0] || { id: workspaceId, title: 'My Learning Map', revision: 1 };
    const sources = this.sql.exec(`SELECT * FROM sources WHERE workspaceId = ? ORDER BY capturedAt DESC`, workspaceId).toArray();
    const rawConcepts = this.sql.exec(`SELECT * FROM concepts WHERE workspaceId = ?`, workspaceId).toArray();
    const rawEdges = this.sql.exec(`SELECT * FROM edges WHERE workspaceId = ?`, workspaceId).toArray();
    const rawStrokes = this.sql.exec(`SELECT * FROM ink_strokes WHERE workspaceId = ?`, workspaceId).toArray();
    const rawProposals = this.sql.exec(`SELECT * FROM proposals WHERE workspaceId = ? AND status = 'pending' ORDER BY createdAt DESC`, workspaceId).toArray();

    return {
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

  // --- Phase 6 & 7: Cloudflare Workers AI Incremental Patch Engine ---
  async processSourceWithAI(workspaceId, source) {
    try {
      const state = this.getFullWorkspaceState(workspaceId);
      const currentConcepts = state.concepts;
      const currentEdges = state.edges;
      const baseRevision = state.workspace.revision || 1;

      let patchOperations = [];
      let patchSummary = 'Processed new source content.';

      if (this.env.AI) {
        // Use Cloudflare Workers AI Llama-3.1-8B-Instruct
        const systemPrompt = `You are the AI engine of Detective Map (Living Learning Map).
Your goal: Compare new learning material to the user's existing Concept Map and generate an INCREMENTAL JSON PATCH.

CRITICAL INVARIANTS:
1. NEVER regenerate the full map.
2. If a concept already exists, do NOT duplicate it. Use "enrich_concept".
3. Only use "add_concept" for genuinely new key ideas.
4. Use "add_edge" to link new or enriched concepts with existing concepts.
5. All operations must be valid JSON matching the schema below.

Allowed Operations Schema:
- { "op": "add_concept", "tempId": "tmp_1", "label": "Short Title", "description": "1-2 sentence essence", "sourceRefs": ["${source.id}"] }
- { "op": "enrich_concept", "conceptId": "<existing_concept_id>", "addition": "new insight to append", "sourceRefs": ["${source.id}"] }
- { "op": "add_edge", "from": "<concept_id_or_tempId>", "to": "<concept_id_or_tempId>", "label": "relationship label", "sourceRefs": ["${source.id}"] }
- { "op": "flag_conflict", "conceptId": "<concept_id>", "note": "potential contradiction" }

OUTPUT FORMAT: Strict JSON only:
{
  "summary": "1 sentence overview of what this adds",
  "operations": [ ... ]
}`;

        const userPrompt = `Existing Concepts:
${JSON.stringify(currentConcepts.map(c => ({ id: c.id, label: c.label, description: c.description })), null, 2)}

Existing Edges:
${JSON.stringify(currentEdges.map(e => ({ from: e.fromId, to: e.toId, label: e.label })), null, 2)}

New Source Material:
"${source.text.slice(0, 4000)}"`;

        const aiResponse = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' }
        });

        const parsed = safeParseJSON(aiResponse.response || aiResponse, null);
        if (parsed && Array.isArray(parsed.operations)) {
          patchOperations = parsed.operations;
          patchSummary = parsed.summary || patchSummary;
        }
      }

      // Fallback extraction if AI not bound or returned empty
      if (patchOperations.length === 0) {
        const lines = source.text.split(/[.!\n]+/).map(s => s.trim()).filter(s => s.length > 10);
        const topIdea = lines[0] || source.title || 'Key Insight';
        patchOperations.push({
          op: 'add_concept',
          tempId: 'tmp_' + Date.now(),
          label: topIdea.slice(0, 40),
          description: source.text.slice(0, 200),
          sourceRefs: [source.id]
        });
      }

      // Save Proposal in SQLite
      const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const now = new Date().toISOString();

      this.sql.exec(`
        INSERT INTO proposals (id, workspaceId, baseRevision, sourceId, summary, operations, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `, proposalId, workspaceId, baseRevision, source.id, patchSummary, JSON.stringify(patchOperations), now);

      this.sql.exec(`UPDATE sources SET processingStatus = 'completed' WHERE id = ?`, source.id);

      const proposal = {
        id: proposalId,
        workspaceId,
        baseRevision,
        sourceId: source.id,
        summary: patchSummary,
        operations: patchOperations,
        status: 'pending',
        createdAt: now
      };

      this.broadcast({ type: 'PROPOSAL_CREATED', proposal, sourceId: source.id });
    } catch (err) {
      console.error('[AI Processing Error]', err);
      this.sql.exec(`UPDATE sources SET processingStatus = 'failed' WHERE id = ?`, source.id);
      this.broadcast({ type: 'SOURCE_FAILED', sourceId: source.id, error: err.message });
    }
  }

  applyProposalOperations(workspaceId, operations, sourceId) {
    const tempIdMap = new Map();
    const createdConcepts = [];
    const createdEdges = [];
    const now = new Date().toISOString();

    const existingConcepts = this.sql.exec(`SELECT * FROM concepts WHERE workspaceId = ?`, workspaceId).toArray();
    let nextX = 150 + (existingConcepts.length % 5) * 260;
    let nextY = 150 + Math.floor(existingConcepts.length / 5) * 200;

    for (const op of operations) {
      if (op.op === 'add_concept') {
        const realId = 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
        if (op.tempId) tempIdMap.set(op.tempId, realId);

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
        const current = this.sql.exec(`SELECT * FROM concepts WHERE id = ?`, op.conceptId).toArray()[0];
        if (current) {
          const newDesc = current.description ? `${current.description}\n• ${op.addition}` : op.addition;
          const refs = safeParseJSON(current.sourceRefs, []);
          if (sourceId && !refs.includes(sourceId)) refs.push(sourceId);

          this.sql.exec(`
            UPDATE concepts SET description = ?, sourceRefs = ?, updatedAt = ? WHERE id = ?
          `, newDesc, JSON.stringify(refs), now, op.conceptId);
        }
      } else if (op.op === 'add_edge') {
        const fromId = tempIdMap.get(op.from) || op.from;
        const toId = tempIdMap.get(op.to) || op.to;
        if (fromId && toId && fromId !== toId) {
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // Route API and WebSocket requests to Durable Object
    if (url.pathname.startsWith('/api/') || url.pathname === '/ws') {
      const id = env.DETECTIVE_WORKSPACE.idFromName('global_workspace_hub');
      const stub = env.DETECTIVE_WORKSPACE.get(id);
      return stub.fetch(request);
    }

    // Serve Static Web Assets (Canvas, HTML, CSS, JS, Icons)
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
