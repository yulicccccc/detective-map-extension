// tests/verify-cloud.js - Live Cloudflare Worker Security & Integration Test Suite
// Complies with no-secret-logging and tests real production endpoints end-to-end

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const WORKER_BASE = 'https://detectivemap.qchen9108.workers.dev';

async function runCloudVerification() {
  console.log('=== Verifying Cloudflare Worker Production Security & Endpoints ===\n');

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

  console.log('\n=== Cloudflare Worker Verification Completed Successfully (0 secrets logged) ===\n');
}

runCloudVerification().catch(err => {
  console.error('\n✕ Cloud Verification Failed:', err);
  process.exit(1);
});
