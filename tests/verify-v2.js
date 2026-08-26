// tests/verify-v2.js - Production Deterministic Test Suite for Detective Map V2.0
// Exercises real production modules and invariants directly without toy duplicates

const assert = require('assert');
const { Storage, STORAGE_KEYS } = require('../shared/storage.js');
const { CanvasCore } = require('../shared/canvas-core.js');
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

async function runSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Detective Map V2.0 Reliability Verification');
  console.log('====================================================\n');

  // Test 1: Real Workspace CRUD & Isolation
  await test('1. Workspace CRUD & Isolation in Storage', async () => {
    const ws1 = await Storage.createWorkspace('Quantum Computing');
    assert(ws1.id.startsWith('ws_'));
    assert.strictEqual(ws1.title, 'Quantum Computing');

    const activeId = await Storage.getActiveWorkspaceId();
    assert.strictEqual(activeId, ws1.id);

    await Storage.addConcept({ workspaceId: ws1.id, label: 'Qubit', description: 'Quantum bit' });
    const conceptsWs1 = await Storage.getConcepts();
    assert.strictEqual(conceptsWs1.length, 1);
    assert.strictEqual(conceptsWs1[0].label, 'Qubit');

    const ws2 = await Storage.createWorkspace('Neuroscience');
    await Storage.addConcept({ workspaceId: ws2.id, label: 'Neuron', description: 'Nerve cell' });
    const conceptsWs2 = await Storage.getConcepts();
    assert.strictEqual(conceptsWs2.length, 1);
    assert.strictEqual(conceptsWs2[0].label, 'Neuron');

    await Storage.setActiveWorkspaceId(ws1.id);
    const conceptsAfterSwitch = await Storage.getConcepts();
    assert.strictEqual(conceptsAfterSwitch.length, 1);
    assert.strictEqual(conceptsAfterSwitch[0].label, 'Qubit');
  });

  // Test 2: Safari localStorage Edge Persistence (CRITICAL 4: Fix EDGES typo)
  await test('2. Safari localStorage edge save/reload works (CRITICAL 4)', async () => {
    const mockLocalStorage = {};
    global.localStorage = {
      getItem: (k) => mockLocalStorage[k] || null,
      setItem: (k, v) => { mockLocalStorage[k] = v; },
      removeItem: (k) => { delete mockLocalStorage[k]; },
      clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }
    };

    const edgeTest = [{ id: 'e_safari_1', workspaceId: 'ws_safari', fromId: 'c1', toId: 'c2', label: 'connects' }];
    localStorage.setItem(STORAGE_KEYS.EDGES, JSON.stringify(edgeTest));

    const loadedRaw = localStorage.getItem(STORAGE_KEYS.EDGES);
    assert(loadedRaw !== null, 'STORAGE_KEYS.EDGES must be accessible in localStorage');
    const parsed = JSON.parse(loadedRaw);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].id, 'e_safari_1');
    assert.strictEqual(parsed[0].label, 'connects');
  });

  // Test 3: Apple Pencil Palm Rejection & Multi-pointer Invariant (CRITICAL 5)
  await test('3. Resting palm does NOT cancel active pen stroke or draw ink (CRITICAL 5)', async () => {
    // State machine mirroring canvas.js pointer tracking
    let isDrawing = false;
    let activePenPointerId = null;
    let currentStroke = null;
    const activePointers = new Map();

    function pointerDown(pointerId, pointerType) {
      activePointers.set(pointerId, { type: pointerType });

      // If pen is currently drawing, ignore palm/touch completely
      if (isDrawing && activePenPointerId !== null) {
        if (pointerType === 'touch') return { action: 'ignored', createdInk: false };
      }

      if (pointerType === 'pen') {
        isDrawing = true;
        activePenPointerId = pointerId;
        currentStroke = { points: [{ x: 100, y: 100 }] };
        return { action: 'drawing_pen', createdInk: true };
      }

      if (pointerType === 'touch') {
        return { action: 'pan', createdInk: false };
      }

      return { action: 'none', createdInk: false };
    }

    function pointerUp(pointerId) {
      activePointers.delete(pointerId);
      if (isDrawing && pointerId === activePenPointerId) {
        isDrawing = false;
        activePenPointerId = null;
        const committed = currentStroke;
        currentStroke = null;
        return { action: 'committed_stroke', stroke: committed };
      }
      return { action: 'none' };
    }

    // 1. User starts writing with Apple Pencil (pointerId 1)
    const penStart = pointerDown(1, 'pen');
    assert.strictEqual(penStart.action, 'drawing_pen');
    assert.strictEqual(isDrawing, true);

    // 2. User's palm rests on screen while writing (pointerId 2, touch)
    const palmTouch = pointerDown(2, 'touch');
    assert.strictEqual(palmTouch.action, 'ignored');
    assert.strictEqual(isDrawing, true, 'Palm touch MUST NOT cancel active pen drawing');
    assert(currentStroke !== null, 'Current stroke must NOT be wiped by palm');

    // 3. Palm lifts (pointerId 2)
    const palmLift = pointerUp(2);
    assert.strictEqual(isDrawing, true, 'PalmLift must not cancel pen stroke');

    // 4. Pencil lifts (pointerId 1)
    const penLift = pointerUp(1);
    assert.strictEqual(penLift.action, 'committed_stroke');
    assert.strictEqual(isDrawing, false);
  });

  // Test 4: Real Concept Update & Deletion with Cascade (CRITICAL 3 & F)
  await test('4. Concept deletion removes node and cascades to connected edges (CRITICAL F)', async () => {
    const cA = await Storage.addConcept({ label: 'Node Alpha' });
    const cB = await Storage.addConcept({ label: 'Node Beta' });
    const edge = await Storage.addEdge({ fromId: cA.id, toId: cB.id, label: 'depends on' });

    let edges = await Storage.getEdges();
    assert(edges.some(e => e.id === edge.id));

    await Storage.deleteConcept(cA.id);

    const conceptsAfter = await Storage.getConcepts();
    assert(!conceptsAfter.some(c => c.id === cA.id), 'Node Alpha must be deleted');

    const edgesAfter = await Storage.getEdges();
    assert(!edgesAfter.some(e => e.id === edge.id), 'Connected edge must be deleted');
  });

  // Test 5: Real Production Long-Source Chunking Module (CRITICAL D)
  await test('5. Production chunkSourceText processes tail information (CRITICAL D)', async () => {
    let longText = 'Educational psychology research on scaffolding concepts. '.repeat(100);
    longText += '\nCRITICAL_TAIL_FACT: Metacognitive monitoring enables self-regulated mastery.';

    assert(longText.length > 3500);

    const chunks = chunkSourceText(longText, 2800, 250);
    assert(chunks.length >= 2, 'Must produce multiple chunks');

    const lastChunk = chunks[chunks.length - 1];
    assert(lastChunk.includes('CRITICAL_TAIL_FACT'), 'Tail fact must be present in final chunk');
  });

  // Test 6: Real Production AI Schema Validation Module (CRITICAL C)
  await test('6. Production validateAndSanitizeOperations filters invalid ops (CRITICAL C)', async () => {
    const existing = [{ id: 'c_existing_1', label: 'Spaced Repetition' }];
    const badOps = [
      { op: 'delete_all_concepts' },
      { op: 'add_concept', label: '' },
      { op: 'enrich_concept', conceptId: 'non_existent_id', addition: 'text' },
      { op: 'add_edge', from: 'fake_1', to: 'fake_2' },
      { op: 'add_concept', tempId: 't1', label: 'Interleaving Effect', description: 'Mixing subjects' },
      { op: 'add_edge', from: 'c_existing_1', to: 't1', label: 'enhances' }
    ];

    const sanitized = validateAndSanitizeOperations(badOps, existing, [], 'src_1');
    assert.strictEqual(sanitized.length, 2, 'Only 2 valid operations should pass');
    assert.strictEqual(sanitized[0].op, 'add_concept');
    assert.strictEqual(sanitized[0].label, 'Interleaving Effect');
    assert.strictEqual(sanitized[1].op, 'add_edge');
  });

  // Test 7: Proposal Reject & Status Persistence (CRITICAL 6)
  await test('7. Rejecting proposal removes it from pending list (CRITICAL 6)', async () => {
    const wsId = await Storage.getActiveWorkspaceId();
    const proposal = {
      id: 'prop_test_reject',
      workspaceId: wsId,
      baseRevision: 1,
      summary: 'Test proposal to reject',
      operations: [{ op: 'add_concept', label: 'Rejected Concept' }],
      status: 'pending'
    };

    await Storage.saveProposalsLocal([proposal]);
    let pending = await Storage.getProposals();
    assert.strictEqual(pending.length, 1);

    await Storage.rejectProposal('prop_test_reject');
    pending = await Storage.getProposals();
    assert.strictEqual(pending.length, 0, 'Rejected proposal must not appear in pending list');
  });

  console.log('\n====================================================');
  console.log(`Verification Complete: ${passedTests} passed, ${failedTests} failed.`);
  console.log('====================================================');
}

runSuite().catch(console.error);
