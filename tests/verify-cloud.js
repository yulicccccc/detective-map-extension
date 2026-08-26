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

  // Test 10: Auth Self-Healing on 401 Stale Token
  console.log('[Test 10] Testing authenticatedFetch 401 stale token auto-healing...');
  const { Storage } = require('../shared/storage.js');
  const resHeal = await Storage.cloudSync.authenticatedFetch('/api/workspaces', {
    headers: { 'Authorization': 'Bearer dt_expired_mock_token_12345' }
  });
  assert.strictEqual(resHeal.status, 200, 'authenticatedFetch must heal 401 stale token and return 200');
  const healData = await resHeal.json();
  assert(Array.isArray(healData.workspaces) && healData.workspaces.length > 0, 'Must return cloud workspaces');
  console.log(`  ✓ PASS: Stale token auto-healed, retrieved ${healData.workspaces.length} cloud workspaces`);

  // Test 11: Strict Data Safety & Deletion Policy Regression Suite
  console.log('[Test 11] Testing Strict Workspace Deletion Safety Policy...');

  // 11.1: Deleting ws_default (My Learning Map) MUST be rejected with HTTP 403
  const resDelDefault = await fetch(`${WORKER_BASE}/api/workspaces/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ workspaceId: 'ws_default' })
  });
  assert.strictEqual(resDelDefault.status, 403, 'Deleting My Learning Map (ws_default) must return HTTP 403');
  const delDefaultJson = await resDelDefault.json();
  assert(delDefaultJson.error && delDefaultJson.error.includes('only allowed for test workspaces'), 'Must explain test workspaces restriction');
  console.log('  ✓ PASS: 1. Deleting "My Learning Map" safely rejected with HTTP 403 Forbidden');

  // 11.2: Deleting ws_8fd9bcca89 (Test - Living Map) MUST be rejected with HTTP 403
  const resDelLiving = await fetch(`${WORKER_BASE}/api/workspaces/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ workspaceId: 'ws_8fd9bcca89' })
  });
  assert.strictEqual(resDelLiving.status, 403, 'Deleting Test - Living Map must return HTTP 403');
  console.log('  ✓ PASS: 2. Deleting "Test - Living Map" safely rejected with HTTP 403 Forbidden');

  // 11.3: cleanup-tests endpoint IGNORES arbitrary client-provided titles
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

  // 11.4: Creating and deleting a __TEST__ workspace returns HTTP 200
  const resWsTest = await fetch(`${WORKER_BASE}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ title: `__TEST__ Safety Check ${Date.now()}` })
  });
  const { workspace: wsTemp } = await resWsTest.json();
  assert(wsTemp && wsTemp.id, 'Must create temp __TEST__ workspace');
  createdTestWsIds.push(wsTemp.id);

  const resDelTest = await fetch(`${WORKER_BASE}/api/workspaces/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ workspaceId: wsTemp.id })
  });
  assert.strictEqual(resDelTest.status, 200, 'Deleting __TEST__ workspace must return HTTP 200');
  console.log('  ✓ PASS: 4. Deleting valid __TEST__ workspace returns HTTP 200');

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
