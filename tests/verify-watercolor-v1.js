// tests/verify-watercolor-v1.js
// Deterministic verification for Watercolor Brush V1 behind the Highlighter button.
// Visual similarity to Apple Freeform Watercolor still requires human side-by-side acceptance.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CanvasCore } = require('../shared/canvas-core.js');

function createMockCtx() {
  const ops = [];
  let _lineWidth = 1;
  let _strokeStyle = '';
  let _fillStyle = '';
  let _globalAlpha = 1;
  let _globalCompositeOperation = 'source-over';
  let _lineCap = '';
  let _lineJoin = '';

  return {
    ops,
    save() { ops.push({ type: 'save' }); },
    restore() { ops.push({ type: 'restore' }); },
    beginPath() { ops.push({ type: 'beginPath' }); },
    moveTo(x, y) { ops.push({ type: 'moveTo', x, y }); },
    lineTo(x, y) { ops.push({ type: 'lineTo', x, y }); },
    quadraticCurveTo(cx, cy, x, y) { ops.push({ type: 'quadraticCurveTo', cx, cy, x, y }); },
    arc(x, y, r, a0, a1) { ops.push({ type: 'arc', x, y, r, a0, a1 }); },
    stroke() { ops.push({ type: 'stroke', alpha: _globalAlpha, width: _lineWidth }); },
    fill() { ops.push({ type: 'fill', alpha: _globalAlpha }); },
    clearRect(x, y, width, height) { ops.push({ type: 'clearRect', x, y, width, height }); },
    set lineWidth(v) { _lineWidth = v; ops.push({ type: 'lineWidth', value: v }); },
    get lineWidth() { return _lineWidth; },
    set strokeStyle(v) { _strokeStyle = v; },
    get strokeStyle() { return _strokeStyle; },
    set fillStyle(v) { _fillStyle = v; },
    get fillStyle() { return _fillStyle; },
    set globalAlpha(v) { _globalAlpha = v; ops.push({ type: 'globalAlpha', value: v }); },
    get globalAlpha() { return _globalAlpha; },
    set globalCompositeOperation(v) { _globalCompositeOperation = v; },
    get globalCompositeOperation() { return _globalCompositeOperation; },
    set lineCap(v) { _lineCap = v; },
    get lineCap() { return _lineCap; },
    set lineJoin(v) { _lineJoin = v; },
    get lineJoin() { return _lineJoin; }
  };
}

function opsAfterLastClear(ops) {
  let idx = -1;
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type === 'clearRect') idx = i;
  }
  return ops.slice(idx + 1);
}

function visibleOps(ops) {
  return ops.filter(op => ['moveTo', 'lineTo', 'lineWidth', 'stroke', 'arc', 'fill'].includes(op.type));
}

// Capture legacy Highlighter output before expressive brush patches are installed.
const legacyHighlighter = {
  tool: 'highlighter',
  width: 20,
  opacity: 0.35,
  color: '#f59e0b',
  points: [
    { x: 0, y: 0, pressure: 0.2 },
    { x: 20, y: 8, pressure: 0.5 },
    { x: 40, y: 0, pressure: 0.8 },
    { x: 60, y: 10, pressure: 0.5 }
  ]
};
const legacyBeforeCtx = createMockCtx();
CanvasCore.renderStroke(legacyBeforeCtx, legacyHighlighter);
const legacyBefore = JSON.stringify(legacyBeforeCtx.ops);

// Browser load order: CanvasCore -> Fountain -> Watercolor -> canvas.js
require('../shared/fountain-pen-v2.js');
const { WatercolorBrushV1 } = require('../shared/watercolor-brush-v1.js');

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('========================================');
console.log('🖌 Watercolor Brush V1 Verification');
console.log('========================================');

test('1. Historical tool:highlighter replay remains unchanged', () => {
  const afterCtx = createMockCtx();
  CanvasCore.renderStroke(afterCtx, legacyHighlighter);
  assert.strictEqual(JSON.stringify(afterCtx.ops), legacyBefore);
});

test('2. Layer profile creates a feathered outer wash rather than one hard marker edge', () => {
  const widths = WatercolorBrushV1.LAYERS.map(x => x.width);
  assert(widths[0] > widths[1] && widths[1] > widths[2] && widths[2] > widths[3] && widths[3] > widths[4]);
  assert(WatercolorBrushV1.LAYERS[0].alpha < WatercolorBrushV1.LAYERS[3].alpha, 'Outer wash must be lighter than inner pigment');
});

test('3. Repeated passes mathematically deepen pigment', () => {
  const onePass = WatercolorBrushV1.combinedAlpha([0.04, 0.05, 0.06, 0.08, 0.04]);
  const twoPass = WatercolorBrushV1.combinedAlpha([0.04, 0.05, 0.06, 0.08, 0.04, 0.04, 0.05, 0.06, 0.08, 0.04]);
  assert(twoPass > onePass, `${twoPass} must be darker than ${onePass}`);
  assert(twoPass < 1, 'Watercolor overlap must remain translucent');
});

test('4. Pressure changes wash width without becoming a calligraphy pen', () => {
  const light = WatercolorBrushV1.pressureWidthFactor(0.1);
  const normal = WatercolorBrushV1.pressureWidthFactor(0.5);
  const firm = WatercolorBrushV1.pressureWidthFactor(1.0);
  assert(light < normal && normal < firm);
  assert(firm / light < 1.6, 'Highlighter width response should remain moderate');
});

test('5. Slow movement deposits more pigment than fast movement', () => {
  const prev = { x: 0, y: 0, t: 0 };
  const slow = { x: 10, y: 0, t: 35 };
  const fast = { x: 10, y: 0, t: 2 };
  assert(WatercolorBrushV1.wetnessFactor(prev, slow) > WatercolorBrushV1.wetnessFactor(prev, fast));
});

test('6. Organic texture is deterministic for the same persisted seed/segment', () => {
  const stroke = {
    tool: 'watercolor',
    width: 20,
    points: [{ x: 2, y: 3, watercolorSeed: 123456 }]
  };
  const a = WatercolorBrushV1.textureVariation(stroke, 17, 2);
  const b = WatercolorBrushV1.textureVariation(JSON.parse(JSON.stringify(stroke)), 17, 2);
  const c = WatercolorBrushV1.textureVariation(stroke, 18, 2);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
});

test('7. New active Highlighter upgrades to persistent Watercolor semantics', () => {
  WatercolorBrushV1._inputCapture.queue = [];
  const stroke = {
    tool: 'highlighter',
    width: 20,
    opacity: 0.35,
    color: '#f59e0b',
    points: [{ x: 4, y: 7, pressure: 0.5 }]
  };
  assert.strictEqual(WatercolorBrushV1.ensureActiveWatercolorStroke(stroke), true);
  assert.strictEqual(stroke.tool, 'watercolor');
  assert.strictEqual(stroke.brushType, 'watercolor');
  assert.strictEqual(stroke.brushVersion, 1);
  assert.strictEqual(stroke.points[0].watercolorPreset, WatercolorBrushV1.PRESET_ID);
  assert(Number.isInteger(stroke.points[0].watercolorSeed));
  assert(Number.isFinite(stroke.points[0].t));
});

test('8. Captured pressure/time data hydrates only new points', () => {
  WatercolorBrushV1._inputCapture.queue = [{ pressure: 0.72, t: 100, tiltX: 10, tiltY: -8 }];
  const stroke = {
    tool: 'highlighter',
    width: 20,
    points: [{ x: 1, y: 1, pressure: 0.5 }]
  };
  WatercolorBrushV1.ensureActiveWatercolorStroke(stroke);
  assert.strictEqual(stroke.points[0].pressure, 0.72);
  assert.strictEqual(stroke.points[0].t, 100);
  assert.strictEqual(stroke._watercolorLastHydratedCount, 1);
  WatercolorBrushV1.ensureActiveWatercolorStroke(stroke);
  assert.strictEqual(stroke._watercolorLastHydratedCount, 0, 'Second pass must not rescan hydrated history');
});

test('9. Full Watercolor replay is deterministic', () => {
  const stroke = {
    tool: 'watercolor',
    width: 20,
    opacity: 0.35,
    color: '#f59e0b',
    points: [
      { x: 0, y: 0, pressure: 0.3, t: 0, watercolorSeed: 424242, watercolorPreset: WatercolorBrushV1.PRESET_ID },
      { x: 15, y: 6, pressure: 0.5, t: 10 },
      { x: 30, y: 12, pressure: 0.8, t: 20 },
      { x: 45, y: 7, pressure: 0.6, t: 30 },
      { x: 60, y: 14, pressure: 0.4, t: 40 }
    ]
  };
  const a = createMockCtx();
  const b = createMockCtx();
  CanvasCore.renderStroke(a, stroke);
  CanvasCore.renderStroke(b, JSON.parse(JSON.stringify(stroke)));
  assert.strictEqual(JSON.stringify(a.ops), JSON.stringify(b.ops));
});

test('10. Incremental finalized + live tail matches full replay visible operations', () => {
  const points = [
    { x: 0, y: 0, pressure: 0.3, t: 0, watercolorSeed: 98765, watercolorPreset: WatercolorBrushV1.PRESET_ID },
    { x: 15, y: 8, pressure: 0.4, t: 10 },
    { x: 30, y: 15, pressure: 0.7, t: 20 },
    { x: 45, y: 10, pressure: 0.6, t: 30 },
    { x: 60, y: 18, pressure: 0.35, t: 40 }
  ];
  const fullStroke = { tool: 'watercolor', width: 20, opacity: 0.35, color: '#f59e0b', points };
  const replay = createMockCtx();
  WatercolorBrushV1.renderWatercolorStroke(replay, fullStroke);

  const active = createMockCtx();
  const scratch = createMockCtx();
  const building = { tool: 'watercolor', width: 20, opacity: 0.35, color: '#f59e0b', points: [] };
  let state = { finalizedCount: 0, liveTail: null };
  for (const point of points) {
    building.points.push({ ...point });
    state = WatercolorBrushV1.renderIncrementalWatercolor(active, scratch, building, state);
  }

  const incrementalVisible = [
    ...visibleOps(active.ops),
    ...visibleOps(opsAfterLastClear(scratch.ops))
  ];
  assert.deepStrictEqual(incrementalVisible, visibleOps(replay.ops));
  assert.strictEqual(state.finalizedCount, points.length - 2);
});

test('11. Full active Watercolor path remains O(1) through 500 appended points', () => {
  const stroke = {
    tool: 'highlighter',
    width: 20,
    opacity: 0.35,
    color: '#f59e0b',
    points: [{ x: 0, y: 0, pressure: 0.5 }]
  };
  WatercolorBrushV1._inputCapture.queue = [{ pressure: 0.5, t: 0, tiltX: null, tiltY: null }];
  WatercolorBrushV1.ensureActiveWatercolorStroke(stroke);

  const active = createMockCtx();
  const scratch = createMockCtx();
  let state = WatercolorBrushV1.renderIncrementalWatercolor(active, scratch, stroke, { finalizedCount: 0, liveTail: null });
  let opsAt20 = null;
  let opsAt500 = null;

  for (let i = 1; i <= 500; i++) {
    const pressure = 0.25 + (i % 6) * 0.1;
    stroke.points.push({ x: i * 2, y: Math.sin(i / 11) * 20, pressure });
    WatercolorBrushV1._inputCapture.queue.push({ pressure, t: i * 8, tiltX: null, tiltY: null });
    WatercolorBrushV1.ensureActiveWatercolorStroke(stroke);
    assert.strictEqual(stroke._watercolorLastHydratedCount, 1);

    const before = active.ops.length + scratch.ops.length;
    state = WatercolorBrushV1.renderIncrementalWatercolor(active, scratch, stroke, state);
    const delta = active.ops.length + scratch.ops.length - before;
    if (i === 20) opsAt20 = delta;
    if (i === 500) opsAt500 = delta;
  }

  assert.strictEqual(opsAt500, opsAt20);
  assert(opsAt500 < 400, `Per-point Watercolor work must remain bounded, got ${opsAt500}`);
  assert.strictEqual(stroke._watercolorHydratedCount, stroke.points.length);
  assert.strictEqual(WatercolorBrushV1._inputCapture.queue.length, 0);
  assert.strictEqual(state.finalizedCount, stroke.points.length - 2);
});

test('12. Toolbar remains exactly Pen + Highlighter semantics and loads Watercolor engine', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'canvas.html'), 'utf8');
  assert(html.includes('id="tool-pen"'));
  assert(html.includes('<span class="btn-label">Pen</span>'));
  assert(html.includes('id="tool-highlighter"'));
  assert(html.includes('<span class="btn-label">Highlighter</span>'));
  assert(html.includes('shared/fountain-pen-v2.js'));
  assert(html.includes('shared/watercolor-brush-v1.js'));
  assert(!html.includes('<span class="btn-label">Watercolor</span>'), 'Do not add a separate Watercolor toolbar button');
});

console.log(`\nVerification Complete: ${passed}/${total} tests passed.`);
if (passed !== total) process.exit(1);
