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
  }
};

// Export for module/script usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CanvasCore };
}
