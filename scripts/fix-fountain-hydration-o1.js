// One-time exact patch: make Fountain dynamic-data hydration incremental and
// strengthen Test 11 so it exercises the real ensure->hydrate->render path.
const fs = require('fs');
const path = require('path');

function patchExact(file, oldText, newText, label) {
  const full = path.join(__dirname, '..', file);
  let text = fs.readFileSync(full, 'utf8');
  if (text.includes(newText)) {
    console.log(`[O1] ${label}: already patched`);
    return false;
  }
  if (!text.includes(oldText)) {
    throw new Error(`[O1] ${label}: expected old text not found; refusing broad rewrite`);
  }
  text = text.replace(oldText, newText);
  fs.writeFileSync(full, text, 'utf8');
  console.log(`[O1] ${label}: patched`);
  return true;
}

const oldHydrate = `  function hydratePointDynamics(stroke) {
    const pts = stroke.points || [];
    for (let i = 0; i < pts.length; i++) {
      const point = pts[i];
      if (Number.isFinite(point.t)) continue;

      const sample = inputCapture.queue.length ? inputCapture.queue.shift() : null;
      const prevT = i > 0 && Number.isFinite(pts[i - 1].t) ? pts[i - 1].t : null;
      const fallbackNow = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

      point.t = sample && Number.isFinite(sample.t)
        ? sample.t
        : (prevT !== null ? prevT + 8 : fallbackNow);

      if (sample) {
        point.pressure = sample.pressure;
        if (sample.tiltX !== null) point.tiltX = sample.tiltX;
        if (sample.tiltY !== null) point.tiltY = sample.tiltY;
        if (sample.altitudeAngle !== null) point.altitudeAngle = sample.altitudeAngle;
        if (sample.azimuthAngle !== null) point.azimuthAngle = sample.azimuthAngle;
      }
    }
  }`;

const newHydrate = `  function hydratePointDynamics(stroke) {
    const pts = stroke.points || [];

    // Active strokes only grow by appending points. Keep a transient cursor on the
    // in-memory stroke so pointermove work is O(new points), never O(total history).
    // Storage.addStroke persists an explicit field subset, so these underscore fields
    // never enter durable stroke JSON.
    let start = Number.isInteger(stroke._fountainHydratedCount)
      ? stroke._fountainHydratedCount
      : 0;
    if (start < 0 || start > pts.length) start = 0;

    let hydratedThisCall = 0;
    for (let i = start; i < pts.length; i++) {
      const point = pts[i];
      // Consume exactly one captured sample per newly appended Canvas point so the
      // capture queue stays aligned even if a future Canvas point already has time data.
      const sample = inputCapture.queue.length ? inputCapture.queue.shift() : null;
      const prevT = i > 0 && Number.isFinite(pts[i - 1].t) ? pts[i - 1].t : null;

      if (!Number.isFinite(point.t)) {
        const fallbackNow = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        point.t = sample && Number.isFinite(sample.t)
          ? sample.t
          : (prevT !== null ? prevT + 8 : fallbackNow);
      }

      if (sample) {
        if (typeof sample.pressure === 'number' && sample.pressure > 0) point.pressure = sample.pressure;
        if (sample.tiltX !== null) point.tiltX = sample.tiltX;
        if (sample.tiltY !== null) point.tiltY = sample.tiltY;
        if (sample.altitudeAngle !== null) point.altitudeAngle = sample.altitudeAngle;
        if (sample.azimuthAngle !== null) point.azimuthAngle = sample.azimuthAngle;
      }
      hydratedThisCall++;
    }

    stroke._fountainHydratedCount = pts.length;
    stroke._fountainLastHydratedCount = hydratedThisCall;
    return hydratedThisCall;
  }`;

const oldTest = `test('11. Incremental work stays O(1) as stroke grows to 500 points', () => {
  const stroke = {
    tool: 'fountain_pen',
    width: 3,
    opacity: 1,
    color: '#38bdf8',
    points: [{ x: 0, y: 0, pressure: 0.5, t: 0, fountainPreset: 'expressive' }]
  };
  const active = createMockCtx();
  const scratch = createMockCtx();
  let state = { finalizedCount: 0, liveTail: null };
  let opsAt20 = null;
  let opsAt500 = null;

  for (let i = 1; i <= 500; i++) {
    stroke.points.push({
      x: i * 2,
      y: Math.sin(i / 12) * 20,
      pressure: 0.2 + (i % 7) * 0.1,
      t: i * 8
    });
    const before = active.ops.length + scratch.ops.length;
    state = FountainPenV2.renderIncrementalFountain(active, scratch, stroke, state);
    const delta = active.ops.length + scratch.ops.length - before;
    if (i === 20) opsAt20 = delta;
    if (i === 500) opsAt500 = delta;
  }

  assert.strictEqual(opsAt500, opsAt20, \`Point 500 work (\${opsAt500}) must equal point 20 (\${opsAt20})\`);
  assert(opsAt500 < 100, 'Per-point operation budget must remain constant and bounded');
  assert.strictEqual(state.finalizedCount, stroke.points.length - 2);
});`;

const newTest = `test('11. Full active path stays O(1) as stroke grows to 500 points', () => {
  const stroke = {
    tool: 'pen',
    width: 3,
    opacity: 1,
    color: '#38bdf8',
    points: [{ x: 0, y: 0, pressure: 0.5 }]
  };
  const active = createMockCtx();
  const scratch = createMockCtx();
  let state = { finalizedCount: 0, liveTail: null };
  let opsAt20 = null;
  let opsAt500 = null;

  FountainPenV2._inputCapture.queue = [{
    pressure: 0.5, t: 0, tiltX: null, tiltY: null, altitudeAngle: null, azimuthAngle: null
  }];
  assert.strictEqual(FountainPenV2.ensureActiveFountainStroke(stroke), true);
  assert.strictEqual(stroke._fountainLastHydratedCount, 1, 'Initial hydration must touch only the initial point');
  state = FountainPenV2.renderIncrementalFountain(active, scratch, stroke, state);

  for (let i = 1; i <= 500; i++) {
    const pressure = 0.2 + (i % 7) * 0.1;
    stroke.points.push({
      x: i * 2,
      y: Math.sin(i / 12) * 20,
      pressure
    });
    FountainPenV2._inputCapture.queue.push({
      pressure,
      t: i * 8,
      tiltX: null,
      tiltY: null,
      altitudeAngle: null,
      azimuthAngle: null
    });

    assert.strictEqual(FountainPenV2.ensureActiveFountainStroke(stroke), true);
    assert.strictEqual(
      stroke._fountainLastHydratedCount,
      1,
      \`Hydration at point \${i} must process only the newly appended point\`
    );
    assert.strictEqual(stroke._fountainHydratedCount, stroke.points.length);

    const before = active.ops.length + scratch.ops.length;
    state = FountainPenV2.renderIncrementalFountain(active, scratch, stroke, state);
    const delta = active.ops.length + scratch.ops.length - before;
    if (i === 20) opsAt20 = delta;
    if (i === 500) opsAt500 = delta;
  }

  assert.strictEqual(opsAt500, opsAt20, \`Point 500 render work (\${opsAt500}) must equal point 20 (\${opsAt20})\`);
  assert(opsAt500 < 100, 'Per-point render operation budget must remain constant and bounded');
  assert.strictEqual(state.finalizedCount, stroke.points.length - 2);
  assert.strictEqual(FountainPenV2._inputCapture.queue.length, 0, 'Captured sample queue must remain aligned/drained');
});`;

patchExact('shared/fountain-pen-v2.js', oldHydrate, newHydrate, 'incremental hydration cursor');
patchExact('tests/verify-fountain-v2.js', oldTest, newTest, 'real active-path O(1) regression test');
