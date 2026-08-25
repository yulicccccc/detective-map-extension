// tests/verify-all.js - Automated Verification Suite for Detective Map

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================');
console.log('🧪 Starting Detective Map Verification Suite');
console.log('========================================\n');

let passed = 0;
let total = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// 1. Manifest V3 Integrity
test('Manifest V3 structure and file references', () => {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  assert(fs.existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.strictEqual(manifest.name, 'Detective Map');
  assert(Array.isArray(manifest.permissions), 'Permissions must be array');
  assert(manifest.permissions.includes('storage'), 'Must have storage permission');
  assert(manifest.permissions.includes('contextMenus'), 'Must have contextMenus permission');
  assert(manifest.permissions.includes('sidePanel'), 'Must have sidePanel permission');

  // Check referenced files
  assert(fs.existsSync(path.join(__dirname, '..', manifest.background.service_worker)), 'service worker exists');
  assert(fs.existsSync(path.join(__dirname, '..', manifest.side_panel.default_path)), 'sidepanel html exists');
  assert(fs.existsSync(path.join(__dirname, '..', manifest.content_scripts[0].js[0])), 'content script exists');

  // Check icons
  [16, 32, 48, 128].forEach(size => {
    const iconPath = path.join(__dirname, '..', manifest.icons[size.toString()]);
    assert(fs.existsSync(iconPath), `Icon ${size} must exist at ${iconPath}`);
  });
});

// 2. Canvas Core Math Tests
const { CanvasCore } = require('../shared/canvas-core.js');

test('World to Screen and Screen to World Coordinate Conversion', () => {
  const panX = 150;
  const panY = 75;
  const zoom = 1.5;

  const worldX = 200;
  const worldY = 300;

  const screen = CanvasCore.worldToScreen(worldX, worldY, panX, panY, zoom);
  assert.strictEqual(screen.x, 200 * 1.5 + 150, 'Screen X conversion');
  assert.strictEqual(screen.y, 300 * 1.5 + 75, 'Screen Y conversion');

  const backToWorld = CanvasCore.screenToWorld(screen.x, screen.y, panX, panY, zoom);
  assert(Math.abs(backToWorld.x - worldX) < 1e-6, 'Invertible World X');
  assert(Math.abs(backToWorld.y - worldY) < 1e-6, 'Invertible World Y');
});

test('Zoom Toward Anchor Point Invariance', () => {
  const panX = 100;
  const panY = 100;
  const zoom = 1.0;
  const anchorX = 400;
  const anchorY = 300;

  // The world point under the cursor before zoom
  const worldPtBefore = CanvasCore.screenToWorld(anchorX, anchorY, panX, panY, zoom);

  // Zoom to 2.0
  const newVp = CanvasCore.zoomTowardPoint(2.0, zoom, panX, panY, anchorX, anchorY);
  assert.strictEqual(newVp.zoom, 2.0);

  // The world point under the cursor after zoom must remain identical
  const worldPtAfter = CanvasCore.screenToWorld(anchorX, anchorY, newVp.panX, newVp.panY, newVp.zoom);
  assert(Math.abs(worldPtBefore.x - worldPtAfter.x) < 1e-6, 'Anchor X invariant');
  assert(Math.abs(worldPtBefore.y - worldPtAfter.y) < 1e-6, 'Anchor Y invariant');
});

test('Point to Segment Distance Math', () => {
  // Segment from (0, 0) to (10, 0)
  const d1 = CanvasCore.pointToSegmentDistance(5, 5, 0, 0, 10, 0);
  assert.strictEqual(d1, 5, 'Perpendicular distance to middle of segment');

  const d2 = CanvasCore.pointToSegmentDistance(15, 0, 0, 0, 10, 0);
  assert.strictEqual(d2, 5, 'Distance beyond endpoint B');

  const d3 = CanvasCore.pointToSegmentDistance(-5, 0, 0, 0, 10, 0);
  assert.strictEqual(d3, 5, 'Distance before endpoint A');
});

test('Stroke Eraser Hit Detection (Pen & Highlighter)', () => {
  const stroke = {
    id: 'stroke-1',
    tool: 'pen',
    width: 4,
    points: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 }
    ]
  };

  // Test point on the stroke line
  assert(CanvasCore.isStrokeHit({ x: 150, y: 102 }, stroke, 10), 'Hit near horizontal segment');
  assert(CanvasCore.isStrokeHit({ x: 202, y: 150 }, stroke, 10), 'Hit near vertical segment');

  // Test point far away from stroke
  assert(!CanvasCore.isStrokeHit({ x: 500, y: 500 }, stroke, 10), 'Miss far away');
  assert(!CanvasCore.isStrokeHit({ x: 150, y: 200 }, stroke, 10), 'Miss in interior gap');
});

test('Domain and Timestamp Formatting', () => {
  const chatGptDomain = CanvasCore.extractDomain('https://chatgpt.com/c/67890-abcdef');
  assert.strictEqual(chatGptDomain, 'ChatGPT', 'ChatGPT domain parsed correctly');

  const webDomain = CanvasCore.extractDomain('https://www.nature.com/articles/s41586');
  assert.strictEqual(webDomain, 'nature.com', 'Web domain parsed correctly');

  const timeFormatted = CanvasCore.formatCaptureTime(new Date().toISOString());
  assert(timeFormatted.includes('Just now') || timeFormatted.includes('m ago'), 'Time format generated');
});

// 3. Storage Mock & Backup Validation
const { Storage } = require('../shared/storage.js');

test('Storage Export and Import Schema Integrity', async () => {
  const exportPayload = await Storage.exportAllData();
  assert.strictEqual(exportPayload.version, '1.0.0');
  assert.strictEqual(exportPayload.generator, 'Detective Map Extension');
  assert(exportPayload.data && typeof exportPayload.data === 'object');
  assert(Array.isArray(exportPayload.data.quotes));
  assert(Array.isArray(exportPayload.data.strokes));

  // Test Import
  const sampleImport = {
    version: '1.0.0',
    data: {
      quotes: [{ id: 'q-test-1', text: 'Test Quote', sourceUrl: 'https://chatgpt.com', x: 50, y: 50 }],
      strokes: [{ id: 's-test-1', tool: 'pen', width: 3, points: [{ x: 10, y: 10 }] }],
      viewport: { panX: 10, panY: 20, zoom: 1.2 }
    }
  };

  const importRes = await Storage.importAllData(sampleImport);
  assert.strictEqual(importRes.quoteCount, 1);
  assert.strictEqual(importRes.strokeCount, 1);

  const importedQuotes = await Storage.getQuotes();
  assert.strictEqual(importedQuotes.length, 1);
  assert.strictEqual(importedQuotes[0].text, 'Test Quote');

  // Clean up
  await Storage.clearAll();
});

async function runAll() {
  for (const t of tests) {
    total++;
    try {
      await t.fn();
      console.log(`  ✓ PASS: ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${t.name}`);
      console.error(`    ${err.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Verification Complete: ${passed}/${total} tests passed.`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runAll();
