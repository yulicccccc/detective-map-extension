// shared/fountain-pen-v2.js
// Expressive Fountain Pen V2 layered over the stable CanvasCore ink foundation.
// Goals: strong pressure response, velocity influence, start/end taper, optional tilt,
// deterministic replay, and O(1) incremental active rendering.

const FountainPenV2 = (() => {
  const core = typeof CanvasCore !== 'undefined'
    ? CanvasCore
    : (typeof require !== 'undefined' ? require('./canvas-core.js').CanvasCore : null);

  if (!core) {
    throw new Error('FountainPenV2 requires CanvasCore');
  }

  const BRUSH_VERSION = 1;
  const STORAGE_KEY = 'dm_fountain_preset_v1';

  const PRESETS = Object.freeze({
    light_touch: Object.freeze({
      id: 'light_touch',
      label: 'Light Touch',
      lowGamma: 0.72,
      highGamma: 0.92,
      minFactor: 0.24,
      maxFactor: 1.78,
      velocityInfluence: 0.16,
      tiltInfluence: 0.14
    }),
    balanced: Object.freeze({
      id: 'balanced',
      label: 'Balanced',
      lowGamma: 1.00,
      highGamma: 0.86,
      minFactor: 0.22,
      maxFactor: 1.82,
      velocityInfluence: 0.20,
      tiltInfluence: 0.16
    }),
    expressive: Object.freeze({
      id: 'expressive',
      label: 'Expressive',
      lowGamma: 1.35,
      highGamma: 0.78,
      minFactor: 0.20,
      maxFactor: 1.88,
      velocityInfluence: 0.24,
      tiltInfluence: 0.18
    })
  });

  const DEFAULT_PRESET = 'expressive';

  const inputCapture = {
    activePointerId: null,
    queue: []
  };

  const originalRenderStroke = core.renderStroke.bind(core);
  const originalRenderIncrementalStroke = core.renderIncrementalStroke.bind(core);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function finiteOrNull(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  function currentPresetId() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && PRESETS[stored]) return stored;
    }
    return DEFAULT_PRESET;
  }

  function getPreset(id) {
    return PRESETS[id] || PRESETS[DEFAULT_PRESET];
  }

  function pressureFactor(pressure, preset) {
    const p = clamp(typeof pressure === 'number' && pressure > 0 ? pressure : 0.5, 0.01, 1.0);
    if (p <= 0.5) {
      const u = p / 0.5;
      return preset.minFactor + (1 - preset.minFactor) * Math.pow(u, preset.lowGamma);
    }
    const u = (p - 0.5) / 0.5;
    return 1 + (preset.maxFactor - 1) * Math.pow(u, preset.highGamma);
  }

  function pointSpeed(prev, point) {
    if (!prev || !point) return null;
    if (!Number.isFinite(prev.t) || !Number.isFinite(point.t)) return null;
    const dt = point.t - prev.t;
    if (!(dt > 0)) return null;
    return Math.hypot(point.x - prev.x, point.y - prev.y) / dt;
  }

  function velocityFactor(prev, point, preset) {
    const speed = pointSpeed(prev, point);
    if (speed === null) return 1;
    // Typical browser pen motion is roughly 0.1–1.5 world px/ms.
    const normalized = clamp((speed - 0.12) / 1.28, 0, 1);
    return 1 - preset.velocityInfluence * normalized;
  }

  function tiltMagnitude(point) {
    if (!point) return 0;
    if (Number.isFinite(point.altitudeAngle)) {
      return clamp((Math.PI / 2 - point.altitudeAngle) / (Math.PI / 2), 0, 1);
    }
    if (Number.isFinite(point.tiltX) || Number.isFinite(point.tiltY)) {
      const tx = Number.isFinite(point.tiltX) ? point.tiltX : 0;
      const ty = Number.isFinite(point.tiltY) ? point.tiltY : 0;
      return clamp(Math.hypot(tx, ty) / 90, 0, 1);
    }
    return 0;
  }

  function nibAngle(point) {
    if (!point) return null;
    if (Number.isFinite(point.azimuthAngle)) return point.azimuthAngle;
    if (Number.isFinite(point.tiltX) || Number.isFinite(point.tiltY)) {
      const tx = Number.isFinite(point.tiltX) ? point.tiltX : 0;
      const ty = Number.isFinite(point.tiltY) ? point.tiltY : 0;
      if (tx !== 0 || ty !== 0) return Math.atan2(ty, tx);
    }
    return null;
  }

  function tiltFactor(prev, point, preset) {
    const magnitude = tiltMagnitude(point);
    const nib = nibAngle(point);
    if (!prev || !point || magnitude <= 0 || nib === null) return 1;
    const strokeAngle = Math.atan2(point.y - prev.y, point.x - prev.x);
    const crossNib = Math.abs(Math.sin(strokeAngle - nib));
    return 1 + preset.tiltInfluence * magnitude * crossNib;
  }

  function startTaperFactor(index) {
    if (index <= 0) return 0.18;
    if (index === 1) return 0.62;
    if (index === 2) return 0.88;
    return 1;
  }

  function resolvePresetFromStroke(stroke) {
    const first = stroke && stroke.points && stroke.points[0];
    const persisted = stroke && stroke.brushParams && stroke.brushParams.preset;
    const pointPersisted = first && first.fountainPreset;
    return getPreset(persisted || pointPersisted || DEFAULT_PRESET);
  }

  function computeRawWidth(stroke, index) {
    const pts = stroke.points || [];
    const point = pts[index];
    if (!point) return stroke.width || 3;
    const prev = index > 0 ? pts[index - 1] : null;
    const baseWidth = stroke.width || 3;
    const preset = resolvePresetFromStroke(stroke);

    const p = pressureFactor(point.pressure, preset);
    const v = velocityFactor(prev, point, preset);
    const t = tiltFactor(prev, point, preset);
    const start = startTaperFactor(index);

    return clamp(baseWidth * p * v * t * start, Math.max(0.45, baseWidth * 0.15), baseWidth * 2.2);
  }

  function computePointWidth(stroke, index) {
    const raw = computeRawWidth(stroke, index);
    if (index <= 0) return raw;
    const prevRaw = computeRawWidth(stroke, index - 1);
    // Local one-step smoothing keeps width stable while retaining pressure character.
    return raw * 0.80 + prevRaw * 0.20;
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function midpointWidth(stroke, i, j) {
    return (computePointWidth(stroke, i) + computePointWidth(stroke, j)) / 2;
  }

  function evalQuadratic(from, cp, to, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * from.x + 2 * mt * t * cp.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * cp.y + t * t * to.y
    };
  }

  function drawVariableLine(ctx, from, to, fromWidth, toWidth, steps = 4) {
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

  function drawVariableQuadratic(ctx, from, cp, to, fromWidth, toWidth, steps = 5) {
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
    ctx.strokeStyle = stroke.color || '#38bdf8';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = typeof stroke.opacity === 'number' ? stroke.opacity : 1.0;
  }

  function tipWidth(stroke) {
    const baseWidth = stroke.width || 3;
    const lastIdx = stroke.points.length - 1;
    const liveWidth = computePointWidth(stroke, Math.max(0, lastIdx));
    return Math.max(0.38, Math.min(baseWidth * 0.32, liveWidth * 0.24));
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
    const to = midpoint(pts[j + 1], pts[j + 2]);
    drawVariableQuadratic(
      ctx,
      from,
      pts[j + 1],
      to,
      midpointWidth(stroke, j, j + 1),
      midpointWidth(stroke, j + 1, j + 2)
    );
  }

  function drawLiveTail(ctx, stroke) {
    const pts = stroke.points;
    const lastIdx = pts.length - 1;
    if (lastIdx <= 0) return null;

    if (pts.length === 2) {
      const fromWidth = computePointWidth(stroke, 0);
      const endWidth = tipWidth(stroke);
      drawVariableLine(ctx, pts[0], pts[1], fromWidth, endWidth);
      return {
        type: 'fountain_tail',
        from: { x: pts[0].x, y: pts[0].y },
        to: { x: pts[1].x, y: pts[1].y },
        widthStart: fromWidth,
        widthEnd: endWidth
      };
    }

    const from = midpoint(pts[lastIdx - 1], pts[lastIdx]);
    const fromWidth = midpointWidth(stroke, lastIdx - 1, lastIdx);
    const endWidth = tipWidth(stroke);
    drawVariableLine(ctx, from, pts[lastIdx], fromWidth, endWidth);
    return {
      type: 'fountain_tail',
      from,
      to: { x: pts[lastIdx].x, y: pts[lastIdx].y },
      widthStart: fromWidth,
      widthEnd: endWidth
    };
  }

  function renderFountainStroke(targetCtx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    targetCtx.save();
    configureContext(targetCtx, stroke);

    const pts = stroke.points;
    if (pts.length === 1) {
      const w = computePointWidth(stroke, 0);
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2);
      targetCtx.fill();
    } else if (pts.length === 2) {
      drawLiveTail(targetCtx, stroke);
    } else {
      for (let j = 0; j <= pts.length - 3; j++) {
        drawFinalizedCurve(targetCtx, stroke, j);
      }
      drawLiveTail(targetCtx, stroke);
    }

    targetCtx.restore();
  }

  function eventSamples(e) {
    let list = [e];
    try {
      const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      if (coalesced && coalesced.length) list = coalesced;
    } catch {}

    return list.map(ev => ({
      pressure: typeof ev.pressure === 'number' && ev.pressure > 0 ? ev.pressure : 0.5,
      t: Number.isFinite(ev.timeStamp) ? ev.timeStamp : null,
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
  }

  function ensureActiveFountainStroke(stroke) {
    if (!stroke) return false;

    // renderIncrementalStroke is only used for the currently active stroke.
    // Upgrade NEW generic Pen strokes while leaving persisted legacy `tool: pen` replay untouched.
    if (stroke.tool === 'pen' && !stroke.brushType) {
      const presetId = currentPresetId();
      stroke.tool = 'fountain_pen';
      stroke.brushType = 'fountain_pen';
      stroke.brushVersion = BRUSH_VERSION;
      stroke.brushParams = { preset: presetId };
      if (stroke.points && stroke.points[0]) {
        stroke.points[0].fountainPreset = presetId;
        stroke.points[0].brushVersion = BRUSH_VERSION;
      }
    }

    if (stroke.tool !== 'fountain_pen' && stroke.brushType !== 'fountain_pen') return false;

    if (!stroke.brushType) stroke.brushType = 'fountain_pen';
    if (!stroke.brushVersion) stroke.brushVersion = BRUSH_VERSION;
    if (!stroke.brushParams) {
      const firstPreset = stroke.points && stroke.points[0] && stroke.points[0].fountainPreset;
      stroke.brushParams = { preset: firstPreset || DEFAULT_PRESET };
    }
    hydratePointDynamics(stroke);
    return true;
  }

  function renderIncrementalFountain(activeCtx, scratchCtx, stroke, state = { finalizedCount: 0, liveTail: null }) {
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
      if (stroke && (stroke.tool === 'fountain_pen' || stroke.brushType === 'fountain_pen')) {
        renderFountainStroke(targetCtx, stroke);
        return;
      }
      originalRenderStroke(targetCtx, stroke);
    };

    core.renderIncrementalStroke = function patchedRenderIncremental(activeCtx, scratchCtx, stroke, state) {
      if (ensureActiveFountainStroke(stroke)) {
        return renderIncrementalFountain(activeCtx, scratchCtx, stroke, state);
      }
      return originalRenderIncrementalStroke(activeCtx, scratchCtx, stroke, state);
    };
  }

  function installSensitivityControl() {
    if (typeof document === 'undefined') return;

    document.addEventListener('DOMContentLoaded', () => {
      const penButton = document.getElementById('tool-pen');
      if (!penButton || document.getElementById('fountain-preset-select')) return;

      penButton.title = 'Fountain Pen / Stylus (P)';
      const penLabel = penButton.querySelector('.btn-label');
      if (penLabel) penLabel.textContent = 'Fountain';

      const select = document.createElement('select');
      select.id = 'fountain-preset-select';
      select.title = 'Fountain Pen pressure sensitivity';
      select.setAttribute('aria-label', 'Fountain Pen pressure sensitivity');
      select.style.cssText = 'height:30px;max-width:92px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#111827;color:#e5e7eb;font-size:11px;padding:0 4px;';

      for (const preset of Object.values(PRESETS)) {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.label;
        select.appendChild(option);
      }
      select.value = currentPresetId();
      select.addEventListener('change', () => {
        if (PRESETS[select.value] && typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, select.value);
        }
      });

      penButton.insertAdjacentElement('afterend', select);

      const pairButton = document.getElementById('btn-pair-device-menu');
      if (pairButton) pairButton.title = 'Pair Another Device';
      const pointerTag = document.getElementById('pointer-device-tag');
      if (pointerTag && pointerTag.textContent.includes('📱')) pointerTag.textContent = '✒ Pen Input: Ready';

      const statusPills = document.querySelectorAll('#status-bar .status-pill');
      statusPills.forEach(el => {
        if (el.textContent && el.textContent.includes('Apple Pencil Optimized')) {
          el.textContent = 'Pen / Stylus Optimized';
        }
      });
    });
  }

  installInputCapture();
  installRendererPatch();
  installSensitivityControl();

  return {
    BRUSH_VERSION,
    PRESETS,
    DEFAULT_PRESET,
    pressureFactor,
    pointSpeed,
    velocityFactor,
    tiltMagnitude,
    nibAngle,
    tiltFactor,
    startTaperFactor,
    computeRawWidth,
    computePointWidth,
    renderFountainStroke,
    renderIncrementalFountain,
    ensureActiveFountainStroke,
    hydratePointDynamics,
    drawVariableLine,
    drawVariableQuadratic,
    tipWidth,
    _inputCapture: inputCapture
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FountainPenV2 };
}
