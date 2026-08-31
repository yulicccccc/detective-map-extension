// shared/transparent-marker-v1.js
// Transparent Marker V1 behind the existing Highlighter button.
// Product goal: readable annotation first — uniform, light, controlled highlighting
// with a subtle soft edge and gradual overlap darkening. No watercolor cloud/bleed.

const TransparentMarkerV1 = (() => {
  const core = typeof CanvasCore !== 'undefined'
    ? CanvasCore
    : (typeof require !== 'undefined' ? require('./canvas-core.js').CanvasCore : null);

  if (!core) throw new Error('TransparentMarkerV1 requires CanvasCore');

  const BRUSH_VERSION = 1;
  const PRESET_ID = 'transparent_soft_marker_v1';
  const DEFAULT_WIDTH = 18;
  const DEFAULT_OPACITY = 0.16;
  const DEFAULT_COLOR = '#ffd166';

  // Two clean layers: a faint soft shoulder + a controlled translucent body.
  // Combined one-pass alpha stays intentionally low so text remains readable.
  const LAYERS = Object.freeze([
    Object.freeze({ width: 1.18, alpha: 0.22 }),
    Object.freeze({ width: 0.90, alpha: 0.48 })
  ]);

  // Preserve all previously installed renderers (legacy Pen, Fountain, Watercolor V1/V2).
  const previousRenderStroke = core.renderStroke.bind(core);
  const previousRenderIncrementalStroke = core.renderIncrementalStroke.bind(core);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function markerVersion(stroke) {
    if (!stroke) return 0;
    if (Number.isFinite(stroke.brushVersion) && (stroke.brushType === 'transparent_marker' || stroke.tool === 'transparent_marker')) {
      return stroke.brushVersion;
    }
    const first = stroke.points && stroke.points[0];
    return first && Number.isFinite(first.markerVersion) ? first.markerVersion : 0;
  }

  function isMarkerStroke(stroke) {
    return !!stroke &&
      (stroke.tool === 'transparent_marker' || stroke.brushType === 'transparent_marker') &&
      markerVersion(stroke) >= BRUSH_VERSION;
  }

  function pressureWidthFactor(pressure) {
    // A real highlighter should feel stable, not calligraphic. Pressure changes width only subtly.
    const p = clamp(typeof pressure === 'number' && pressure > 0 ? pressure : 0.5, 0.05, 1);
    return 0.96 + 0.08 * p;
  }

  function pointWidth(stroke, index) {
    const pts = stroke.points || [];
    const base = Number.isFinite(stroke.width) ? stroke.width : DEFAULT_WIDTH;
    const point = pts[index];
    return base * pressureWidthFactor(point && point.pressure);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function configureContext(ctx, stroke) {
    ctx.lineCap = 'butt'; // flat marker-like ends rather than round paint blobs
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color || DEFAULT_COLOR;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalCompositeOperation = 'source-over';
  }

  function baseOpacity(stroke) {
    const value = Number.isFinite(stroke.opacity) ? stroke.opacity : DEFAULT_OPACITY;
    return clamp(value, 0.06, 0.20);
  }

  function combinedAlpha(layerAlphas) {
    return 1 - layerAlphas.reduce((remaining, a) => remaining * (1 - clamp(a, 0, 1)), 1);
  }

  function estimatedSinglePassAlpha(stroke) {
    const opacity = baseOpacity(stroke);
    return combinedAlpha(LAYERS.map(layer => opacity * layer.alpha));
  }

  function drawLayeredLine(ctx, stroke, from, to, width) {
    const opacity = baseOpacity(stroke);
    for (const layer of LAYERS) {
      ctx.globalAlpha = opacity * layer.alpha;
      core.drawLineSegment(ctx, from, to, width * layer.width);
    }
  }

  function drawLayeredQuadratic(ctx, stroke, from, cp, to, width) {
    const opacity = baseOpacity(stroke);
    for (const layer of LAYERS) {
      ctx.globalAlpha = opacity * layer.alpha;
      core.drawSegment(ctx, from, cp, to, width * layer.width);
    }
  }

  function drawMarkerDot(ctx, stroke, point, width) {
    // A short tap is a compact flat-ish mark, not a dense watercolor blob.
    const opacity = baseOpacity(stroke);
    for (const layer of LAYERS) {
      ctx.globalAlpha = opacity * layer.alpha;
      const w = width * layer.width;
      ctx.fillRect(point.x - w / 2, point.y - w * 0.18, w, w * 0.36);
    }
  }

  function drawFinalizedCurve(ctx, stroke, j) {
    const pts = stroke.points;
    if (j === 0) {
      const to = midpoint(pts[1], pts[2]);
      const width = (pointWidth(stroke, 0) + pointWidth(stroke, 1) + pointWidth(stroke, 2)) / 3;
      drawLayeredQuadratic(ctx, stroke, pts[0], pts[1], to, width);
      return;
    }

    const from = midpoint(pts[j], pts[j + 1]);
    const to = midpoint(pts[j + 1], pts[j + 2]);
    const width = (pointWidth(stroke, j) + pointWidth(stroke, j + 1) + pointWidth(stroke, j + 2)) / 3;
    drawLayeredQuadratic(ctx, stroke, from, pts[j + 1], to, width);
  }

  function drawLiveTail(ctx, stroke) {
    const pts = stroke.points;
    const lastIdx = pts.length - 1;
    if (lastIdx <= 0) return null;

    if (pts.length === 2) {
      const width = (pointWidth(stroke, 0) + pointWidth(stroke, 1)) / 2;
      drawLayeredLine(ctx, stroke, pts[0], pts[1], width);
      return { type: 'transparent_marker_tail', from: { ...pts[0] }, to: { ...pts[1] }, width };
    }

    const from = midpoint(pts[lastIdx - 1], pts[lastIdx]);
    const width = (pointWidth(stroke, lastIdx - 1) + pointWidth(stroke, lastIdx)) / 2;
    drawLayeredLine(ctx, stroke, from, pts[lastIdx], width);
    return { type: 'transparent_marker_tail', from, to: { ...pts[lastIdx] }, width };
  }

  function renderMarkerStroke(targetCtx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    targetCtx.save();
    configureContext(targetCtx, stroke);
    const pts = stroke.points;

    if (pts.length === 1) {
      drawMarkerDot(targetCtx, stroke, pts[0], pointWidth(stroke, 0));
    } else if (pts.length === 2) {
      drawLiveTail(targetCtx, stroke);
    } else {
      for (let j = 0; j <= pts.length - 3; j++) drawFinalizedCurve(targetCtx, stroke, j);
      drawLiveTail(targetCtx, stroke);
    }

    targetCtx.restore();
  }

  function ensureActiveMarkerStroke(stroke) {
    if (!stroke) return false;

    // New Highlighter strokes become Transparent Marker. Watercolor histories already
    // carry brushType/tool metadata and therefore never enter this upgrade path.
    if (stroke.tool === 'highlighter' && !stroke.brushType) {
      stroke.tool = 'transparent_marker';
      stroke.brushType = 'transparent_marker';
      stroke.brushVersion = BRUSH_VERSION;
      stroke.brushParams = { preset: PRESET_ID };

      if (!Number.isFinite(stroke.width) || stroke.width === 20 || stroke.width === 17) stroke.width = DEFAULT_WIDTH;
      if (!Number.isFinite(stroke.opacity) || Math.abs(stroke.opacity - 0.35) < 1e-9 || Math.abs(stroke.opacity - 0.18) < 1e-9) {
        stroke.opacity = DEFAULT_OPACITY;
      }
      if (!stroke.color) stroke.color = DEFAULT_COLOR;

      if (stroke.points && stroke.points[0]) {
        stroke.points[0].markerPreset = PRESET_ID;
        stroke.points[0].markerVersion = BRUSH_VERSION;
      }
    }

    if (!isMarkerStroke(stroke)) return false;
    if (!stroke.brushType) stroke.brushType = 'transparent_marker';
    if (!stroke.brushVersion) stroke.brushVersion = BRUSH_VERSION;
    if (!stroke.brushParams) stroke.brushParams = { preset: PRESET_ID };
    return true;
  }

  function renderIncrementalMarker(activeCtx, scratchCtx, stroke, state = { finalizedCount: 0, liveTail: null }) {
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
      const width = pointWidth(stroke, 0);
      if (scratchCtx) drawMarkerDot(scratchCtx, stroke, pts[0], width);
      liveTail = { type: 'transparent_marker_dot', to: { ...pts[0] }, width };
    } else if (pts.length === 2) {
      if (scratchCtx) liveTail = drawLiveTail(scratchCtx, stroke);
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
    }

    if (scratchCtx) scratchCtx.restore();
    return { finalizedCount, liveTail };
  }

  function installRendererPatch() {
    core.renderStroke = function patchedTransparentMarkerReplay(targetCtx, stroke) {
      if (isMarkerStroke(stroke)) {
        renderMarkerStroke(targetCtx, stroke);
        return;
      }
      previousRenderStroke(targetCtx, stroke);
    };

    core.renderIncrementalStroke = function patchedTransparentMarkerIncremental(activeCtx, scratchCtx, stroke, state) {
      if ((stroke && stroke.tool === 'highlighter' && !stroke.brushType) || isMarkerStroke(stroke)) {
        if (ensureActiveMarkerStroke(stroke)) {
          return renderIncrementalMarker(activeCtx, scratchCtx, stroke, state);
        }
      }
      return previousRenderIncrementalStroke(activeCtx, scratchCtx, stroke, state);
    };
  }

  installRendererPatch();

  return {
    BRUSH_VERSION,
    PRESET_ID,
    DEFAULT_WIDTH,
    DEFAULT_OPACITY,
    DEFAULT_COLOR,
    LAYERS,
    markerVersion,
    isMarkerStroke,
    pressureWidthFactor,
    pointWidth,
    baseOpacity,
    combinedAlpha,
    estimatedSinglePassAlpha,
    ensureActiveMarkerStroke,
    renderMarkerStroke,
    renderIncrementalMarker
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TransparentMarkerV1 };
}
