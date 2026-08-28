// shared/watercolor-brush-v1.js
// Watercolor Brush V1 behind the existing Highlighter toolbar button.
// Product mapping: Pen = Fountain Pen; Highlighter = Watercolor Brush.
// Design goal: soft translucent wet-looking wash, natural overlap darkening,
// deterministic replay, and O(1) incremental active rendering without blur/diffusion.

const WatercolorBrushV1 = (() => {
  const core = typeof CanvasCore !== 'undefined'
    ? CanvasCore
    : (typeof require !== 'undefined' ? require('./canvas-core.js').CanvasCore : null);

  if (!core) throw new Error('WatercolorBrushV1 requires CanvasCore');

  const BRUSH_VERSION = 1;
  const PRESET_ID = 'freeform_watercolor_v1';

  // Outer -> inner. Multiple low-alpha passes create a feathered edge without blur.
  const LAYERS = Object.freeze([
    Object.freeze({ width: 1.48, alpha: 0.12, offset: 0.00 }),
    Object.freeze({ width: 1.30, alpha: 0.15, offset: 0.05 }),
    Object.freeze({ width: 1.12, alpha: 0.18, offset: -0.04 }),
    Object.freeze({ width: 0.92, alpha: 0.22, offset: 0.02 }),
    Object.freeze({ width: 0.68, alpha: 0.12, offset: -0.02 })
  ]);

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

  function isWatercolorSelected() {
    if (typeof document === 'undefined') return false;
    const btn = document.getElementById('tool-highlighter');
    return !!(btn && btn.classList && btn.classList.contains('active'));
  }

  function hash32(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return n >>> 0;
  }

  function seedFromPoint(point) {
    if (!point) return 0x51a7c0de;
    const x = Math.round((point.x || 0) * 100);
    const y = Math.round((point.y || 0) * 100);
    return hash32((x * 73856093) ^ (y * 19349663) ^ 0x51a7c0de);
  }

  function strokeSeed(stroke) {
    const first = stroke && stroke.points && stroke.points[0];
    if (first && Number.isInteger(first.watercolorSeed)) return first.watercolorSeed >>> 0;
    return seedFromPoint(first);
  }

  function noise01(seed, segmentIndex, layerIndex = 0, channel = 0) {
    const mixed = hash32(
      (seed >>> 0) ^
      Math.imul((segmentIndex + 1) >>> 0, 0x9e3779b1) ^
      Math.imul((layerIndex + 3) >>> 0, 0x85ebca6b) ^
      Math.imul((channel + 7) >>> 0, 0xc2b2ae35)
    );
    return mixed / 0xffffffff;
  }

  function textureVariation(stroke, segmentIndex, layerIndex = 0) {
    const seed = strokeSeed(stroke);
    return {
      width: 0.965 + noise01(seed, segmentIndex, layerIndex, 1) * 0.07,
      alpha: 0.90 + noise01(seed, segmentIndex, layerIndex, 2) * 0.20,
      offset: -1 + noise01(seed, segmentIndex, layerIndex, 3) * 2
    };
  }

  function pointSpeed(prev, point) {
    if (!prev || !point || !Number.isFinite(prev.t) || !Number.isFinite(point.t)) return null;
    const dt = point.t - prev.t;
    if (!(dt > 0)) return null;
    return Math.hypot(point.x - prev.x, point.y - prev.y) / dt;
  }

  function pressureWidthFactor(pressure) {
    const p = clamp(typeof pressure === 'number' && pressure > 0 ? pressure : 0.5, 0.05, 1);
    return 0.82 + 0.44 * Math.pow(p, 0.82);
  }

  function wetnessFactor(prev, point) {
    const speed = pointSpeed(prev, point);
    if (speed === null) return 1;
    const normalized = clamp((speed - 0.10) / 1.40, 0, 1);
    // Slow movement deposits slightly more pigment; fast movement stays lighter.
    return 1.08 - normalized * 0.22;
  }

  function segmentBaseWidth(stroke, index) {
    const pts = stroke.points || [];
    const point = pts[index];
    const baseWidth = stroke.width || 20;
    if (!point) return baseWidth;
    return baseWidth * pressureWidthFactor(point.pressure);
  }

  function segmentBaseOpacity(stroke, index) {
    const pts = stroke.points || [];
    const point = pts[index];
    const prev = index > 0 ? pts[index - 1] : null;
    const baseOpacity = typeof stroke.opacity === 'number' ? stroke.opacity : 0.35;
    const pressure = clamp(typeof point?.pressure === 'number' && point.pressure > 0 ? point.pressure : 0.5, 0.05, 1);
    const pressurePigment = 0.86 + pressure * 0.24;
    return clamp(baseOpacity * pressurePigment * wetnessFactor(prev, point), 0.08, 0.52);
  }

  function combinedAlpha(layerAlphas) {
    return 1 - layerAlphas.reduce((remaining, a) => remaining * (1 - clamp(a, 0, 1)), 1);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function evalQuadratic(from, cp, to, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * from.x + 2 * mt * t * cp.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * cp.y + t * t * to.y
    };
  }

  function offsetPair(from, to, amount) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return {
      from: { x: from.x + nx * amount, y: from.y + ny * amount },
      to: { x: to.x + nx * amount, y: to.y + ny * amount }
    };
  }

  function configureContext(ctx, stroke) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color || '#f59e0b';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawWatercolorLine(ctx, stroke, from, to, width, opacity, segmentIndex) {
    for (let layerIndex = 0; layerIndex < LAYERS.length; layerIndex++) {
      const layer = LAYERS[layerIndex];
      const variation = textureVariation(stroke, segmentIndex, layerIndex);
      const layerWidth = width * layer.width * variation.width;
      const layerAlpha = clamp(opacity * layer.alpha * variation.alpha, 0.005, 0.20);
      const offsetAmount = width * layer.offset * 0.10 + width * variation.offset * 0.008;
      const shifted = offsetPair(from, to, offsetAmount);
      ctx.globalAlpha = layerAlpha;
      core.drawLineSegment(ctx, shifted.from, shifted.to, layerWidth);
    }
  }

  function drawWatercolorQuadratic(ctx, stroke, from, cp, to, widthStart, widthEnd, opacityStart, opacityEnd, segmentIndex, steps = 4) {
    let prev = from;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const next = evalQuadratic(from, cp, to, t);
      const t0 = (i - 1) / steps;
      const w0 = widthStart + (widthEnd - widthStart) * t0;
      const w1 = widthStart + (widthEnd - widthStart) * t;
      const a0 = opacityStart + (opacityEnd - opacityStart) * t0;
      const a1 = opacityStart + (opacityEnd - opacityStart) * t;
      drawWatercolorLine(ctx, stroke, prev, next, (w0 + w1) / 2, (a0 + a1) / 2, segmentIndex * 8 + i);
      prev = next;
    }
  }

  function drawWatercolorDot(ctx, stroke, point, width, opacity, segmentIndex = 0) {
    for (let layerIndex = 0; layerIndex < LAYERS.length; layerIndex++) {
      const layer = LAYERS[layerIndex];
      const variation = textureVariation(stroke, segmentIndex, layerIndex);
      ctx.globalAlpha = clamp(opacity * layer.alpha * variation.alpha, 0.005, 0.20);
      ctx.beginPath();
      ctx.arc(point.x, point.y, (width * layer.width * variation.width) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFinalizedCurve(ctx, stroke, j) {
    const pts = stroke.points;
    if (j === 0) {
      const to = midpoint(pts[1], pts[2]);
      drawWatercolorQuadratic(
        ctx,
        stroke,
        pts[0],
        pts[1],
        to,
        segmentBaseWidth(stroke, 0),
        (segmentBaseWidth(stroke, 1) + segmentBaseWidth(stroke, 2)) / 2,
        segmentBaseOpacity(stroke, 0),
        (segmentBaseOpacity(stroke, 1) + segmentBaseOpacity(stroke, 2)) / 2,
        j
      );
      return;
    }

    const from = midpoint(pts[j], pts[j + 1]);
    const to = midpoint(pts[j + 1], pts[j + 2]);
    drawWatercolorQuadratic(
      ctx,
      stroke,
      from,
      pts[j + 1],
      to,
      (segmentBaseWidth(stroke, j) + segmentBaseWidth(stroke, j + 1)) / 2,
      (segmentBaseWidth(stroke, j + 1) + segmentBaseWidth(stroke, j + 2)) / 2,
      (segmentBaseOpacity(stroke, j) + segmentBaseOpacity(stroke, j + 1)) / 2,
      (segmentBaseOpacity(stroke, j + 1) + segmentBaseOpacity(stroke, j + 2)) / 2,
      j
    );
  }

  function drawLiveTail(ctx, stroke) {
    const pts = stroke.points;
    const lastIdx = pts.length - 1;
    if (lastIdx <= 0) return null;

    if (pts.length === 2) {
      const width = (segmentBaseWidth(stroke, 0) + segmentBaseWidth(stroke, 1)) / 2;
      const opacity = (segmentBaseOpacity(stroke, 0) + segmentBaseOpacity(stroke, 1)) / 2;
      drawWatercolorLine(ctx, stroke, pts[0], pts[1], width, opacity, 0);
      return { type: 'watercolor_tail', from: { ...pts[0] }, to: { ...pts[1] }, width, opacity };
    }

    const from = midpoint(pts[lastIdx - 1], pts[lastIdx]);
    const width = (segmentBaseWidth(stroke, lastIdx - 1) + segmentBaseWidth(stroke, lastIdx)) / 2;
    const opacity = (segmentBaseOpacity(stroke, lastIdx - 1) + segmentBaseOpacity(stroke, lastIdx)) / 2;
    drawWatercolorLine(ctx, stroke, from, pts[lastIdx], width, opacity, lastIdx - 1);
    return { type: 'watercolor_tail', from, to: { ...pts[lastIdx] }, width, opacity };
  }

  function renderWatercolorStroke(targetCtx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    targetCtx.save();
    configureContext(targetCtx, stroke);
    const pts = stroke.points;

    if (pts.length === 1) {
      drawWatercolorDot(targetCtx, stroke, pts[0], segmentBaseWidth(stroke, 0), segmentBaseOpacity(stroke, 0));
    } else if (pts.length === 2) {
      drawLiveTail(targetCtx, stroke);
    } else {
      for (let j = 0; j <= pts.length - 3; j++) drawFinalizedCurve(targetCtx, stroke, j);
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
      tiltY: finiteOrNull(ev.tiltY)
    }));
  }

  function installInputCapture() {
    if (typeof window === 'undefined' || !window.addEventListener) return;

    window.addEventListener('pointerdown', e => {
      if (!isWatercolorSelected()) return;
      if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
      if (typeof e.button === 'number' && e.button !== 0) return;
      inputCapture.activePointerId = e.pointerId;
      inputCapture.queue = eventSamples(e);
    }, true);

    window.addEventListener('pointermove', e => {
      if (e.pointerId !== inputCapture.activePointerId) return;
      if (!(e.buttons > 0 || e.pressure > 0)) return;
      inputCapture.queue.push(...eventSamples(e));
      if (inputCapture.queue.length > 512) inputCapture.queue.splice(0, inputCapture.queue.length - 512);
    }, true);

    const finish = e => {
      if (e.pointerId === inputCapture.activePointerId) inputCapture.activePointerId = null;
    };
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  }

  function hydratePointDynamics(stroke) {
    const pts = stroke.points || [];
    let start = Number.isInteger(stroke._watercolorHydratedCount) ? stroke._watercolorHydratedCount : 0;
    if (start < 0 || start > pts.length) start = 0;

    let hydratedThisCall = 0;
    for (let i = start; i < pts.length; i++) {
      const point = pts[i];
      const sample = inputCapture.queue.length ? inputCapture.queue.shift() : null;
      const prevT = i > 0 && Number.isFinite(pts[i - 1].t) ? pts[i - 1].t : null;

      if (!Number.isFinite(point.t)) {
        const fallbackNow = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        point.t = sample && Number.isFinite(sample.t) ? sample.t : (prevT !== null ? prevT + 8 : fallbackNow);
      }
      if (sample) {
        if (typeof sample.pressure === 'number' && sample.pressure > 0) point.pressure = sample.pressure;
        if (sample.tiltX !== null) point.tiltX = sample.tiltX;
        if (sample.tiltY !== null) point.tiltY = sample.tiltY;
      }
      hydratedThisCall++;
    }

    stroke._watercolorHydratedCount = pts.length;
    stroke._watercolorLastHydratedCount = hydratedThisCall;
    return hydratedThisCall;
  }

  function ensureActiveWatercolorStroke(stroke) {
    if (!stroke) return false;

    // Incremental rendering is active-stroke-only, so this upgrades new Highlighter
    // strokes while historical persisted `tool: highlighter` replay remains untouched.
    if (stroke.tool === 'highlighter' && !stroke.brushType) {
      stroke.tool = 'watercolor';
      stroke.brushType = 'watercolor';
      stroke.brushVersion = BRUSH_VERSION;
      stroke.brushParams = { preset: PRESET_ID };
      if (stroke.points && stroke.points[0]) {
        stroke.points[0].watercolorPreset = PRESET_ID;
        stroke.points[0].watercolorVersion = BRUSH_VERSION;
        stroke.points[0].watercolorSeed = seedFromPoint(stroke.points[0]);
      }
    }

    if (stroke.tool !== 'watercolor' && stroke.brushType !== 'watercolor') return false;
    if (!stroke.brushType) stroke.brushType = 'watercolor';
    if (!stroke.brushVersion) stroke.brushVersion = BRUSH_VERSION;
    if (!stroke.brushParams) stroke.brushParams = { preset: PRESET_ID };
    if (stroke.points && stroke.points[0] && !Number.isInteger(stroke.points[0].watercolorSeed)) {
      stroke.points[0].watercolorSeed = seedFromPoint(stroke.points[0]);
    }
    hydratePointDynamics(stroke);
    return true;
  }

  function renderIncrementalWatercolor(activeCtx, scratchCtx, stroke, state = { finalizedCount: 0, liveTail: null }) {
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
      const width = segmentBaseWidth(stroke, 0);
      const opacity = segmentBaseOpacity(stroke, 0);
      if (scratchCtx) drawWatercolorDot(scratchCtx, stroke, pts[0], width, opacity);
      liveTail = { type: 'watercolor_dot', to: { ...pts[0] }, width, opacity };
    } else if (pts.length === 2) {
      if (scratchCtx) liveTail = drawLiveTail(scratchCtx, stroke);
      else {
        const width = (segmentBaseWidth(stroke, 0) + segmentBaseWidth(stroke, 1)) / 2;
        const opacity = (segmentBaseOpacity(stroke, 0) + segmentBaseOpacity(stroke, 1)) / 2;
        liveTail = { type: 'watercolor_tail', from: { ...pts[0] }, to: { ...pts[1] }, width, opacity };
      }
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
        const width = (segmentBaseWidth(stroke, lastIdx - 1) + segmentBaseWidth(stroke, lastIdx)) / 2;
        const opacity = (segmentBaseOpacity(stroke, lastIdx - 1) + segmentBaseOpacity(stroke, lastIdx)) / 2;
        liveTail = { type: 'watercolor_tail', from, to: { ...pts[lastIdx] }, width, opacity };
      }
    }

    if (scratchCtx) scratchCtx.restore();
    return { finalizedCount, liveTail };
  }

  function installRendererPatch() {
    core.renderStroke = function patchedWatercolorReplay(targetCtx, stroke) {
      if (stroke && (stroke.tool === 'watercolor' || stroke.brushType === 'watercolor')) {
        renderWatercolorStroke(targetCtx, stroke);
        return;
      }
      originalRenderStroke(targetCtx, stroke);
    };

    core.renderIncrementalStroke = function patchedWatercolorIncremental(activeCtx, scratchCtx, stroke, state) {
      if (ensureActiveWatercolorStroke(stroke)) {
        return renderIncrementalWatercolor(activeCtx, scratchCtx, stroke, state);
      }
      return originalRenderIncrementalStroke(activeCtx, scratchCtx, stroke, state);
    };
  }

  function installToolbarMapping() {
    if (typeof document === 'undefined') return;
    document.addEventListener('DOMContentLoaded', () => {
      // Product-facing labels remain the two simple existing controls.
      const penButton = document.getElementById('tool-pen');
      if (penButton) {
        const label = penButton.querySelector('.btn-label');
        if (label) label.textContent = 'Pen';
        penButton.title = 'Pen — Fountain Pen behavior (P)';
      }

      const highlighterButton = document.getElementById('tool-highlighter');
      if (highlighterButton) {
        const label = highlighterButton.querySelector('.btn-label');
        if (label) label.textContent = 'Highlighter';
        highlighterButton.title = 'Highlighter — Watercolor Brush behavior (H)';
      }
    });
  }

  installInputCapture();
  installRendererPatch();
  installToolbarMapping();

  return {
    BRUSH_VERSION,
    PRESET_ID,
    LAYERS,
    pressureWidthFactor,
    wetnessFactor,
    segmentBaseWidth,
    segmentBaseOpacity,
    combinedAlpha,
    seedFromPoint,
    strokeSeed,
    noise01,
    textureVariation,
    renderWatercolorStroke,
    renderIncrementalWatercolor,
    ensureActiveWatercolorStroke,
    hydratePointDynamics,
    drawWatercolorLine,
    drawWatercolorQuadratic,
    _inputCapture: inputCapture
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WatercolorBrushV1 };
}
