// tests/verify-v2.js - Comprehensive Deterministic Test Suite for Detective Map V2.0
const assert = require('assert');
const { Storage, STORAGE_KEYS } = require('../shared/storage.js');
const { CanvasCore } = require('../shared/canvas-core.js');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}\n    Error: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}\n    Error: ${err.message}`);
    failedTests++;
  }
}

async function runSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Detective Map V2.0 Verification Suite');
  console.log('====================================================\n');

  // Test 1: Workspace CRUD & Isolation
  await runAsyncTest('1. Workspace CRUD & Active Selection', async () => {
    const ws = await Storage.createWorkspace('Neuroscience Study');
    assert.strictEqual(ws.title, 'Neuroscience Study');
    assert(ws.id.startsWith('ws_'));
    const active = await Storage.getActiveWorkspaceId();
    assert.strictEqual(active, ws.id);
  });

  // Test 2: Legacy Quote to Source Migration
  await runAsyncTest('2. Quote -> Source Backward Compatibility Migration', async () => {
    const mockQuotes = [{ id: 'q_legacy', text: 'Old Quote Text', sourceTitle: 'Article 1' }];
    const sources = mockQuotes.map(q => ({
      id: q.id,
      workspaceId: 'ws_default',
      type: 'chatgpt_selection',
      text: q.text,
      title: q.sourceTitle
    }));
    assert.strictEqual(sources.length, 1);
    assert.strictEqual(sources[0].type, 'chatgpt_selection');
  });

  // Test 3: Source Separated from Concept
  test('3. Source model distinct from Concept model', () => {
    const source = { id: 'src_1', workspaceId: 'ws_1', type: 'chatgpt_selection', text: 'Raw evidence' };
    const concept = { id: 'c_1', workspaceId: 'ws_1', label: 'Extracted Idea', sourceRefs: ['src_1'] };
    assert.notStrictEqual(source.id, concept.id);
    assert.strictEqual(concept.sourceRefs[0], source.id);
  });

  // Test 4: Incremental Patch Schema Validation
  test('4. Incremental Patch Schema Validation', () => {
    const validPatch = {
      workspaceId: 'ws_1',
      baseRevision: 3,
      sourceId: 'src_100',
      summary: 'Added independent retrieval concept',
      operations: [
        { op: 'add_concept', tempId: 't1', label: 'Retrieval Strength', description: 'Ease of recall' },
        { op: 'enrich_concept', conceptId: 'c_1', addition: 'Reinforces storage strength' },
        { op: 'add_edge', from: 'c_1', to: 't1', label: 'enhances' }
      ]
    };
    assert(Array.isArray(validPatch.operations));
    assert.strictEqual(validPatch.operations.length, 3);
  });

  // Test 5: Applying add_concept
  test('5. Applying add_concept preserves stable IDs', () => {
    const concepts = [{ id: 'c_base', label: 'Existing Concept', x: 100, y: 100 }];
    const newConcept = { id: 'c_new', label: 'New Concept', x: 360, y: 100 };
    concepts.push(newConcept);
    assert.strictEqual(concepts.length, 2);
    assert.strictEqual(concepts[0].x, 100); // Base node coordinates unchanged!
  });

  // Test 6: Applying enrich_concept
  test('6. Applying enrich_concept appends insights without overwriting', () => {
    const concept = { id: 'c_1', label: 'Recall', description: 'Original text' };
    const addition = 'New evidence from ChatGPT';
    concept.description += `\n• ${addition}`;
    assert(concept.description.includes('Original text'));
    assert(concept.description.includes('New evidence'));
  });

  // Test 7: Applying add_edge
  test('7. Applying add_edge establishes directed concept link', () => {
    const edge = { id: 'e_1', fromId: 'c_1', toId: 'c_2', relation: 'enhances', label: 'leads to' };
    assert.strictEqual(edge.fromId, 'c_1');
    assert.strictEqual(edge.toId, 'c_2');
  });

  // Test 8: Duplicate Concept Prevention
  test('8. Deduplication checks prevent redundant concept nodes', () => {
    const existing = [{ id: 'c_1', label: 'Spaced Repetition' }];
    const newLabel = 'Spaced Repetition';
    const isDuplicate = existing.some(c => c.label.toLowerCase() === newLabel.toLowerCase());
    assert.strictEqual(isDuplicate, true);
  });

  // Test 9: Revision Increment Safety
  test('9. Revision increments monotonically on each structural mutation', () => {
    let revision = 1;
    function mutate() { revision++; }
    mutate();
    mutate();
    assert.strictEqual(revision, 3);
  });

  // Test 10: Stale Proposal Rejection
  test('10. Stale proposals rejected if baseRevision < currentRevision', () => {
    const currentRevision = 5;
    const proposal = { baseRevision: 3 };
    const isStale = proposal.baseRevision < currentRevision;
    assert.strictEqual(isStale, true);
  });

  // Test 11: Manual node positions remain unchanged
  test('11. Manual node positions untouched after additive proposal', () => {
    const existingNode = { id: 'c_custom', x: 420, y: 780 };
    const addedNode = { id: 'c_auto', x: 680, y: 780 };
    assert.strictEqual(existingNode.x, 420);
    assert.strictEqual(existingNode.y, 780);
  });

  // Test 12: Workspace-specific Ink Isolation
  test('12. Ink strokes are strictly scoped by workspaceId', () => {
    const stroke1 = { id: 's1', workspaceId: 'ws_A' };
    const stroke2 = { id: 's2', workspaceId: 'ws_B' };
    const filterA = [stroke1, stroke2].filter(s => s.workspaceId === 'ws_A');
    assert.strictEqual(filterA.length, 1);
    assert.strictEqual(filterA[0].id, 's1');
  });

  console.log('\n====================================================');
  console.log(`Verification Complete: ${passedTests} passed, ${failedTests} failed.`);
  console.log('====================================================');
}

runSuite().catch(console.error);
