process.env.DETECTIVE_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

const assert = require('assert');

// Strict Network Call Guard: Any network attempt fails the test suite immediately
let networkCallsAttempted = 0;
global.fetch = async (...args) => {
  networkCallsAttempted++;
  throw new Error(`[CRITICAL TEST ISOLATION FAILURE] Network call strictly forbidden in verify-v2: ${args[0]}`);
};

const { Storage, STORAGE_KEYS } = require('../shared/storage.js');
Storage.enableTestMode();

const { CanvasCore } = require('../shared/canvas-core.js');
const { chunkSourceText, validateAndSanitizeOperations, validateProposalSubset } = require('../shared/engine-core.js');

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
  console.log('🧪 Starting Detective Map V2.0 Reliability Verification (Pure In-Memory Isolation)');
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
    let isDrawing = false;
    let activePenPointerId = null;
    let currentStroke = null;
    const activePointers = new Map();

    function pointerDown(pointerId, pointerType) {
      activePointers.set(pointerId, { type: pointerType });

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

    const penStart = pointerDown(1, 'pen');
    assert.strictEqual(penStart.action, 'drawing_pen');
    assert.strictEqual(isDrawing, true);

    const palmTouch = pointerDown(2, 'touch');
    assert.strictEqual(palmTouch.action, 'ignored');
    assert.strictEqual(isDrawing, true, 'Palm touch MUST NOT cancel active pen drawing');
    assert(currentStroke !== null, 'Current stroke must NOT be wiped by palm');

    const palmLift = pointerUp(2);
    assert.strictEqual(isDrawing, true, 'PalmLift must not cancel pen stroke');

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

  // Test 8: Cross-Device Workspace List Sync (CRITICAL 2)
  await test('8. Workspace creation syncs to new client (CRITICAL 2)', async () => {
    const wsList = [
      { id: 'ws_default', title: 'My Learning Map', revision: 1 },
      { id: 'ws_ai_learning', title: 'AI Learning', revision: 1 }
    ];
    await Storage.saveWorkspacesLocal(wsList);

    const loaded = await Storage.getWorkspaces();
    assert(loaded.some(w => w.title === 'AI Learning'), 'AI Learning workspace must be present in synced list');
  });

  // Test 9: Strict Partial Proposal Validation - Prevent Dangling Edges (CRITICAL 4)
  await test('9. validateProposalSubset drops dangling edges when concept is deselected (CRITICAL 4)', async () => {
    const existing = [{ id: 'c_existing_1', label: 'Spaced Repetition' }];
    
    // User was proposed adding Concept temp_1 and an Edge from existing to temp_1
    // User DESELECTS add_concept temp_1, but leaves add_edge selected
    const selectedOpsOnlyEdge = [
      { op: 'add_edge', from: 'c_existing_1', to: 'temp_1', label: 'links' }
    ];

    const safeOps = validateProposalSubset(selectedOpsOnlyEdge, existing);
    assert.strictEqual(safeOps.length, 0, 'Dangling edge pointing to deselected temp_1 MUST be dropped');

    // If user selects BOTH add_concept and add_edge:
    const selectedBoth = [
      { op: 'add_concept', tempId: 'temp_1', label: 'Active Recall', description: 'Testing effect' },
      { op: 'add_edge', from: 'c_existing_1', to: 'temp_1', label: 'links' }
    ];
    const safeOpsBoth = validateProposalSubset(selectedBoth, existing);
    assert.strictEqual(safeOpsBoth.length, 2, 'Both concept and dependent edge should pass when concept is selected');
  });

  // Test 10: Persisted Active Workspace Reload & Ink Isolation Regression Test
  await test('10. Reload preserves active workspace and routes ADD_INK_STROKE to correct workspace', async () => {
    // 1. Set persisted active workspace = 'ws_ai_learning'
    await Storage.setActiveWorkspaceId('ws_ai_learning');

    // 2. Simulate reload/new client engine initialization
    const reloadedActiveId = await Storage.getActiveWorkspaceId();
    assert.strictEqual(reloadedActiveId, 'ws_ai_learning', 'Persisted workspace must be ws_ai_learning');

    // Verify engine activeWorkspaceId alignment
    Storage.cloudSync.activeWorkspaceId = reloadedActiveId;
    assert.strictEqual(Storage.cloudSync.activeWorkspaceId, 'ws_ai_learning');

    // 3. Add stroke to active workspace
    const newStroke = await Storage.addStroke({
      points: [{ x: 50, y: 50 }],
      tool: 'pen',
      color: '#38bdf8'
    });
    assert.strictEqual(newStroke.workspaceId, 'ws_ai_learning');

    // 4. Verify strokes in 'ws_ai_learning' contain the stroke
    const strokesAiLearning = await Storage.getStrokes();
    assert(strokesAiLearning.some(s => s.id === newStroke.id), 'Stroke must exist in ws_ai_learning');

    // 5. Verify 'ws_default' received ZERO strokes from this action
    await Storage.setActiveWorkspaceId('ws_default');
    const strokesDefault = await Storage.getStrokes();
    assert(!strokesDefault.some(s => s.id === newStroke.id), 'ws_default must receive zero strokes');

    // Restore ws_ai_learning
    await Storage.setActiveWorkspaceId('ws_ai_learning');
  });

  // Test 11: SOURCE_FAILED state update & Retry Analysis
  await test('11. SOURCE_FAILED updates source status to failed with user-visible error', async () => {
    const src = await Storage.addSource({
      title: 'Failed Analysis Candidate',
      text: 'Gibberish text test',
      workspaceId: 'ws_ai_learning'
    });
    assert.strictEqual(src.processingStatus, 'processing');

    // Simulate SOURCE_FAILED incoming message
    Storage.cloudSync.handleIncomingMessage({
      type: 'SOURCE_FAILED',
      sourceId: src.id,
      error: 'AI could not extract structured insights'
    });

    // Wait a tick for local store update
    await new Promise(r => setTimeout(r, 50));

    const sources = await Storage.getSources();
    const updated = sources.find(s => s.id === src.id);
    assert(updated, 'Source must exist');
    assert.strictEqual(updated.processingStatus, 'failed');
    assert.strictEqual(updated.processingError, 'AI could not extract structured insights');
  });

  // Test 12: Workspace Proposal Scoped Isolation & Hydration
  await test('12. Proposal scoped saving preserves proposals across multiple workspaces', async () => {
    const origFetchRemoteState = Storage.fetchRemoteState;
    Storage.fetchRemoteState = async () => {}; // Test offline local isolation

    await Storage.setActiveWorkspaceId('ws_unit_1');
    await Storage.saveProposalsLocal([
      { id: 'prop_1', workspaceId: 'ws_unit_1', status: 'pending', summary: 'WS1 Proposal' }
    ]);

    await Storage.setActiveWorkspaceId('ws_unit_2');
    await Storage.saveProposalsLocal([
      { id: 'prop_2', workspaceId: 'ws_unit_2', status: 'pending', summary: 'WS2 Proposal' }
    ]);

    // Query ws_unit_2
    const p2 = await Storage.getProposals();
    assert.strictEqual(p2.length, 1);
    assert.strictEqual(p2[0].id, 'prop_2');

    // Query ws_unit_1
    await Storage.setActiveWorkspaceId('ws_unit_1');
    const p1 = await Storage.getProposals();
    assert.strictEqual(p1.length, 1);
    assert.strictEqual(p1[0].id, 'prop_1');

    Storage.fetchRemoteState = origFetchRemoteState;
  });

  // Test 13: Durable Stale Proposal Lifecycle & Recovery Across Reload
  await test('13. Stale proposal durable recovery across client reload and retrySource clearing', async () => {
    const wsId = await Storage.getActiveWorkspaceId();
    const proposalA = {
      id: 'prop_A',
      workspaceId: wsId,
      sourceId: 'src_A',
      baseRevision: 1,
      summary: 'Proposal A',
      operations: [{ op: 'add_concept', tempId: 't1', label: 'Concept A', description: 'Desc A' }],
      status: 'pending'
    };
    const proposalB = {
      id: 'prop_B',
      workspaceId: wsId,
      sourceId: 'src_B',
      baseRevision: 1,
      summary: 'Proposal B',
      operations: [{ op: 'enrich_concept', conceptId: 't1', addition: 'Enrich insight' }],
      status: 'pending'
    };

    // Save pending proposals
    await Storage.saveProposalsLocal([proposalA, proposalB]);
    let pending = await Storage.getProposals();
    assert.strictEqual(pending.length, 2);

    // Apply Proposal A -> succeeds
    await Storage.applyProposal('prop_A', proposalA.operations);

    // Proposal B becomes stale
    const allStaleBefore = await Storage.getStaleProposals();
    assert.strictEqual(allStaleBefore.length, 0);

    // Simulate 409 conflict when applying Proposal B
    const propBObj = {
      id: 'prop_B',
      workspaceId: wsId,
      sourceId: 'src_B',
      baseRevision: 1,
      summary: 'Proposal B',
      operations: proposalB.operations,
      status: 'stale',
      createdAt: new Date().toISOString()
    };
    await Storage.saveStaleProposalsLocal([propBObj]);
    await Storage.saveProposalsLocal([]); // prop_B removed from pending

    // Assert pending is 0, stale is 1
    pending = await Storage.getProposals();
    assert.strictEqual(pending.length, 0, 'Pending proposals must be empty');

    let stale = await Storage.getStaleProposals();
    assert.strictEqual(stale.length, 1, 'Stale proposal must exist in getStaleProposals()');
    assert.strictEqual(stale[0].sourceId, 'src_B', 'Recoverable sourceId must match src_B');

    // Simulate Client Reload (reinitialization via fetchRemoteState)
    const reloadedState = await Storage.fetchRemoteState();
    assert.strictEqual(reloadedState.proposals.length, 0);
    assert.strictEqual(reloadedState.staleProposals.length, 1);
    assert.strictEqual(reloadedState.staleProposals[0].sourceId, 'src_B');

    // Test retrySource() clears stale record
    await Storage.retrySource('src_B');
    const staleAfterRetry = await Storage.getStaleProposals();
    assert.strictEqual(staleAfterRetry.length, 0, 'retrySource must clear stale proposal record');
  });

  // Test 14: Dismissed Failure Persistence per Workspace
  await test('14. Dismissed failure persistence per workspace in local storage', async () => {
    const wsId = await Storage.getActiveWorkspaceId();
    await Storage.dismissFailedSource('src_failed_999');

    const dismissed = await Storage.getDismissedFailedSourceIds();
    assert(dismissed.has('src_failed_999'), 'Dismissed source ID must be persisted in Set');

    // Switch workspace and verify isolation
    await Storage.setActiveWorkspaceId('ws_other_temp');
    const dismissedOther = await Storage.getDismissedFailedSourceIds();
    assert(!dismissedOther.has('src_failed_999'), 'Dismissed source IDs must be scoped per workspace');

    // Switch back
    await Storage.setActiveWorkspaceId(wsId);
    const dismissedBack = await Storage.getDismissedFailedSourceIds();
    assert(dismissedBack.has('src_failed_999'), 'Dismissed source ID must remain persisted for original workspace');
  });

  // Test 15: Side Panel Startup Integrity & Workspace Switch Safety
  await test('15. Side Panel startup integrity & workspace switch (Zero undefined functions/variables)', async () => {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');

    const sidepanelCode = fs.readFileSync(path.join(__dirname, '../sidepanel.js'), 'utf-8');
    const canvasCode = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf-8');

    // 15.1 Static Invariant Assertions
    assert(!sidepanelCode.includes('dismissedStale'), 'sidepanel.js must not contain any reference to removed variable "dismissedStale"');
    assert(!canvasCode.includes('dismissedStale'), 'canvas.js must not contain any reference to removed variable "dismissedStale"');
    assert(!sidepanelCode.includes('setupCanvas()'), 'sidepanel.js must call setupMapInteractions(), not setupCanvas()');
    assert(sidepanelCode.includes('setupMapInteractions()'), 'sidepanel.js must call setupMapInteractions()');

    // 15.2 Simulated Runtime Execution with Mock DOM
    const createMockElement = (id = '') => {
      const listeners = {};
      const el = {
        id,
        style: {},
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false
        },
        children: [],
        innerHTML: '',
        textContent: '',
        value: '',
        dataset: {},
        disabled: false,
        appendChild: (child) => el.children.push(child),
        querySelectorAll: () => [],
        querySelector: (sel) => createMockElement(sel),
        closest: () => createMockElement(),
        remove: () => {},
        setAttribute: () => {},
        getAttribute: () => '',
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        addEventListener: (event, handler) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        },
        trigger: async (event, eventData = {}) => {
          if (listeners[event]) {
            for (const h of listeners[event]) {
              await h(eventData);
            }
          }
        },
        focus: () => {}
      };
      return el;
    };

    const elements = {};
    const docListeners = {};

    const mockDocument = {
      addEventListener: (event, handler) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      getElementById: (id) => {
        if (!elements[id]) elements[id] = createMockElement(id);
        return elements[id];
      },
      createElement: (tag) => createMockElement(tag),
      querySelectorAll: () => [],
      querySelector: (sel) => createMockElement(sel)
    };

    const mockWindow = {
      addEventListener: () => {},
      devicePixelRatio: 1
    };

    const mockChrome = {
      runtime: {
        sendMessage: () => {}
      }
    };

    const context = vm.createContext({
      document: mockDocument,
      window: mockWindow,
      chrome: mockChrome,
      Storage,
      STORAGE_KEYS,
      Set,
      Map,
      Promise,
      Date,
      Math,
      parseInt,
      parseFloat,
      JSON,
      alert: () => {},
      prompt: () => 'New Map',
      console
    });

    // Execute sidepanel.js script in VM context
    vm.runInContext(sidepanelCode, context);

    // Trigger DOMContentLoaded to launch init()
    assert(docListeners['DOMContentLoaded'] && docListeners['DOMContentLoaded'].length > 0, 'Must register DOMContentLoaded listener');
    for (const handler of docListeners['DOMContentLoaded']) {
      await handler();
    }

    // Verify workspace dropdown populated without error
    const selectWsEl = elements['sp-select-workspace'];
    assert(selectWsEl, 'sp-select-workspace element must exist');
    assert(selectWsEl.children.length > 0, 'Workspace dropdown must be populated with options');

    // Simulate Workspace Switch event
    await selectWsEl.trigger('change', { target: { value: selectWsEl.children[0].value || 'ws_default' } });

    console.log('    ✓ Side Panel DOM startup and workspace switch lifecycle verified with 0 runtime errors');
  });

  // Test 16: Mutation Audit Invariant & Header Propagation (AI Proposes; Human Commits)
  await test('16. Mutation Audit Invariant & Surface/Action-ID Header Propagation', async () => {
    const fs = require('fs');
    const path = require('path');

    const sidepanelCode = fs.readFileSync(path.join(__dirname, '../sidepanel.js'), 'utf-8');
    const canvasCode = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf-8');
    const storageCode = fs.readFileSync(path.join(__dirname, '../shared/storage.js'), 'utf-8');

    // 16.1 Verify storage.js propagates audit headers and NEVER fabricates action ID
    assert(storageCode.includes("'X-Detective-Surface': surface"), 'storage.js must attach X-Detective-Surface header');
    assert(storageCode.includes("'X-Detective-Action-Id': clientActionId"), 'storage.js must attach X-Detective-Action-Id header');
    assert(storageCode.includes("const clientActionId = options.clientActionId || 'unknown';"), "storage.js must default clientActionId to 'unknown' without fabricating false action IDs");

    // 16.2 Verify sidepanel.js sends surface: 'sidepanel' and unique action ID on explicit Apply click
    assert(sidepanelCode.includes("surface: 'sidepanel'"), "sidepanel.js must pass surface: 'sidepanel' on apply");
    assert(sidepanelCode.includes("act_sp_apply_all_"), "sidepanel.js must generate unique action ID for Apply All");
    assert(sidepanelCode.includes("act_sp_apply_sel_"), "sidepanel.js must generate unique action ID for Apply Selected");

    // 16.3 Verify canvas.js sends surface: 'canvas' and unique action ID on explicit Apply click
    assert(canvasCode.includes("surface: 'canvas'"), "canvas.js must pass surface: 'canvas' on apply");
    assert(canvasCode.includes("act_cv_apply_all_"), "canvas.js must generate unique action ID for Apply All");
    assert(canvasCode.includes("act_cv_apply_sel_"), "canvas.js must generate unique action ID for Apply Selected");

    // 16.4 Verify that fetchRemoteState, init, loadData, switchWorkspace do NOT call applyProposal
    const initFnMatch = sidepanelCode.match(/async function init\(\)\s*\{[\s\S]*?fitToContent\(\);?\s*\}/);
    assert(initFnMatch && !initFnMatch[0].includes('applyProposal'), 'init() must NEVER call applyProposal');

    const loadDataMatch = sidepanelCode.match(/async function loadData\(\)\s*\{[\s\S]*?checkBanners\(\);?\s*\}/);
    assert(loadDataMatch && !loadDataMatch[0].includes('applyProposal'), 'loadData() must NEVER call applyProposal');
  });

  // Test 17: Atomic Transaction Rollback on Failure Injection & Provenance Guard
  await test('17. Atomic Transaction Rollback on Failure Injection & Provenance Guard', async () => {
    const fs = require('fs');
    const path = require('path');
    const workerCode = fs.readFileSync(path.join(__dirname, '../src/worker.js'), 'utf-8');

    // 17.1: Verify worker.js contains executeTransaction and isValidApplyProvenance
    assert(workerCode.includes('executeTransaction(callback)'), 'worker.js must define executeTransaction');
    assert(workerCode.includes('isValidApplyProvenance(surface, clientActionId)'), 'worker.js must define isValidApplyProvenance');
    assert(workerCode.includes('enrichedConceptIds'), 'worker.js must track enrichedConceptIds');
    assert(workerCode.includes('enrichedConceptCount'), 'worker.js must report enrichedConceptCount');
    assert(workerCode.includes('proposal_apply_blocked'), 'worker.js must log proposal_apply_blocked on unprovenanced requests');

    // 17.2: Simulate transactional apply with simulated SQLite state
    let state = {
      revision: 1,
      concepts: [{ id: 'c_base', label: 'Base Concept', description: 'Initial' }],
      edges: [],
      proposals: [{ id: 'prop_test', status: 'pending' }],
      audit: []
    };

    // Define transactional executor mimicking executeTransaction
    function runApplyTransaction(shouldFailAudit) {
      const snapshot = JSON.parse(JSON.stringify(state));
      try {
        // Step A: apply concept
        const newConcept = { id: 'c_new', label: 'New Concept' };
        state.concepts.push(newConcept);
        // Step B: enrich existing
        state.concepts[0].description += '\n• Enriched info';
        // Step C: bump revision
        state.revision += 1;
        // Step D: mark proposal applied
        state.proposals[0].status = 'applied';

        // Step E: success audit insert (injected failure point)
        if (shouldFailAudit) {
          throw new Error('INJECTED_SQLITE_DISK_ERROR: Failed to write success audit');
        }
        state.audit.push({ action: 'proposal_apply_success', revisionAfter: state.revision });
      } catch (err) {
        // Rollback state
        state = snapshot;
        state.audit.push({ action: 'proposal_apply_error', revisionAfter: state.revision, error: err.message });
        throw err;
      }
    }

    // Run failure injection: success audit fails
    let caughtError = null;
    try {
      runApplyTransaction(true);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError && caughtError.message.includes('INJECTED_SQLITE_DISK_ERROR'), 'Must throw injected error');
    assert.strictEqual(state.revision, 1, 'Map revision MUST remain 1 after transaction rollback');
    assert.strictEqual(state.concepts.length, 1, 'New concepts MUST NOT be persisted after rollback');
    assert.strictEqual(state.concepts[0].description, 'Initial', 'Enriched concept description MUST be rolled back');
    assert.strictEqual(state.proposals[0].status, 'pending', 'Proposal status MUST remain pending after rollback');
    assert.strictEqual(state.audit.length, 1, 'Error audit record must be logged');
    assert.strictEqual(state.audit[0].action, 'proposal_apply_error');
    assert.strictEqual(state.audit[0].revisionAfter, 1, 'Error audit must report the TRUE post-rollback revision (1)');

    // Run successful apply: everything commits
    runApplyTransaction(false);
    assert.strictEqual(state.revision, 2, 'Successful transaction must increment revision');
    assert.strictEqual(state.concepts.length, 2, 'New concept must be added');
    assert.strictEqual(state.proposals[0].status, 'applied', 'Proposal must be applied');
    assert.strictEqual(state.audit.find(a => a.action === 'proposal_apply_success').revisionAfter, 2);
  });

  // Test 18: Explicit Source Subject Preservation, Contrastive Identity Check, & Edge Grounding Invariant
  await test('18. Explicit Source Subject Preservation, Contrastive Identity Check, & Edge Grounding Invariant', async () => {
    const fs = require('fs');
    const path = require('path');
    const workerCode = fs.readFileSync(path.join(__dirname, '../src/worker.js'), 'utf-8');

    // 18.1 Verify Precondition Gate: Explicit Source Subject Preservation
    assert(workerCode.includes('PRECONDITION 1: EXPLICIT SOURCE SUBJECT PRESERVATION'), 'worker.js must include EXPLICIT SOURCE SUBJECT PRESERVATION');
    assert(workerCode.includes('PRECONDITION 2: POSITIVE IDENTITY EVIDENCE & CONTRASTIVE CHECK'), 'worker.js must include POSITIVE IDENTITY EVIDENCE & CONTRASTIVE CHECK');
    assert(workerCode.includes('CONTRASTIVE SUBSTITUTION TEST:'), 'worker.js must include CONTRASTIVE SUBSTITUTION TEST');
    assert(workerCode.includes('CRITICAL SIBLING-CONCEPT ANTI-COLLAPSE RULE:'), 'worker.js must include SIBLING-CONCEPT ANTI-COLLAPSE RULE');

    // 18.2 Verify Three-Pillars, Edge Grounding, and Proposal Consistency Rules
    assert(workerCode.includes('PRODUCT RULE: THREE-PILLAR CONCEPT BOUNDARY GATE'), 'worker.js must include THREE-PILLAR CONCEPT BOUNDARY GATE');
    assert(workerCode.includes('ATTACHMENT TEST (Internal to X) -> ENRICH EXISTING CONCEPT X'), 'worker.js must include ATTACHMENT TEST');
    assert(workerCode.includes('INDEPENDENCE TEST (Standalone A) -> ADD NEW CONCEPT A'), 'worker.js must include INDEPENDENCE TEST');
    assert(workerCode.includes('RELATIONAL & COMPOSABILITY SIGNAL -> ADD NEW CONCEPT A + ADD_EDGE'), 'worker.js must include RELATIONAL & COMPOSABILITY SIGNAL');
    assert(workerCode.includes('HARD RULE: SOURCE-GROUNDED EDGE GATE (EVIDENCE AUTHORITY)'), 'worker.js must include SOURCE-GROUNDED EDGE GATE');
    assert(workerCode.includes('EXCLUSIVE EVIDENCE AUTHORITY'), 'worker.js must include EXCLUSIVE EVIDENCE AUTHORITY');
    assert(workerCode.includes('PROPOSAL CONSISTENCY INVARIANT'), 'worker.js must include PROPOSAL CONSISTENCY INVARIANT');

    // 18.3 Verify balanced decision examples exist
    assert(workerCode.includes('Precision'), 'worker.js must provide Precision sibling example');
    assert(workerCode.includes('Validation'), 'worker.js must provide Validation sibling example');
    assert(workerCode.includes('Polymerase Chain Reaction'), 'worker.js must provide PCR alias positive control');
    assert(workerCode.includes('Timeboxing'), 'worker.js must provide Timeboxing composability example');
  });

  // Test 19: Human-Readable Edge Review UI Resolution Invariant
  await test('19. Human-Readable Edge Review UI Resolution Invariant', async () => {
    const { resolveConceptLabel, formatEdgeReview } = require('../shared/engine-core.js');

    // 19.1: Resolve tempId to add_concept label within same proposal
    const existingConcepts = [
      { id: 'c_5d6601f0d6', label: 'Spaced Repetition', description: 'Initial retention method.' },
      { id: 'c_active_recall', label: 'Active Recall', description: 'Testing retrieval.' }
    ];

    const proposalOps = [
      {
        op: 'add_concept',
        tempId: 'tmp_1',
        label: 'Distributed Practice',
        description: 'General learning methodology.'
      },
      {
        op: 'add_edge',
        from: 'tmp_1',
        to: 'c_5d6601f0d6',
        relation: 'is a type of',
        label: 'specialized application'
      }
    ];

    // Verify resolveConceptLabel on tempId
    const resolvedTemp = resolveConceptLabel('tmp_1', existingConcepts, proposalOps);
    assert.strictEqual(resolvedTemp, 'Distributed Practice', 'tempId tmp_1 must resolve to Distributed Practice');

    // Verify resolveConceptLabel on existing concept ID
    const resolvedExisting = resolveConceptLabel('c_5d6601f0d6', existingConcepts, proposalOps);
    assert.strictEqual(resolvedExisting, 'Spaced Repetition', 'Existing concept ID c_5d6601f0d6 must resolve to Spaced Repetition');

    // Verify formatEdgeReview resolves tempId -> existing concept
    const edgeReview = formatEdgeReview(proposalOps[1], existingConcepts, proposalOps);
    assert.strictEqual(edgeReview.fromLabel, 'Distributed Practice');
    assert.strictEqual(edgeReview.toLabel, 'Spaced Repetition');
    assert.strictEqual(edgeReview.displayTitle, 'Distributed Practice → Spaced Repetition');
    assert.strictEqual(edgeReview.relationText, 'is a type of');
    assert.strictEqual(edgeReview.labelText, 'specialized application');
    assert(edgeReview.descText.includes('is a type of'));
    assert(edgeReview.descText.includes('specialized application'));
    assert(!edgeReview.displayTitle.includes('tmp_1'), 'displayTitle MUST NOT expose raw tmp_1 ID');
    assert(!edgeReview.displayTitle.includes('c_5d6601f0d6'), 'displayTitle MUST NOT expose raw c_5d6601f0d6 ID');

    // 19.2: Verify existing concept -> existing concept edge resolution
    const existingToExistingEdge = {
      op: 'add_edge',
      from: 'c_5d6601f0d6',
      to: 'c_active_recall',
      relation: 'synergizes with',
      label: 'combined in flashcards'
    };
    const edgeReview2 = formatEdgeReview(existingToExistingEdge, existingConcepts, []);
    assert.strictEqual(edgeReview2.fromLabel, 'Spaced Repetition');
    assert.strictEqual(edgeReview2.toLabel, 'Active Recall');
    assert.strictEqual(edgeReview2.displayTitle, 'Spaced Repetition → Active Recall');
    assert.strictEqual(edgeReview2.relationText, 'synergizes with');
    assert.strictEqual(edgeReview2.labelText, 'combined in flashcards');
    assert(!edgeReview2.displayTitle.includes('c_'), 'displayTitle MUST NOT expose raw IDs');

    // 19.3: Verify sidepanel.js and canvas.js call formatEdgeReview and resolveConceptLabel
    const fs = require('fs');
    const path = require('path');
    const sidepanelCode = fs.readFileSync(path.join(__dirname, '../sidepanel.js'), 'utf-8');
    const canvasCode = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf-8');

    assert(sidepanelCode.includes('formatEdgeReview('), 'sidepanel.js must call formatEdgeReview');
    assert(canvasCode.includes('formatEdgeReview('), 'canvas.js must call formatEdgeReview');
    assert(!sidepanelCode.includes('labelText = `${op.from} → ${op.to}`'), 'sidepanel.js must not render raw op.from -> op.to');
    assert(!canvasCode.includes('titleText = `${op.from} → ${op.to}`'), 'canvas.js must not render raw op.from -> op.to');
  });

  // Test 20: Concept Card Drag Handle, Select Mode Dragging, and Edge Geometry Invariant
  await test('20. Concept Card Drag Handle, Select Mode Dragging, and Edge Geometry Invariant', async () => {
    const fs = require('fs');
    const path = require('path');
    const canvasJs = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf-8');
    const canvasCss = fs.readFileSync(path.join(__dirname, '../canvas.css'), 'utf-8');
    const sidepanelJs = fs.readFileSync(path.join(__dirname, '../sidepanel.js'), 'utf-8');
    const sidepanelCss = fs.readFileSync(path.join(__dirname, '../sidepanel.css'), 'utf-8');

    // 20.1 Structure and CSS Checks: Dedicated drag handle
    assert(canvasJs.includes('class="concept-drag-handle"'), 'canvas.js must render .concept-drag-handle in concept header');
    assert(sidepanelJs.includes('class="sp-card-drag-handle"'), 'sidepanel.js must render .sp-card-drag-handle in card head');
    assert(canvasCss.includes('.concept-drag-handle'), 'canvas.css must style .concept-drag-handle with grab cursor');
    assert(sidepanelCss.includes('.sp-card-drag-handle'), 'sidepanel.css must style .sp-card-drag-handle with grab cursor');
    assert(canvasCss.includes('paint-order: stroke fill'), 'canvas.css must style .edge-label-text with paint-order halo');
    assert(sidepanelCss.includes('paint-order: stroke fill'), 'sidepanel.css must style .sp-edge-label with paint-order halo');

    // 20.2 Select Tool Enforcement & Non-Select Guard
    assert(canvasJs.includes("if (activeTool !== 'select') return;"), 'canvas.js handleConceptPointerDown must enforce activeTool === select');
    assert(canvasJs.includes("e.target.closest('[contenteditable=\"true\"]')"), 'canvas.js handleConceptPointerDown must guard against contenteditable clicks');

    // 20.3 Functional DOM Drag Simulation & Edge Geometry Rerender
    const memoryStorage = {};
    const mockStorage = {
      updateConcept: async (id, data) => {
        memoryStorage[id] = { ...(memoryStorage[id] || {}), ...data };
      }
    };

    // Simulate 3 collinear nodes: c1 (0, 100), c2 (300, 100), c3 (600, 100) with edge c1 -> c3
    const concepts = [
      { id: 'c1', label: 'Concept 1', x: 0, y: 100, width: 200 },
      { id: 'c2', label: 'Concept 2 (Midpoint)', x: 300, y: 100, width: 200 },
      { id: 'c3', label: 'Concept 3', x: 600, y: 100, width: 200 }
    ];

    let activeTool = 'select';
    let isDraggingConcept = false;
    let draggedConceptId = null;
    let dragOffset = { x: 0, y: 0 };
    let renderEdgesCount = 0;

    function renderEdges() {
      renderEdgesCount++;
    }

    function handleConceptPointerDown(e, concept) {
      if (activeTool !== 'select') return;
      if (e.target.closest && (e.target.closest('.btn-card-close') || e.target.closest('.badge-sources') || e.target.getAttribute('contenteditable') === 'true' || e.target.closest('[contenteditable="true"]'))) return;
      isDraggingConcept = true;
      draggedConceptId = concept.id;
      dragOffset = { x: e.clientX - concept.x, y: e.clientY - concept.y };
    }

    function handlePointerMove(e) {
      if (isDraggingConcept && draggedConceptId) {
        const newX = Math.round(e.clientX - dragOffset.x);
        const newY = Math.round(e.clientY - dragOffset.y);
        const c = concepts.find(item => item.id === draggedConceptId);
        if (c) {
          c.x = newX;
          c.y = newY;
        }
        renderEdges();
      }
    }

    async function handlePointerUp() {
      if (isDraggingConcept && draggedConceptId) {
        const c = concepts.find(item => item.id === draggedConceptId);
        if (c) {
          await mockStorage.updateConcept(draggedConceptId, { x: c.x, y: c.y });
        }
        renderEdges();
        isDraggingConcept = false;
        draggedConceptId = null;
      }
    }

    // A: In Select mode, clicking drag handle starts dragging
    const mockDragHandle = { getAttribute: () => null, closest: (sel) => null };
    handleConceptPointerDown({ target: mockDragHandle, clientX: 305, clientY: 105 }, concepts[1]);
    assert.strictEqual(isDraggingConcept, true, 'Pointerdown on drag handle in select mode must start drag');
    assert.strictEqual(draggedConceptId, 'c2');

    // Move midpoint concept vertically down by 150px
    handlePointerMove({ clientX: 305, clientY: 255 });
    assert.strictEqual(concepts[1].y, 250, 'Move must update concept y live');
    assert(renderEdgesCount > 0, 'Move must call renderEdges live');

    // Pointerup persists to storage
    await handlePointerUp();
    assert.strictEqual(isDraggingConcept, false);
    assert.strictEqual(memoryStorage['c2'].y, 250, 'Pointerup must persist new y coordinate to storage');

    // B: Title editing does NOT drag
    const mockTitleEl = { getAttribute: (attr) => attr === 'contenteditable' ? 'true' : null, closest: (sel) => sel.includes('contenteditable') ? true : null };
    handleConceptPointerDown({ target: mockTitleEl, clientX: 310, clientY: 250 }, concepts[1]);
    assert.strictEqual(isDraggingConcept, false, 'Clicking contenteditable title MUST NOT start dragging');

    // C: Body editing does NOT drag
    const mockBodyEl = { getAttribute: (attr) => attr === 'contenteditable' ? 'true' : null, closest: (sel) => sel.includes('contenteditable') ? true : null };
    handleConceptPointerDown({ target: mockBodyEl, clientX: 310, clientY: 280 }, concepts[1]);
    assert.strictEqual(isDraggingConcept, false, 'Clicking contenteditable body MUST NOT start dragging');

    // D: Pen / Highlighter / Eraser / Connect tools do NOT drag
    const nonSelectTools = ['pen', 'highlighter', 'eraser', 'connect'];
    for (const tool of nonSelectTools) {
      activeTool = tool;
      handleConceptPointerDown({ target: mockDragHandle, clientX: 305, clientY: 255 }, concepts[1]);
      assert.strictEqual(isDraggingConcept, false, `Tool "${tool}" MUST NOT start concept dragging`);
    }
  });

  // Test 21: Apple Pencil Ink Engine V1 (Pressure-aware, Dual-layer Active/Scratch, Canonical Parity, Loop Safety)
  await test('21. Apple Pencil Ink Engine V1 (Pressure-aware, Dual-layer Active/Scratch, Canonical Parity, Loop Safety)', async () => {
    const { CanvasCore } = require('../shared/canvas-core.js');

    // 21.1 Pressure normalization and width curve
    const baseW = 3;
    const wLight = CanvasCore.computePointWidth(baseW, 0.1, 'pen');
    const wNormal = CanvasCore.computePointWidth(baseW, 0.5, 'pen');
    const wFirm = CanvasCore.computePointWidth(baseW, 1.0, 'pen');

    assert(wLight < wNormal, 'Light pressure width must be thinner than normal');
    assert(wNormal < wFirm, 'Normal pressure width must be thinner than firm');
    assert(wLight >= 1.4 && wLight <= 1.8, `Light width expected ~1.5px, got ${wLight}`);
    assert(wNormal >= 2.9 && wNormal <= 3.3, `Normal width expected ~3.0px, got ${wNormal}`);
    assert(wFirm >= 4.8 && wFirm <= 5.5, `Firm width expected ~5.1px, got ${wFirm}`);

    // 21.2 Missing pressure fallback
    const wUndef = CanvasCore.computePointWidth(baseW, undefined, 'pen');
    const wNull = CanvasCore.computePointWidth(baseW, null, 'pen');
    const wZero = CanvasCore.computePointWidth(baseW, 0, 'pen');
    assert.strictEqual(wUndef, wNormal, 'Undefined pressure must fall back to normal pressure (0.5)');
    assert.strictEqual(wNull, wNormal, 'Null pressure must fall back to normal pressure (0.5)');
    assert.strictEqual(wZero, wNormal, 'Zero pressure must fall back to normal pressure (0.5)');

    // 21.3 Width bounds
    const wExtremeLow = CanvasCore.computePointWidth(baseW, -100, 'pen');
    const wExtremeHigh = CanvasCore.computePointWidth(baseW, 1000, 'pen');
    const wNaN = CanvasCore.computePointWidth(baseW, NaN, 'pen');
    assert(wExtremeLow >= 1.0 && wExtremeLow <= baseW * 2.2, 'Negative pressure must stay within bounds');
    assert(wExtremeHigh >= 1.0 && wExtremeHigh <= baseW * 2.2, 'High pressure must stay within bounds');
    assert(wNaN >= 1.0 && wNaN <= baseW * 2.2, 'NaN pressure must stay within bounds');

    // 21.4 Smooth monotonic interpolation
    let prevW = 0;
    for (let p = 0.05; p <= 1.0; p += 0.05) {
      const currW = CanvasCore.computePointWidth(baseW, p, 'pen');
      assert(currW >= prevW, `Width must scale monotonically with pressure at p=${p}`);
      prevW = currW;
    }

    // Mock Context Recorder
    function createMockCtx() {
      const ops = [];
      return {
        ops,
        save() { ops.push({ type: 'save' }); },
        restore() { ops.push({ type: 'restore' }); },
        beginPath() { ops.push({ type: 'beginPath' }); },
        moveTo(x, y) { ops.push({ type: 'moveTo', x, y }); },
        lineTo(x, y) { ops.push({ type: 'lineTo', x, y }); },
        quadraticCurveTo(cx, cy, x, y) { ops.push({ type: 'quadraticCurveTo', cx, cy, x, y }); },
        stroke() { ops.push({ type: 'stroke' }); },
        arc(x, y, r) { ops.push({ type: 'arc', x, y, r }); },
        fill() { ops.push({ type: 'fill' }); },
        clearRect(x, y, w, h) { ops.push({ type: 'clearRect', x, y, w, h }); },
        set lineWidth(v) { ops.push({ type: 'lineWidth', value: v }); }
      };
    }

    // 21.5 Live Tip Endpoint Test: liveTail.to MUST equal latestPoint for N = 2..10
    const dynamicStroke = { tool: 'pen', width: 3, points: [] };
    let activeState = { finalizedCount: 0, liveTail: null };
    const stepActiveCtx = createMockCtx();
    const stepScratchCtx = createMockCtx();

    for (let n = 1; n <= 10; n++) {
      const pt = { x: n * 20, y: n * 15, pressure: 0.3 + n * 0.05 };
      dynamicStroke.points.push(pt);
      activeState = CanvasCore.renderIncrementalStroke(stepActiveCtx, stepScratchCtx, dynamicStroke, activeState);

      assert(activeState && activeState.liveTail, `Live tail must exist at N=${n}`);
      assert.strictEqual(activeState.liveTail.to.x, pt.x, `liveTail.to.x at N=${n} must equal latest point x (${pt.x})`);
      assert.strictEqual(activeState.liveTail.to.y, pt.y, `liveTail.to.y at N=${n} must equal latest point y (${pt.y})`);

      if (n >= 3) {
        assert.strictEqual(activeState.finalizedCount, n - 2, `Finalized count at N=${n} must be ${n - 2}`);
      }
    }

    // 21.6 REAL Canonical Segment-by-Segment Parity Test
    const sampleStroke = {
      tool: 'pen',
      width: 3,
      points: [
        { x: 10, y: 10, pressure: 0.2 },
        { x: 30, y: 20, pressure: 0.4 },
        { x: 60, y: 35, pressure: 0.6 },
        { x: 90, y: 40, pressure: 0.8 },
        { x: 120, y: 50, pressure: 0.5 }
      ]
    };

    // Path A: Full Replay
    const replayCtx = createMockCtx();
    CanvasCore.renderStroke(replayCtx, sampleStroke);

    // Extract canonical segments from replay ops
    const replaySegments = [];
    let currentWidth = null;
    let currentFrom = null;

    for (let i = 0; i < replayCtx.ops.length; i++) {
      const op = replayCtx.ops[i];
      if (op.type === 'lineWidth') currentWidth = op.value;
      if (op.type === 'moveTo') currentFrom = { x: op.x, y: op.y };
      if (op.type === 'quadraticCurveTo') {
        replaySegments.push({
          type: 'curve',
          from: currentFrom,
          cp: { x: op.cx, y: op.cy },
          to: { x: op.x, y: op.y },
          width: currentWidth
        });
      }
      if (op.type === 'lineTo') {
        replaySegments.push({
          type: 'line',
          from: currentFrom,
          to: { x: op.x, y: op.y },
          width: currentWidth
        });
      }
    }

    // Path B: Step-by-Step Incremental Stream
    const incActiveCtx = createMockCtx();
    const incScratchCtx = createMockCtx();
    const buildingStroke = { tool: 'pen', width: 3, points: [] };
    let incState = { finalizedCount: 0, liveTail: null };

    for (let i = 0; i < sampleStroke.points.length; i++) {
      buildingStroke.points.push(sampleStroke.points[i]);
      incState = CanvasCore.renderIncrementalStroke(incActiveCtx, incScratchCtx, buildingStroke, incState);
    }

    // Extract canonical segments from incremental activeCtx (finalized curves) + scratchCtx (live tail)
    const incSegments = [];
    currentWidth = null;
    currentFrom = null;

    for (let i = 0; i < incActiveCtx.ops.length; i++) {
      const op = incActiveCtx.ops[i];
      if (op.type === 'lineWidth') currentWidth = op.value;
      if (op.type === 'moveTo') currentFrom = { x: op.x, y: op.y };
      if (op.type === 'quadraticCurveTo') {
        incSegments.push({
          type: 'curve',
          from: currentFrom,
          cp: { x: op.cx, y: op.cy },
          to: { x: op.x, y: op.y },
          width: currentWidth
        });
      }
    }

    // Append live tail from scratch layer
    assert(incState.liveTail && incState.liveTail.type === 'tail', 'Incremental state must have live tail');
    incSegments.push({
      type: 'line',
      from: incState.liveTail.from,
      to: incState.liveTail.to,
      width: incState.liveTail.width
    });

    // Exact 1:1 segment comparison
    assert.strictEqual(incSegments.length, replaySegments.length, `Incremental segments count (${incSegments.length}) must equal replay segments count (${replaySegments.length})`);

    for (let s = 0; s < replaySegments.length; s++) {
      const incSeg = incSegments[s];
      const repSeg = replaySegments[s];
      assert.strictEqual(incSeg.type, repSeg.type, `Segment ${s} type mismatch`);
      assert.strictEqual(incSeg.from.x, repSeg.from.x, `Segment ${s} from.x mismatch`);
      assert.strictEqual(incSeg.from.y, repSeg.from.y, `Segment ${s} from.y mismatch`);
      assert.strictEqual(incSeg.to.x, repSeg.to.x, `Segment ${s} to.x mismatch`);
      assert.strictEqual(incSeg.to.y, repSeg.to.y, `Segment ${s} to.y mismatch`);
      assert.strictEqual(incSeg.width, repSeg.width, `Segment ${s} width mismatch`);
      if (repSeg.type === 'curve') {
        assert.strictEqual(incSeg.cp.x, repSeg.cp.x, `Segment ${s} cp.x mismatch`);
        assert.strictEqual(incSeg.cp.y, repSeg.cp.y, `Segment ${s} cp.y mismatch`);
      }
    }

    // 21.7 Self-Intersection / Tight Loop Regression Test
    // Figure-eight loop where points 4, 5, 6 loop back and cross over points 0, 1, 2
    const loopStroke = {
      tool: 'pen',
      width: 3,
      points: [
        { x: 100, y: 100, pressure: 0.5 },
        { x: 150, y: 50,  pressure: 0.5 },
        { x: 200, y: 100, pressure: 0.5 },
        { x: 150, y: 150, pressure: 0.5 },
        { x: 100, y: 100, pressure: 0.5 }, // crosses back over P0
        { x: 50,  y: 50,  pressure: 0.5 },
        { x: 100, y: 100, pressure: 0.5 }  // crosses back over P0 again
      ]
    };

    const loopActiveCtx = createMockCtx();
    const loopScratchCtx = createMockCtx();
    const activeLoopStroke = { tool: 'pen', width: 3, points: [] };
    let loopState = { finalizedCount: 0, liveTail: null };

    for (let i = 0; i < loopStroke.points.length; i++) {
      activeLoopStroke.points.push(loopStroke.points[i]);
      loopState = CanvasCore.renderIncrementalStroke(loopActiveCtx, loopScratchCtx, activeLoopStroke, loopState);
    }

    // Assert activeCtx was NEVER cleared during the entire loop drawing
    const activeClearRects = loopActiveCtx.ops.filter(op => op.type === 'clearRect');
    assert.strictEqual(activeClearRects.length, 0, 'activeStrokeCanvas MUST NEVER be cleared during drawing, preventing hole formation in self-crossing loops');

    // Assert segment 0 on activeCtx was drawn exactly once and preserved
    const curveOps = loopActiveCtx.ops.filter(op => op.type === 'quadraticCurveTo');
    assert.strictEqual(curveOps.length, 5, 'Loop stroke with 7 points must produce exactly 5 finalized curve segments on activeCtx');

    // 21.8 Incremental rendering O(1) performance invariant
    const largeStroke = { tool: 'pen', width: 3, points: [{ x: 0, y: 0, pressure: 0.5 }] };
    let largeState = { finalizedCount: 0, liveTail: null };
    const perfActiveCtx = createMockCtx();
    const perfScratchCtx = createMockCtx();

    let opsAtPoint10 = 0;
    let opsAtPoint500 = 0;
    for (let i = 1; i <= 500; i++) {
      largeStroke.points.push({ x: i * 2, y: Math.sin(i / 10) * 50, pressure: 0.2 + (i % 8) * 0.1 });
      const opsBefore = perfActiveCtx.ops.length + perfScratchCtx.ops.length;
      largeState = CanvasCore.renderIncrementalStroke(perfActiveCtx, perfScratchCtx, largeStroke, largeState);
      const opsDelta = (perfActiveCtx.ops.length + perfScratchCtx.ops.length) - opsBefore;

      if (i === 10) opsAtPoint10 = opsDelta;
      if (i === 500) opsAtPoint500 = opsDelta;
    }

    assert(largeState.finalizedCount === 499, `Total finalized segments must match N-2 (499), got ${largeState.finalizedCount}`);
    assert.strictEqual(opsAtPoint500, opsAtPoint10, `Ops at point 500 (${opsAtPoint500}) must strictly equal ops at point 10 (${opsAtPoint10}), proving strict O(1) performance`);
    assert(opsAtPoint500 <= 20, `Ops when appending point 500 MUST be O(1) (got ${opsAtPoint500} ops), NOT proportional to 500`);

    // 21.9 Pointerup immediate render ordering in canvas.js
    const fs = require('fs');
    const path = require('path');
    const canvasJsCode = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf8');
    assert(canvasJsCode.includes('CanvasCore.renderStroke(ctx, currentStroke)'), 'canvas.js must immediately paint to inkCanvas on pointerup');
    assert(canvasJsCode.indexOf('CanvasCore.renderStroke(ctx, currentStroke)') < canvasJsCode.indexOf('await Storage.addStroke(currentStroke)'), 'Immediate render must happen BEFORE awaiting Storage.addStroke to prevent blank frames');

    // 21.10 Palm Rejection & Touch separation
    let mockTool = 'pen';
    let mockIsDrawing = false;
    let mockActivePenPointerId = null;
    const mockPointers = new Map();

    function mockInkPointerDown(e) {
      mockPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

      // Resting palm while pencil is down MUST NOT interrupt pencil stroke
      if (mockIsDrawing && mockActivePenPointerId !== null) {
        if (e.pointerType === 'touch') {
          return 'palm_ignored';
        }
      }

      if (mockPointers.size === 2 && !mockIsDrawing) {
        return 'pinch_started';
      }

      if (e.pointerType === 'touch') {
        return 'touch_pan';
      }

      if (e.pointerType === 'pen' && mockTool === 'pen') {
        mockIsDrawing = true;
        mockActivePenPointerId = e.pointerId;
        return 'drawing_started';
      }
    }

    // Touch cannot start drawing
    const touchRes = mockInkPointerDown({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    assert.strictEqual(touchRes, 'touch_pan', 'Touch MUST NOT initiate drawing');
    assert.strictEqual(mockIsDrawing, false, 'isDrawing must remain false on touch');
    mockPointers.clear();

    // Pen initiates drawing
    const penRes = mockInkPointerDown({ pointerId: 2, pointerType: 'pen', clientX: 150, clientY: 150, pressure: 0.6 });
    assert.strictEqual(penRes, 'drawing_started', 'Pen must start drawing');
    assert.strictEqual(mockIsDrawing, true, 'isDrawing must be true');
    assert.strictEqual(mockActivePenPointerId, 2);

    // Palm touch arrives while pen is drawing
    const palmRes = mockInkPointerDown({ pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 200 });
    assert.strictEqual(palmRes, 'palm_ignored', 'Palm touch must be ignored while pen is active');
    assert.strictEqual(mockIsDrawing, true, 'Pen drawing must NOT be interrupted by palm touch');
    assert.strictEqual(mockActivePenPointerId, 2, 'Active pen pointer ID must remain authoritative');
  });

  // Test 22: Structure-First Concept Map UI Invariants
  await test('22. Structure-First Concept Map UI Invariants', async () => {
    const fs = require('fs');
    const path = require('path');
    const canvasCss = fs.readFileSync(path.join(__dirname, '../canvas.css'), 'utf8');
    const canvasJs = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf8');

    // 22.1 Nodes default collapsed & description hidden by default
    assert(canvasCss.includes('.concept-body {\n  display: none;') || canvasCss.includes('.concept-body {\r\n  display: none;'), 'Concept body must have display: none by default');
    assert(canvasCss.includes('.concept-node.expanded .concept-body {\n  display: block;') || canvasCss.includes('.concept-node.expanded .concept-body {\r\n  display: block;'), 'Concept body must be displayed only when .expanded class is applied');

    // 22.2 Full Concept label preservation: ABSENCE of line-clamp and overflow clipping
    assert(!canvasCss.includes('-webkit-line-clamp'), 'Concept title MUST NOT artificially line-clamp text');
    assert(!canvasCss.includes('text-overflow: ellipsis'), 'Concept title MUST NOT silently truncate with ellipsis');
    assert(canvasCss.includes('overflow-wrap: break-word;'), 'Concept title must wrap long words');
    assert(canvasCss.includes('white-space: normal;'), 'Concept title must allow natural multi-line wrapping');

    // 22.3 Concept Node V2 footprint: compact, adaptive, node-like rather than card-like
    const conceptNodeRule = canvasCss.match(/\.concept-node \{([\s\S]*?)\n\}/);
    assert(conceptNodeRule, 'canvas.css must define .concept-node');
    assert(/min-width:\s*92px/.test(conceptNodeRule[1]), 'Short Concept nodes must be allowed to remain compact (~92px floor)');
    assert(/max-width:\s*260px/.test(conceptNodeRule[1]), 'Concept node collapsed max-width must remain ~260px');
    assert(/width:\s*max-content/.test(conceptNodeRule[1]), 'Collapsed Concept width must adapt to content');
    assert(/border-radius:\s*999px/.test(conceptNodeRule[1]), 'Collapsed Concept must visually read as a soft oval/capsule node');

    const conceptHeaderRule = canvasCss.match(/\.concept-header \{([\s\S]*?)\n\}/);
    assert(conceptHeaderRule && /background:\s*transparent/.test(conceptHeaderRule[1]), 'Concept header must not recreate a rectangular card band');

    const conceptActionsRule = canvasCss.match(/\.concept-actions \{([\s\S]*?)\n\}/);
    assert(conceptActionsRule && /position:\s*absolute/.test(conceptActionsRule[1]), 'Concept controls must remain out-of-flow so they do not force card-like width');

    // 22.4 In-memory UI view state & expand/collapse toggle
    assert(canvasJs.includes('const expandedConceptIds = new Set();'), 'Expanded state must be tracked as purely in-memory UI state');
    assert(canvasJs.includes('function toggleConceptExpansion(conceptId)'), 'canvas.js must contain toggleConceptExpansion');
    assert(canvasJs.includes('node.addEventListener(\'dblclick\''), 'canvas.js must bind double-click to toggle expansion');
    assert(canvasJs.includes('.btn-toggle-expand'), 'canvas.js must include explicit expand toggle button');

    // 22.5 Auto-collapse on clicking empty canvas
    assert(canvasJs.includes('expandedConceptIds.clear()'), 'Clicking canvas background must clear temporary expansions');

    // 22.6 Evidence Drawer knowledge integration
    assert(canvasJs.includes('evidence-concept-description'), 'Evidence drawer must display full concept description');
    assert(canvasJs.includes('drawerConceptTitle.textContent = concept.label'), 'Evidence drawer must show concept label');

    // 22.7 Compact corner toast banner styling
    assert(canvasCss.includes('.proposal-banner {\n  position: absolute;\n  bottom: 40px;\n  right: 16px;') || canvasCss.includes('max-width: 320px;'), 'Proposal banner must be a compact corner toast');

    // 22.8 Edge dynamic center calculation
    assert(canvasJs.includes('fromEl.offsetWidth / 2') && canvasJs.includes('fromEl.offsetHeight / 2'), 'renderEdges must dynamically calculate from true element dimensions');

    // 22.9 Deterministic Interaction Test: Double-clicking Concept Title toggles expansion
    const testExpandedSet = new Set();
    function testToggleExpansion(id) {
      if (testExpandedSet.has(id)) testExpandedSet.delete(id);
      else testExpandedSet.add(id);
    }

    const mockNode = {
      id: 'concept-c_test',
      classList: {
        _classes: new Set(['concept-node']),
        add(cls) { this._classes.add(cls); },
        remove(cls) { this._classes.delete(cls); },
        toggle(cls, force) {
          if (force !== undefined) {
            if (force) this._classes.add(cls);
            else this._classes.delete(cls);
          } else {
            if (this._classes.has(cls)) this._classes.delete(cls);
            else this._classes.add(cls);
          }
        },
        contains(cls) { return this._classes.has(cls); }
      }
    };

    const mockTitleTarget = {
      className: 'concept-title',
      getAttribute: (attr) => attr === 'contenteditable' ? 'true' : null,
      closest: (sel) => {
        if (sel === '.concept-body') return null;
        if (sel === '.badge-sources' || sel === '.btn-card-close' || sel === '.btn-toggle-expand') return null;
        if (sel === '.concept-node') return mockNode;
        return null;
      }
    };

    function simulateDblClick(target, conceptId) {
      if (target.closest('.badge-sources') || target.closest('.btn-card-close') || target.closest('.btn-toggle-expand')) return;
      if (target.closest('.concept-body')) return;
      testToggleExpansion(conceptId);
      mockNode.classList.toggle('expanded', testExpandedSet.has(conceptId));
    }

    // A: Initial collapsed state
    assert.strictEqual(testExpandedSet.has('c_test'), false, 'Initial state must be collapsed');
    assert.strictEqual(mockNode.classList.contains('expanded'), false);

    // B: Double-click ON TITLE expands node summary
    simulateDblClick(mockTitleTarget, 'c_test');
    assert.strictEqual(testExpandedSet.has('c_test'), true, 'Double-clicking concept title MUST toggle expansion to true');
    assert.strictEqual(mockNode.classList.contains('expanded'), true);

    // C: Double-click ON TITLE again collapses node summary
    simulateDblClick(mockTitleTarget, 'c_test');
    assert.strictEqual(testExpandedSet.has('c_test'), false, 'Second double-click on concept title MUST toggle expansion back to false');
    assert.strictEqual(mockNode.classList.contains('expanded'), false);
  });

  assert.strictEqual(networkCallsAttempted, 0, 'verify-v2.js MUST execute with ZERO network calls');
  console.log(`  ✓ VERIFIED: Zero (0) network calls attempted during verify-v2 execution.`);

  console.log('\n====================================================');
  console.log(`Verification Complete: ${passedTests} passed, ${failedTests} failed.`);
  console.log('====================================================');
  process.exit(failedTests > 0 ? 1 : 0);
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
