// shared/fountain-pen-v3.js
// Expressive Fountain Pen V3 (Calligraphic / Fountain Pen) layered over CanvasCore.
// Goals:
// 1. Strong thick/thin contrast (hairline to rich swell)
// 2. True start taper (sharp pointed entry)
// 3. True end / pen-lift taper (sharp pointed exit)
// 4. Pressure + velocity width fusion (fast motion becomes finer, slow curves fuller)
// 5. Directional nib / calligraphic character (chisel angle modulation)
// 6. Elegant loops and curves (smooth width continuity, no tubular sausages)
// 7. Deterministic full replay parity with O(1) low-latency incremental active rendering.
// 8. Strict backward compatibility with legacy Pen, Fountain Pen V1/V2, and Transparent Marker.

const FountainPenV3 = (() => {
  const core = typeof CanvasCore !== 'undefined'
    ? CanvasCore
    : (typeof require !== 'undefined' ? require('./canvas-core.js').CanvasCore : null);

  if (!core) {
    throw new Error('FountainPenV3 requires CanvasCore');
  }

  const BRUSH_VERSION = 3;
  const STORAGE_KEY = 'dm_fountain_preset_v3';

  const PRESETS = Object.freeze({
    expressive: Object.freeze({
      id: 'expressive',
      label: 'Expressive (Default)',
      lowGamma: 1.50,
      highGamma: 0.72,
      minFactor: 0.16,
      maxFactor: 2.55,
      velocityInfluence: 0.28,
      nibInfluence: 0.32,
      tiltInfluence: 0.22
    }),
    calligraphy: Object.freeze({
      id: 'calligraphy',
      label: 'Calligraphy Nib',
      lowGamma: 1.75,
      highGamma: 0.64,
      minFactor: 0.12,
      maxFactor: 2.85,
      velocityInfluence: 0.34,
      nibInfluence: 0.46,
      tiltInfluence: 0.28
    }),
    balanced: Object.freeze({
      id: 'balanced',
      label: 'Balanced',
      lowGamma: 1.25,
      highGamma: 0.80,
      minFactor: 0.20,
      maxFactor: 2.25,
      velocityInfluence: 0.20,
      nibInfluence: 0.22,
      tiltInfluence: 0.18
    })
  });

  const DEFAULT_PRESET = 'expressive';

  const inputCapture = {
    activePointerId: null,
    queue: []
  };

  // Preserve previously installed renderers (Legacy, Fountain Pen V1/V2, Watercolor, Marker)
  const previousRenderStroke = core.renderStroke.bind(core);
  const previousRenderIncrementalStroke = core.renderIncrementalStroke.bind(core);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function finiteOrNull(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  function currentPresetId() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('dm_fountain_preset_v1');
      if (stored && PRESETS[stored]) return stored;
    }
    return DEFAULT_PRESET;
  }

  function getPreset(id) {
    return PRESETS[id] || PRESETS[DEFAULT_PRESET];
  }

  function fountainVersion(stroke) {
    if (!stroke) return 0;
    if (Number.isFinite(stroke.brushVersion) && (stroke.brushType === 'fountain_pen' || stroke.tool === 'fountain_pen')) {
      return stroke.brushVersion;
    }
    const first = stroke.points && stroke.points[0];
    if (first && Number.isFinite(first.brushVersion)) return first.brushVersion;
    if (first && Number.isFinite(first.fountainVersion)) return first.fountainVersion;
    return (stroke.tool === 'fountain_pen' || stroke.brushType === 'fountain_pen') ? 2 : 0;
  }

  function isFountainV3Stroke(stroke) {
    return !!stroke &&
      (stroke.tool === 'fountain_pen' || stroke.brushType === 'fountain_pen') &&
      fountainVersion(stroke) >= BRUSH_VERSION;
  }

  // 1. Nonlinear high-contrast pressure curve: fine hairline on light touch, rich swell on firm
  function pressureFactor(pressure, preset) {
    const p = clamp(typeof pressure === 'number' && pressure > 0 ? pressure : 0.5, 0.01, 1.0);
    if (p <= 0.5) {
      const u = p / 0.5;
      return preset.minFactor + (1.0 - preset.minFactor) * Math.pow(u, preset.lowGamma);
    }
    const u = (p - 0.5) / 0.5;
    return 1.0 + (preset.maxFactor - 1.0) * Math.pow(u, preset.highGamma);
  }

  // 2. Velocity calculation and modulation
  function pointSpeed(prev, point) {
    if (!prev || !point) return null;
    if (!Number.isFinite(prev.t) || !Number.isFinite(point.t)) return null;
    const dt = point.t - prev.t;
    if (!(dt > 0)) return null;
    return Math.hypot(point.x - prev.x, point.y - prev.y) / dt;
  }

  function velocityFactor(prev, point, preset) {
    const speed = pointSpeed(prev, point);
    if (speed === null) return 1.0;
    // Normalized writing speed: 0.10 px/ms (slow/deliberate) to 1.40 px/ms (fast flick)
    const normalized = clamp((speed - 0.10) / 1.30, 0, 1);
    // Faster movement thins the stroke down by up to velocityInfluence
    return 1.0 - preset.velocityInfluence * normalized;
  }

  // 3. Directional nib factor (Chisel / Calligraphic angle modulation)
  const FIXED_NIB_ANGLE = 0.70; // ~40 degrees italic calligraphy slant

  function strokeNibFactor(prev, point, preset) {
    if (!prev || !point) return 1.0;
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return 1.0;

    let nib = FIXED_NIB_ANGLE;
    if (Number.isFinite(point.azimuthAngle)) {
      nib = point.azimuthAngle;
    } else if (Number.isFinite(point.tiltX) || Number.isFinite(point.tiltY)) {
      const tx = Number.isFinite(point.tiltX) ? point.tiltX : 0;
      const ty = Number.isFinite(point.tiltY) ? point.tiltY : 0;
      if (tx !== 0 || ty !== 0) nib = Math.atan2(ty, tx);
    }

    const strokeAngle = Math.atan2(dy, dx);
    const angleDiff = Math.abs(Math.sin(strokeAngle - nib)); // 0 when parallel to nib, 1 when perpendicular
    const baseScale = 1.0 - (preset.nibInfluence * 0.5);
    return baseScale + preset.nibInfluence * angleDiff;
  }

  // 4. Entry Taper (sharp pointed start)
  function startTaperFactor(index) {
    if (index <= 0) return 0.12;
    if (index === 1) return 0.42;
    if (index === 2) return 0.76;
    if (index === 3) return 0.94;
    return 1.0;
  }

  // 5. Exit Taper (sharp pointed finish on completed/replayed strokes)
  function exitTaperFactor(index, totalCount) {
    if (totalCount < 4) return 1.0;
    const fromEnd = totalCount - 1 - index;
    if (fromEnd <= 0) return 0.12;
    if (fromEnd === 1) return 0.46;
    if (fromEnd === 2) return 0.82;
    return 1.0;
  }

  function resolvePresetFromStroke(stroke) {
    const first = stroke && stroke.points && stroke.points[0];
    const persisted = stroke && stroke.brushParams && stroke.brushParams.preset;
    const pointPersisted = first && first.fountainPreset;
    return getPreset(persisted || pointPersisted || DEFAULT_PRESET);
  }

  function computeRawWidth(stroke, index, totalPoints = null) {
    const pts = stroke.points || [];
    const point = pts[index];
    if (!point) return stroke.width || 3;
    const prev = index > 0 ? pts[index - 1] : null;
    const baseWidth = stroke.width || 3;
    const preset = resolvePresetFromStroke(stroke);

    const p = pressureFactor(point.pressure, preset);
    const v = velocityFactor(prev, point, preset);
    const n = strokeNibFactor(prev, point, preset);
    const start = startTaperFactor(index);
    const exit = totalPoints !== null ? exitTaperFactor(index, totalPoints) : 1.0;

    const combined = baseWidth * p * v * n * start * exit;
    return clamp(combined, Math.max(0.35, baseWidth * 0.12), baseWidth * 3.2);
  }

  function computePointWidth(stroke, index, totalPoints = null) {
    const raw = computeRawWidth(stroke, index, totalPoints);
    if (index <= 0) return raw;
    const prevRaw = computeRawWidth(stroke, index - 1, totalPoints);
    // Smooth width transitions to avoid sudden diameter steps across sampling points
    return raw * 0.78 + prevRaw * 0.22;
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function midpointWidth(stroke, i, j, totalPoints = null) {
    return (computePointWidth(stroke, i, totalPoints) + computePointWidth(stroke, j, totalPoints)) / 2;
  }

  function evalQuadratic(from, cp, to, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * from.x + 2 * mt * t * cp.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * cp.y + t * t * to.y
    };
  }

  function drawVariableLine(ctx, from, to, fromWidth, toWidth, steps = 5) {
    let prev = from;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const next = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      };
      const w0 = fromWidth + (toWidth - fromWidth) * ((i - 1) / steps);
      const w1 = fromWidth + (toWidth - fromWidth) * t;
      core.drawLineSegment(ctx, prev, next, (w0 + w1) / 2);
      prev = next;
    }
  }

  function drawVariableQuadratic(ctx, from, cp, to, fromWidth, toWidth, steps = 6) {
    let prev = from;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const next = evalQuadratic(from, cp, to, t);
      const w0 = fromWidth + (toWidth - fromWidth) * ((i - 1) / steps);
      const w1 = fromWidth + (toWidth - fromWidth) * t;
      core.drawLineSegment(ctx, prev, next, (w0 + w1) / 2);
      prev = next;
    }
  }

  function configureContext(ctx, stroke) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color || '#0f172a';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = typeof stroke.opacity === 'number' ? stroke.opacity : 1.0;
  }

  function tipWidth(stroke) {
    const baseWidth = stroke.width || 3;
    const lastIdx = stroke.points.length - 1;
    const liveWidth = computePointWidth(stroke, Math.max(0, lastIdx));
    return Math.max(0.30, Math.min(baseWidth * 0.18, liveWidth * 0.16));
  }

  function drawFinalizedCurve(ctx, stroke, j) {
    const pts = stroke.points;
    if (j === 0) {
      const to = midpoint(pts[1], pts[2]);
      drawVariableQuadratic(
        ctx,
        pts[0],
        pts[1],
        to,
        computePointWidth(stroke, 0),
        midpointWidth(stroke, 1, 2)
      );
      return;
    }

    const from = midpoint(pts[j], pts[j + 1]);
    const cp = pts[j + 1];
    const to = midpoint(pts[j + 1], pts[j + 2]);
    drawVariableQuadratic(
      ctx,
      from,
      cp,
      to,
      midpointWidth(stroke, j, j + 1),
      midpointWidth(stroke, j + 1, j + 2)
    );
  }

  function drawLiveTail(scratchCtx, stroke) {
    const pts = stroke.points;
    const count = pts.length;
    if (count <= 0) return null;

    if (count === 1) {
      const w = computePointWidth(stroke, 0);
      scratchCtx.beginPath();
      scratchCtx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      scratchCtx.fill();
      return { type: 'fountain_dot', to: { x: pts[0].x, y: pts[0].y }, width: w };
    }

    if (count === 2) {
      const w0 = computePointWidth(stroke, 0);
      const w1 = tipWidth(stroke);
      drawVariableLine(scratchCtx, pts[0], pts[1], w0, w1);
      return {
        type: 'fountain_tail',
        from: { x: pts[0].x, y: pts[0].y },
        to: { x: pts[1].x, y: pts[1].y },
        widthStart: w0,
        widthEnd: w1
      };
    }

    const lastIdx = count - 1;
    const from = midpoint(pts[lastIdx - 1], pts[lastIdx]);
    const cp = pts[lastIdx];
    const to = pts[lastIdx];
    const widthStart = midpointWidth(stroke, lastIdx - 1, lastIdx);
    const widthEnd = tipWidth(stroke);

    drawVariableQuadratic(scratchCtx, from, cp, to, widthStart, widthEnd, 6);
    return {
      type: 'fountain_tail',
      from,
      to,
      widthStart,
      widthEnd
    };
  }

  function renderFountainV3Stroke(targetCtx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    const pts = stroke.points;
    const total = pts.length;

    targetCtx.save();
    configureContext(targetCtx, stroke);

    if (total === 1) {
      const w = computePointWidth(stroke, 0, total);
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.restore();
      return;
    }

    if (total === 2) {
      const w0 = computePointWidth(stroke, 0, total);
      const w1 = computePointWidth(stroke, 1, total);
      drawVariableLine(targetCtx, pts[0], pts[1], w0, w1);
      targetCtx.restore();
      return;
    }

    // Segment 0: pts[0] -> mid(1,2)
    const mid12 = midpoint(pts[1], pts[2]);
    drawVariableQuadratic(
      targetCtx,
      pts[0],
      pts[1],
      mid12,
      computePointWidth(stroke, 0, total),
      midpointWidth(stroke, 1, 2, total)
    );

    // Intermediate segments: mid(j, j+1) -> mid(j+1, j+2)
    for (let j = 1; j <= total - 3; j++) {
      const from = midpoint(pts[j], pts[j + 1]);
      const cp = pts[j + 1];
      const to = midpoint(pts[j + 1], pts[j + 2]);
      drawVariableQuadratic(
        targetCtx,
        from,
        cp,
        to,
        midpointWidth(stroke, j, j + 1, total),
        midpointWidth(stroke, j + 1, j + 2, total)
      );
    }

    // Final segment: mid(N-2, N-1) -> pts[N-1]
    const lastIdx = total - 1;
    const fromFinal = midpoint(pts[lastIdx - 1], pts[lastIdx]);
    drawVariableQuadratic(
      targetCtx,
      fromFinal,
      pts[lastIdx],
      pts[lastIdx],
      midpointWidth(stroke, lastIdx - 1, lastIdx, total),
      computePointWidth(stroke, lastIdx, total)
    );

    targetCtx.restore();
  }

  function eventSamples(e) {
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const source = list && list.length ? list : [e];
    return source.map(ev => ({
      t: Number.isFinite(ev.timeStamp) ? ev.timeStamp : Date.now(),
      pressure: typeof ev.pressure === 'number' && ev.pressure > 0 ? ev.pressure : 0.5,
      tiltX: finiteOrNull(ev.tiltX),
      tiltY: finiteOrNull(ev.tiltY),
      altitudeAngle: finiteOrNull(ev.altitudeAngle),
      azimuthAngle: finiteOrNull(ev.azimuthAngle)
    }));
  }

  function installInputCapture() {
    if (typeof window === 'undefined' || !window.addEventListener) return;

    window.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
      if (typeof e.button === 'number' && e.button !== 0) return;
      inputCapture.activePointerId = e.pointerId;
      inputCapture.queue = eventSamples(e);
    }, true);

    window.addEventListener('pointermove', e => {
      if (e.pointerId !== inputCapture.activePointerId) return;
      if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
      if (!(e.buttons > 0 || e.pressure > 0)) return;
      inputCapture.queue.push(...eventSamples(e));
      if (inputCapture.queue.length > 512) {
        inputCapture.queue.splice(0, inputCapture.queue.length - 512);
      }
    }, true);

    const finishPointer = e => {
      if (e.pointerId === inputCapture.activePointerId) {
        inputCapture.activePointerId = null;
      }
    };
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', finishPointer, true);
  }

  function hydratePointDynamics(stroke) {
    const pts = stroke.points || [];
    let start = Number.isInteger(stroke._fountainV3HydratedCount)
      ? stroke._fountainV3HydratedCount
      : 0;
    if (start < 0 || start > pts.length) start = 0;

    let hydratedThisCall = 0;
    for (let i = start; i < pts.length; i++) {
      const point = pts[i];
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

    stroke._fountainV3HydratedCount = pts.length;
    stroke._fountainV3LastHydratedCount = hydratedThisCall;
    return hydratedThisCall;
  }

  function ensureActiveFountainV3Stroke(stroke) {
    if (!stroke) return false;

    // When the user has Pen selected, upgrade new active strokes to Fountain Pen V3
    if (stroke.tool === 'pen' && !stroke.brushType) {
      const presetId = currentPresetId();
      stroke.tool = 'fountain_pen';
      stroke.brushType = 'fountain_pen';
      stroke.brushVersion = BRUSH_VERSION;
      stroke.brushParams = { preset: presetId, version: BRUSH_VERSION };
      if (stroke.points && stroke.points[0]) {
        stroke.points[0].fountainPreset = presetId;
        stroke.points[0].brushVersion = BRUSH_VERSION;
      }
    }

    if (stroke.tool !== 'fountain_pen' && stroke.brushType !== 'fountain_pen') return false;

    if (!stroke.brushType) stroke.brushType = 'fountain_pen';
    if (!stroke.brushVersion || stroke.brushVersion < BRUSH_VERSION) stroke.brushVersion = BRUSH_VERSION;
    if (!stroke.brushParams) {
      const firstPreset = stroke.points && stroke.points[0] && stroke.points[0].fountainPreset;
      stroke.brushParams = { preset: firstPreset || DEFAULT_PRESET, version: BRUSH_VERSION };
    }
    hydratePointDynamics(stroke);
    return true;
  }

  function renderIncrementalFountainV3(activeCtx, scratchCtx, stroke, state = { finalizedCount: 0, liveTail: null }) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return state;

    const pts = stroke.points;
    let finalizedCount = (state && state.finalizedCount) || 0;
    let liveTail = null;

    if (scratchCtx) {
      scratchCtx.clearRect(-100000, -100000, 200000, 200000);
      scratchCtx.save();
      configureContext(scratchCtx, stroke);
    }

    if (pts.length === 1) {
      const w = computePointWidth(stroke, 0);
      if (scratchCtx) {
        scratchCtx.beginPath();
        scratchCtx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
        scratchCtx.fill();
      }
      liveTail = { type: 'fountain_dot', to: { x: pts[0].x, y: pts[0].y }, width: w };
    } else if (pts.length === 2) {
      if (scratchCtx) liveTail = drawLiveTail(scratchCtx, stroke);
      else liveTail = {
        type: 'fountain_tail',
        from: { x: pts[0].x, y: pts[0].y },
        to: { x: pts[1].x, y: pts[1].y },
        widthStart: computePointWidth(stroke, 0),
        widthEnd: tipWidth(stroke)
      };
    } else {
      if (activeCtx) {
        activeCtx.save();
        configureContext(activeCtx, stroke);
        while (finalizedCount <= pts.length - 3) {
          drawFinalizedCurve(activeCtx, stroke, finalizedCount);
          finalizedCount++;
        }
        activeCtx.restore();
      } else {
        finalizedCount = pts.length - 2;
      }

      if (scratchCtx) liveTail = drawLiveTail(scratchCtx, stroke);
      else {
        const lastIdx = pts.length - 1;
        const from = midpoint(pts[lastIdx - 1], pts[lastIdx]);
        liveTail = {
          type: 'fountain_tail',
          from,
          to: { x: pts[lastIdx].x, y: pts[lastIdx].y },
          widthStart: midpointWidth(stroke, lastIdx - 1, lastIdx),
          widthEnd: tipWidth(stroke)
        };
      }
    }

    if (scratchCtx) scratchCtx.restore();
    return { finalizedCount, liveTail };
  }

  function installRendererPatch() {
    core.renderStroke = function patchedRenderStroke(targetCtx, stroke) {
      if (isFountainV3Stroke(stroke)) {
        renderFountainV3Stroke(targetCtx, stroke);
        return;
      }
      previousRenderStroke(targetCtx, stroke);
    };

    core.renderIncrementalStroke = function patchedRenderIncremental(activeCtx, scratchCtx, stroke, state) {
      if (ensureActiveFountainV3Stroke(stroke)) {
        return renderIncrementalFountainV3(activeCtx, scratchCtx, stroke, state);
      }
      return previousRenderIncrementalStroke(activeCtx, scratchCtx, stroke, state);
    };
  }

  installInputCapture();
  installRendererPatch();

  return {
    BRUSH_VERSION,
    PRESETS,
    DEFAULT_PRESET,
    pressureFactor,
    pointSpeed,
    velocityFactor,
    strokeNibFactor,
    startTaperFactor,
    exitTaperFactor,
    computeRawWidth,
    computePointWidth,
    renderFountainV3Stroke,
    renderIncrementalFountainV3,
    ensureActiveFountainV3Stroke,
    hydratePointDynamics,
    drawVariableLine,
    drawVariableQuadratic,
    tipWidth,
    isFountainV3Stroke,
    _inputCapture: inputCapture
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FountainPenV3 };
}
