// tests/verify-transparent-marker-v1.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CanvasCore } = require('../shared/canvas-core.js');
require('../shared/watercolor-brush-v1.js');
require('../shared/watercolor-brush-v2.js');

function mockCtx() {
  const ops = [];
  const ctx = {
    ops,
    save() { ops.push(['save']); },
    restore() { ops.push(['restore']); },
    beginPath() { ops.push(['begin']); },
    moveTo(x,y) { ops.push(['move',x,y]); },
    lineTo(x,y) { ops.push(['line',x,y]); },
    quadraticCurveTo(cx,cy,x,y) { ops.push(['quad',cx,cy,x,y]); },
    stroke() { ops.push(['stroke', ctx.lineWidth, ctx.globalAlpha, ctx.lineCap]); },
    fill() { ops.push(['fill', ctx.globalAlpha]); },
    fillRect(x,y,w,h) { ops.push(['fillRect',x,y,w,h,ctx.globalAlpha]); },
    arc(x,y,r) { ops.push(['arc',x,y,r]); },
    clearRect() { ops.push(['clear']); },
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '',
    fillStyle: '',
    globalCompositeOperation: 'source-over'
  };
  return ctx;
}

const legacyWatercolor = {
  tool: 'watercolor', brushType: 'watercolor', brushVersion: 2,
  width: 17, opacity: 0.18, color: '#ffd166',
  points: [
    {x:0,y:0,pressure:.5,watercolorVersion:2,watercolorSeed:123},
    {x:10,y:2,pressure:.5},{x:20,y:0,pressure:.5}
  ]
};
const before = mockCtx();
CanvasCore.renderStroke(before, legacyWatercolor);
const beforeOps = JSON.stringify(before.ops);

const { TransparentMarkerV1 } = require('../shared/transparent-marker-v1.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ PASS:', name); }
  catch (e) { console.error('  ✗ FAIL:', name, '\n   ', e.message); process.exitCode = 1; }
}

console.log('========================================');
console.log('🖍 Transparent Marker V1 Verification');
console.log('========================================');

test('1. Existing Watercolor V2 replay remains unchanged', () => {
  const after = mockCtx();
  CanvasCore.renderStroke(after, legacyWatercolor);
  assert.strictEqual(JSON.stringify(after.ops), beforeOps);
});

test('2. New Highlighter upgrades to transparent_marker semantics', () => {
  const s = { tool:'highlighter', width:20, opacity:.35, color:'#f0a6ca', points:[{x:0,y:0,pressure:.5}] };
  assert.strictEqual(TransparentMarkerV1.ensureActiveMarkerStroke(s), true);
  assert.strictEqual(s.tool, 'transparent_marker');
  assert.strictEqual(s.brushType, 'transparent_marker');
  assert.strictEqual(s.brushVersion, 1);
  assert.strictEqual(s.width, TransparentMarkerV1.DEFAULT_WIDTH);
  assert.strictEqual(s.opacity, TransparentMarkerV1.DEFAULT_OPACITY);
  assert.strictEqual(s.color, '#f0a6ca', 'selected pigment must be preserved');
  assert.strictEqual(s.points[0].markerVersion, 1);
});

test('3. One-pass alpha stays below readability budget', () => {
  const s = { tool:'transparent_marker', brushType:'transparent_marker', brushVersion:1, opacity:.16, points:[{x:0,y:0,pressure:.5,markerVersion:1}] };
  const alpha = TransparentMarkerV1.estimatedSinglePassAlpha(s);
  assert(alpha > 0.07 && alpha < 0.14, `single-pass alpha ${alpha} outside light marker budget`);
});

test('4. Repeated passes deepen gradually rather than starting opaque', () => {
  const s = { tool:'transparent_marker', brushType:'transparent_marker', brushVersion:1, opacity:.16, points:[{x:0,y:0,pressure:.5,markerVersion:1}] };
  const a = TransparentMarkerV1.estimatedSinglePassAlpha(s);
  const twice = 1 - Math.pow(1 - a, 2);
  const thrice = 1 - Math.pow(1 - a, 3);
  assert(a < twice && twice < thrice);
  assert(twice < 0.25, `two passes should remain translucent, got ${twice}`);
});

test('5. Pressure changes marker width only subtly', () => {
  const light = TransparentMarkerV1.pressureWidthFactor(.1);
  const firm = TransparentMarkerV1.pressureWidthFactor(1);
  assert(firm > light);
  assert(firm / light < 1.09, 'marker must stay stable rather than calligraphic');
});

test('6. Renderer uses flat marker-style caps and exactly two clean layers', () => {
  const ctx = mockCtx();
  const s = { tool:'transparent_marker', brushType:'transparent_marker', brushVersion:1, width:18, opacity:.16, color:'#ffd166', points:[{x:0,y:0,pressure:.5,markerVersion:1},{x:20,y:0,pressure:.5}] };
  TransparentMarkerV1.renderMarkerStroke(ctx, s);
  const strokes = ctx.ops.filter(op => op[0] === 'stroke');
  assert.strictEqual(strokes.length, 2);
  assert(strokes.every(op => op[3] === 'butt'), 'marker paths must use flat caps');
});

test('7. Full replay is deterministic', () => {
  const s = { tool:'transparent_marker', brushType:'transparent_marker', brushVersion:1, width:18, opacity:.16, color:'#8ee3c8', points:[{x:0,y:0,pressure:.5,markerVersion:1},{x:10,y:5,pressure:.7},{x:20,y:0,pressure:.4},{x:30,y:5,pressure:.6}] };
  const a = mockCtx(), b = mockCtx();
  TransparentMarkerV1.renderMarkerStroke(a, s);
  TransparentMarkerV1.renderMarkerStroke(b, JSON.parse(JSON.stringify(s)));
  assert.strictEqual(JSON.stringify(a.ops), JSON.stringify(b.ops));
});

test('8. Incremental renderer finalizes only newly stable segments', () => {
  const active = mockCtx(), scratch = mockCtx();
  const s = { tool:'transparent_marker', brushType:'transparent_marker', brushVersion:1, width:18, opacity:.16, color:'#a8d8ff', points:[{x:0,y:0,pressure:.5,markerVersion:1}] };
  let state = { finalizedCount:0, liveTail:null };
  state = TransparentMarkerV1.renderIncrementalMarker(active, scratch, s, state);
  for (let i=1;i<=200;i++) {
    s.points.push({x:i*2,y:Math.sin(i/10)*10,pressure:.5});
    const beforeCount = active.ops.length;
    state = TransparentMarkerV1.renderIncrementalMarker(active, scratch, s, state);
    const delta = active.ops.length - beforeCount;
    if (i > 5) assert(delta < 20, `incremental active work grew unexpectedly at ${i}: ${delta}`);
  }
  assert.strictEqual(state.finalizedCount, s.points.length - 2);
});

test('9. Color palette still maps Highlighter independently', () => {
  const source = fs.readFileSync(path.join(__dirname, '../shared/ink-color-palette.js'), 'utf8');
  assert(source.includes("highlighter: 'dm_highlighter_color_v1'"));
  assert(source.includes("if (tool === 'highlighter' || tool === 'watercolor') return 'highlighter';"));
});

test('10. Canvas loads Transparent Marker after Watercolor histories and before controller', () => {
  const html = fs.readFileSync(path.join(__dirname, '../canvas.html'), 'utf8');
  const wc = html.indexOf('shared/watercolor-brush-v2.js');
  const marker = html.indexOf('shared/transparent-marker-v1.js');
  const canvas = html.indexOf('canvas.js');
  assert(wc >= 0 && marker > wc && canvas > marker);
  assert.strictEqual((html.match(/id="tool-highlighter"/g) || []).length, 1);
});

console.log(`\nVerification Complete: ${passed}/10 tests passed.`);
if (passed !== 10) process.exit(1);
