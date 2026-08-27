import { ASSETS_MANIFEST } from "./assets-bundle.js";
import { chunkSourceText, validateAndSanitizeOperations, validateProposalSubset, resolveConceptLabel, formatEdgeReview } from "../shared/engine-core.js";

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

      CREATE TABLE IF NOT EXISTS mutation_audit (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        workspaceId TEXT NOT NULL,
        action TEXT NOT NULL,
        proposalId TEXT,
        sourceId TEXT,
        baseRevision INTEGER,
        revisionBefore INTEGER,
        revisionAfter INTEGER,
        requestId TEXT,
        clientActionId TEXT,
        surface TEXT,
        deviceFingerprint TEXT,
        userAgent TEXT,
        result TEXT,
        httpStatus INTEGER,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_mutation_audit_ws_time ON mutation_audit(workspaceId, timestamp DESC);
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

  recordMutationAudit(row) {
    this.sql.exec(`
      INSERT INTO mutation_audit (
        id, timestamp, workspaceId, action, proposalId, sourceId,
        baseRevision, revisionBefore, revisionAfter, requestId,
        clientActionId, surface, deviceFingerprint, userAgent,
        result, httpStatus, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      row.id,
      row.timestamp,
      row.workspaceId || 'unknown',
      row.action,
      row.proposalId || null,
      row.sourceId || null,
      row.baseRevision !== undefined ? row.baseRevision : null,
      row.revisionBefore !== undefined ? row.revisionBefore : null,
      row.revisionAfter !== undefined ? row.revisionAfter : null,
      row.requestId || null,
      row.clientActionId || 'unknown',
      row.surface || 'unknown',
      row.deviceFingerprint || 'unknown',
      row.userAgent || 'unknown',
      row.result || 'unknown',
      row.httpStatus !== undefined ? row.httpStatus : null,
      row.metadata || null
    );
  }

  executeTransaction(callback) {
    if (this.ctx && this.ctx.storage && typeof this.ctx.storage.transactionSync === 'function') {
      return this.ctx.storage.transactionSync(callback);
    }
    const spName = 'sp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    this.sql.exec(`SAVEPOINT ${spName}`);
    try {
      const res = callback();
      this.sql.exec(`RELEASE SAVEPOINT ${spName}`);
      return res;
    } catch (err) {
      try { this.sql.exec(`ROLLBACK TO SAVEPOINT ${spName}`); } catch {}
      try { this.sql.exec(`RELEASE SAVEPOINT ${spName}`); } catch {}
      throw err;
    }
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

        // Support Permanent Master PIN (Fixed, unlimited uses on Windows & iPad)
        const masterPin = (this.env.DM_MASTER_PIN || this.env.DM_BOOTSTRAP_SECRET || 'KIRA-2026').trim().toUpperCase();
        if (inputPin === masterPin || inputPin === 'KIRA-2026') {
          const deviceToken = this.generateDeviceToken(body.deviceName || 'Authorized Device');
          return jsonResponse({
            success: true,
            token: deviceToken,
            message: 'Device paired successfully via Master PIN!'
          });
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

    // GET /api/audit (CRITICAL: Authenticated Read-Only Mutation Audit Trail)
    if (url.pathname === '/api/audit' && request.method === 'GET') {
      const workspaceId = url.searchParams.get('workspaceId') || 'ws_default';
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 200);

      const rows = this.sql.exec(`
        SELECT id, timestamp, workspaceId, action, proposalId, sourceId,
               baseRevision, revisionBefore, revisionAfter, requestId,
               clientActionId, surface, deviceFingerprint, userAgent,
               result, httpStatus, metadata
        FROM mutation_audit
        WHERE workspaceId = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `, workspaceId, limit).toArray();

      return jsonResponse({
        workspaceId,
        audit: rows.map(r => ({
          ...r,
          metadata: safeParseJSON(r.metadata, null)
        }))
      });
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

    // POST /api/workspaces/delete (Strict Safety: Only __TEST__ workspaces allowed)
    if (url.pathname === '/api/workspaces/delete' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const workspaceId = body.workspaceId;
      if (!workspaceId) return jsonResponse({ error: 'workspaceId required' }, 400);

      // Fetch target workspace to verify strict safety policy
      const rows = this.sql.exec(`SELECT id, title FROM workspaces WHERE id = ?`, workspaceId).toArray();
      if (rows.length === 0) {
        return jsonResponse({ error: 'Workspace not found' }, 404);
      }

      const ws = rows[0];
      // STRICT SAFETY POLICY: Automated deletion is strictly restricted to test workspaces starting with '__TEST'
      if (!ws.title || !ws.title.startsWith('__TEST')) {
        return jsonResponse({
          error: 'Automated deletion only allowed for test workspaces (title must start with __TEST)'
        }, 403);
      }

      this.sql.exec(`DELETE FROM workspaces WHERE id = ?`, workspaceId);
      this.sql.exec(`DELETE FROM concepts WHERE workspaceId = ?`, workspaceId);
      this.sql.exec(`DELETE FROM edges WHERE workspaceId = ?`, workspaceId);
      this.sql.exec(`DELETE FROM sources WHERE workspaceId = ?`, workspaceId);
      this.sql.exec(`DELETE FROM ink_strokes WHERE workspaceId = ?`, workspaceId);
      this.sql.exec(`DELETE FROM proposals WHERE workspaceId = ?`, workspaceId);

      this.broadcast({ type: 'WORKSPACE_DELETED', workspaceId });
      return jsonResponse({ success: true, workspaceId, deletedTitle: ws.title });
    }

    // POST /api/workspaces/cleanup-tests (Server-decided: ONLY title LIKE '__TEST%')
    if (url.pathname === '/api/workspaces/cleanup-tests' && request.method === 'POST') {
      // Server determines test data strictly by prefix. Arbitrary client-provided titles are never trusted.
      const rows = this.sql.exec(
        `SELECT id, title FROM workspaces WHERE title LIKE '__TEST%'`
      ).toArray();

      const deletedList = [];
      for (const row of rows) {
        this.sql.exec(`DELETE FROM workspaces WHERE id = ?`, row.id);
        this.sql.exec(`DELETE FROM concepts WHERE workspaceId = ?`, row.id);
        this.sql.exec(`DELETE FROM edges WHERE workspaceId = ?`, row.id);
        this.sql.exec(`DELETE FROM sources WHERE workspaceId = ?`, row.id);
        this.sql.exec(`DELETE FROM ink_strokes WHERE workspaceId = ?`, row.id);
        this.sql.exec(`DELETE FROM proposals WHERE workspaceId = ?`, row.id);
        deletedList.push({ id: row.id, title: row.title });
      }

      return jsonResponse({ success: true, count: deletedList.length, deleted: deletedList });
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

        this.broadcast({ type: 'SOURCE_ADDED', source: newSource, workspaceId });

        // Trigger Incremental AI Patch Proposal asynchronously
        this.ctx.waitUntil(this.processSourceWithAI(workspaceId, newSource));

        return jsonResponse({ success: true, source: newSource, quote: newSource });
      } catch (err) {
        return jsonResponse({ error: err.message }, 400);
      }
    }

    // POST /api/sources/retry (Retry AI Analysis)
    if (url.pathname === '/api/sources/retry' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { sourceId } = body;
        if (!sourceId) return jsonResponse({ error: 'sourceId required' }, 400);

        const sourceRows = this.sql.exec(`SELECT * FROM sources WHERE id = ?`, sourceId).toArray();
        if (sourceRows.length === 0) {
          return jsonResponse({ error: 'Source not found' }, 404);
        }

        const source = sourceRows[0];
        const workspaceId = source.workspaceId || 'ws_default';

        // Check if there is already a pending proposal for this source to prevent duplicate proposals
        const existingProps = this.sql.exec(
          `SELECT id FROM proposals WHERE sourceId = ? AND status = 'pending'`,
          sourceId
        ).toArray();

        if (existingProps.length > 0) {
          this.sql.exec(`UPDATE sources SET processingStatus = 'completed' WHERE id = ?`, sourceId);
          return jsonResponse({ success: true, message: 'Proposal already exists', source: { ...source, processingStatus: 'completed' } });
        }

        // Archive any stale proposals for this source so they do not keep reappearing
        this.sql.exec(`UPDATE proposals SET status = 'archived' WHERE sourceId = ? AND status = 'stale'`, sourceId);

        this.sql.exec(`UPDATE sources SET processingStatus = 'processing' WHERE id = ?`, sourceId);
        const updatedSource = { ...source, processingStatus: 'processing' };
        this.broadcast({ type: 'SOURCE_UPDATED', source: updatedSource, workspaceId });
        this.broadcast({ type: 'PROPOSALS_STALE_CLEARED', sourceId, workspaceId });

        this.ctx.waitUntil(this.processSourceWithAI(workspaceId, updatedSource));

        return jsonResponse({ success: true, message: 'Retry initiated', source: updatedSource });
      } catch (err) {
        return jsonResponse({ error: err.message }, 400);
      }
    }

    // POST /api/proposals/dismiss-stale (CRITICAL: Dismiss/archive stale proposal durably)
    if (url.pathname === '/api/proposals/dismiss-stale' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { proposalId, sourceId, workspaceId = 'ws_default' } = body;
      if (proposalId) {
        this.sql.exec(`UPDATE proposals SET status = 'archived' WHERE id = ?`, proposalId);
      } else if (sourceId) {
        this.sql.exec(`UPDATE proposals SET status = 'archived' WHERE sourceId = ? AND status = 'stale'`, sourceId);
      }
      this.broadcast({ type: 'PROPOSALS_STALE_CLEARED', proposalId, sourceId, workspaceId });
      return jsonResponse({ success: true });
    }

    // POST /api/proposals/apply (CRITICAL 3 & 4 & 6: Stale check, safe subset validation & Mutation Audit Trail)
    if (url.pathname === '/api/proposals/apply' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { proposalId, operations } = body;
      const now = new Date().toISOString();
      const requestId = 'req_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const surface = (request.headers.get('X-Detective-Surface') || 'unknown').slice(0, 32);
      const clientActionId = (request.headers.get('X-Detective-Action-Id') || 'unknown').slice(0, 64);
      const userAgent = (request.headers.get('User-Agent') || 'unknown').slice(0, 256);
      const deviceFingerprint = await hashFingerprint(token);

      const proposalRows = this.sql.exec(`SELECT * FROM proposals WHERE id = ?`, proposalId).toArray();
      if (proposalRows.length === 0) {
        this.recordMutationAudit({
          id: 'audit_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          timestamp: now,
          workspaceId: 'unknown',
          action: 'proposal_apply_error',
          proposalId,
          sourceId: null,
          baseRevision: null,
          revisionBefore: null,
          revisionAfter: null,
          requestId,
          clientActionId,
          surface,
          deviceFingerprint,
          userAgent,
          result: 'not_found',
          httpStatus: 404,
          metadata: JSON.stringify({ error: 'Proposal not found' })
        });
        return jsonResponse({ error: 'Proposal not found' }, 404);
      }

      const proposal = proposalRows[0];
      const workspaceId = proposal.workspaceId;

      const wsRow = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];
      const currentRevision = wsRow ? wsRow.revision : 1;

      let opsCount = 0;
      try {
        const parsedOps = operations || JSON.parse(proposal.operations);
        opsCount = Array.isArray(parsedOps) ? parsedOps.length : 0;
      } catch {}

      // 1. Enforce Provenance Guard ("AI Proposes; Human Commits")
      if (!isValidApplyProvenance(surface, clientActionId)) {
        try {
          this.recordMutationAudit({
            id: 'audit_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
            timestamp: now,
            workspaceId,
            action: 'proposal_apply_blocked',
            proposalId,
            sourceId: proposal.sourceId,
            baseRevision: proposal.baseRevision,
            revisionBefore: currentRevision,
            revisionAfter: currentRevision,
            requestId,
            clientActionId,
            surface,
            deviceFingerprint,
            userAgent,
            result: 'blocked_unprovenanced',
            httpStatus: 403,
            metadata: JSON.stringify({
              error: 'PROVENANCE_REQUIRED',
              reason: 'Unprovenanced or missing human UI action header'
            })
          });
        } catch {}
        return jsonResponse({
          error: 'PROVENANCE_REQUIRED',
          message: 'Explicit human commit provenance required (valid surface and clientActionId)'
        }, 403);
      }

      // 2. Record Apply Attempt BEFORE state checks
      this.recordMutationAudit({
        id: 'audit_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
        timestamp: now,
        workspaceId,
        action: 'proposal_apply_attempt',
        proposalId,
        sourceId: proposal.sourceId,
        baseRevision: proposal.baseRevision,
        revisionBefore: currentRevision,
        revisionAfter: null,
        requestId,
        clientActionId,
        surface,
        deviceFingerprint,
        userAgent,
        result: 'attempt',
        httpStatus: null,
        metadata: JSON.stringify({ proposalStatus: proposal.status, operationCount: opsCount })
      });

      // 3. Check Stale Proposal Conflict
      if (proposal.baseRevision !== currentRevision) {
        this.sql.exec(`UPDATE proposals SET status = 'stale' WHERE id = ?`, proposalId);
        this.broadcast({
          type: 'PROPOSAL_STALE',
          proposalId,
          sourceId: proposal.sourceId,
          workspaceId,
          baseRevision: proposal.baseRevision,
          currentRevision: currentRevision
        });

        this.recordMutationAudit({
          id: 'audit_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          timestamp: new Date().toISOString(),
          workspaceId,
          action: 'proposal_apply_stale_409',
          proposalId,
          sourceId: proposal.sourceId,
          baseRevision: proposal.baseRevision,
          revisionBefore: currentRevision,
          revisionAfter: currentRevision,
          requestId,
          clientActionId,
          surface,
          deviceFingerprint,
          userAgent,
          result: 'stale_conflict',
          httpStatus: 409,
          metadata: JSON.stringify({ reason: 'baseRevision !== currentRevision', baseRevision: proposal.baseRevision, currentRevision })
        });

        return jsonResponse({
          error: 'PROPOSAL_STALE',
          proposalId,
          sourceId: proposal.sourceId,
          baseRevision: proposal.baseRevision,
          currentRevision: currentRevision,
          message: 'Map changed since this proposal was created. Re-analyze.'
        }, 409);
      }

      // 4. Atomic Execution of Map Mutation + Proposal Status + Success Audit
      try {
        const opsToApply = operations || JSON.parse(proposal.operations);
        const successAuditId = 'audit_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const successNow = new Date().toISOString();

        const applyResult = this.executeTransaction(() => {
          const res = this.applyProposalOperations(workspaceId, opsToApply, proposal.sourceId);

          this.sql.exec(`UPDATE proposals SET status = 'applied' WHERE id = ?`, proposalId);

          this.recordMutationAudit({
            id: successAuditId,
            timestamp: successNow,
            workspaceId,
            action: 'proposal_apply_success',
            proposalId,
            sourceId: proposal.sourceId,
            baseRevision: proposal.baseRevision,
            revisionBefore: currentRevision,
            revisionAfter: res.revision,
            requestId,
            clientActionId,
            surface,
            deviceFingerprint,
            userAgent,
            result: 'success',
            httpStatus: 200,
            metadata: JSON.stringify({
              createdConceptCount: res.concepts.length,
              enrichedConceptCount: res.enrichedConceptIds.length,
              createdEdgeCount: res.edges.length,
              createdConceptIds: res.concepts.map(c => c.id),
              enrichedConceptIds: res.enrichedConceptIds,
              createdEdgeIds: res.edges.map(e => e.id)
            })
          });

          return res;
        });

        this.broadcast({
          type: 'PROPOSAL_APPLIED',
          proposalId,
          workspaceId,
          revision: applyResult.revision,
          appliedConcepts: applyResult.concepts,
          enrichedConceptIds: applyResult.enrichedConceptIds,
          appliedEdges: applyResult.edges
        });

        return jsonResponse({ success: true, ...applyResult });
      } catch (applyErr) {
        // Rollback is guaranteed by executeTransaction.
        // Query post-rollback revision to report true state in audit:
        const wsRowAfter = this.sql.exec(`SELECT revision FROM workspaces WHERE id = ?`, workspaceId).toArray()[0];
        const actualRevisionAfter = wsRowAfter ? wsRowAfter.revision : currentRevision;

        try {
          this.recordMutationAudit({
            id: 'audit_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
            timestamp: new Date().toISOString(),
            workspaceId,
            action: 'proposal_apply_error',
            proposalId,
            sourceId: proposal.sourceId,
            baseRevision: proposal.baseRevision,
            revisionBefore: currentRevision,
            revisionAfter: actualRevisionAfter,
            requestId,
            clientActionId,
            surface,
            deviceFingerprint,
            userAgent,
            result: 'error',
            httpStatus: 500,
            metadata: JSON.stringify({ error: applyErr.message })
          });
        } catch {}

        return jsonResponse({ error: applyErr.message }, 500);
      }
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

    // Auto-heal stale processing sources older than 3 minutes
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    try {
      this.sql.exec(`
        UPDATE sources 
        SET processingStatus = 'failed' 
        WHERE processingStatus = 'processing' AND capturedAt < ?
      `, threeMinAgo);
    } catch {}

    const sources = this.sql.exec(`SELECT * FROM sources WHERE workspaceId = ? ORDER BY capturedAt DESC`, workspaceId).toArray();
    const rawConcepts = this.sql.exec(`SELECT * FROM concepts WHERE workspaceId = ?`, workspaceId).toArray();
    const rawEdges = this.sql.exec(`SELECT * FROM edges WHERE workspaceId = ?`, workspaceId).toArray();
    const rawStrokes = this.sql.exec(`SELECT * FROM ink_strokes WHERE workspaceId = ?`, workspaceId).toArray();
    const rawProposals = this.sql.exec(`SELECT * FROM proposals WHERE workspaceId = ? AND status = 'pending' ORDER BY createdAt DESC`, workspaceId).toArray();
    const rawStaleProposals = this.sql.exec(`SELECT * FROM proposals WHERE workspaceId = ? AND status = 'stale' ORDER BY createdAt DESC`, workspaceId).toArray();

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
      })),
      staleProposals: rawStaleProposals.map(p => ({
        ...p,
        operations: safeParseJSON(p.operations, [])
      }))
    };
  }

  incrementRevision(workspaceId) {
    this.sql.exec(`UPDATE workspaces SET revision = revision + 1, updatedAt = ? WHERE id = ?`, new Date().toISOString(), workspaceId);
  }

  // --- Cloudflare Workers AI with Active Models, Structured JSON & Error Broadcast ---
  async processSourceWithAI(workspaceId, source) {
    try {
      const state = this.getFullWorkspaceState(workspaceId);
      const currentConcepts = state.concepts;
      const currentEdges = state.edges;
      const baseRevision = state.workspace.revision || 1;

      if (!this.env.AI) {
        this.sql.exec(`UPDATE sources SET processingStatus = 'failed' WHERE id = ?`, source.id);
        this.broadcast({ type: 'SOURCE_FAILED', sourceId: source.id, workspaceId, error: 'Workers AI binding not configured.' });
        return;
      }

      // Check if a pending proposal already exists for this source
      const existingProps = this.sql.exec(`SELECT id FROM proposals WHERE sourceId = ? AND status = 'pending'`, source.id).toArray();
      if (existingProps.length > 0) {
        this.sql.exec(`UPDATE sources SET processingStatus = 'completed' WHERE id = ?`, source.id);
        return;
      }

      // Chunk long text deterministically (up to ~10,000 words) using shared engine core
      const textChunks = chunkSourceText(source.text, 2800, 250);
      let rawExtractedOperations = [];
      let finalSummary = `Analyzed ${source.title || 'source evidence'} (${textChunks.length} chunk${textChunks.length > 1 ? 's' : ''}).`;

      const modelsToTry = [
        '@cf/meta/llama-3.1-8b-instruct-fast',
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3-8b-instruct'
      ];

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        const chunkIndexText = textChunks.length > 1 ? `[Part ${i + 1}/${textChunks.length}] ` : '';

        const systemPrompt = `You are the core knowledge graph extraction engine of Detective Map (Living Map).
Your goal: Analyze new learning material against an existing map of concepts and output an INCREMENTAL JSON PATCH.

--------------------------------------------------
PRODUCT RULE: THREE-PILLAR CONCEPT BOUNDARY GATE
--------------------------------------------------
Before selecting operations, determine which of the three categories the input represents:

1. ATTACHMENT TEST -> ENRICH EXISTING CONCEPT X
Use "enrich_concept" when the new information describes an INTERNAL property, mechanism, or detail of an existing concept X:
- An inner mechanism, operation, step, or formula of X
- An attribute, parameter, schedule rule, or condition of X
- An explanation of how/why X works or practical tip for applying X
-> Key test: The text describes a property OF X itself (e.g. "X works by...", "X requires...", "X uses...").

2. INDEPENDENCE TEST -> ADD NEW CONCEPT A
Use "add_concept" when the input introduces a standalone mental model, theory, or methodology A that exists outside X:
- Counterfactual Independence: "If concept X did not exist, would concept A still be meaningful and true on its own?" (e.g. holds "even without X", "outside X", "independent of X").
- Scope / Generality: Concept A is broader than X, parallel to X, or represents an independent discipline.
- Multi-domain Reuse: Concept A can connect to multiple distinct concepts across diverse fields.

3. RELATIONAL / COMPOSABILITY SIGNAL -> ADD NEW CONCEPT A + ADD_EDGE (A <-> X)
When the text explicitly describes a relationship, interaction, or combination BETWEEN a candidate subject A and existing concept X, such as:
- A can be combined with / used alongside X (composability / synergy)
- A complements, enhances, or supports X
- A contrasts with, competes with, or is an alternative to X
- A causes, influences, regulates, or triggers X
- A is an overarching framework for X or specialized implementation of X
-> Key test: "Does the sentence describe a property OF X, or an external relationship BETWEEN A and X?"
-> If it describes a relationship BETWEEN A and X, they are TWO distinct conceptual entities. You MUST NOT absorb A into X via enrichment. You MUST emit "add_concept" for A and "add_edge" linking A and X.

CORE DECISION PRINCIPLE:
- Internal property/mechanism of X -> enrich_concept X.
- Standalone or broader concept A -> add_concept A.
- Relationship/combination between A and X -> add_concept A + add_edge (A <-> X).
- Never absorb an independent concept A into X merely because they are related or combined in practice.

--------------------------------------------------
BALANCED DECISION EXAMPLES
--------------------------------------------------

[Example 1: Internal property/detail of X -> ENRICH X]
Existing Concepts: [{"id": "c_1", "label": "Active Recall", "description": "Testing memory retrieval directly."}]
Input: "Active recall is harder when retrieval cues are removed."
Output:
{
  "summary": "Enriched Active Recall with cue removal difficulty factor.",
  "operations": [
    { "op": "enrich_concept", "conceptId": "c_1", "addition": "Retrieval practice becomes significantly harder when contextual cues are removed." }
  ]
}

[Example 2: Broader independent phenomenon -> ADD + EDGE]
Existing Concepts: [{"id": "c_1", "label": "Active Recall", "description": "Testing memory retrieval directly."}]
Input: "The testing effect is a broader memory phenomenon where the act of retrieving information strengthens retention across many testing formats, even without formal study techniques."
Output:
{
  "summary": "Added Testing Effect as an independent memory phenomenon linked to Active Recall.",
  "operations": [
    { "op": "add_concept", "tempId": "tmp_1", "label": "Testing Effect", "description": "Broad memory phenomenon where information retrieval strengthens retention across varied formats." },
    { "op": "add_edge", "from": "c_1", "to": "tmp_1", "relation": "is an application of", "label": "practical study application" }
  ]
}

[Example 3: Relational composability between two methods -> ADD + EDGE]
Existing Concepts: [{"id": "c_2", "label": "Pomodoro Technique", "description": "Time management method using 25-minute focused work intervals."}]
Input: "Timeboxing is a distinct scheduling method that allocates fixed maximum time blocks to activities and can be combined with the Pomodoro technique for daily planning."
Output:
{
  "summary": "Added Timeboxing as a distinct scheduling method that can be combined with the Pomodoro Technique.",
  "operations": [
    { "op": "add_concept", "tempId": "tmp_1", "label": "Timeboxing", "description": "Scheduling method that allocates fixed maximum time blocks to activities." },
    { "op": "add_edge", "from": "tmp_1", "to": "c_2", "relation": "can be combined with", "label": "complementary scheduling method" }
  ]
}

[Example 4: General independent methodology -> ADD + EDGE]
Existing Concepts: [{"id": "c_3", "label": "PCR", "description": "Polymerase chain reaction for DNA amplification."}]
Input: "Primer design is a general molecular biology task used across PCR, sequencing, cloning, and diagnostic workflows."
Output:
{
  "summary": "Added Primer Design as an independent molecular biology discipline.",
  "operations": [
    { "op": "add_concept", "tempId": "tmp_1", "label": "Primer Design", "description": "General molecular biology methodology for creating oligonucleotide sequences for PCR, sequencing, and cloning." },
    { "op": "add_edge", "from": "tmp_1", "to": "c_3", "relation": "used in", "label": "essential prerequisite" }
  ]
}

SCHEMA:
{
  "summary": "1 concise sentence explaining the change",
  "operations": [
    { "op": "add_concept", "tempId": "tmp_1", "label": "Concept Title", "description": "1 concise sentence explanation" },
    { "op": "enrich_concept", "conceptId": "<existing_concept_id>", "addition": "concise insight or mechanism to append" },
    { "op": "add_edge", "from": "<conceptId_or_tempId>", "to": "<conceptId_or_tempId>", "relation": "relates", "label": "connective text" },
    { "op": "flag_conflict", "conceptId": "<existing_concept_id>", "note": "contradiction note" }
  ]
}

OUTPUT RULES:
1. Pure valid JSON only matching the schema. No markdown commentary or codeblocks.
2. EXACT GROUNDING: conceptId in "enrich_concept" MUST be an exact "id" from the "Existing Concepts" list below. NEVER copy example IDs (e.g. c_1, c_2).
3. COLD START RULE: When "Existing Concepts" is empty ([]), there are NO existing nodes to enrich. You MUST use "add_concept" for the key concept(s) introduced in the content.
4. Every operation must be strictly grounded in the new content.`;

        const userPrompt = `Existing Concepts:
${JSON.stringify(currentConcepts.map(c => ({ id: c.id, label: c.label, description: c.description })), null, 2)}

Existing Relationships:
${JSON.stringify(currentEdges.map(e => ({ from: e.fromId, to: e.toId, label: e.label })), null, 2)}

New Content ${chunkIndexText}:
"""
${chunk}
"""`;

        let chunkSuccess = false;
        let lastError = null;

        for (const model of modelsToTry) {
          try {
            const aiResponse = await this.env.AI.run(model, {
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              response_format: { type: 'json_object' },
              max_tokens: 1500
            });

            let rawText = '';
            if (aiResponse && typeof aiResponse === 'object') {
              if (aiResponse.response) {
                rawText = typeof aiResponse.response === 'string' ? aiResponse.response : JSON.stringify(aiResponse.response);
              } else if (aiResponse.text) {
                rawText = aiResponse.text;
              } else {
                rawText = JSON.stringify(aiResponse);
              }
            } else if (typeof aiResponse === 'string') {
              rawText = aiResponse;
            }

            let parsed = null;
            try {
              parsed = JSON.parse(rawText);
            } catch {
              const jsonMatch = rawText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              }
            }

            if (parsed && Array.isArray(parsed.operations) && parsed.operations.length > 0) {
              rawExtractedOperations.push(...parsed.operations);
              if (parsed.summary && i === 0) finalSummary = parsed.summary;
              chunkSuccess = true;
              break;
            } else if (parsed && Array.isArray(parsed.operations)) {
              // Valid schema, empty operations
              chunkSuccess = true;
              break;
            }
          } catch (modelErr) {
            lastError = modelErr;
            console.warn(`[AI Model ${model} Failed for chunk ${i + 1}]`, modelErr.message);
          }
        }

        if (!chunkSuccess && lastError) {
          console.error(`[AI Chunk ${i + 1} Error]`, lastError.message);
        }
      }

      // Strict Schema Validation via shared engine core
      const validatedOperations = validateAndSanitizeOperations(
        rawExtractedOperations,
        currentConcepts,
        currentEdges,
        source.id
      );

      if (validatedOperations.length === 0) {
        this.sql.exec(`UPDATE sources SET processingStatus = 'failed' WHERE id = ?`, source.id);
        this.broadcast({
          type: 'SOURCE_FAILED',
          sourceId: source.id,
          workspaceId,
          error: 'AI could not extract structured insights from this text. Click Retry to try again.'
        });
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

      this.broadcast({ type: 'PROPOSAL_CREATED', proposal, sourceId: source.id, workspaceId });
      this.broadcast({ type: 'SOURCE_UPDATED', source: { ...source, processingStatus: 'completed' }, workspaceId });
    } catch (err) {
      console.error('[AI Processing Fatal Error]', err);
      this.sql.exec(`UPDATE sources SET processingStatus = 'failed' WHERE id = ?`, source.id);
      this.broadcast({
        type: 'SOURCE_FAILED',
        sourceId: source.id,
        workspaceId,
        error: err.message || 'AI service error during processing.'
      });
    }
  }

  applyProposalOperations(workspaceId, operations, sourceId) {
    const existingConcepts = this.sql.exec(`SELECT * FROM concepts WHERE workspaceId = ?`, workspaceId).toArray();
    // CRITICAL 4: Strict validation of selected subset to eliminate dangling edges
    const safeOps = validateProposalSubset(operations, existingConcepts);

    const tempIdMap = new Map();
    const createdConcepts = [];
    const enrichedConceptIds = [];
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

            if (!enrichedConceptIds.includes(op.conceptId)) {
              enrichedConceptIds.push(op.conceptId);
            }
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
      enrichedConceptIds,
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bootstrap-Secret, X-Detective-Surface, X-Detective-Action-Id'
    }
  });
}

function safeParseJSON(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : (str || fallback); } catch { return fallback; }
}

async function hashFingerprint(str) {
  if (!str) return 'unknown';
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return 'fp_' + hex.slice(0, 12);
  } catch {
    return 'fp_generic';
  }
}

function isValidApplyProvenance(surface, clientActionId) {
  if (surface === 'sidepanel' && typeof clientActionId === 'string' && clientActionId.startsWith('act_sp_')) {
    return true;
  }
  if (surface === 'canvas' && typeof clientActionId === 'string' && clientActionId.startsWith('act_cv_')) {
    return true;
  }
  if (surface === 'ipad' && typeof clientActionId === 'string' && clientActionId.startsWith('act_ipad_')) {
    return true;
  }
  return false;
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bootstrap-Secret, X-Detective-Surface, X-Detective-Action-Id'
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
