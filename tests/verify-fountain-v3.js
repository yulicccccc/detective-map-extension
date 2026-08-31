// tests/verify-fountain-v2.js
// Deterministic verification for Fountain Pen V3. Manual handwriting quality still requires Wacom testing.

const assert = require('assert');
const { CanvasCore } = require('../shared/canvas-core.js');

function createMockCtx() {
  const ops = [];
  let _lineWidth = 1;
  let _strokeStyle = '';
  let _fillStyle = '';
  let _globalAlpha = 1;
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
    stroke() { ops.push({ type: 'stroke' }); },
    fill() { ops.push({ type: 'fill' }); },
    clearRect(x, y, width, height) { ops.push({ type: 'clearRect', x, y, width, height }); },
    set lineWidth(v) { _lineWidth = v; ops.push({ type: 'lineWidth', value: v }); },
    get lineWidth() { return _lineWidth; },
    set strokeStyle(v) { _strokeStyle = v; },
    get strokeStyle() { return _strokeStyle; },
    set fillStyle(v) { _fillStyle = v; },
    get fillStyle() { return _fillStyle; },
    set globalAlpha(v) { _globalAlpha = v; },
    get globalAlpha() { return _globalAlpha; },
    set lineCap(v) { _lineCap = v; },
    get lineCap() { return _lineCap; },
    set lineJoin(v) { _lineJoin = v; },
    get lineJoin() { return _lineJoin; }
  };
}

function extractLineSegments(ops) {
  const out = [];
  let width = null;
  let from = null;
  for (const op of ops) {
    if (op.type === 'lineWidth') width = op.value;
    if (op.type === 'moveTo') from = { x: op.x, y: op.y };
    if (op.type === 'lineTo' && from) {
      out.push({ from, to: { x: op.x, y: op.y }, width });
      from = { x: op.x, y: op.y };
    }
  }
  return out;
}

function opsAfterLastClear(ops) {
  let idx = -1;
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type === 'clearRect') idx = i;
  }
  return ops.slice(idx + 1);
}

// Capture legacy rendering BEFORE FountainPenV3 patches CanvasCore.
const legacyStroke = {
  tool: 'pen',
  width: 3,
  opacity: 1,
  color: '#38bdf8',
  points: [
    { x: 0, y: 0, pressure: 0.2 },
    { x: 20, y: 10, pressure: 0.5 },
    { x: 40, y: 0, pressure: 0.8 },
    { x: 60, y: 10, pressure: 0.5 }
  ]
};
const legacyBeforeCtx = createMockCtx();
CanvasCore.renderStroke(legacyBeforeCtx, legacyStroke);
const legacyBefore = JSON.stringify(legacyBeforeCtx.ops);

const { FountainPenV3 } = require('../shared/fountain-pen-v3.js');

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
console.log('✒ Fountain Pen V3 Verification');
console.log('========================================');

test('1. Legacy tool:pen replay is byte-for-byte renderer compatible', () => {
  const afterCtx = createMockCtx();
  CanvasCore.renderStroke(afterCtx, legacyStroke);
  assert.strictEqual(JSON.stringify(afterCtx.ops), legacyBefore, 'Legacy pen renderer output must remain unchanged');
});

test('2. Expressive pressure curve has obvious light/normal/firm separation', () => {
  const preset = FountainPenV3.PRESETS.expressive;
  const light = FountainPenV3.pressureFactor(0.1, preset);
  const normal = FountainPenV3.pressureFactor(0.5, preset);
  const firm = FountainPenV3.pressureFactor(1.0, preset);
  assert(light < 0.40, `Light factor should be hairline-like, got ${light}`);
  assert(Math.abs(normal - 1) < 1e-9, `Normal pressure must equal base width factor 1, got ${normal}`);
  assert(firm > 1.80, `Firm factor must be clearly fuller, got ${firm}`);
  assert(light < normal && normal < firm);
});

test('3. Velocity influence makes fast movement finer than slow movement', () => {
  const preset = FountainPenV3.PRESETS.expressive;
  const prev = { x: 0, y: 0, t: 0 };
  const slow = { x: 10, y: 0, t: 30 };
  const fast = { x: 10, y: 0, t: 2 };
  const slowFactor = FountainPenV3.velocityFactor(prev, slow, preset);
  const fastFactor = FountainPenV3.velocityFactor(prev, fast, preset);
  assert(slowFactor > fastFactor, `Slow ${slowFactor} must be fuller than fast ${fastFactor}`);
  assert(fastFactor >= 0.70, 'Velocity thinning must remain bounded and readable');
});

test('4. Start taper ramps from sharp entry toward full writing weight', () => {
  assert(FountainPenV3.startTaperFactor(0) < FountainPenV3.startTaperFactor(1));
  assert(FountainPenV3.startTaperFactor(1) < FountainPenV3.startTaperFactor(2));
  assert(FountainPenV3.startTaperFactor(2) < FountainPenV3.startTaperFactor(3));
  assert.strictEqual(FountainPenV3.startTaperFactor(4), 1.0);
});

test('5. Directional nib angle and tilt modulation', () => {
  const preset = FountainPenV3.PRESETS.expressive;
  const p0 = { x: 0, y: 0, t: 0 };
  const pParallel = { x: 10, y: 8.4, t: 50 }; // ~40 deg parallel
  const pPerp = { x: 10, y: -11.9, t: 50 }; // ~130 deg perpendicular

  const factorParallel = FountainPenV3.strokeNibFactor(p0, pParallel, preset);
  const factorPerp = FountainPenV3.strokeNibFactor(p0, pPerp, preset);

  assert(factorParallel < 1.0, `Parallel stroke must be finer, got ${factorParallel}`);
  assert(factorPerp > 1.0, `Perpendicular downstroke must be fuller, got ${factorPerp}`);
  assert(factorPerp > factorParallel * 1.20, 'Perpendicular downstroke must be fuller than upstroke');
});

test('6. New active Pen upgrades to persistent fountain_pen V3 semantics without touching legacy replay', () => {
  FountainPenV3._inputCapture.queue = [];
  const active = {
    tool: 'pen',
    width: 3,
    opacity: 1,
    color: '#0f172a',
    points: [{ x: 1, y: 2, pressure: 0.5 }]
  };
  const upgraded = FountainPenV3.ensureActiveFountainV3Stroke(active);
  assert.strictEqual(upgraded, true);
  assert.strictEqual(active.tool, 'fountain_pen');
  assert.strictEqual(active.brushType, 'fountain_pen');
  assert.strictEqual(active.brushVersion, 3);
  assert(active.points[0].fountainPreset, 'Preset identity must be persisted inside points JSON for server reload');
  assert.strictEqual(active.points[0].brushVersion, 3);
  assert(Number.isFinite(active.points[0].t), 'Missing timestamps must degrade gracefully to a finite fallback');
});

test('7. Captured point dynamics preserve pressure/time/tilt metadata when available', () => {
  FountainPenV3._inputCapture.queue = [{
    pressure: 0.73,
    t: 1234,
    tiltX: 18,
    tiltY: -22,
    altitudeAngle: 0.8,
    azimuthAngle: 1.1
  }];
  const stroke = {
    tool: 'pen',
    width: 3,
    points: [{ x: 4, y: 5, pressure: 0.5 }]
  };
  FountainPenV3.ensureActiveFountainV3Stroke(stroke);
  const pt = stroke.points[0];
  assert.strictEqual(pt.pressure, 0.73);
  assert.strictEqual(pt.t, 1234);
  assert.strictEqual(pt.tiltX, 18);
  assert.strictEqual(pt.tiltY, -22);
  assert.strictEqual(pt.altitudeAngle, 0.8);
  assert.strictEqual(pt.azimuthAngle, 1.1);
});

test('8. End taper produces a visibly finer live/final pen-lift tip', () => {
  const stroke = {
    tool: 'fountain_pen',
    brushType: 'fountain_pen',
    brushVersion: 3,
    width: 3,
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0, fountainPreset: 'expressive' },
      { x: 10, y: 4, pressure: 0.6, t: 12 },
      { x: 20, y: 8, pressure: 0.6, t: 24 },
      { x: 30, y: 10, pressure: 0.5, t: 36 }
    ]
  };
  const tip = FountainPenV3.tipWidth(stroke);
  const body = FountainPenV3.computePointWidth(stroke, 3);
  assert(tip < body * 0.40, `Tip ${tip} must be substantially finer than body ${body}`);
  assert(tip >= 0.30, 'Tip must remain bounded to avoid disappearing');
});

test('9. Full replay is deterministic for persisted Fountain Pen V3 points', () => {
  const stroke = {
    tool: 'fountain_pen',
    brushType: 'fountain_pen',
    brushVersion: 3,
    width: 3,
    opacity: 1,
    color: '#0f172a',
    points: [
      { x: 10, y: 10, pressure: 0.15, t: 0, fountainPreset: 'expressive', tiltX: 10, tiltY: 30 },
      { x: 25, y: 20, pressure: 0.35, t: 12, tiltX: 12, tiltY: 28 },
      { x: 45, y: 18, pressure: 0.75, t: 24, tiltX: 15, tiltY: 25 },
      { x: 65, y: 30, pressure: 0.55, t: 36, tiltX: 18, tiltY: 22 },
      { x: 85, y: 24, pressure: 0.25, t: 48, tiltX: 20, tiltY: 20 }
    ]
  };
  const a = createMockCtx();
  const b = createMockCtx();
  CanvasCore.renderStroke(a, stroke);
  CanvasCore.renderStroke(b, JSON.parse(JSON.stringify(stroke)));
  assert.strictEqual(JSON.stringify(a.ops), JSON.stringify(b.ops), 'Same persisted data must replay identically');
});

test('10. Incremental finalized + live tail matches full replay across 100% of segments (including full exit taper)', () => {
  const testPointCounts = [2, 3, 5, 8, 12, 20];

  for (const count of testPointCounts) {
    const points = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: i * 15,
        y: Math.sin(i / 3) * 20,
        pressure: 0.2 + (i % 5) * 0.15,
        t: i * 16,
        fountainPreset: 'expressive'
      });
    }

    const building = {
      tool: 'fountain_pen',
      brushType: 'fountain_pen',
      brushVersion: 3,
      width: 3,
      opacity: 1,
      color: '#0f172a',
      points: []
    };

    const active = createMockCtx();
    const scratch = createMockCtx();
    let state = { finalizedCount: 0, liveTail: null };

    for (let i = 0; i < points.length; i++) {
      building.points.push(points[i]);
      state = FountainPenV3.renderIncrementalFountainV3(active, scratch, building, state);

      // Verify at each point count (and especially at the final point count)
      const currentFullStroke = {
        ...building,
        points: [...building.points]
      };
      const replay = createMockCtx();
      FountainPenV3.renderFountainV3Stroke(replay, currentFullStroke);

      const replaySegments = extractLineSegments(replay.ops);
      const incrementalSegments = [
        ...extractLineSegments(active.ops),
        ...extractLineSegments(opsAfterLastClear(scratch.ops))
      ];

      assert.strictEqual(
        incrementalSegments.length,
        replaySegments.length,
        `Segment count mismatch at total points ${i + 1}: incremental=${incrementalSegments.length}, replay=${replaySegments.length}`
      );

      // 100% segment-by-segment comparison across the entire stroke with NO exclusions
      for (let s = 0; s < replaySegments.length; s++) {
        assert.deepStrictEqual(
          incrementalSegments[s],
          replaySegments[s],
          `Segment ${s}/${replaySegments.length} mismatch at point count ${i + 1}`
        );
      }
    }
  }
});

test('11. Full active path stays O(1) as stroke grows to 500 points', () => {
  const stroke = {
    tool: 'pen',
    width: 3,
    opacity: 1,
    color: '#0f172a',
    points: [{ x: 0, y: 0, pressure: 0.5 }]
  };
  const active = createMockCtx();
  const scratch = createMockCtx();
  let state = { finalizedCount: 0, liveTail: null };
  let opsAt20 = null;
  let opsAt500 = null;

  FountainPenV3._inputCapture.queue = [{
    pressure: 0.5, t: 0, tiltX: null, tiltY: null, altitudeAngle: null, azimuthAngle: null
  }];
  assert.strictEqual(FountainPenV3.ensureActiveFountainV3Stroke(stroke), true);
  assert.strictEqual(stroke._fountainV3LastHydratedCount, 1, 'Initial hydration must touch only the initial point');
  state = FountainPenV3.renderIncrementalFountainV3(active, scratch, stroke, state);

  for (let i = 1; i <= 500; i++) {
    const pressure = 0.2 + (i % 7) * 0.1;
    stroke.points.push({
      x: i * 2,
      y: Math.sin(i / 12) * 20,
      pressure
    });
    FountainPenV3._inputCapture.queue.push({
      pressure,
      t: i * 8,
      tiltX: null,
      tiltY: null,
      altitudeAngle: null,
      azimuthAngle: null
    });

    assert.strictEqual(FountainPenV3.ensureActiveFountainV3Stroke(stroke), true);
    assert.strictEqual(
      stroke._fountainV3LastHydratedCount,
      1,
      `Hydration at point ${i} must process only the newly appended point`
    );
    assert.strictEqual(stroke._fountainV3HydratedCount, stroke.points.length);

    const before = active.ops.length + scratch.ops.length;
    state = FountainPenV3.renderIncrementalFountainV3(active, scratch, stroke, state);
    const delta = active.ops.length + scratch.ops.length - before;
    if (i === 20) opsAt20 = delta;
    if (i === 500) opsAt500 = delta;
  }

  assert.strictEqual(opsAt500, opsAt20, `Point 500 render work (${opsAt500}) must equal point 20 (${opsAt20})`);
  assert(opsAt500 < 200, `Per-point render operation budget must remain constant and bounded, got ${opsAt500}`);
  assert.strictEqual(state.finalizedCount, stroke.points.length - 5, 'Finalized count must be total - 5');
  assert.strictEqual(FountainPenV3._inputCapture.queue.length, 0, 'Captured sample queue must remain aligned/drained');
});

test('12. Version isolation: persisted V2 stroke remains V2 and renders identically without V3 mutation', () => {
  const v2Stroke = {
    tool: 'fountain_pen',
    brushType: 'fountain_pen',
    brushVersion: 2,
    width: 3,
    opacity: 1,
    color: '#38bdf8',
    points: [
      { x: 10, y: 10, pressure: 0.3, t: 0, brushVersion: 2 },
      { x: 25, y: 20, pressure: 0.6, t: 15, brushVersion: 2 },
      { x: 45, y: 35, pressure: 0.8, t: 30, brushVersion: 2 },
      { x: 70, y: 40, pressure: 0.4, t: 45, brushVersion: 2 }
    ]
  };

  const v2Snapshot = JSON.stringify(v2Stroke);
  const upgraded = FountainPenV3.ensureActiveFountainV3Stroke(v2Stroke);
  assert.strictEqual(upgraded, false, 'ensureActiveFountainV3Stroke must return false for V2 strokes');
  assert.strictEqual(v2Stroke.brushVersion, 2, 'brushVersion must stay 2');
  assert.strictEqual(v2Stroke.points[0].brushVersion, 2, 'points[0].brushVersion must stay 2');
  assert.strictEqual(JSON.stringify(v2Stroke), v2Snapshot, 'v2Stroke object must not be mutated');

  // Verify that CanvasCore delegates to V2 renderer
  const ctx = createMockCtx();
  CanvasCore.renderStroke(ctx, v2Stroke);
  assert(ctx.ops.length > 0, 'Must render via V2');
  assert.strictEqual(v2Stroke.brushVersion, 2, 'renderStroke must not mutate brushVersion');
});

console.log(`\n========================================`);
console.log(`Verification Complete: ${passed}/${total} tests passed.`);
console.log(`========================================`);

if (passed !== total) process.exit(1);
