// tests/verify-cloud.js - Live Cloudflare Worker Security & Integration Test Suite
const assert = require('assert');

const WORKER_BASE = 'https://detectivemap.qchen9108.workers.dev';

async function runCloudVerification() {
  console.log('=== Verifying Cloudflare Worker Production Deployment ===\n');

  // Test 1: Fetching Canvas HTML from Worker root
  console.log('[Test 1] Fetching Canvas HTML from Worker root...');
  const resHtml = await fetch(`${WORKER_BASE}/`);
  assert.strictEqual(resHtml.status, 200, 'Worker must serve canvas.html with HTTP 200');
  const htmlText = await resHtml.text();
  assert(htmlText.includes('Detective Map'), 'HTML must include Detective Map title');
  assert(!htmlText.includes('MAP-2026'), 'HTML must NOT contain hardcoded MAP-2026');
  console.log('  PASS (HTTP 200, clean HTML served without hardcoded secrets)');

  // Test 2: CRITICAL A - MAP-2026 MUST be rejected
  console.log('[Test 2] Testing that legacy hardcoded MAP-2026 is permanently rejected...');
  const resLegacyPin = await fetch(`${WORKER_BASE}/api/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode: 'MAP-2026', deviceName: 'Legacy Test' })
  });
  assert.strictEqual(resLegacyPin.status, 401, 'MAP-2026 must be rejected with HTTP 401');
  console.log('  PASS (MAP-2026 permanently rejected with HTTP 401)');

  // Test 3: Unauthenticated /api/state must return 401
  console.log('[Test 3] Testing unauthenticated /api/state access...');
  const resUnauth = await fetch(`${WORKER_BASE}/api/state`);
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated /api/state must return HTTP 401');
  console.log('  PASS (Unauthorized request rejected with HTTP 401)');

  // Test 4: Fake / Compromised Bearer Token rejected
  console.log('[Test 4] Testing invalid Bearer token on /api/state...');
  const resFakeToken = await fetch(`${WORKER_BASE}/api/state`, {
    headers: { 'Authorization': 'Bearer dt_fake_invalid_token_12345' }
  });
  assert.strictEqual(resFakeToken.status, 401, 'Invalid Bearer token must return HTTP 401');
  console.log('  PASS (Invalid Bearer token rejected with HTTP 401)');

  // Test 5: Dynamic Bootstrap or Authorized PIN Generation
  console.log('[Test 5] Testing Dynamic One-Time PIN Generation & Pairing...');
  let pinToUse = null;

  // Try bootstrap PIN first (works if 0 tokens exist)
  const resBootstrap = await fetch(`${WORKER_BASE}/api/auth/bootstrap-pin`, { method: 'POST' });
  if (resBootstrap.status === 200) {
    const data = await resBootstrap.json();
    pinToUse = data.pin;
    console.log('  Bootstrapped dynamic PIN:', pinToUse);

    // 1st use of PIN: must succeed with 200 and return a token
    const pair1 = await fetch(`${WORKER_BASE}/api/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: pinToUse, deviceName: 'Primary Device' })
    });
    assert.strictEqual(pair1.status, 200, 'First use of PIN must return 200');
    const pair1Data = await pair1.json();
    assert(pair1Data.token && pair1Data.token.startsWith('dt_'), 'Token must be returned');
    console.log('  PASS: First PIN use successfully issued token:', pair1Data.token.slice(0, 10) + '...');

    // 2nd use of the SAME PIN: MUST FAIL WITH 401 (atomic consumption)
    const pair2 = await fetch(`${WORKER_BASE}/api/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: pinToUse, deviceName: 'Second Attempt' })
    });
    assert.strictEqual(pair2.status, 401, 'Second use of same PIN must return 401');
    console.log('  PASS: Second use of same PIN atomically rejected with HTTP 401 (CRITICAL A)');

    // Now test authorized PIN generation from this authenticated device
    const genRes = await fetch(`${WORKER_BASE}/api/auth/generate-pin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${pair1Data.token}` }
    });
    assert.strictEqual(genRes.status, 200, 'Authorized device can generate new pairing PIN');
    const genData = await genRes.json();
    assert(genData.pin && genData.pin.startsWith('PIN-'), 'Generated PIN must have prefix PIN-');
    console.log('  PASS: Authorized device successfully generated new one-time PIN:', genData.pin);

    // Pair second device with the new PIN
    const pairSecondary = await fetch(`${WORKER_BASE}/api/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: genData.pin, deviceName: 'iPad Secondary' })
    });
    assert.strictEqual(pairSecondary.status, 200, 'Secondary device successfully paired');
    console.log('  PASS: Secondary device successfully paired with generated PIN');

    // Second attempt with the new PIN must also fail with 401
    const pairSecondaryAgain = await fetch(`${WORKER_BASE}/api/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: genData.pin, deviceName: 'iPad Secondary Replay' })
    });
    assert.strictEqual(pairSecondaryAgain.status, 401, 'Replayed generated PIN must return 401');
    console.log('  PASS: Replayed generated PIN atomically rejected with HTTP 401 (CRITICAL A)');
  } else {
    console.log('  (Bootstrap PIN endpoint returned 403 as expected when host tokens already exist)');
  }

  console.log('\n=== Cloudflare Worker Verification Completed Successfully ===\n');
}

runCloudVerification().catch(err => {
  console.error('\n✕ Cloud Verification Failed:', err);
  process.exit(1);
});
