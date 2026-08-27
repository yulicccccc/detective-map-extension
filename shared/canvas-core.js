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

    if (stroke.tool === 'highlighter') {
      targetCtx.strokeStyle = stroke.color || '#f59e0b';
      targetCtx.lineWidth = baseWidth;
      targetCtx.globalAlpha = stroke.opacity || 0.35;

      if (pts.length === 1) {
        targetCtx.beginPath();
        targetCtx.arc(pts[0].x, pts[0].y, baseWidth / 2, 0, Math.PI * 2);
        targetCtx.fillStyle = targetCtx.strokeStyle;
        targetCtx.fill();
      } else {
        targetCtx.beginPath();
        targetCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          if (i < pts.length - 1) {
            const midX = (pts[i].x + pts[i + 1].x) / 2;
            const midY = (pts[i].y + pts[i + 1].y) / 2;
            targetCtx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
          } else {
            targetCtx.lineTo(pts[i].x, pts[i].y);
          }
        }
        targetCtx.stroke();
      }
    } else {
      // Pen Stroke: Pressure-aware variable width rendering
      targetCtx.strokeStyle = stroke.color || '#38bdf8';
      targetCtx.fillStyle = stroke.color || '#38bdf8';
      targetCtx.globalAlpha = stroke.opacity || 1.0;

      if (pts.length === 1) {
        const w0 = this.computePointWidth(baseWidth, pts[0].pressure, 'pen');
        targetCtx.beginPath();
        targetCtx.arc(pts[0].x, pts[0].y, w0 / 2, 0, Math.PI * 2);
        targetCtx.fill();
      } else if (pts.length === 2) {
        const w0 = this.computePointWidth(baseWidth, pts[0].pressure, 'pen');
        const w1 = this.computePointWidth(baseWidth, pts[1].pressure, 'pen');
        targetCtx.lineWidth = (w0 + w1) / 2;
        targetCtx.beginPath();
        targetCtx.moveTo(pts[0].x, pts[0].y);
        targetCtx.lineTo(pts[1].x, pts[1].y);
        targetCtx.stroke();
      } else {
        // Multi-point smooth variable-width quadratic bezier ribbon
        // Segment 0: From P0 to M1 (midpoint of P1 and P2) via P1
        const mid1X = (pts[1].x + pts[2].x) / 2;
        const mid1Y = (pts[1].y + pts[2].y) / 2;
        const w1 = this.computePointWidth(baseWidth, pts[1].pressure, 'pen');

        targetCtx.lineWidth = w1;
        targetCtx.beginPath();
        targetCtx.moveTo(pts[0].x, pts[0].y);
        targetCtx.quadraticCurveTo(pts[1].x, pts[1].y, mid1X, mid1Y);
        targetCtx.stroke();

        // Middle segments: From M(i-1) to M(i) via Pi
        for (let i = 2; i < pts.length - 1; i++) {
          const prevMidX = (pts[i - 1].x + pts[i].x) / 2;
          const prevMidY = (pts[i - 1].y + pts[i].y) / 2;
          const currMidX = (pts[i].x + pts[i + 1].x) / 2;
          const currMidY = (pts[i].y + pts[i + 1].y) / 2;
          const wi = this.computePointWidth(baseWidth, pts[i].pressure, 'pen');

          targetCtx.lineWidth = wi;
          targetCtx.beginPath();
          targetCtx.moveTo(prevMidX, prevMidY);
          targetCtx.quadraticCurveTo(pts[i].x, pts[i].y, currMidX, currMidY);
          targetCtx.stroke();
        }

        // Tail segment: From M(N-2) to P(N-1)
        const lastIdx = pts.length - 1;
        const lastMidX = (pts[lastIdx - 1].x + pts[lastIdx].x) / 2;
        const lastMidY = (pts[lastIdx - 1].y + pts[lastIdx].y) / 2;
        const wTail = this.computePointWidth(baseWidth, pts[lastIdx].pressure, 'pen');

        targetCtx.lineWidth = wTail;
        targetCtx.beginPath();
        targetCtx.moveTo(lastMidX, lastMidY);
        targetCtx.lineTo(pts[lastIdx].x, pts[lastIdx].y);
        targetCtx.stroke();
      }
    }

    targetCtx.restore();
  },

  /**
   * Incrementally render only newly appended stroke segments on an active scratch context.
   * Runs in O(new_points) without clearing or redrawing historical points.
   * @param {CanvasRenderingContext2D} targetCtx
   * @param {Object} stroke Active stroke object
   * @param {number} drawnSegmentCount Number of segments previously drawn
   * @returns {number} Updated drawnSegmentCount
   */
  renderIncrementalSegment(targetCtx, stroke, drawnSegmentCount = 0) {
    if (!stroke || !stroke.points || stroke.points.length < 2) return drawnSegmentCount;

    const pts = stroke.points;
    const baseWidth = stroke.width || (stroke.tool === 'highlighter' ? 20 : 3);
    const isPen = stroke.tool !== 'highlighter';

    targetCtx.save();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.strokeStyle = stroke.color || (isPen ? '#38bdf8' : '#f59e0b');
    targetCtx.fillStyle = targetCtx.strokeStyle;
    targetCtx.globalAlpha = stroke.opacity || (isPen ? 1.0 : 0.35);

    let count = drawnSegmentCount;

    if (pts.length === 2 && count === 0) {
      const w0 = isPen ? this.computePointWidth(baseWidth, pts[0].pressure, 'pen') : baseWidth;
      const w1 = isPen ? this.computePointWidth(baseWidth, pts[1].pressure, 'pen') : baseWidth;
      targetCtx.lineWidth = (w0 + w1) / 2;
      targetCtx.beginPath();
      targetCtx.moveTo(pts[0].x, pts[0].y);
      targetCtx.lineTo(pts[1].x, pts[1].y);
      targetCtx.stroke();
      count = 1;
    } else if (pts.length >= 3) {
      // If segment 0 has not been drawn yet
      if (count === 0) {
        const mid1X = (pts[1].x + pts[2].x) / 2;
        const mid1Y = (pts[1].y + pts[2].y) / 2;
        const w1 = isPen ? this.computePointWidth(baseWidth, pts[1].pressure, 'pen') : baseWidth;

        targetCtx.lineWidth = w1;
        targetCtx.beginPath();
        targetCtx.moveTo(pts[0].x, pts[0].y);
        targetCtx.quadraticCurveTo(pts[1].x, pts[1].y, mid1X, mid1Y);
        targetCtx.stroke();
        count = 1;
      }

      // Draw all newly available middle segments
      while (count < pts.length - 2) {
        const i = count + 1;
        const prevMidX = (pts[i - 1].x + pts[i].x) / 2;
        const prevMidY = (pts[i - 1].y + pts[i].y) / 2;
        const currMidX = (pts[i].x + pts[i + 1].x) / 2;
        const currMidY = (pts[i].y + pts[i + 1].y) / 2;
        const wi = isPen ? this.computePointWidth(baseWidth, pts[i].pressure, 'pen') : baseWidth;

        targetCtx.lineWidth = wi;
        targetCtx.beginPath();
        targetCtx.moveTo(prevMidX, prevMidY);
        targetCtx.quadraticCurveTo(pts[i].x, pts[i].y, currMidX, currMidY);
        targetCtx.stroke();
        count++;
      }
    }

    targetCtx.restore();
    return count;
  }
};

// Export for module/script usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CanvasCore };
}
