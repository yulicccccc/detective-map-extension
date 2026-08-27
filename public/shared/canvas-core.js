// shared/canvas-core.js - World Coordinate Engine & Spatial Math

const CanvasCore = {
  MIN_ZOOM: 0.2,
  MAX_ZOOM: 4.0,

  /**
   * Convert Screen coordinate to World coordinate
   */
  screenToWorld(screenX, screenY, panX, panY, zoom) {
    return {
      x: (screenX - panX) / zoom,
      y: (screenY - panY) / zoom
    };
  },

  /**
   * Convert World coordinate to Screen coordinate
   */
  worldToScreen(worldX, worldY, panX, panY, zoom) {
    return {
      x: worldX * zoom + panX,
      y: worldY * zoom + panY
    };
  },

  /**
   * Compute new pan coordinates to zoom toward an anchor screen point (e.g. cursor or center)
   */
  zoomTowardPoint(targetZoom, currentZoom, currentPanX, currentPanY, anchorScreenX, anchorScreenY) {
    const clampedZoom = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, targetZoom));
    const worldAnchor = this.screenToWorld(anchorScreenX, anchorScreenY, currentPanX, currentPanY, currentZoom);

    return {
      zoom: clampedZoom,
      panX: anchorScreenX - worldAnchor.x * clampedZoom,
      panY: anchorScreenY - worldAnchor.y * clampedZoom
    };
  },

  /**
   * Minimum distance from point P to line segment AB
   */
  pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(px - x1, py - y1);
    }

    // Project point P onto line segment AB, computing parameterized t
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    return Math.hypot(px - projX, py - projY);
  },

  /**
   * Test if an eraser in world coordinates hits a stroke
   * @param {Object} worldPoint {x, y}
   * @param {Object} stroke {points, width}
   * @param {number} eraserRadius world units hit threshold
   */
  isStrokeHit(worldPoint, stroke, eraserRadius = 12) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return false;

    const threshold = (stroke.width || 3) / 2 + eraserRadius;
    const points = stroke.points;

    // Quick bounding box rejection
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    if (
      worldPoint.x < minX - threshold ||
      worldPoint.x > maxX + threshold ||
      worldPoint.y < minY - threshold ||
      worldPoint.y > maxY + threshold
    ) {
      return false;
    }

    // Single-point dot stroke
    if (points.length === 1) {
      return Math.hypot(worldPoint.x - points[0].x, worldPoint.y - points[0].y) <= threshold;
    }

    // Multi-point polyline segment testing
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = this.pointToSegmentDistance(worldPoint.x, worldPoint.y, p1.x, p1.y, p2.x, p2.y);
      if (dist <= threshold) {
        return true;
      }
    }

    return false;
  },

  /**
   * Formats timestamp into clean readable display (relative + absolute)
   */
  formatCaptureTime(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (diffMins < 1) return `Just now (${timeStr})`;
      if (diffMins < 60) return `${diffMins}m ago (${timeStr})`;
      if (diffHours < 24) return `${diffHours}h ago (${timeStr})`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
    } catch {
      return isoString;
    }
  },

  /**
   * Extract clean domain or short name from URL
   */
  extractDomain(url) {
    if (!url) return 'Web';
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('chatgpt.com')) {
        return 'ChatGPT';
      }
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'Web';
    }
  },

  /**
   * Compute effective stroke width based on tool, baseWidth, and pressure.
   * - Light pressure (e.g. 0.1) -> ~0.5x base width (~1.5px)
   * - Normal pressure (0.5 or missing) -> ~1.0x base width (~3.0px)
   * - Firm pressure (1.0) -> ~1.7x base width (~5.1px)
   * - Highlighter maintains fixed/subtle width (e.g. baseWidth)
   * - Bounded: min width 1.0px, max width baseWidth * 2.2
   */
  computePointWidth(baseWidth = 3, pressure = 0.5, tool = 'pen') {
    if (tool === 'highlighter') {
      return baseWidth || 20;
    }
    const p = (typeof pressure === 'number' && pressure > 0 && !isNaN(pressure)) ? pressure : 0.5;
    const clampedP = Math.max(0.05, Math.min(1.0, p));
    // Smooth responsive mapping: 0.4 + 1.2 * p + 0.1 * p^2
    const factor = 0.4 + 1.2 * clampedP + 0.1 * Math.pow(clampedP, 2);
    const minWidth = 1.0;
    const maxWidth = Math.max(minWidth, baseWidth * 2.2);
    return Math.max(minWidth, Math.min(maxWidth, baseWidth * factor));
  },

  /**
   * Compute bounding box for dirty rect clearing
   */
  computeStrokeBBox(pt1, pt2, width = 6) {
    const pad = Math.max(20, width * 2.5);
    if (!pt2) {
      return {
        x: pt1.x - pad,
        y: pt1.y - pad,
        width: pad * 2,
        height: pad * 2
      };
    }
    const minX = Math.min(pt1.x, pt2.x) - pad;
    const minY = Math.min(pt1.y, pt2.y) - pad;
    const maxX = Math.max(pt1.x, pt2.x) + pad;
    const maxY = Math.max(pt1.y, pt2.y) + pad;
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  },

  /**
   * Draw a single quadratic curve segment
   */
  drawSegment(targetCtx, from, cp, to, width) {
    targetCtx.lineWidth = width;
    targetCtx.beginPath();
    targetCtx.moveTo(from.x, from.y);
    targetCtx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
    targetCtx.stroke();
  },

  /**
   * Draw a straight line segment
   */
  drawLineSegment(targetCtx, from, to, width) {
    targetCtx.lineWidth = width;
    targetCtx.beginPath();
    targetCtx.moveTo(from.x, from.y);
    targetCtx.lineTo(to.x, to.y);
    targetCtx.stroke();
  },

  /**
   * Render a complete stroke deterministically on a 2D canvas context.
   * Supports variable-width pen strokes and smooth quadratic curve interpolation.
   */
  renderStroke(targetCtx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;

    targetCtx.save();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    const pts = stroke.points;
    const baseWidth = stroke.width || (stroke.tool === 'highlighter' ? 20 : 3);
    const isPen = stroke.tool !== 'highlighter';

    targetCtx.strokeStyle = stroke.color || (isPen ? '#38bdf8' : '#f59e0b');
    targetCtx.fillStyle = targetCtx.strokeStyle;
    targetCtx.globalAlpha = stroke.opacity || (isPen ? 1.0 : 0.35);

    if (pts.length === 1) {
      const w0 = isPen ? this.computePointWidth(baseWidth, pts[0].pressure, 'pen') : baseWidth;
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, w0 / 2, 0, Math.PI * 2);
      targetCtx.fill();
    } else if (pts.length === 2) {
      const w0 = isPen ? this.computePointWidth(baseWidth, pts[0].pressure, 'pen') : baseWidth;
      const w1 = isPen ? this.computePointWidth(baseWidth, pts[1].pressure, 'pen') : baseWidth;
      this.drawLineSegment(targetCtx, pts[0], pts[1], (w0 + w1) / 2);
    } else {
      // Segment 0: P0 to M1 via P1
      const mid1 = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
      const w1 = isPen ? this.computePointWidth(baseWidth, pts[1].pressure, 'pen') : baseWidth;
      this.drawSegment(targetCtx, pts[0], pts[1], mid1, w1);

      // Middle segments
      let prevMid = mid1;
      for (let i = 2; i < pts.length - 1; i++) {
        const currMid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
        const wi = isPen ? this.computePointWidth(baseWidth, pts[i].pressure, 'pen') : baseWidth;
        this.drawSegment(targetCtx, prevMid, pts[i], currMid, wi);
        prevMid = currMid;
      }

      // Tail segment: from prevMid to P(N-1)
      const lastIdx = pts.length - 1;
      const wTail = isPen ? this.computePointWidth(baseWidth, pts[lastIdx].pressure, 'pen') : baseWidth;
      this.drawLineSegment(targetCtx, prevMid, pts[lastIdx], wTail);
    }

    targetCtx.restore();
  },

  /**
   * Incrementally render active stroke preview: FINALIZED SEGMENTS + REPLACEABLE LIVE TAIL.
   * Only redraws a constant-size recent tail window without replaying historical points.
   * @param {CanvasRenderingContext2D} targetCtx
   * @param {Object} stroke Active stroke object
   * @param {Object} state { finalizedCount: number, prevTail: { bbox: {...} } | null }
   * @returns {Object} Updated state { finalizedCount, prevTail }
   */
  renderIncrementalStroke(targetCtx, stroke, state = { finalizedCount: 0, prevTail: null }) {
    if (!stroke || !stroke.points || stroke.points.length === 0) {
      return state || { finalizedCount: 0, prevTail: null };
    }

    const pts = stroke.points;
    const baseWidth = stroke.width || (stroke.tool === 'highlighter' ? 20 : 3);
    const isPen = stroke.tool !== 'highlighter';

    targetCtx.save();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.strokeStyle = stroke.color || (isPen ? '#38bdf8' : '#f59e0b');
    targetCtx.fillStyle = targetCtx.strokeStyle;
    targetCtx.globalAlpha = stroke.opacity || (isPen ? 1.0 : 0.35);

    // 1. Clear previous replaceable live tail dirty rect
    if (state && state.prevTail && state.prevTail.bbox) {
      targetCtx.clearRect(
        state.prevTail.bbox.x,
        state.prevTail.bbox.y,
        state.prevTail.bbox.width,
        state.prevTail.bbox.height
      );
    }

    let finalizedCount = (state && state.finalizedCount) || 0;
    let prevTail = null;

    if (pts.length === 1) {
      const w0 = isPen ? this.computePointWidth(baseWidth, pts[0].pressure, 'pen') : baseWidth;
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, w0 / 2, 0, Math.PI * 2);
      targetCtx.fill();
      prevTail = { bbox: this.computeStrokeBBox(pts[0], null, w0) };
    } else if (pts.length === 2) {
      const w0 = isPen ? this.computePointWidth(baseWidth, pts[0].pressure, 'pen') : baseWidth;
      const w1 = isPen ? this.computePointWidth(baseWidth, pts[1].pressure, 'pen') : baseWidth;
      const lineW = (w0 + w1) / 2;
      this.drawLineSegment(targetCtx, pts[0], pts[1], lineW);
      prevTail = { bbox: this.computeStrokeBBox(pts[0], pts[1], lineW) };
    } else {
      // pts.length >= 3

      // If we cleared a tail and have previously finalized segments, repair the last finalized segment
      if (finalizedCount > 0) {
        const lastFinalIdx = finalizedCount - 1;
        if (lastFinalIdx === 0) {
          const mid1 = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
          const w1 = isPen ? this.computePointWidth(baseWidth, pts[1].pressure, 'pen') : baseWidth;
          this.drawSegment(targetCtx, pts[0], pts[1], mid1, w1);
        } else {
          const prevMid = { x: (pts[lastFinalIdx].x + pts[lastFinalIdx + 1].x) / 2, y: (pts[lastFinalIdx].y + pts[lastFinalIdx + 1].y) / 2 };
          const currMid = { x: (pts[lastFinalIdx + 1].x + pts[lastFinalIdx + 2].x) / 2, y: (pts[lastFinalIdx + 1].y + pts[lastFinalIdx + 2].y) / 2 };
          const wi = isPen ? this.computePointWidth(baseWidth, pts[lastFinalIdx + 1].pressure, 'pen') : baseWidth;
          this.drawSegment(targetCtx, prevMid, pts[lastFinalIdx + 1], currMid, wi);
        }
      }

      // Draw all newly finalized segments: from finalizedCount up to pts.length - 3
      while (finalizedCount <= pts.length - 3) {
        const j = finalizedCount;
        if (j === 0) {
          const mid1 = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
          const w1 = isPen ? this.computePointWidth(baseWidth, pts[1].pressure, 'pen') : baseWidth;
          this.drawSegment(targetCtx, pts[0], pts[1], mid1, w1);
        } else {
          const prevMid = { x: (pts[j].x + pts[j + 1].x) / 2, y: (pts[j].y + pts[j + 1].y) / 2 };
          const currMid = { x: (pts[j + 1].x + pts[j + 2].x) / 2, y: (pts[j + 1].y + pts[j + 2].y) / 2 };
          const wi = isPen ? this.computePointWidth(baseWidth, pts[j + 1].pressure, 'pen') : baseWidth;
          this.drawSegment(targetCtx, prevMid, pts[j + 1], currMid, wi);
        }
        finalizedCount++;
      }

      // Draw the new live tail from M_{N-2} to P_{N-1}
      const lastIdx = pts.length - 1;
      const lastMid = { x: (pts[lastIdx - 1].x + pts[lastIdx].x) / 2, y: (pts[lastIdx - 1].y + pts[lastIdx].y) / 2 };
      const wTail = isPen ? this.computePointWidth(baseWidth, pts[lastIdx].pressure, 'pen') : baseWidth;
      this.drawLineSegment(targetCtx, lastMid, pts[lastIdx], wTail);
      prevTail = { bbox: this.computeStrokeBBox(lastMid, pts[lastIdx], wTail) };
    }

    targetCtx.restore();
    return { finalizedCount, prevTail };
  }
};

// Export for module/script usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CanvasCore };
}
