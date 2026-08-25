// tests/verify-cloud.js - Verify deployed Cloudflare Worker, Durable Object & Pairing APIs
const https = require('https');

const WORKER_URL = 'https://detectivemap.qchen9108.workers.dev';

function post(endpoint, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const url = new URL(endpoint, WORKER_URL);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, WORKER_URL);
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=== Verifying Cloudflare Worker Deployment ===\n');

  // Test 1: Static Canvas HTML Serving over HTTPS
  console.log('[Test 1] Fetching Canvas HTML from Worker root...');
  const htmlRes = await get('/');
  if (htmlRes.status === 200 && htmlRes.body.includes('Detective Map')) {
    console.log('  PASS (HTTP 200, HTML rendered correctly)');
  } else {
    console.error('  FAIL', htmlRes.status);
  }

  // Test 2: Pairing with Invalid Code (Should be 401)
  console.log('[Test 2] Testing Device Pairing with Invalid Code...');
  const invalidPair = await post('/api/pair', { pairingCode: 'WRONG_CODE' });
  if (invalidPair.status === 401) {
    console.log('  PASS (Unauthorized rejected correctly)');
  } else {
    console.error('  FAIL', invalidPair);
  }

  // Test 3: Pairing with Valid Code MAP-2026
  console.log('[Test 3] Testing Device Pairing with MAP-2026...');
  const validPair = await post('/api/pair', { pairingCode: 'MAP-2026' });
  if (validPair.status === 200 && validPair.data.success && validPair.data.token) {
    console.log('  PASS (Paired successfully, Token received: ' + validPair.data.token.slice(0, 10) + '...)');
    
    // Test 4: Post Quote with Device Token
    console.log('[Test 4] Posting Quote to Durable Object via Token Auth...');
    const quoteRes = await post('/api/quote', {
      id: `test-quote-${Date.now()}`,
      text: 'Verified cloud sync quote from Antigravity test suite.',
      sourceTitle: 'ChatGPT Test Conversation',
      sourceUrl: 'https://chatgpt.com/c/test',
      capturedAt: new Date().toISOString(),
      x: 150,
      y: 150
    }, {
      'Authorization': `Bearer ${validPair.data.token}`
    });

    if (quoteRes.status === 200 && quoteRes.data.success) {
      console.log('  PASS (Quote persisted in Durable Object SQLite store)');
    } else {
      console.error('  FAIL Quote Post', quoteRes);
    }
  } else {
    console.error('  FAIL Pair', validPair);
  }

  // Test 5: Verify Local Verification Suite (9 unit tests)
  console.log('\n[Test 5] Running local unit tests suite...');
  require('./verify-all.js');
}

runTests().catch(console.error);
