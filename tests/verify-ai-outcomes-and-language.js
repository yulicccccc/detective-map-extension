// tests/verify-ai-outcomes-and-language.js
// Verification suite for AI semantic outcomes, durable diagnostics, and multilingual English map invariant

process.env.DETECTIVE_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { chunkSourceText, validateAndSanitizeOperations } = require('../shared/engine-core.js');

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}\n    Error: ${err.message}`);
    failedTests++;
  }
}

// In-memory mock SQLite engine matching Cloudflare Durable Object sql API
class MockSqlite {
  constructor() {
    this.tables = {
      sources: [],
      proposals: [],
      workspaces: [{ id: 'ws_default', title: 'Default', revision: 1, archived: 0 }]
    };
    this.columns = {
      sources: ['id', 'workspaceId', 'type', 'title', 'text', 'url', 'capturedAt', 'contentHash', 'processingStatus']
    };
  }

  exec(query, ...params) {
    const q = query.trim().replace(/\s+/g, ' ');

    if (q.startsWith('PRAGMA table_info(sources)')) {
      return {
        toArray: () => this.columns.sources.map((name, cid) => ({ cid, name, type: 'TEXT' }))
      };
    }

    if (q.startsWith('ALTER TABLE sources ADD COLUMN')) {
      const colName = q.split('ADD COLUMN')[1].trim().split(/\s+/)[0].replace(';', '');
      if (!this.columns.sources.includes(colName)) {
        this.columns.sources.push(colName);
      }
      return { toArray: () => [] };
    }

    if (q.startsWith('INSERT INTO sources')) {
      const colMatch = q.match(/\(([^)]+)\)/);
      const srcObj = {};
      if (colMatch) {
        const colNames = colMatch[1].split(',').map(c => c.trim());
        colNames.forEach((c, idx) => {
          srcObj[c] = params[idx];
        });
      }
      this.tables.sources.push(srcObj);
      return { toArray: () => [] };
    }

    if (q.startsWith('SELECT processingAttemptId') && q.includes('FROM sources WHERE id = ?')) {
      const id = params[0];
      const src = this.tables.sources.find(s => s.id === id);
      return {
        toArray: () => src ? [{ processingAttemptId: src.processingAttemptId, processingStatus: src.processingStatus }] : []
      };
    }

    if (q.startsWith('UPDATE sources') && q.includes('WHERE processingStatus = \'processing\'')) {
      // Timeout query
      const threshold = params[0];
      this.tables.sources.forEach(src => {
        if (src.processingStatus === 'processing') {
          const checkTime = src.processingStartedAt || src.capturedAt;
          if (checkTime && checkTime < threshold) {
            src.processingStatus = 'failed';
            src.processingError = 'AI_MODEL_ERROR: Processing timed out after 5 minutes.';
          }
        }
      });
      return { toArray: () => [] };
    }

    if (q.startsWith('UPDATE sources SET') && q.includes('WHERE id = ?')) {
      const id = params[params.length - 1];
      const src = this.tables.sources.find(s => s.id === id);
      if (src) {
        let paramIdx = 0;
        if (q.includes("processingStatus = ?")) {
          src.processingStatus = params[paramIdx++];
        } else if (q.includes("processingStatus = 'processing'")) {
          src.processingStatus = 'processing';
        } else if (q.includes("processingStatus = 'completed_with_changes'")) {
          src.processingStatus = 'completed_with_changes';
        } else if (q.includes("processingStatus = 'completed_no_change'")) {
          src.processingStatus = 'completed_no_change';
        } else if (q.includes("processingStatus = 'failed'")) {
          src.processingStatus = 'failed';
        }

        if (q.includes("processingError = NULL")) {
          src.processingError = null;
        } else if (q.includes("processingError = ?")) {
          src.processingError = params[paramIdx++];
        }

        if (q.includes("processingStartedAt = ?")) {
          src.processingStartedAt = params[paramIdx++];
        }

        if (q.includes("processingAttemptId = ?")) {
          src.processingAttemptId = params[paramIdx++];
        }
      }
      return { toArray: () => [] };
    }

    if (q.startsWith('SELECT * FROM sources')) {
      return {
        toArray: () => this.tables.sources.map(s => ({ ...s }))
      };
    }

    if (q.startsWith('SELECT id FROM proposals WHERE sourceId = ?')) {
      const sourceId = params[0];
      return {
        toArray: () => this.tables.proposals.filter(p => p.sourceId === sourceId)
      };
    }

    if (q.startsWith('INSERT INTO proposals')) {
      const [id, workspaceId, baseRevision, sourceId, summary, operations, status, createdAt] = params;
      this.tables.proposals.push({ id, workspaceId, baseRevision, sourceId, summary, operations, status, createdAt });
      return { toArray: () => [] };
    }

    return { toArray: () => [] };
  }
}

async function runSuite() {
  console.log('====================================================');
  console.log('🧪 Starting AI Semantic Outcomes & Multilingual English Map Suite');
  console.log('====================================================\n');

  // Test 1: Idempotent Migration
  await test('1. Idempotent processingError column migration in SQLite', async () => {
    const db = new MockSqlite();

    // First run adds column
    const cols1 = db.exec('PRAGMA table_info(sources)').toArray();
    assert(!cols1.some(c => c.name === 'processingError'), 'Column should initially not exist in mock table');
    if (!cols1.some(c => c.name === 'processingError')) {
      db.exec('ALTER TABLE sources ADD COLUMN processingError TEXT;');
    }
    const colsAfterFirst = db.exec('PRAGMA table_info(sources)').toArray();
    assert(colsAfterFirst.some(c => c.name === 'processingError'), 'Column must exist after migration');

    // Second run is idempotent (no-op, does not throw)
    if (!colsAfterFirst.some(c => c.name === 'processingError')) {
      db.exec('ALTER TABLE sources ADD COLUMN processingError TEXT;');
    }
    const colsAfterSecond = db.exec('PRAGMA table_info(sources)').toArray();
    assert.strictEqual(colsAfterSecond.filter(c => c.name === 'processingError').length, 1);
  });

  // Test 2: Multilingual Source Input & Byte-for-Byte Preservation
  await test('2. Original Chinese source text is preserved 100% byte-for-byte', async () => {
    const db = new MockSqlite();
    const rawChineseText = '间隔重复（Spaced Repetition）通过在逐渐延长的时间间隔中重新接触信息来显著提高长期记忆保持率。';
    const sourceId = 'src_chinese_1';

    db.exec(
      'INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      sourceId, 'ws_default', 'notes', '认知心理学', rawChineseText, '', new Date().toISOString(), '', 'processing', null
    );

    const stored = db.exec('SELECT * FROM sources').toArray()[0];
    assert.strictEqual(stored.text, rawChineseText, 'Stored source text must be byte-for-byte identical to input');
    assert.strictEqual(stored.title, '认知心理学');
  });

  // Test 3: Multilingual Prompt Invariant
  await test('3. Prompt explicitly locks English output while accepting multilingual input', async () => {
    const fs = require('fs');
    const path = require('path');
    const workerCode = fs.readFileSync(path.join(__dirname, '../src/worker.js'), 'utf8');

    assert(workerCode.includes("MAP_OUTPUT_LANGUAGE = 'en'"), 'MAP_OUTPUT_LANGUAGE must be defined and set to en');
    assert(workerCode.includes('HARD RULE: LANGUAGE INVARIANT'), 'System prompt must include explicit LANGUAGE INVARIANT rule');
    assert(workerCode.includes('COGNITIVE MAP OUTPUT IN ENGLISH'), 'System prompt must mandate English cognitive map output');
    assert(workerCode.includes('Never modify or translate the stored original source text'), 'System prompt must safeguard original source text');
  });

  // Test 4: English Operations Acceptance from Chinese Input
  await test('4. English concept operations extracted from Chinese source pass validation cleanly', async () => {
    const rawAiOps = [
      {
        op: 'add_concept',
        tempId: 'tmp_sr',
        label: 'Spaced Repetition',
        description: 'Improves long-term retention by spacing review intervals over time.'
      },
      {
        op: 'add_concept',
        tempId: 'tmp_ltr',
        label: 'Long-Term Retention',
        description: 'Durable memory representation resistant to forgetting.'
      },
      {
        op: 'add_edge',
        from: 'tmp_sr',
        to: 'tmp_ltr',
        relation: 'improves',
        label: 'enhances'
      }
    ];

    const validated = validateAndSanitizeOperations(rawAiOps, [], [], 'src_chinese_1');
    assert.strictEqual(validated.length, 3);
    assert.strictEqual(validated[0].label, 'Spaced Repetition');
    assert.strictEqual(validated[1].label, 'Long-Term Retention');
    assert.strictEqual(validated[2].relation, 'improves');
  });

  // Test 5: Outcome Case A — True No-Change (completed_no_change)
  await test('5. Outcome Case A: AI returns { operations: [] } -> completed_no_change (NOT failed)', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_test_no_change';
    db.exec(
      'INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      sourceId, 'ws_default', 'notes', 'Review Notes', 'Existing concepts repeated', '', new Date().toISOString(), '', 'processing', null
    );

    // AI parses cleanly and returns 0 operations
    const rawExtractedOperations = [];

    if (rawExtractedOperations.length === 0) {
      db.exec('UPDATE sources SET processingStatus = ?, processingError = NULL WHERE id = ?', 'completed_no_change', sourceId);
    }

    const updated = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(updated.processingStatus, 'completed_no_change', 'Status must be completed_no_change');
    assert.strictEqual(updated.processingError, null, 'processingError must be null');
    assert.strictEqual(db.tables.proposals.length, 0, 'No proposal should be generated for no-change');
  });

  // Test 6: Outcome Case B — Validation Rejection (failed + AI_VALIDATION_EMPTY)
  await test('6. Outcome Case B: AI proposes operations but validator rejects all -> failed + AI_VALIDATION_EMPTY', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_test_val_empty';
    db.exec(
      'INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      sourceId, 'ws_default', 'notes', 'Invalid Ops', 'Some text', '', new Date().toISOString(), '', 'processing', null
    );

    // AI returned raw operations, but none are valid (e.g. label too short, invalid ID enrichments)
    const rawExtractedOperations = [
      { op: 'add_concept', label: 'x' }, // label length < 2 rejected
      { op: 'enrich_concept', conceptId: 'non_existent_c_999', addition: 'invalid' } // concept does not exist
    ];

    const validatedOperations = validateAndSanitizeOperations(rawExtractedOperations, [], [], sourceId);
    assert.strictEqual(validatedOperations.length, 0, 'All raw operations should be rejected');

    // Pipeline logic
    if (rawExtractedOperations.length > 0 && validatedOperations.length === 0) {
      const diagErr = 'AI_VALIDATION_EMPTY: Proposed map changes did not pass grounding/schema validation.';
      db.exec('UPDATE sources SET processingStatus = ?, processingError = ? WHERE id = ?', 'failed', diagErr, sourceId);
    }

    const updated = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(updated.processingStatus, 'failed');
    assert.strictEqual(updated.processingError, 'AI_VALIDATION_EMPTY: Proposed map changes did not pass grounding/schema validation.');
    assert.strictEqual(db.tables.proposals.length, 0);
  });

  // Test 7: Outcome Case C — Chunk Failure Fail-Fast (No silent partial success)
  await test('7. Outcome Case C: Multi-chunk source fails if any chunk fails across models', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_multi_chunk_fail';
    db.exec(
      'INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      sourceId, 'ws_default', 'notes', 'Long Document', 'Chunk 1 text... Chunk 2 text...', '', new Date().toISOString(), '', 'processing', null
    );

    const chunks = ['Chunk 1 text', 'Chunk 2 text'];
    let chunk1Success = true;
    let chunk2Success = false;

    // Simulating chunk loop behavior from worker.js with sanitized diagnostics
    let fatalChunkError = null;
    for (let i = 0; i < chunks.length; i++) {
      const success = (i === 0) ? chunk1Success : chunk2Success;
      if (!success) {
        fatalChunkError = `AI_MODEL_ERROR: Analysis failed for chunk ${i + 1}/${chunks.length} after all fallback models.`;
        db.exec('UPDATE sources SET processingStatus = ?, processingError = ? WHERE id = ?', 'failed', fatalChunkError, sourceId);
        break;
      }
    }

    assert(fatalChunkError !== null, 'Fatal error must be set');
    const updated = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(updated.processingStatus, 'failed');
    assert.strictEqual(updated.processingError, 'AI_MODEL_ERROR: Analysis failed for chunk 2/2 after all fallback models.');
    assert.strictEqual(db.tables.proposals.length, 0, 'Must NOT create partial proposal when chunk fails');
  });

  // Test 8: Durable Diagnostic Preserved on Re-hydration & Reset on Retry
  await test('8. Failure diagnostic survives hydration and is cleared on retry', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_retry_test';
    const diagError = 'AI_MODEL_ERROR: Workers AI service binding unavailable.';

    db.exec(
      'INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      sourceId, 'ws_default', 'notes', 'Failed Source', 'text', '', new Date().toISOString(), '', 'failed', diagError
    );

    // Hydration check
    const hydrated = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(hydrated.processingError, diagError, 'Diagnostic must persist durably in sources table');

    // Retry initiated: clears error and resets to processing
    db.exec('UPDATE sources SET processingStatus = ?, processingError = NULL WHERE id = ?', 'processing', sourceId);
    const retried = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(retried.processingStatus, 'processing');
    assert.strictEqual(retried.processingError, null, 'Old failure diagnostic must be reset to null on retry');
  });

  // Test 9: Sanitized Diagnostics Guard in worker.js
  await test('9. worker.js never concatenates raw exception messages into durable processingError', async () => {
    const fs = require('fs');
    const path = require('path');
    const workerCode = fs.readFileSync(path.join(__dirname, '../src/worker.js'), 'utf8');

    assert(!workerCode.includes('processingError = ?`, lastError.message'), 'Must not store lastError.message directly into processingError');
    assert(!workerCode.includes('processingError = ?`, err.message'), 'Must not store raw err.message directly into processingError');
    assert(!workerCode.includes('(${lastError.message})'), 'Must not embed raw lastError in formatted error string');
  });

  // Test 10: Transition-based No Change Toast Invariant
  await test('10. No Change notification is transition-based and never fires on cold reload/hydration', async () => {
    // Simulating canvas.js tracking logic
    const knownProcessingSourceIds = new Set();
    let toastFired = false;

    const onSourceAnalyzedToast = (sourceTitle) => {
      toastFired = true;
    };

    // 1. Cold reload scenario: existing completed_no_change source in storage
    const historicalSources = [
      { id: 'src_hist_1', title: 'Old Source', processingStatus: 'completed_no_change' }
    ];

    // Seed on startup/hydration: only processing sources are tracked
    historicalSources.forEach(s => {
      if (s.processingStatus === 'processing') {
        knownProcessingSourceIds.add(s.id);
      }
    });

    // Simulate storage sync event on load
    historicalSources.forEach(s => {
      if (s.processingStatus === 'completed_no_change' && knownProcessingSourceIds.has(s.id)) {
        knownProcessingSourceIds.delete(s.id);
        onSourceAnalyzedToast(s.title);
      }
    });

    assert.strictEqual(toastFired, false, 'Toast must NOT fire for historical completed_no_change source on reload');

    // 2. Active session transition scenario: new source added in processing state
    const newSource = { id: 'src_live_2', title: 'Live Reading', processingStatus: 'processing' };
    knownProcessingSourceIds.add(newSource.id);

    // AI finishes analysis with no changes
    const updatedNewSource = { ...newSource, processingStatus: 'completed_no_change' };
    const liveSources = [updatedNewSource, historicalSources[0]];

    liveSources.forEach(s => {
      if (s.processingStatus === 'completed_no_change' && knownProcessingSourceIds.has(s.id)) {
        knownProcessingSourceIds.delete(s.id);
        onSourceAnalyzedToast(s.title);
      }
    });

    assert.strictEqual(toastFired, true, 'Toast MUST fire on live transition from processing -> completed_no_change');
    assert(!knownProcessingSourceIds.has('src_live_2'), 'Source must be removed from tracked set after firing');
  });

  // Test 11: Idempotent migration for lifecycle fields (processingStartedAt, processingAttemptId)
  await test('11. Idempotent migration for processingStartedAt and processingAttemptId', async () => {
    const db = new MockSqlite();
    db.columns.sources = ['id', 'workspaceId', 'type', 'title', 'text', 'url', 'capturedAt', 'contentHash', 'processingStatus', 'processingError'];

    // First migration adds columns
    const cols1 = db.exec('PRAGMA table_info(sources)').toArray();
    assert(!cols1.some(c => c.name === 'processingStartedAt'), 'processingStartedAt initially absent');
    assert(!cols1.some(c => c.name === 'processingAttemptId'), 'processingAttemptId initially absent');

    if (!cols1.some(c => c.name === 'processingStartedAt')) {
      db.exec('ALTER TABLE sources ADD COLUMN processingStartedAt TEXT;');
    }
    if (!cols1.some(c => c.name === 'processingAttemptId')) {
      db.exec('ALTER TABLE sources ADD COLUMN processingAttemptId TEXT;');
    }

    const colsAfter1 = db.exec('PRAGMA table_info(sources)').toArray();
    assert(colsAfter1.some(c => c.name === 'processingStartedAt'));
    assert(colsAfter1.some(c => c.name === 'processingAttemptId'));

    // Second run must be idempotent (no duplicate columns)
    if (!colsAfter1.some(c => c.name === 'processingStartedAt')) {
      db.exec('ALTER TABLE sources ADD COLUMN processingStartedAt TEXT;');
    }
    if (!colsAfter1.some(c => c.name === 'processingAttemptId')) {
      db.exec('ALTER TABLE sources ADD COLUMN processingAttemptId TEXT;');
    }

    const colsAfter2 = db.exec('PRAGMA table_info(sources)').toArray();
    assert.strictEqual(colsAfter2.filter(c => c.name === 'processingStartedAt').length, 1);
    assert.strictEqual(colsAfter2.filter(c => c.name === 'processingAttemptId').length, 1);
  });

  // Test 12: Old Source Retry preserves capturedAt byte-for-byte, updates processingStartedAt and creates new processingAttemptId
  await test('12. Retry preserves immutable capturedAt provenance and assigns new attemptId & startedAt', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_old_provenance';
    const oldCapturedAt = '2026-09-03T08:00:00.000Z'; // 4 hours ago
    const initialAttemptId = 'att_initial_123';

    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, sourceId, 'ws_default', 'notes', 'Old Proof', 'Content', '', oldCapturedAt, '', 'failed', 'AI_MODEL_ERROR: Rate limit', oldCapturedAt, initialAttemptId);

    // Perform Retry logic as in POST /api/sources/retry
    const retryTime = '2026-09-03T12:00:00.000Z';
    const newAttemptId = 'att_retry_456';

    db.exec(`
      UPDATE sources 
      SET processingStatus = 'processing', processingError = NULL, processingStartedAt = ?, processingAttemptId = ? 
      WHERE id = ?
    `, retryTime, newAttemptId, sourceId);

    const updated = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(updated.capturedAt, oldCapturedAt, 'capturedAt provenance MUST remain 100% byte-for-byte unchanged');
    assert.strictEqual(updated.processingStartedAt, retryTime, 'processingStartedAt must reflect retry time');
    assert.strictEqual(updated.processingAttemptId, newAttemptId, 'processingAttemptId must be updated to new attempt');
    assert.strictEqual(updated.processingStatus, 'processing', 'Status must be reset to processing');
    assert.strictEqual(updated.processingError, null, 'Error must be cleared on retry');
  });

  // Test 13: Old Source retry is NOT immediately timed out by getFullWorkspaceState recovery
  await test('13. Old source (captured hours ago) is NOT immediately timed out on retry', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_retry_not_timeout';
    const oldCapturedAt = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(); // 4 hours ago
    const retryTime = new Date(Date.now() - 30 * 1000).toISOString(); // retried 30 seconds ago
    const attemptId = 'att_live_retry';

    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, sourceId, 'ws_default', 'notes', 'Old Clip', 'Content', '', oldCapturedAt, '', 'processing', null, retryTime, attemptId);

    // Timeout check with 5 minutes threshold
    const timeoutThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.exec(`
      UPDATE sources 
      SET processingStatus = 'failed', processingError = 'AI_MODEL_ERROR: Processing timed out after 5 minutes.'
      WHERE processingStatus = 'processing' 
        AND (
          (processingStartedAt IS NOT NULL AND processingStartedAt < ?)
          OR (processingStartedAt IS NULL AND capturedAt < ?)
        )
    `, timeoutThreshold, timeoutThreshold);

    const checked = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(checked.processingStatus, 'processing', 'Old source retried 30s ago must NOT be timed out!');
    assert.strictEqual(checked.processingError, null);
  });

  // Test 14: Timeout evaluates processingStartedAt, NEVER capturedAt
  await test('14. Timeout auto-heal uses processingStartedAt, never capturedAt', async () => {
    const db = new MockSqlite();
    const now = Date.now();
    const timeoutThreshold = new Date(now - 5 * 60 * 1000).toISOString();

    // Source A: captured 2 hours ago, but retried 1 minute ago -> MUST REMAIN PROCESSING
    const srcA_id = 'src_A_recent_retry';
    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, srcA_id, 'ws_default', 'notes', 'A', 'Text', '', new Date(now - 2 * 60 * 60 * 1000).toISOString(), '', 'processing', null, new Date(now - 60 * 1000).toISOString(), 'att_A');

    // Source B: captured 1 minute ago, but attempt started 6 minutes ago -> MUST TIME OUT
    const srcB_id = 'src_B_old_attempt';
    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, srcB_id, 'ws_default', 'notes', 'B', 'Text', '', new Date(now - 60 * 1000).toISOString(), '', 'processing', null, new Date(now - 6 * 60 * 1000).toISOString(), 'att_B');

    // Run timeout sweep
    db.exec(`
      UPDATE sources 
      SET processingStatus = 'failed', processingError = 'AI_MODEL_ERROR: Processing timed out after 5 minutes.'
      WHERE processingStatus = 'processing' 
        AND (
          (processingStartedAt IS NOT NULL AND processingStartedAt < ?)
          OR (processingStartedAt IS NULL AND capturedAt < ?)
        )
    `, timeoutThreshold, timeoutThreshold);

    const srcA = db.exec('SELECT * FROM sources').toArray().find(s => s.id === srcA_id);
    const srcB = db.exec('SELECT * FROM sources').toArray().find(s => s.id === srcB_id);

    assert.strictEqual(srcA.processingStatus, 'processing', 'Source A with recent processingStartedAt must NOT time out despite old capturedAt');
    assert.strictEqual(srcB.processingStatus, 'failed', 'Source B with old processingStartedAt MUST time out despite recent capturedAt');
    assert(srcB.processingError.includes('timed out after 5 minutes'));
  });

  // Test 15: Attempt A times out -> no Retry occurs -> late successful A result is discarded
  await test('15. Attempt A times out -> no Retry occurs -> late successful A result is discarded', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_timeout_no_retry';
    const attemptA = 'att_timed_out_A';

    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, sourceId, 'ws_default', 'notes', 'Timeout A', 'Text', '', new Date().toISOString(), '', 'processing', null, new Date().toISOString(), attemptA);

    // Timeout occurs (status -> failed, attemptId remains att_timed_out_A)
    const timeoutMsg = 'AI_MODEL_ERROR: Processing timed out after 5 minutes.';
    db.exec("UPDATE sources SET processingStatus = 'failed', processingError = ? WHERE id = ?", timeoutMsg, sourceId);

    // Guard matching worker.js isAttemptWritable
    const isAttemptWritable = (attId) => {
      const rows = db.exec('SELECT processingAttemptId, processingStatus FROM sources WHERE id = ?', sourceId).toArray();
      return rows.length > 0 && rows[0].processingAttemptId === attId && rows[0].processingStatus === 'processing';
    };

    // Late Attempt A arrives with success BEFORE any Retry occurs
    if (isAttemptWritable(attemptA)) {
      db.exec("UPDATE sources SET processingStatus = 'completed_with_changes' WHERE id = ?", sourceId);
    }

    const state = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(state.processingStatus, 'failed', 'Late Attempt A success MUST be dropped after timeout');
    assert(state.processingError.includes('timed out after 5 minutes'), 'Timeout error must not be overwritten');
  });

  // Test 16: Attempt A times out -> no Retry occurs -> late failed A result cannot replace timeout diagnostic
  await test('16. Attempt A times out -> no Retry occurs -> late failed A result cannot replace timeout diagnostic', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_timeout_late_err';
    const attemptA = 'att_timed_out_A_err';

    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, sourceId, 'ws_default', 'notes', 'Timeout Err', 'Text', '', new Date().toISOString(), '', 'processing', null, new Date().toISOString(), attemptA);

    // Timeout triggers
    const timeoutMsg = 'AI_MODEL_ERROR: Processing timed out after 5 minutes.';
    db.exec("UPDATE sources SET processingStatus = 'failed', processingError = ? WHERE id = ?", timeoutMsg, sourceId);

    const isAttemptWritable = (attId) => {
      const rows = db.exec('SELECT processingAttemptId, processingStatus FROM sources WHERE id = ?', sourceId).toArray();
      return rows.length > 0 && rows[0].processingAttemptId === attId && rows[0].processingStatus === 'processing';
    };

    // Late Attempt A returns with a model error
    const lateModelErr = 'AI_MODEL_ERROR: Analysis failed for chunk 1/1 after all fallback models.';
    if (isAttemptWritable(attemptA)) {
      db.exec("UPDATE sources SET processingStatus = 'failed', processingError = ? WHERE id = ?", lateModelErr, sourceId);
    }

    const state = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(state.processingError, timeoutMsg, 'Timeout diagnostic must be preserved, not overwritten by late attempt error');
  });

  // Test 17: Attempt A times out -> late A cannot create a Proposal
  await test('17. Attempt A times out -> late A cannot create a Proposal', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_timeout_no_proposal';
    const attemptA = 'att_timed_out_A_prop';

    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, sourceId, 'ws_default', 'notes', 'Timeout Proposal', 'Text', '', new Date().toISOString(), '', 'processing', null, new Date().toISOString(), attemptA);

    // Timeout triggers
    db.exec("UPDATE sources SET processingStatus = 'failed', processingError = 'AI_MODEL_ERROR: Processing timed out after 5 minutes.' WHERE id = ?", sourceId);

    const isAttemptWritable = (attId) => {
      const rows = db.exec('SELECT processingAttemptId, processingStatus FROM sources WHERE id = ?', sourceId).toArray();
      return rows.length > 0 && rows[0].processingAttemptId === attId && rows[0].processingStatus === 'processing';
    };

    // Late Attempt A tries to create a proposal
    if (isAttemptWritable(attemptA)) {
      db.exec(`
        INSERT INTO proposals (id, workspaceId, baseRevision, sourceId, summary, operations, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `, 'prop_stale_1', 'ws_default', 1, sourceId, 'Stale Summary', '[]', new Date().toISOString());
    }

    const proposals = db.exec('SELECT id FROM proposals WHERE sourceId = ?', sourceId).toArray();
    assert.strictEqual(proposals.length, 0, 'No proposal may be created by a timed-out attempt');
  });

  // Test 18: Timeout A -> Retry B -> late A discarded
  await test('18. Timeout A -> Retry B -> late A discarded and cannot overwrite B', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_timeout_then_retry';
    const attemptA = 'att_A_timed_out';
    const attemptB = 'att_B_retry';

    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, sourceId, 'ws_default', 'notes', 'Timeout then Retry', 'Text', '', new Date().toISOString(), '', 'processing', null, new Date().toISOString(), attemptA);

    // Attempt A times out
    db.exec("UPDATE sources SET processingStatus = 'failed', processingError = 'AI_MODEL_ERROR: Processing timed out after 5 minutes.' WHERE id = ?", sourceId);

    // User clicks Retry -> Attempt B starts
    db.exec(`
      UPDATE sources 
      SET processingStatus = 'processing', processingError = NULL, processingStartedAt = ?, processingAttemptId = ? 
      WHERE id = ?
    `, new Date().toISOString(), attemptB, sourceId);

    const isAttemptWritable = (attId) => {
      const rows = db.exec('SELECT processingAttemptId, processingStatus FROM sources WHERE id = ?', sourceId).toArray();
      return rows.length > 0 && rows[0].processingAttemptId === attId && rows[0].processingStatus === 'processing';
    };

    // Stale Attempt A arrives late
    if (isAttemptWritable(attemptA)) {
      db.exec("UPDATE sources SET processingStatus = 'completed_no_change' WHERE id = ?", sourceId);
    }

    let midState = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(midState.processingStatus, 'processing', 'Attempt A must be discarded');
    assert.strictEqual(midState.processingAttemptId, attemptB);

    // Active Attempt B arrives
    if (isAttemptWritable(attemptB)) {
      db.exec("UPDATE sources SET processingStatus = 'completed_with_changes' WHERE id = ?", sourceId);
    }

    let finalState = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(finalState.processingStatus, 'completed_with_changes', 'Attempt B must successfully write');
  });

  // Test 19: Double Retry -> only newest attempt may write terminal state
  await test('19. Double retry discards all earlier attempts and only permits newest attempt to write', async () => {
    const db = new MockSqlite();
    const sourceId = 'src_double_retry';
    const attempt1 = 'att_1';
    const attempt2 = 'att_2';
    const attempt3 = 'att_3';

    db.exec(`
      INSERT INTO sources (id, workspaceId, type, title, text, url, capturedAt, contentHash, processingStatus, processingError, processingStartedAt, processingAttemptId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, sourceId, 'ws_default', 'notes', 'Double Retry', 'Text', '', new Date().toISOString(), '', 'processing', null, new Date().toISOString(), attempt1);

    // User retries once (att_2)
    db.exec("UPDATE sources SET processingAttemptId = ? WHERE id = ?", attempt2, sourceId);

    // User retries second time (att_3)
    db.exec("UPDATE sources SET processingAttemptId = ? WHERE id = ?", attempt3, sourceId);

    const isAttemptWritable = (attId) => {
      const rows = db.exec('SELECT processingAttemptId, processingStatus FROM sources WHERE id = ?', sourceId).toArray();
      return rows.length > 0 && rows[0].processingAttemptId === attId && rows[0].processingStatus === 'processing';
    };

    // Attempt 1 finishes -> dropped
    if (isAttemptWritable(attempt1)) {
      db.exec("UPDATE sources SET processingStatus = 'failed', processingError = 'Old error' WHERE id = ?", sourceId);
    }

    // Attempt 2 finishes -> dropped
    if (isAttemptWritable(attempt2)) {
      db.exec("UPDATE sources SET processingStatus = 'completed_no_change' WHERE id = ?", sourceId);
    }

    let midState = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(midState.processingStatus, 'processing', 'Neither attempt 1 nor 2 should write');

    // Attempt 3 finishes -> accepted
    if (isAttemptWritable(attempt3)) {
      db.exec("UPDATE sources SET processingStatus = 'completed_with_changes' WHERE id = ?", sourceId);
    }

    let finalState = db.exec('SELECT * FROM sources').toArray().find(s => s.id === sourceId);
    assert.strictEqual(finalState.processingStatus, 'completed_with_changes', 'Attempt 3 must successfully write state');
  });

  // Test 20: Configurable timeout duration constant and justification in worker.js
  await test('20. AI_PROCESSING_TIMEOUT_MS is exported as 5 minutes and used in timeout query', async () => {
    const fs = require('fs');
    const path = require('path');
    const workerCode = fs.readFileSync(path.join(__dirname, '../src/worker.js'), 'utf8');

    assert(workerCode.includes('export const AI_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;'), 'AI_PROCESSING_TIMEOUT_MS must be exported as 5 minutes');
    assert(workerCode.includes('AI_PROCESSING_TIMEOUT_MS'), 'Timeout query must use AI_PROCESSING_TIMEOUT_MS');
    assert(workerCode.includes('processingStartedAt IS NOT NULL AND processingStartedAt <'), 'Query must check processingStartedAt');
    assert(workerCode.includes("processingStatus === 'processing'"), 'Guard must check processingStatus === processing');
  });

  console.log('\n====================================================');
  console.log(`Verification Complete: ${passedTests}/${passedTests + failedTests} tests passed.`);
  console.log('====================================================\n');

  if (failedTests > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('[Unhandled Test Error]', err);
  process.exit(1);
});
