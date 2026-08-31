// tests/verify-watercolor-v2.js
// Regression tests for the manual-failure correction: V1 was too dense and blocked text.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CanvasCore } = require('../shared/canvas-core.js');

function createMockCtx() {
  const ops = [];
  let _lineWidth = 1;
  let _globalAlpha = 1;
  return {
    ops,
    save() { ops.push({ type: 'save' }); },
    restore() { ops.push({ type: 'restore' }); },
    beginPath() { ops.push({ type: 'beginPath' }); },
    moveTo(x, y) { ops.push({ type: 'moveTo', x, y }); },
    lineTo(x, y) { ops.push({ type: 'lineTo', x, y }); },
    quadraticCurveTo(cx, cy, x, y) { ops.push({ type: 'quadraticCurveTo', cx, cy, x, y }); },
    arc(x, y, r) { ops.push({ type: 'arc', x, y, r }); },
    stroke() { ops.push({ type: 'stroke', alpha: _globalAlpha, width: _lineWidth }); },
    fill() { ops.push({ type: 'fill', alpha: _globalAlpha }); },
    clearRect() { ops.push({ type: 'clearRect' }); },
    set lineWidth(v) { _lineWidth = v; ops.push({ type: 'lineWidth', value: v }); },
    get lineWidth() { return _lineWidth; },
    set globalAlpha(v) { _globalAlpha = v; ops.push({ type: 'globalAlpha', value: v }); },
    get globalAlpha() { return _globalAlpha; },
    set strokeStyle(v) {}, set fillStyle(v) {},
    set globalCompositeOperation(v) {}, set lineCap(v) {}, set lineJoin(v) {}
  };
}

function visibleOps(ops) {
  return ops.filter(op => ['moveTo', 'lineTo', 'quadraticCurveTo', 'lineWidth', 'stroke', 'arc', 'fill'].includes(op.type));
}

function opsAfterLastClear(ops) {
  let idx = -1;
  for (let i = 0; i < ops.length; i++) if (ops[i].type === 'clearRect') idx = i;
  return ops.slice(idx + 1);
}

require('../shared/fountain-pen-v2.js');
require('../shared/watercolor-brush-v1.js');

// Capture a V1 persisted stroke after V1 loads and before V2 patches the renderer.
const persistedV1 = {
  tool: 'watercolor', width: 20, opacity: 0.35, color: '#f59e0b',
  points: [
    { x: 0, y: 0, pressure: 0.5, t: 0, watercolorVersion: 1, watercolorSeed: 55 },
    { x: 20, y: 5, pressure: 0.5, t: 10 },
    { x: 40, y: 0, pressure: 0.5, t: 20 }
  ]
};
const v1BeforeCtx = createMockCtx();
CanvasCore.renderStroke(v1BeforeCtx, persistedV1);
const v1Before = JSON.stringify(v1BeforeCtx.ops);

const { WatercolorBrushV2 } = require('../shared/watercolor-brush-v2.js');

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try { fn(); passed++; console.log(`  ✓ PASS: ${name}`); }
  catch (err) { console.error(`  ✗ FAIL: ${name}`); console.error(`    ${err.message}`); process.exitCode = 1; }
}

console.log('========================================');
console.log('🖌 Watercolor Brush V2 Light Wash');
console.log('========================================');

test('1. Persisted Watercolor V1 replay remains unchanged', () => {
  const after = createMockCtx();
  CanvasCore.renderStroke(after, persistedV1);
  assert.strictEqual(JSON.stringify(after.ops), v1Before);
});

test('2. New Highlighter upgrades to Watercolor V2 light-wash defaults', () => {
  WatercolorBrushV2._inputCapture.queue = [];
  const stroke = {
    tool: 'highlighter', width: 20, opacity: 0.35, color: '#f59e0b',
    points: [{ x: 10, y: 10, pressure: 0.5 }]
  };
  assert.strictEqual(WatercolorBrushV2.ensureActiveWatercolorStroke(stroke), true);
  assert.strictEqual(stroke.tool, 'watercolor');
  assert.strictEqual(stroke.points[0].watercolorVersion, 2);
  assert.strictEqual(stroke.width, WatercolorBrushV2.DEFAULT_WIDTH);
  assert.strictEqual(stroke.opacity, WatercolorBrushV2.DEFAULT_OPACITY);
  assert.strictEqual(stroke.color, WatercolorBrushV2.DEFAULT_COLOR);
});

test('3. One V2 pass has a strict low-opacity readability budget', () => {
  const stroke = {
    tool: 'watercolor', width: 17, opacity: 0.18, color: '#ffd166',
    points: [{ x: 0, y: 0, pressure: 0.5, t: 0, watercolorVersion: 2, watercolorSeed: 1 }]
  };
  const alpha = WatercolorBrushV2.estimatedSinglePassAlpha(stroke, 0);
  assert(alpha > 0.06, `Single pass should still be visible, got ${alpha}`);
  assert(alpha < 0.16, `Single pass must remain text-readable, got ${alpha}`);
});

test('4. Repeated V2 passes deepen gradually without approaching opacity too quickly', () => {
  const stroke = {
    tool: 'watercolor', width: 17, opacity: 0.18,
    points: [{ x: 0, y: 0, pressure: 0.5, t: 0, watercolorVersion: 2, watercolorSeed: 1 }]
  };
  const one = WatercolorBrushV2.estimatedSinglePassAlpha(stroke, 0);
  const two = 1 - (1 - one) * (1 - one);
  const three = 1 - Math.pow(1 - one, 3);
  assert(two > one && three > two);
  assert(two < 0.30, `Two passes should still be translucent, got ${two}`);
  assert(three < 0.40, `Three passes should not become a solid block, got ${three}`);
});

test('5. V2 feather profile has a wider, lighter outer edge and no heavy center core', () => {
  const layers = WatercolorBrushV2.LAYERS;
  assert(layers[0].width > layers[1].width && layers[1].width > layers[2].width);
  assert(layers[0].alpha < layers[1].alpha);
  assert(layers[2].alpha < layers[1].alpha, 'Center should not become a dense marker core');
});

test('6. V2 no longer subdivides each quadratic curve into many round-capped mini-lines', () => {
  const ctx = createMockCtx();
  const stroke = {
    tool: 'watercolor', width: 17, opacity: 0.18, color: '#ffd166',
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0, watercolorVersion: 2, watercolorSeed: 3 },
      { x: 20, y: 10, pressure: 0.5, t: 10 },
      { x: 40, y: 0, pressure: 0.5, t: 20 }
    ]
  };
  WatercolorBrushV2.renderWatercolorStroke(ctx, stroke);
  const curves = ctx.ops.filter(op => op.type === 'quadraticCurveTo');
  // One finalized quadratic x 3 translucent layers. Tail is straight.
  assert.strictEqual(curves.length, WatercolorBrushV2.LAYERS.length);
});

test('7. V2 texture remains deterministic', () => {
  const stroke = { tool: 'watercolor', points: [{ x: 1, y: 2, watercolorVersion: 2, watercolorSeed: 999 }] };
  assert.deepStrictEqual(
    WatercolorBrushV2.textureVariation(stroke, 8, 1),
    WatercolorBrushV2.textureVariation(JSON.parse(JSON.stringify(stroke)), 8, 1)
  );
});

test('8. V2 full replay is deterministic', () => {
  const stroke = {
    tool: 'watercolor', width: 17, opacity: 0.18, color: '#ffd166',
    points: [
      { x: 0, y: 0, pressure: 0.3, t: 0, watercolorVersion: 2, watercolorSeed: 123 },
      { x: 15, y: 8, pressure: 0.5, t: 10 },
      { x: 30, y: 15, pressure: 0.7, t: 20 },
      { x: 45, y: 10, pressure: 0.4, t: 30 }
    ]
  };
  const a = createMockCtx(); const b = createMockCtx();
  CanvasCore.renderStroke(a, stroke);
  CanvasCore.renderStroke(b, JSON.parse(JSON.stringify(stroke)));
  assert.strictEqual(JSON.stringify(a.ops), JSON.stringify(b.ops));
});

test('9. V2 incremental finalized + live tail matches full replay visible ops', () => {
  const points = [
    { x: 0, y: 0, pressure: 0.3, t: 0, watercolorVersion: 2, watercolorSeed: 77 },
    { x: 15, y: 7, pressure: 0.4, t: 10 },
    { x: 30, y: 12, pressure: 0.6, t: 20 },
    { x: 45, y: 8, pressure: 0.5, t: 30 },
    { x: 60, y: 15, pressure: 0.35, t: 40 }
  ];
  const fullStroke = { tool: 'watercolor', width: 17, opacity: 0.18, color: '#ffd166', points };
  const replay = createMockCtx();
  WatercolorBrushV2.renderWatercolorStroke(replay, fullStroke);

  const active = createMockCtx(); const scratch = createMockCtx();
  const building = { tool: 'watercolor', width: 17, opacity: 0.18, color: '#ffd166', points: [] };
  let state = { finalizedCount: 0, liveTail: null };
  for (const p of points) {
    building.points.push({ ...p });
    state = WatercolorBrushV2.renderIncrementalWatercolor(active, scratch, building, state);
  }
  const incremental = [...visibleOps(active.ops), ...visibleOps(opsAfterLastClear(scratch.ops))];
  assert.deepStrictEqual(incremental, visibleOps(replay.ops));
});

test('10. V2 active path remains O(1) through 500 points', () => {
  const stroke = { tool: 'highlighter', width: 20, opacity: 0.35, color: '#f59e0b', points: [{ x: 0, y: 0, pressure: 0.5 }] };
  WatercolorBrushV2._inputCapture.queue = [{ pressure: 0.5, t: 0, tiltX: null, tiltY: null }];
  WatercolorBrushV2.ensureActiveWatercolorStroke(stroke);
  const active = createMockCtx(); const scratch = createMockCtx();
  let state = WatercolorBrushV2.renderIncrementalWatercolor(active, scratch, stroke, { finalizedCount: 0, liveTail: null });
  let at20, at500;
  for (let i = 1; i <= 500; i++) {
    stroke.points.push({ x: i * 2, y: Math.sin(i / 12) * 10, pressure: 0.5 });
    WatercolorBrushV2._inputCapture.queue.push({ pressure: 0.5, t: i * 8, tiltX: null, tiltY: null });
    WatercolorBrushV2.ensureActiveWatercolorStroke(stroke);
    assert.strictEqual(stroke._watercolorV2LastHydratedCount, 1);
    const before = active.ops.length + scratch.ops.length;
    state = WatercolorBrushV2.renderIncrementalWatercolor(active, scratch, stroke, state);
    const delta = active.ops.length + scratch.ops.length - before;
    if (i === 20) at20 = delta;
    if (i === 500) at500 = delta;
  }
  assert.strictEqual(at20, at500);
  assert(at500 < 120, `V2 should be materially cheaper than V1, got ${at500} ops`);
  assert.strictEqual(state.finalizedCount, stroke.points.length - 2);
});

test('11. Canvas loads V1 before V2 and keeps only the existing Highlighter button', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'canvas.html'), 'utf8');
  const v1 = html.indexOf('shared/watercolor-brush-v1.js');
  const v2 = html.indexOf('shared/watercolor-brush-v2.js');
  assert(v1 >= 0 && v2 > v1, 'V1 must load before V2 so V2 can delegate historical replay');
  assert(html.includes('id="tool-highlighter"'));
  assert(!html.includes('<span class="btn-label">Watercolor</span>'));
});

console.log(`\nVerification Complete: ${passed}/${total} tests passed.`);
if (passed !== total) process.exit(1);
