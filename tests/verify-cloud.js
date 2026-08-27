// tests/verify-cloud.js - Live Cloudflare Worker Security & Integration Test Suite
// Complies with no-secret-logging and tests real production endpoints end-to-end

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const WORKER_BASE = 'https://detectivemap.qchen9108.workers.dev';

async function runCloudVerification() {
  console.log('=== Verifying Cloudflare Worker Production Security & Endpoints ===\n');

  let aiToken = null;
  const createdTestWsIds = [];

  try {
    // Test 1: Fetching Canvas HTML from Worker root
    console.log('[Test 1] Fetching Canvas HTML from Worker root...');
  const resHtml = await fetch(`${WORKER_BASE}/`);
  assert.strictEqual(resHtml.status, 200, 'Worker must serve canvas.html with HTTP 200');
  const htmlText = await resHtml.text();
  assert(htmlText.includes('Detective Map'), 'HTML must include Detective Map title');
  assert(!htmlText.includes('MAP-2026'), 'HTML must NOT contain hardcoded MAP-2026');
  console.log('  ✓ PASS: Clean HTML served without hardcoded secrets (HTTP 200)');

  // Test 2: CRITICAL A - MAP-2026 MUST be rejected
  console.log('[Test 2] Testing that legacy hardcoded MAP-2026 is permanently rejected...');
  const resLegacyPin = await fetch(`${WORKER_BASE}/api/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode: 'MAP-2026', deviceName: 'Legacy Test' })
  });
  assert.strictEqual(resLegacyPin.status, 401, 'MAP-2026 must be rejected with HTTP 401');
  console.log('  ✓ PASS: MAP-2026 permanently rejected with HTTP 401');

  // Test 2B: Permanent Master PIN KIRA-2026 works repeatable & never expires
  console.log('[Test 2B] Testing Permanent Master PIN KIRA-2026...');
  const resMasterPin = await fetch(`${WORKER_BASE}/api/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode: 'KIRA-2026', deviceName: 'Master Test Device' })
  });
  assert.strictEqual(resMasterPin.status, 200, 'Master PIN KIRA-2026 must succeed with HTTP 200');
  const masterData = await resMasterPin.json();
  assert(masterData.token && masterData.token.startsWith('dt_'), 'Master PIN must issue valid token');
  console.log('  ✓ PASS: Permanent Master PIN KIRA-2026 verified successfully (HTTP 200)');

  // Test 3: Unauthenticated /api/state must return 401
  console.log('[Test 3] Testing unauthenticated /api/state access...');
  const resUnauth = await fetch(`${WORKER_BASE}/api/state`);
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated /api/state must return HTTP 401');
  console.log('  ✓ PASS: Unauthorized request rejected with HTTP 401');

  // Test 4: Fake / Compromised Bearer Token rejected
  console.log('[Test 4] Testing invalid Bearer token on /api/state...');
  const resFakeToken = await fetch(`${WORKER_BASE}/api/state`, {
    headers: { 'Authorization': 'Bearer dt_fake_invalid_token_12345' }
  });
  assert.strictEqual(resFakeToken.status, 401, 'Invalid Bearer token must return HTTP 401');
  console.log('  ✓ PASS: Invalid Bearer token rejected with HTTP 401');

  // Test 5: Secure Bootstrap Endpoint Requires Secret (CRITICAL 2)
  console.log('[Test 5] Testing /api/auth/bootstrap-pin requires valid bootstrap secret...');
  const resBootstrapNoSecret = await fetch(`${WORKER_BASE}/api/auth/bootstrap-pin`, { method: 'POST' });
  assert.strictEqual(resBootstrapNoSecret.status, 403, 'Unauthenticated bootstrap-pin must return HTTP 403 Forbidden');
  console.log('  ✓ PASS: Unauthenticated bootstrap-pin rejected with HTTP 403 Forbidden');

  // Test 6: Authenticated First-Host Bootstrap & Full Lifecycle (CRITICAL 1)
  console.log('[Test 6] Testing Authenticated First-Host Bootstrap Flow...');
  const secretFile = path.join(__dirname, '..', '.bootstrap.secret');
  if (fs.existsSync(secretFile)) {
    const bootstrapSecret = fs.readFileSync(secretFile, 'utf8').trim();
    if (bootstrapSecret) {
      // 1. Request bootstrap PIN using valid secret
      const resBoot = await fetch(`${WORKER_BASE}/api/auth/bootstrap-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Secret': bootstrapSecret },
        body: JSON.stringify({ bootstrapSecret })
      });
      assert.strictEqual(resBoot.status, 200, 'Bootstrap PIN request with valid secret must succeed (HTTP 200)');
      const bootData = await resBoot.json();
      assert(bootData.success && bootData.pin, 'Bootstrap PIN must be returned');

      // 2. Pair primary Windows host with returned PIN
      const resPairPrimary = await fetch(`${WORKER_BASE}/api/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: bootData.pin, deviceName: 'Primary Windows Host' })
      });
      assert.strictEqual(resPairPrimary.status, 200, 'Primary device pairing with bootstrap PIN must succeed');
      const pairData = await resPairPrimary.json();
      assert(pairData.token && pairData.token.startsWith('dt_'), 'Primary device must receive valid dt_ token');

      // 3. Verify authorized /api/state access with new device token
      const resState = await fetch(`${WORKER_BASE}/api/state`, {
        headers: { 'Authorization': `Bearer ${pairData.token}` }
      });
      assert.strictEqual(resState.status, 200, 'Authorized device token must successfully fetch /api/state');
      const stateData = await resState.json();
      assert(stateData.workspace && stateData.workspace.id, 'State must contain workspace data');

      // 4. Verify /api/workspaces returns workspace list (CRITICAL 2)
      const resWorkspaces = await fetch(`${WORKER_BASE}/api/workspaces`, {
        headers: { 'Authorization': `Bearer ${pairData.token}` }
      });
      assert.strictEqual(resWorkspaces.status, 200, 'Authorized device token must fetch /api/workspaces');
      const wsData = await resWorkspaces.json();
      assert(Array.isArray(wsData.workspaces), 'Workspaces must be an array');

      // 5. Generate one-time PIN for secondary device (iPad)
      const resGenPin = await fetch(`${WORKER_BASE}/api/auth/generate-pin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pairData.token}` }
      });
      assert.strictEqual(resGenPin.status, 200, 'Authorized host can generate pairing PIN');
      const genData = await resGenPin.json();
      assert(genData.pin && genData.pin.startsWith('PIN-'), 'Generated PIN must have prefix PIN-');

      // 6. Pair secondary device (iPad) with that PIN
      const resPairSecondary = await fetch(`${WORKER_BASE}/api/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: genData.pin, deviceName: 'iPad Safari' })
      });
      assert.strictEqual(resPairSecondary.status, 200, 'Secondary device must pair successfully');
      const secondaryData = await resPairSecondary.json();
      assert(secondaryData.token && secondaryData.token.startsWith('dt_'), 'Secondary device must receive token');

      // 7. Atomic Consumption Verification: Second attempt with the SAME PIN must return 401
      const resReplay = await fetch(`${WORKER_BASE}/api/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: genData.pin, deviceName: 'Replay Attempt' })
      });
      assert.strictEqual(resReplay.status, 401, 'Replayed PIN must be atomically rejected with HTTP 401');

      console.log('  ✓ PASS: Complete First-Host Bootstrap, State Sync, Workspace Sync, & Atomic iPad Pairing lifecycle verified (0 secrets logged)');
    }
  }

  // Test 7: Proposal reject endpoint protection
  console.log('[Test 7] Testing /api/proposals/reject requires authorization...');
  const resRejectNoAuth = await fetch(`${WORKER_BASE}/api/proposals/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: 'prop_test' })
  });
  assert.strictEqual(resRejectNoAuth.status, 401, 'Proposal reject without token must return HTTP 401');
  console.log('  ✓ PASS: Proposal reject endpoint strictly protected with HTTP 401');

  // Test 8: Live Real Workers AI End-to-End Ingestion & Proposal Generation
  console.log('[Test 8] Testing Real Live Workers AI Ingestion (Active Recall Sentence)...');
  const resPairAI = await fetch(`${WORKER_BASE}/api/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode: 'KIRA-2026', deviceName: 'AI Test Runner' })
  });
  const pairJson = await resPairAI.json();
  aiToken = pairJson.token;
  assert(aiToken, 'Must receive auth token for live AI test');

  // Create temporary test workspace with clear __TEST__ marker
  const testWsTitle = `__TEST__ AI Active Recall ${Date.now()}`;
  const resWsAI = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: testWsTitle })
  });
  const { workspace: testWs } = await resWsAI.json();
  assert(testWs && testWs.id, 'Must create test workspace');
  createdTestWsIds.push(testWs.id);

  // POST the exact test sentence
  const exactSentence = 'Active recall strengthens the ability to retrieve information without cues.';
  const resSrcAI = await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: testWs.id,
      type: 'chatgpt_selection',
      title: 'Active Recall Test',
      text: exactSentence
    })
  });
  const { source: testSrc } = await resSrcAI.json();
  assert(testSrc && testSrc.id, 'Source must be created');

  // Poll /api/state for up to 60 seconds
  const startPoll = Date.now();
  let aiCompleted = false;
  let finalAiState = null;

  while (Date.now() - startPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resStateAI = await fetch(`${WORKER_BASE}/api/state?workspaceId=${encodeURIComponent(testWs.id)}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resStateAI.json();
    const currentSrc = (stateData.sources || []).find(s => s.id === testSrc.id);
    if (currentSrc && currentSrc.processingStatus === 'completed') {
      aiCompleted = true;
      finalAiState = stateData;
      break;
    }
  }

  assert(aiCompleted, 'Workers AI must complete source processing within 60s');
  assert.strictEqual(finalAiState.proposals.length, 1, 'Exactly one pending proposal must exist');
  const operations = finalAiState.proposals[0].operations;
  assert(Array.isArray(operations) && operations.length > 0, 'Proposal must have operations');
  const hasValidOp = operations.some(o => o.op === 'add_concept' || o.op === 'enrich_concept');
  assert(hasValidOp, 'Proposal must have valid add_concept or enrich_concept operation');
  console.log(`  ✓ PASS: Live Workers AI generated valid proposal with ${operations.length} operation(s): "${operations[0].label || operations[0].op}"`);

  // Test 9: Live Retry Analysis Endpoint
  console.log('[Test 9] Testing POST /api/sources/retry endpoint...');
  const resRetry = await fetch(`${WORKER_BASE}/api/sources/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ sourceId: testSrc.id })
  });
  assert.strictEqual(resRetry.status, 200, 'Retry endpoint must return HTTP 200');
  const retryData = await resRetry.json();
  assert(retryData.success, 'Retry endpoint must return success: true');
  console.log('  ✓ PASS: Retry Analysis endpoint verified successfully');

  // Test 10: Durable Stale Proposals in GET /api/state & dismiss-stale
  console.log('[Test 10] Testing Durable Stale Proposals in GET /api/state & dismiss-stale...');
  // Bump workspace revision by adding a concept to testWs
  await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ workspaceId: testWs.id, label: 'Revision Bumping Concept', x: 100, y: 100 })
  });

  // Attempt to apply proposal from Test 8 (which was created against revision 1)
  const staleProposalId = finalAiState.proposals[0].id;
  const resApplyStale = await fetch(`${WORKER_BASE}/api/proposals/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiToken}`,
      'X-Detective-Surface': 'sidepanel',
      'X-Detective-Action-Id': `act_sp_stale_${Date.now()}`
    },
    body: JSON.stringify({ proposalId: staleProposalId })
  });
  const staleApplyJson = await resApplyStale.json();
  assert.strictEqual(resApplyStale.status, 409, 'Applying proposal on bumped revision must return HTTP 409 PROPOSAL_STALE');
  assert.strictEqual(staleApplyJson.sourceId, testSrc.id, '409 response must preserve sourceId');

  // Query GET /api/state to verify durable separation
  const resStateStale = await fetch(`${WORKER_BASE}/api/state?workspaceId=${encodeURIComponent(testWs.id)}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  const stateStaleData = await resStateStale.json();
  assert.strictEqual(stateStaleData.proposals.length, 0, 'Pending proposals must be 0');
  assert(Array.isArray(stateStaleData.staleProposals) && stateStaleData.staleProposals.length === 1, 'staleProposals must have 1 record');
  assert.strictEqual(stateStaleData.staleProposals[0].sourceId, testSrc.id, 'staleProposals must preserve sourceId across reload');

  // Dismiss stale proposal
  const resDismiss = await fetch(`${WORKER_BASE}/api/proposals/dismiss-stale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ proposalId: staleProposalId, workspaceId: testWs.id })
  });
  assert.strictEqual(resDismiss.status, 200);

  const resStateAfterDismiss = await fetch(`${WORKER_BASE}/api/state?workspaceId=${encodeURIComponent(testWs.id)}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  const stateAfterDismissData = await resStateAfterDismiss.json();
  assert.strictEqual(stateAfterDismissData.staleProposals.length, 0, 'Stale proposal must be dismissed durably');
  console.log('  ✓ PASS: Durable Stale Proposals verified in GET /api/state & dismiss-stale');

  // Test 11: Auto-Healing 401 Stale Token in authenticatedFetch
  console.log('[Test 11] Testing authenticatedFetch 401 stale token auto-healing...');
  let storedToken = 'dt_invalid_stale_token_12345';
  let healedTokens = 0;

  const mockAuthenticatedFetch = async (endpoint, options = {}) => {
    let res = await fetch(`${WORKER_BASE}${endpoint}`, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${storedToken}` }
    });

    if (res.status === 401) {
      // Auto-re-pair using master PIN
      const rePairRes = await fetch(`${WORKER_BASE}/api/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: 'KIRA-2026', deviceName: 'Auto-Healer Host' })
      });
      if (rePairRes.ok) {
        const pairData = await rePairRes.json();
        storedToken = pairData.token;
        healedTokens++;
        // Retry original request
        res = await fetch(`${WORKER_BASE}${endpoint}`, {
          ...options,
          headers: { ...options.headers, 'Authorization': `Bearer ${storedToken}` }
        });
      }
    }
    return res;
  };

  const resHealed = await mockAuthenticatedFetch('/api/workspaces');
  assert.strictEqual(resHealed.status, 200, 'Auto-healed request must succeed with HTTP 200');
  const healedWsData = await resHealed.json();
  assert(healedWsData.workspaces && healedWsData.workspaces.length >= 2, 'Must retrieve cloud workspaces after healing');
  assert.strictEqual(healedTokens, 1, 'Exactly one 401 re-pairing event must occur');
  console.log(`  ✓ PASS: Stale token auto-healed, retrieved ${healedWsData.workspaces.length} cloud workspaces`);

  // Test 12: Workspace Deletion Strict Safety Policy
  console.log('[Test 12] Testing Strict Workspace Deletion Safety Policy...');

  // 12.1: Default workspace CANNOT be deleted (HTTP 403)
  const resDelDefault = await fetch(`${WORKER_BASE}/api/workspaces/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ workspaceId: 'ws_default' })
  });
  assert.strictEqual(resDelDefault.status, 403, 'Deleting default workspace must return HTTP 403');
  console.log('  ✓ PASS: 1. Deleting "My Learning Map" safely rejected with HTTP 403 Forbidden');

  // 12.2: User named workspaces CANNOT be deleted (HTTP 403)
  const resDelLiving = await fetch(`${WORKER_BASE}/api/workspaces/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ workspaceId: 'ws_8fd9bcca89' })
  });
  assert.strictEqual(resDelLiving.status, 403, 'Deleting Test - Living Map must return HTTP 403');
  console.log('  ✓ PASS: 2. Deleting "Test - Living Map" safely rejected with HTTP 403 Forbidden');

  // 12.3: cleanup-tests endpoint IGNORES arbitrary client-provided titles
  const resCleanupArbitrary = await fetch(`${WORKER_BASE}/api/workspaces/cleanup-tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ titles: ['My Learning Map', 'Test - Living Map', 'Future Real User Map'] })
  });
  assert.strictEqual(resCleanupArbitrary.status, 200);
  const resCheckWs = await fetch(`${WORKER_BASE}/api/workspaces`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  const checkWsData = await resCheckWs.json();
  const hasDefault = checkWsData.workspaces.some(w => w.id === 'ws_default');
  const hasLiving = checkWsData.workspaces.some(w => w.id === 'ws_8fd9bcca89');
  assert(hasDefault && hasLiving, 'Legitimate workspaces must remain completely intact');
  console.log('  ✓ PASS: 3. cleanup-tests rejects arbitrary title lists and preserves user data');

  // 12.4: Creating and deleting a __TEST__ workspace returns HTTP 200
  const resWsTest = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ Safety Check ${Date.now()}` })
  });
  const { workspace: wsTemp } = await resWsTest.json();
  assert(wsTemp && wsTemp.id, 'Must create temp __TEST__ workspace');

  const resDelTest = await fetch(`${WORKER_BASE}/api/workspaces/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ workspaceId: wsTemp.id })
  });
  assert.strictEqual(resDelTest.status, 200, 'Deleting __TEST__ workspace must return HTTP 200');
  console.log('  ✓ PASS: 4. Deleting valid __TEST__ workspace returns HTTP 200');

  // Test 13: Live Server-Side Mutation Audit Trail Verification (CRITICAL: "AI Proposes; Human Commits")
  console.log('\n[Test 13] Verifying Live Server-Side Mutation Audit Trail on __TEST__ workspace...');
  const resWsAudit = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ MUTATION_AUDIT_${Date.now()}` })
  });
  const { workspace: wsAudit } = await resWsAudit.json();
  assert(wsAudit && wsAudit.id, 'Must create test workspace for mutation audit');
  createdTestWsIds.push(wsAudit.id);

  // 13.1: Initial audit log must be empty for new workspace
  const resAuditInitial = await fetch(`${WORKER_BASE}/api/audit?workspaceId=${wsAudit.id}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  assert.strictEqual(resAuditInitial.status, 200, 'GET /api/audit must return HTTP 200');
  const auditInitialData = await resAuditInitial.json();
  assert.strictEqual(auditInitialData.audit.length, 0, 'New workspace must have 0 audit entries');

  // 13.2: Ingest a source to create a proposal
  const resSourceAudit = await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsAudit.id,
      text: 'Neural networks use gradient descent to optimize parameters iteratively.'
    })
  });
  assert.strictEqual(resSourceAudit.status, 200);

  // Wait for AI proposal to generate (up to 60s)
  let auditProp = null;
  const startAuditPoll = Date.now();
  while (Date.now() - startAuditPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsAudit.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      auditProp = stateData.proposals[0];
      break;
    }
  }
  assert(auditProp, 'AI must generate a proposal for audit test');

  // 13.3: Explicit Canvas Apply with X-Detective-Surface & X-Detective-Action-Id
  const testActionId = `act_cv_test_${Date.now()}`;
  const resApplyAudit = await fetch(`${WORKER_BASE}/api/proposals/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiToken}`,
      'X-Detective-Surface': 'canvas',
      'X-Detective-Action-Id': testActionId,
      'User-Agent': 'DetectiveMapTestRunner/2.0'
    },
    body: JSON.stringify({ proposalId: auditProp.id })
  });
  assert.strictEqual(resApplyAudit.status, 200, 'Proposal apply must succeed with HTTP 200');

  // 13.4: Query GET /api/audit and verify both attempt and success logs
  const resAuditAfter = await fetch(`${WORKER_BASE}/api/audit?workspaceId=${wsAudit.id}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  assert.strictEqual(resAuditAfter.status, 200);
  const { audit: auditEntries } = await resAuditAfter.json();
  assert(auditEntries.length >= 2, 'Audit trail must contain attempt and success records');

  const attemptRecord = auditEntries.find(a => a.action === 'proposal_apply_attempt');
  assert(attemptRecord, 'Audit trail must record proposal_apply_attempt');
  assert.strictEqual(attemptRecord.surface, 'canvas', 'Audit must capture X-Detective-Surface');
  assert.strictEqual(attemptRecord.clientActionId, testActionId, 'Audit must capture X-Detective-Action-Id');
  assert(attemptRecord.deviceFingerprint && attemptRecord.deviceFingerprint.startsWith('fp_'), 'Audit must record hashed device fingerprint');
  assert.strictEqual(attemptRecord.proposalId, auditProp.id);

  const successRecord = auditEntries.find(a => a.action === 'proposal_apply_success');
  assert(successRecord, 'Audit trail must record proposal_apply_success');
  assert.strictEqual(successRecord.result, 'success');
  assert.strictEqual(successRecord.httpStatus, 200);
  assert.strictEqual(successRecord.revisionBefore, 1);
  assert.strictEqual(successRecord.revisionAfter, 2);
  assert(successRecord.metadata && successRecord.metadata.createdConceptCount >= 1);

  // 13.5: Test Unprovenanced / Programmatic Apply is BLOCKED with HTTP 403 and records proposal_apply_blocked
  // Ingest second source for unprovenanced blocking test
  const resSourceProg = await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsAudit.id,
      text: 'Backpropagation computes the gradient of the loss function with respect to weights.'
    })
  });
  assert.strictEqual(resSourceProg.status, 200);

  let progProp = null;
  const startProgPoll = Date.now();
  while (Date.now() - startProgPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsAudit.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    const found = (stateData.proposals || []).find(p => p.id !== auditProp.id);
    if (found) {
      progProp = found;
      break;
    }
  }
  assert(progProp, 'AI must generate second proposal for unprovenanced test');

  // Attempt apply WITHOUT X-Detective-Surface / X-Detective-Action-Id headers -> MUST be rejected with HTTP 403
  const resApplyBlocked = await fetch(`${WORKER_BASE}/api/proposals/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiToken}`
    },
    body: JSON.stringify({ proposalId: progProp.id })
  });
  assert.strictEqual(resApplyBlocked.status, 403, 'Unprovenanced apply must be rejected with HTTP 403 PROVENANCE_REQUIRED');
  const blockedBody = await resApplyBlocked.json();
  assert.strictEqual(blockedBody.error, 'PROVENANCE_REQUIRED');

  // Verify audit log has proposal_apply_blocked and revision did NOT increase
  const resAuditBlocked = await fetch(`${WORKER_BASE}/api/audit?workspaceId=${wsAudit.id}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  const { audit: blockedAuditEntries } = await resAuditBlocked.json();
  const blockedRecord = blockedAuditEntries.find(a => a.proposalId === progProp.id && a.action === 'proposal_apply_blocked');
  assert(blockedRecord, 'Audit trail must record proposal_apply_blocked');
  assert.strictEqual(blockedRecord.httpStatus, 403);
  assert.strictEqual(blockedRecord.revisionBefore, 2);
  assert.strictEqual(blockedRecord.revisionAfter, 2);

  // 13.6: Now apply with explicit Side Panel headers + test enrich_concept audit tracking
  // Fetch existing concept from revision 2 to create an enrichment operation
  const resStateBeforeEnrich = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsAudit.id}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  const stateBeforeEnrich = await resStateBeforeEnrich.json();
  const targetConcept = stateBeforeEnrich.concepts[0];
  assert(targetConcept, 'Target concept must exist for enrichment test');

  const enrichOps = [
    {
      op: 'enrich_concept',
      conceptId: targetConcept.id,
      addition: 'Backpropagation efficiently calculates layer-by-layer partial derivatives.'
    }
  ];

  const spActionId = `act_sp_enrich_${Date.now()}`;
  const resApplyEnrich = await fetch(`${WORKER_BASE}/api/proposals/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiToken}`,
      'X-Detective-Surface': 'sidepanel',
      'X-Detective-Action-Id': spActionId
    },
    body: JSON.stringify({ proposalId: progProp.id, operations: enrichOps })
  });
  assert.strictEqual(resApplyEnrich.status, 200, 'Explicit Side Panel Apply with enrichment must succeed');

  const resAuditEnrich = await fetch(`${WORKER_BASE}/api/audit?workspaceId=${wsAudit.id}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  const { audit: enrichAuditEntries } = await resAuditEnrich.json();
  const enrichSuccessRecord = enrichAuditEntries.find(a => a.proposalId === progProp.id && a.action === 'proposal_apply_success');
  assert(enrichSuccessRecord, 'Must record proposal_apply_success for enrichment');
  assert.strictEqual(enrichSuccessRecord.surface, 'sidepanel');
  assert.strictEqual(enrichSuccessRecord.clientActionId, spActionId);
  assert.strictEqual(enrichSuccessRecord.revisionBefore, 2);
  assert.strictEqual(enrichSuccessRecord.revisionAfter, 3);
  assert.strictEqual(enrichSuccessRecord.metadata.enrichedConceptCount, 1, 'enrichedConceptCount must be 1');
  assert(Array.isArray(enrichSuccessRecord.metadata.enrichedConceptIds) && enrichSuccessRecord.metadata.enrichedConceptIds.includes(targetConcept.id), 'Must include enriched concept ID');

  // 13.7: Verify state hydration / reload produces ZERO mutation audit records
  const preReloadCount = enrichAuditEntries.length;
  await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsAudit.id}`, { headers: { 'Authorization': `Bearer ${aiToken}` } });
  await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsAudit.id}`, { headers: { 'Authorization': `Bearer ${aiToken}` } });
  const resAuditReload = await fetch(`${WORKER_BASE}/api/audit?workspaceId=${wsAudit.id}`, {
    headers: { 'Authorization': `Bearer ${aiToken}` }
  });
  const { audit: postReloadAudit } = await resAuditReload.json();
  assert.strictEqual(postReloadAudit.length, preReloadCount, 'Fetching state/reloading must produce ZERO mutation audit records');

  // 13.8: Verify security & content privacy — NO raw tokens, pairing codes, proposal summaries, or source texts
  for (const entry of postReloadAudit) {
    assert(!JSON.stringify(entry).includes(aiToken), 'Audit trail must NEVER contain raw auth tokens');
    assert(!JSON.stringify(entry).includes('KIRA-2026'), 'Audit trail must NEVER contain pairing codes');
    assert(!JSON.stringify(entry).includes('summary'), 'Audit metadata must NOT contain proposal summary text');
    assert(!JSON.stringify(entry).includes('gradient descent'), 'Audit metadata must NOT contain raw source text');
    assert(!JSON.stringify(entry).includes('Backpropagation'), 'Audit metadata must NOT contain raw source text');
  }

  console.log('  ✓ PASS: Live server-side Mutation Audit Trail fully verified (provenance guard, atomic enrich_concept, 0 reload mutations, 0 content leaks)');

  // Test 14: Two-Sided Concept Boundary — Anti-Over-Merging Real Browser Regression
  console.log('\n[Test 14] Two-Sided Concept Boundary — Anti-Over-Merging Regression (Distributed Learning)...');
  const resWsOverMerge = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ OVER_MERGE_${Date.now()}` })
  });
  const { workspace: wsOverMerge } = await resWsOverMerge.json();
  assert(wsOverMerge && wsOverMerge.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsOverMerge.id);

  // 14.1 Create base Spaced Repetition concept
  const resBaseSpaced = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsOverMerge.id,
      label: 'Spaced Repetition',
      description: 'Improves long-term retention by increasing the interval between successful reviews.'
    })
  });
  const { concept: baseSpacedConcept } = await resBaseSpaced.json();

  // 14.2 Ingest the real browser failure sentence (independent broader concept)
  const realBrowserOverMergeSentence = 'Distributed learning tends to produce better long-term retention than completing the same amount of study in one concentrated session, even when no spaced-repetition algorithm is used.';
  const resSrcOverMerge = await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsOverMerge.id,
      title: 'Distributed Learning Article',
      text: realBrowserOverMergeSentence
    })
  });
  assert.strictEqual(resSrcOverMerge.status, 200);

  // 14.3 Poll for AI proposal
  let overMergeProp = null;
  const startOverMergePoll = Date.now();
  while (Date.now() - startOverMergePoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsOverMerge.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      overMergeProp = stateData.proposals[0];
      break;
    }
  }
  assert(overMergeProp, 'AI must generate a proposal for over-merge test');

  // 14.4 Assertions: MUST contain add_concept for Distributed Learning/Practice, MUST NOT be sole enrich_concept on Spaced Repetition
  const overMergeOps = overMergeProp.operations;
  const hasDistributedConcept = overMergeOps.some(op => op.op === 'add_concept' && /distributed\s*(learning|practice)/i.test(op.label || ''));
  const onlyEnrichSpaced = overMergeOps.length === 1 && overMergeOps[0].op === 'enrich_concept' && overMergeOps[0].conceptId === baseSpacedConcept.id;

  assert(hasDistributedConcept, 'Proposal MUST contain add_concept for Distributed Learning / Practice (Counterfactual Independence)');
  assert(!onlyEnrichSpaced, 'Proposal MUST NOT solely enrich Spaced Repetition for independent concept');
  console.log('  ✓ PASS: Two-Sided Boundary Anti-Over-Merging verified — Distributed Learning created as independent concept (+1 Concept)');

  // Test 15: Cross-Domain Generalization Independence Test (Photosynthesis vs Cellular Respiration)
  console.log('\n[Test 15] Cross-Domain Generalization Independence Test (Biology: Cellular Respiration vs Photosynthesis)...');
  const resWsBio = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ BIO_INDEPENDENCE_${Date.now()}` })
  });
  const { workspace: wsBio } = await resWsBio.json();
  assert(wsBio && wsBio.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsBio.id);

  // 15.1 Create base Photosynthesis concept
  const resBasePhoto = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsBio.id,
      label: 'Photosynthesis',
      description: 'Process by which green plants and some organisms use sunlight to synthesize nutrients from carbon dioxide and water.'
    })
  });
  const { concept: basePhotoConcept } = await resBasePhoto.json();

  // 15.2 Ingest Cellular Respiration text (independent process)
  const bioSentence = 'Cellular respiration releases usable energy from organic molecules and also occurs in organisms that do not perform photosynthesis.';
  const resSrcBio = await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsBio.id,
      title: 'Cellular Energetics',
      text: bioSentence
    })
  });
  assert.strictEqual(resSrcBio.status, 200);

  // 15.3 Poll for AI proposal
  let bioProp = null;
  const startBioPoll = Date.now();
  while (Date.now() - startBioPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsBio.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      bioProp = stateData.proposals[0];
      break;
    }
  }
  assert(bioProp, 'AI must generate a proposal for bio independence test');

  // 15.4 Assertions: MUST contain add_concept for Cellular Respiration, MUST NOT solely enrich Photosynthesis
  const bioOps = bioProp.operations;
  const hasRespirationConcept = bioOps.some(op => op.op === 'add_concept' && /cellular\s*respiration|respiration/i.test(op.label || ''));
  const onlyEnrichPhoto = bioOps.length === 1 && bioOps[0].op === 'enrich_concept' && bioOps[0].conceptId === basePhotoConcept.id;

  assert(hasRespirationConcept, 'Proposal MUST contain add_concept for Cellular Respiration');
  assert(!onlyEnrichPhoto, 'Proposal MUST NOT solely enrich Photosynthesis for independent metabolic process');
  console.log('  ✓ PASS: Cross-Domain Generalization verified — Cellular Respiration created as independent concept (+1 Concept)');

  // Test 16: Anti-Fragmentation Regression — Spaced Repetition Mechanism
  console.log('\n[Test 16] Anti-Fragmentation Regression (Mechanism input MUST enrich and NOT create satellite nodes)...');
  const resWsFrag = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ FRAG_GUARD_${Date.now()}` })
  });
  const { workspace: wsFrag } = await resWsFrag.json();
  assert(wsFrag && wsFrag.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsFrag.id);

  const resBaseFrag = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsFrag.id,
      label: 'Spaced Repetition',
      description: 'Improves long-term retention by increasing the interval between successful reviews.'
    })
  });
  const { concept: baseFragConcept } = await resBaseFrag.json();

  const fragText = 'Spaced repetition works by scheduling repeated reviews across time, rather than massing those reviews together in one session.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsFrag.id,
      title: 'Mechanism Input',
      text: fragText
    })
  });

  let fragProp = null;
  const startFragPoll = Date.now();
  while (Date.now() - startFragPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsFrag.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      fragProp = stateData.proposals[0];
      break;
    }
  }
  assert(fragProp, 'AI must generate a proposal for fragmentation test');
  const fragOps = fragProp.operations;
  const hasFragEnrich = fragOps.some(op => op.op === 'enrich_concept' && op.conceptId === baseFragConcept.id);
  const fragAddOps = fragOps.filter(op => op.op === 'add_concept');

  assert(hasFragEnrich, 'Mechanism proposal MUST contain enrich_concept targeting Spaced Repetition');
  assert.strictEqual(fragAddOps.length, 0, 'Mechanism proposal MUST NOT create any new satellite concept nodes');
  console.log('  ✓ PASS: Anti-Fragmentation verified — Mechanism correctly enriched existing concept (+0 Concepts, ~1 Enrichment)');

  // Test 17: Relational & Composability Signal — Interleaved Practice + Distributed Practice
  console.log('\n[Test 17] Relational & Composability Signal (Interleaved Practice combined with Distributed Practice)...');
  const resWsInterleaved = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ INTERLEAVED_${Date.now()}` })
  });
  const { workspace: wsInterleaved } = await resWsInterleaved.json();
  assert(wsInterleaved && wsInterleaved.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsInterleaved.id);

  const resBaseDist = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsInterleaved.id,
      label: 'Distributed Practice',
      description: 'Learning strategy that spreads study sessions over time.'
    })
  });
  const { concept: baseDistConcept } = await resBaseDist.json();

  const interleavedSentence = 'Interleaved practice alternates different types of problems during practice and can be combined with distributed practice across separate learning sessions.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsInterleaved.id,
      title: 'Interleaving Study',
      text: interleavedSentence
    })
  });

  let interleavedProp = null;
  const startInterleavedPoll = Date.now();
  while (Date.now() - startInterleavedPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsInterleaved.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      interleavedProp = stateData.proposals[0];
      break;
    }
  }
  assert(interleavedProp, 'AI must generate a proposal for composability test');
  const interleavedOps = interleavedProp.operations;
  const hasInterleavedConcept = interleavedOps.some(op => op.op === 'add_concept' && /interleaved\s*practice|interleaving/i.test(op.label || ''));
  const onlyEnrichDist = interleavedOps.length === 1 && interleavedOps[0].op === 'enrich_concept' && interleavedOps[0].conceptId === baseDistConcept.id;

  assert(hasInterleavedConcept, 'Proposal MUST contain add_concept for Interleaved Practice');
  assert(!onlyEnrichDist, 'Proposal MUST NOT solely enrich Distributed Practice when composability relation is stated');
  console.log('  ✓ PASS: Relational & Composability Signal verified — Interleaved Practice created as independent concept (+1 Concept)');

  // Test 18: Cross-Domain Composability Generalization (Mobility Training + Strength Training)
  console.log('\n[Test 18] Cross-Domain Composability Generalization (Mobility Training combined with Strength Training)...');
  const resWsMobility = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ MOBILITY_${Date.now()}` })
  });
  const { workspace: wsMobility } = await resWsMobility.json();
  assert(wsMobility && wsMobility.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsMobility.id);

  const resBaseStrength = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsMobility.id,
      label: 'Strength Training',
      description: 'Physical exercise specializing in the use of resistance to induce muscular contraction.'
    })
  });
  const { concept: baseStrengthConcept } = await resBaseStrength.json();

  const mobilitySentence = 'Mobility training can be combined with strength training to improve movement quality while addressing different physical capacities.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsMobility.id,
      title: 'Mobility & Strength Protocol',
      text: mobilitySentence
    })
  });

  let mobilityProp = null;
  const startMobilityPoll = Date.now();
  while (Date.now() - startMobilityPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsMobility.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      mobilityProp = stateData.proposals[0];
      break;
    }
  }
  assert(mobilityProp, 'AI must generate a proposal for cross-domain composability test');
  const mobilityOps = mobilityProp.operations;
  const hasMobilityConcept = mobilityOps.some(op => op.op === 'add_concept' && /mobility\s*training|mobility/i.test(op.label || ''));
  const onlyEnrichStrength = mobilityOps.length === 1 && mobilityOps[0].op === 'enrich_concept' && mobilityOps[0].conceptId === baseStrengthConcept.id;

  assert(hasMobilityConcept, 'Proposal MUST contain add_concept for Mobility Training');
  assert(!onlyEnrichStrength, 'Proposal MUST NOT solely enrich Strength Training when composability relation is stated');
  console.log('  ✓ PASS: Cross-Domain Composability Generalization verified — Mobility Training created as independent concept (+1 Concept)');

  // Test 19: Semantic Target Grounding — Real Failure Regression (Retrieval Practice vs Spaced Repetition)
  console.log('\n[Test 19] Semantic Target Grounding (Retrieval Practice MUST NOT absorb into Spaced Repetition)...');
  const resWsRetrieval = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ RETRIEVAL_${Date.now()}` })
  });
  const { workspace: wsRetrieval } = await resWsRetrieval.json();
  assert(wsRetrieval && wsRetrieval.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsRetrieval.id);

  const resBaseSpaced19 = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsRetrieval.id,
      label: 'Spaced Repetition',
      description: 'Improves long-term retention by increasing review intervals.'
    })
  });
  const { concept: baseSpacedConcept19 } = await resBaseSpaced19.json();

  const retrievalText = 'Retrieval practice strengthens long-term memory because actively retrieving information improves later retention.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsRetrieval.id,
      title: 'Retrieval Ingestion',
      text: retrievalText
    })
  });

  let retrievalProp = null;
  const startRetrievalPoll = Date.now();
  while (Date.now() - startRetrievalPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsRetrieval.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      retrievalProp = stateData.proposals[0];
      break;
    }
  }
  assert(retrievalProp, 'AI must generate a proposal for retrieval practice test');
  const retrievalOps = retrievalProp.operations;
  const hasRetrievalConcept = retrievalOps.some(op => op.op === 'add_concept' && /retrieval\s*practice|retrieval/i.test(op.label || ''));
  const hasEnrichSpaced = retrievalOps.some(op => op.op === 'enrich_concept' && op.conceptId === baseSpacedConcept19.id);
  const hasEdgeToSpaced = retrievalOps.some(op => op.op === 'add_edge' && (op.to === baseSpacedConcept19.id || op.from === baseSpacedConcept19.id));

  assert(hasRetrievalConcept, 'Proposal MUST contain add_concept for Retrieval Practice');
  assert(!hasEnrichSpaced, 'Proposal MUST NOT enrich Spaced Repetition (Topical Similarity is not identity)');
  assert(!hasEdgeToSpaced, 'Proposal MUST NOT create an ungrounded edge to Spaced Repetition');
  console.log('  ✓ PASS: Semantic Target Grounding verified — Retrieval Practice created as independent concept (+1 Concept, 0 Enriches, 0 Ungrounded Edges)');

  // Test 20: Cross-Domain Semantic Target Grounding (Fermentation vs Photosynthesis)
  console.log('\n[Test 20] Cross-Domain Semantic Target Grounding (Fermentation vs Photosynthesis)...');
  const resWsFerm = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ FERMENTATION_${Date.now()}` })
  });
  const { workspace: wsFerm } = await resWsFerm.json();
  assert(wsFerm && wsFerm.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsFerm.id);

  const resBasePhoto20 = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsFerm.id,
      label: 'Photosynthesis',
      description: 'Biological process converting light into chemical energy.'
    })
  });
  const { concept: basePhotoConcept2 } = await resBasePhoto20.json();

  const fermText = 'Fermentation produces energy from organic compounds without requiring oxygen.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsFerm.id,
      title: 'Fermentation Study',
      text: fermText
    })
  });

  let fermProp = null;
  const startFermPoll = Date.now();
  while (Date.now() - startFermPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsFerm.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      fermProp = stateData.proposals[0];
      break;
    }
  }
  assert(fermProp, 'AI must generate a proposal for fermentation test');
  const fermOps = fermProp.operations;
  const hasFermConcept = fermOps.some(op => op.op === 'add_concept' && /fermentation/i.test(op.label || ''));
  const hasEnrichPhoto2 = fermOps.some(op => op.op === 'enrich_concept' && op.conceptId === basePhotoConcept2.id);

  assert(hasFermConcept, 'Proposal MUST contain add_concept for Fermentation');
  assert(!hasEnrichPhoto2, 'Proposal MUST NOT enrich Photosynthesis for fermentation');
  console.log('  ✓ PASS: Cross-Domain Target Grounding verified — Fermentation created as independent concept (+1 Concept)');

  // Test 21: Real Failure Regression — Self-Explanation vs Elaborative Interrogation (Explicit Subject Preservation)
  console.log('\n[Test 21] Explicit Source Subject Preservation (Self-Explanation MUST NOT absorb into Elaborative Interrogation)...');
  const resWsSelfExp = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ SELF_EXP_${Date.now()}` })
  });
  const { workspace: wsSelfExp } = await resWsSelfExp.json();
  assert(wsSelfExp && wsSelfExp.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsSelfExp.id);

  const resBaseElab = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsSelfExp.id,
      label: 'Elaborative Interrogation',
      description: 'Generating explanations for why explicitly stated facts are true.'
    })
  });
  const { concept: baseElabConcept } = await resBaseElab.json();

  const selfExpText = 'Self-explanation improves learning when learners generate explanations that connect new information with what they already know.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsSelfExp.id,
      title: 'Self-Explanation Study',
      text: selfExpText
    })
  });

  let selfExpProp = null;
  const startSelfExpPoll = Date.now();
  while (Date.now() - startSelfExpPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsSelfExp.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      selfExpProp = stateData.proposals[0];
      break;
    }
  }
  assert(selfExpProp, 'AI must generate a proposal for self-explanation test');
  const selfExpOps = selfExpProp.operations;
  const hasSelfExpConcept = selfExpOps.some(op => op.op === 'add_concept' && /self[-\s]*explanation/i.test(op.label || ''));
  const hasEnrichElab = selfExpOps.some(op => op.op === 'enrich_concept' && op.conceptId === baseElabConcept.id);
  const hasEdgeToElab = selfExpOps.some(op => op.op === 'add_edge' && (op.to === baseElabConcept.id || op.from === baseElabConcept.id));

  assert(hasSelfExpConcept, 'Proposal MUST contain add_concept for Self-Explanation');
  assert(!hasEnrichElab, 'Proposal MUST NOT enrich Elaborative Interrogation (Close Sibling Anti-Collapse Rule)');
  assert(!hasEdgeToElab, 'Proposal MUST NOT create an ungrounded edge to Elaborative Interrogation');
  console.log('  ✓ PASS: Explicit Subject Preservation verified — Self-Explanation created as independent concept (+1 Concept, 0 Enriches, 0 Ungrounded Edges)');

  // Test 22: Sibling Generalization Test (Sensitivity vs Specificity)
  console.log('\n[Test 22] Sibling Generalization Test (Sensitivity vs Specificity)...');
  const resWsSens = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ SENSITIVITY_${Date.now()}` })
  });
  const { workspace: wsSens } = await resWsSens.json();
  assert(wsSens && wsSens.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsSens.id);

  const resBaseSpec = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsSens.id,
      label: 'Specificity',
      description: 'Ability of a test to correctly identify those without the disease.'
    })
  });
  const { concept: baseSpecConcept } = await resBaseSpec.json();

  const sensText = 'Sensitivity measures a diagnostic test\'s ability to correctly identify people who truly have the condition.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsSens.id,
      title: 'Diagnostic Metrics',
      text: sensText
    })
  });

  let sensProp = null;
  const startSensPoll = Date.now();
  while (Date.now() - startSensPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsSens.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      sensProp = stateData.proposals[0];
      break;
    }
  }
  assert(sensProp, 'AI must generate a proposal for sensitivity test');
  const sensOps = sensProp.operations;
  const hasSensConcept = sensOps.some(op => op.op === 'add_concept' && /sensitivity/i.test(op.label || ''));
  const hasEnrichSpec = sensOps.some(op => op.op === 'enrich_concept' && op.conceptId === baseSpecConcept.id);

  assert(hasSensConcept, 'Proposal MUST contain add_concept for Sensitivity');
  assert(!hasEnrichSpec, 'Proposal MUST NOT enrich Specificity');
  console.log('  ✓ PASS: Sibling Generalization verified — Sensitivity created as independent concept (+1 Concept)');

  // Test 23: True Alias Positive Control (PCR vs Polymerase Chain Reaction)
  console.log('\n[Test 23] True Alias Positive Control (PCR vs Polymerase Chain Reaction)...');
  const resWsPcr = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ PCR_ALIAS_${Date.now()}` })
  });
  const { workspace: wsPcr } = await resWsPcr.json();
  assert(wsPcr && wsPcr.id, 'Must create temp test workspace');
  createdTestWsIds.push(wsPcr.id);

  const resBasePcr = await fetch(`${WORKER_BASE}/api/concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsPcr.id,
      label: 'Polymerase Chain Reaction',
      description: 'Molecular technique for amplifying specific DNA regions.'
    })
  });
  const { concept: basePcrConcept } = await resBasePcr.json();

  const pcrText = 'PCR uses repeated thermal cycles to amplify a target DNA sequence.';
  await fetch(`${WORKER_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({
      workspaceId: wsPcr.id,
      title: 'PCR Protocol',
      text: pcrText
    })
  });

  let pcrProp = null;
  const startPcrPoll = Date.now();
  while (Date.now() - startPcrPoll < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const resState = await fetch(`${WORKER_BASE}/api/state?workspaceId=${wsPcr.id}`, {
      headers: { 'Authorization': `Bearer ${aiToken}` }
    });
    const stateData = await resState.json();
    if (stateData.proposals && stateData.proposals.length > 0) {
      pcrProp = stateData.proposals[0];
      break;
    }
  }
  assert(pcrProp, 'AI must generate a proposal for PCR alias test');
  const pcrOps = pcrProp.operations;
  const hasEnrichPcr = pcrOps.some(op => op.op === 'enrich_concept' && op.conceptId === basePcrConcept.id);
  const pcrAddOps = pcrOps.filter(op => op.op === 'add_concept');

  assert(hasEnrichPcr, 'Proposal MUST enrich Polymerase Chain Reaction for true alias PCR');
  assert.strictEqual(pcrAddOps.length, 0, 'Proposal MUST NOT duplicate PCR as a new concept node');
  console.log('  ✓ PASS: True Alias Positive Control verified — PCR successfully enriched Polymerase Chain Reaction (+0 Concepts, ~1 Enrichment)');
  } finally {
    // GUARANTEED CLEANUP OF ALL TEMPORARY TEST RESOURCES WITH POST-DELETION VERIFICATION
    if (createdTestWsIds.length > 0 && aiToken) {
      console.log(`\n[Cleanup] Removing ${createdTestWsIds.length} temporary test workspace(s)...`);
      try {
        for (const wsId of createdTestWsIds) {
          const resDel = await fetch(`${WORKER_BASE}/api/workspaces/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
            body: JSON.stringify({ workspaceId: wsId })
          });
          if (resDel.status !== 200 && resDel.status !== 404) {
            const delData = await resDel.json();
            throw new Error(`Deletion API failed for ${wsId} with HTTP ${resDel.status}: ${JSON.stringify(delData)}`);
          }
        }

        // VERIFY DELETION: Query /api/workspaces and assert NONE of createdTestWsIds exist
        const resVerify = await fetch(`${WORKER_BASE}/api/workspaces`, {
          headers: { 'Authorization': `Bearer ${aiToken}` }
        });
        const verifyData = await resVerify.json();
        const remainingTestIds = (verifyData.workspaces || []).filter(w => createdTestWsIds.includes(w.id));
        if (remainingTestIds.length > 0) {
          throw new Error(`[CRITICAL TEST FAILURE] Test workspace(s) [${remainingTestIds.map(w => w.id).join(', ')}] STILL EXIST in production after delete!`);
        }
        console.log(`  ✓ VERIFIED: All ${createdTestWsIds.length} test workspace(s) are completely gone from production.`);
      } catch (err) {
        console.error(`\n✕ [ZERO-RESIDUE VIOLATION] Cleanup verification failed:`, err.message);
        process.exit(1);
      }
    }
  }

  console.log('\n=== Cloudflare Worker Verification Completed Successfully (0 secrets logged) ===\n');
  process.exit(0);
}

runCloudVerification().catch(err => {
  console.error('\n✕ Cloud Verification Failed:', err);
  process.exit(1);
});
