// canvas.js - Controller for Detective Map Standalone Canvas Window

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const viewportContainer = document.getElementById('viewport-container');
  const gridBackground = document.getElementById('grid-background');
  const worldCardsLayer = document.getElementById('world-cards-layer');
  const inkCanvas = document.getElementById('ink-canvas');
  const ctx = inkCanvas.getContext('2d');

  // Toolbar & Status Elements
  const toolBtns = document.querySelectorAll('.tool-btn');
  const btnUndo = document.getElementById('btn-undo');
  const btnClearInk = document.getElementById('btn-clear-ink');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomFit = document.getElementById('btn-zoom-fit');
  const zoomLevelText = document.getElementById('zoom-level');
  const btnExport = document.getElementById('btn-export-canvas');
  const fileImport = document.getElementById('file-import-canvas');

  const pointerDeviceTag = document.getElementById('pointer-device-tag');
  const coordsTag = document.getElementById('coords-tag');
  const cardCountTag = document.getElementById('card-count-tag');
  const strokeCountTag = document.getElementById('stroke-count-tag');

  // Application State
  let quotes = [];
  let strokes = [];
  let viewport = { panX: 0, panY: 0, zoom: 1.0 };
  let activeTool = 'select'; // 'select' | 'pen' | 'highlighter' | 'eraser'
  let undoStack = [];

  // Interaction State
  let isDrawing = false;
  let currentStroke = null;
  let isPanning = false;
  let isSpacePressed = false;
  let panStart = { x: 0, y: 0 };
  let panOrigin = { x: 0, y: 0 };

  // Card Dragging State
  let isDraggingCard = false;
  let draggedCardId = null;
  let cardDragOffset = { x: 0, y: 0 };
  let cardInitialPos = { x: 0, y: 0 };

  // Multi-touch gestures (Pinch-to-zoom on iPad / touchscreens)
  const activePointers = new Map();
  let initialPinchDistance = null;
  let initialPinchZoom = 1.0;
  let pinchCenterScreen = { x: 0, y: 0 };

  // Device Pixel Ratio for crisp rendering on Retina / iPad displays
  let dpr = window.devicePixelRatio || 1;

  // Initialize Canvas
  await init();

  async function init() {
    setupCanvasResolution();
    window.addEventListener('resize', handleResize);

    // Load initial data
    const [savedQuotes, savedStrokes, savedViewport] = await Promise.all([
      Storage.getQuotes(),
      Storage.getStrokes(),
      Storage.getViewport()
    ]);

    quotes = savedQuotes;
    strokes = savedStrokes;
    viewport = savedViewport || { panX: 0, panY: 0, zoom: 1.0 };

    updateViewportTransforms();
    renderCards();
    renderAllStrokes();
    updateStatusPills();

    setupToolListeners();
    setupPointerListeners();
    setupKeyboardListeners();
    setupStorageSync();

    // Default to Select tool and set proper pointer-events routing
    setActiveTool('select');
  }

  /**
   * Setup High-DPI Resolution for iPad Retina Displays
   */
  function setupCanvasResolution() {
    dpr = window.devicePixelRatio || 1;
    const rect = viewportContainer.getBoundingClientRect();
    inkCanvas.width = rect.width * dpr;
    inkCanvas.height = rect.height * dpr;
    inkCanvas.style.width = `${rect.width}px`;
    inkCanvas.style.height = `${rect.height}px`;
  }

  function handleResize() {
    setupCanvasResolution();
    renderAllStrokes();
  }

  /**
   * Update Viewport Transforms for DOM Cards, Grid, and Canvas Context
   */
  function updateViewportTransforms() {
    // 1. Transform DOM Cards Container
    worldCardsLayer.style.transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;

    // 2. Transform Dot Grid Background
    const gridSize = 32 * viewport.zoom;
    gridBackground.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    gridBackground.style.backgroundPosition = `${viewport.panX}px ${viewport.panY}px`;

    // 3. Update Zoom Text
    zoomLevelText.textContent = `${Math.round(viewport.zoom * 100)}%`;

    // 4. Redraw Ink Strokes in World Space
    renderAllStrokes();
  }

  /**
   * Render All Quotes as DOM Cards in the World Layer
   */
  function renderCards() {
    worldCardsLayer.innerHTML = '';

    quotes.forEach(quote => {
      const cardEl = document.createElement('div');
      cardEl.className = 'canvas-card';
      cardEl.id = `card-${quote.id}`;
      cardEl.style.left = `${quote.x}px`;
      cardEl.style.top = `${quote.y}px`;
      cardEl.style.width = `${quote.width || 320}px`;

      const domain = CanvasCore.extractDomain(quote.sourceUrl);
      const timeDisplay = CanvasCore.formatCaptureTime(quote.capturedAt);
      const safeText = escapeHtml(quote.text);
      const safeTitle = escapeHtml(quote.sourceTitle || domain);
      const safeUrl = quote.sourceUrl ? escapeHtml(quote.sourceUrl) : '#';

      cardEl.innerHTML = `
        <div class="canvas-card-header" data-id="${quote.id}">
          <div class="card-header-left">
            <a href="${safeUrl}" target="_blank" class="card-source-link" title="${safeTitle}">
              <span>↗</span> ${domain}
            </a>
          </div>
          <div class="card-header-actions">
            <span class="card-time">${timeDisplay}</span>
            <button class="btn-card-close" data-id="${quote.id}" title="Delete Quote">✕</button>
          </div>
        </div>
        <div class="canvas-card-body">${safeText}</div>
      `;

      // Header drag handler for Card movement in Select mode
      const headerEl = cardEl.querySelector('.canvas-card-header');
      headerEl.addEventListener('pointerdown', (e) => handleCardPointerDown(e, quote));

      // Close button handler
      const closeBtn = cardEl.querySelector('.btn-card-close');
      closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Remove this quote card?')) {
          quotes = await Storage.deleteQuote(quote.id);
          renderCards();
          updateStatusPills();
        }
      });

      worldCardsLayer.appendChild(cardEl);
    });

    updateStatusPills();
  }

  /**
   * Hardware-Accelerated Redraw of All Ink Strokes
   */
  function renderAllStrokes() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);

    // Apply world-to-screen matrix with DPR scaling
    ctx.setTransform(
      viewport.zoom * dpr, 0,
      0, viewport.zoom * dpr,
      viewport.panX * dpr, viewport.panY * dpr
    );

    // Draw saved strokes
    strokes.forEach(stroke => drawSingleStroke(stroke));

    // Draw active drawing stroke if in progress
    if (currentStroke && currentStroke.points.length > 0) {
      drawSingleStroke(currentStroke);
    }
  }

  function drawSingleStroke(stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      ctx.strokeStyle = stroke.color || '#f59e0b';
      ctx.lineWidth = stroke.width || 20;
      ctx.globalAlpha = stroke.opacity || 0.35;
    } else {
      ctx.strokeStyle = stroke.color || '#38bdf8';
      ctx.lineWidth = stroke.width || 3;
      ctx.globalAlpha = stroke.opacity || 1.0;
    }

    const pts = stroke.points;
    if (pts.length === 1) {
      // Single dot
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, (stroke.width || 3) / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      for (let i = 1; i < pts.length; i++) {
        // Smooth quadratic interpolation between midpoints
        if (i < pts.length - 1) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        } else {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Pointer Event Routing for Mouse, Touch, and Apple Pencil
   */
  function setupPointerListeners() {
    // 1. Viewport Container PointerDown: handles background click/pan when in Select mode, or Space+Drag / Middle Click
    viewportContainer.addEventListener('pointerdown', handleViewportPointerDown);

    // 2. Ink Canvas PointerDown: handles Pen / Highlighter / Eraser drawing
    inkCanvas.addEventListener('pointerdown', handleInkPointerDown);

    // 3. Global Window listeners for continuous move & release
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    // Mouse wheel zooming
    viewportContainer.addEventListener('wheel', handleWheel, { passive: false });
  }

  function handleViewportPointerDown(e) {
    // If click originated on a card component, do not trigger background pan
    if (e.target.closest('.canvas-card')) return;

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    updatePointerDeviceTag(e);

    // Multi-touch pinch-to-zoom detection
    if (activePointers.size === 2) {
      isDrawing = false;
      isPanning = false;
      const pts = Array.from(activePointers.values());
      initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchZoom = viewport.zoom;
      pinchCenterScreen = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
      return;
    }

    // Left click on background in select mode, or Middle click / Space held in any mode
    if (isSpacePressed || e.button === 1 || (activeTool === 'select' && e.button === 0)) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panOrigin = { x: viewport.panX, y: viewport.panY };
      viewportContainer.classList.add('cursor-panning-active');
    }
  }

  function handleInkPointerDown(e) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    updatePointerDeviceTag(e);

    // Multi-touch pinch-to-zoom detection
    if (activePointers.size === 2) {
      isDrawing = false;
      currentStroke = null;
      isPanning = false;
      const pts = Array.from(activePointers.values());
      initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchZoom = viewport.zoom;
      pinchCenterScreen = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
      return;
    }

    // Space held or Middle Mouse -> Pan canvas even while in pen mode
    if (isSpacePressed || e.button === 1) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panOrigin = { x: viewport.panX, y: viewport.panY };
      viewportContainer.classList.add('cursor-panning-active');
      return;
    }

    const worldPoint = CanvasCore.screenToWorld(e.clientX, e.clientY, viewport.panX, viewport.panY, viewport.zoom);
    updateCoordsTag(worldPoint);

    // Drawing Tools (Pen & Highlighter)
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      isDrawing = true;
      inkCanvas.setPointerCapture(e.pointerId);

      currentStroke = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
        type: 'ink',
        tool: activeTool,
        width: activeTool === 'highlighter' ? 20 : 3,
        opacity: activeTool === 'highlighter' ? 0.35 : 1.0,
        color: activeTool === 'highlighter' ? '#f59e0b' : '#38bdf8',
        points: [{
          x: worldPoint.x,
          y: worldPoint.y,
          pressure: typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 0.5
        }]
      };

      renderAllStrokes();
      return;
    }

    // Stroke Eraser
    if (activeTool === 'eraser') {
      eraseStrokesAtPoint(worldPoint);
    }
  }

  function handlePointerMove(e) {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Handle 2-finger pinch zoom
    if (activePointers.size === 2 && initialPinchDistance) {
      const pts = Array.from(activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const targetZoom = initialPinchZoom * (currentDist / initialPinchDistance);
      const newVp = CanvasCore.zoomTowardPoint(targetZoom, viewport.zoom, viewport.panX, viewport.panY, pinchCenterScreen.x, pinchCenterScreen.y);
      viewport.zoom = newVp.zoom;
      viewport.panX = newVp.panX;
      viewport.panY = newVp.panY;
      updateViewportTransforms();
      return;
    }

    // Handle Panning
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      viewport.panX = panOrigin.x + dx;
      viewport.panY = panOrigin.y + dy;
      updateViewportTransforms();
      return;
    }

    // Handle Card Dragging (Select mode)
    if (isDraggingCard && draggedCardId) {
      const worldPoint = CanvasCore.screenToWorld(e.clientX, e.clientY, viewport.panX, viewport.panY, viewport.zoom);
      const newX = Math.round(worldPoint.x - cardDragOffset.x);
      const newY = Math.round(worldPoint.y - cardDragOffset.y);

      const cardEl = document.getElementById(`card-${draggedCardId}`);
      if (cardEl) {
        cardEl.style.left = `${newX}px`;
        cardEl.style.top = `${newY}px`;
      }
      return;
    }

    const worldPoint = CanvasCore.screenToWorld(e.clientX, e.clientY, viewport.panX, viewport.panY, viewport.zoom);
    updateCoordsTag(worldPoint);

    // Handle Active Drawing (Pen / Highlighter)
    if (isDrawing && currentStroke) {
      const lastPt = currentStroke.points[currentStroke.points.length - 1];
      const dist = Math.hypot(worldPoint.x - lastPt.x, worldPoint.y - lastPt.y);

      if (dist >= 1.5) {
        currentStroke.points.push({
          x: worldPoint.x,
          y: worldPoint.y,
          pressure: typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 0.5
        });
        renderAllStrokes();
      }
      return;
    }

    // Handle Continuous Stroke Eraser
    if (activeTool === 'eraser' && (e.buttons === 1 || e.pressure > 0)) {
      eraseStrokesAtPoint(worldPoint);
    }
  }

  async function handlePointerUp(e) {
    activePointers.delete(e.pointerId);

    if (activePointers.size < 2) {
      initialPinchDistance = null;
    }

    if (isPanning) {
      isPanning = false;
      viewportContainer.classList.remove('cursor-panning-active');
      Storage.saveViewport(viewport);
    }

    if (isDraggingCard && draggedCardId) {
      const cardEl = document.getElementById(`card-${draggedCardId}`);
      if (cardEl) {
        cardEl.classList.remove('dragging');
        const finalX = parseFloat(cardEl.style.left);
        const finalY = parseFloat(cardEl.style.top);

        const quote = quotes.find(q => q.id === draggedCardId);
        if (quote) {
          quote.x = finalX;
          quote.y = finalY;
          await Storage.updateQuote(draggedCardId, { x: finalX, y: finalY });

          undoStack.push({
            type: 'MOVE_CARD',
            id: draggedCardId,
            prevX: cardInitialPos.x,
            prevY: cardInitialPos.y,
            newX: finalX,
            newY: finalY
          });
        }
      }
      isDraggingCard = false;
      draggedCardId = null;
    }

    if (isDrawing && currentStroke) {
      isDrawing = false;
      if (currentStroke.points.length > 0) {
        strokes.push(currentStroke);
        await Storage.addStroke(currentStroke);

        undoStack.push({
          type: 'ADD_STROKE',
          stroke: currentStroke
        });
        updateStatusPills();
      }
      currentStroke = null;
      renderAllStrokes();
    }
  }

  /**
   * Card Dragging via Header (Select Mode)
   */
  function handleCardPointerDown(e, quote) {
    if (e.target.closest('.btn-card-close') || e.target.closest('.card-source-link')) return;

    e.stopPropagation();
    isDraggingCard = true;
    draggedCardId = quote.id;
    cardInitialPos = { x: quote.x, y: quote.y };

    const worldPoint = CanvasCore.screenToWorld(e.clientX, e.clientY, viewport.panX, viewport.panY, viewport.zoom);
    cardDragOffset = {
      x: worldPoint.x - quote.x,
      y: worldPoint.y - quote.y
    };

    const cardEl = document.getElementById(`card-${quote.id}`);
    if (cardEl) {
      cardEl.classList.add('dragging');
    }
  }

  /**
   * Stroke Eraser Logic (Deletes whole stroke upon touch)
   */
  async function eraseStrokesAtPoint(worldPoint) {
    const eraserRadius = 15 / viewport.zoom;
    const hitStrokeIds = [];
    const remainingStrokes = [];
    const deletedStrokes = [];

    strokes.forEach(s => {
      if (CanvasCore.isStrokeHit(worldPoint, s, eraserRadius)) {
        hitStrokeIds.push(s.id);
        deletedStrokes.push(s);
      } else {
        remainingStrokes.push(s);
      }
    });

    if (hitStrokeIds.length > 0) {
      strokes = remainingStrokes;
      await Storage.deleteStrokes(hitStrokeIds);

      undoStack.push({
        type: 'DELETE_STROKES',
        strokes: deletedStrokes
      });

      renderAllStrokes();
      updateStatusPills();
    }
  }

  /**
   * Mouse Wheel Smooth Zooming Toward Cursor
   */
  function handleWheel(e) {
    e.preventDefault();

    if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const targetZoom = viewport.zoom * zoomFactor;

      const newVp = CanvasCore.zoomTowardPoint(
        targetZoom,
        viewport.zoom,
        viewport.panX,
        viewport.panY,
        e.clientX,
        e.clientY
      );

      viewport.zoom = newVp.zoom;
      viewport.panX = newVp.panX;
      viewport.panY = newVp.panY;

      updateViewportTransforms();
      Storage.saveViewport(viewport);
    }
  }

  /**
   * Toolbar Mode Selector & Buttons
   */
  function setupToolListeners() {
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        setActiveTool(tool);
      });
    });

    // Undo Button
    btnUndo.addEventListener('click', handleUndo);

    // Clear Ink Button
    btnClearInk.addEventListener('click', async () => {
      if (strokes.length === 0) return;
      if (confirm('Clear all ink strokes on this canvas?')) {
        const prevStrokes = [...strokes];
        strokes = [];
        await Storage.saveStrokes([]);

        undoStack.push({
          type: 'DELETE_STROKES',
          strokes: prevStrokes
        });

        renderAllStrokes();
        updateStatusPills();
      }
    });

    // Zoom Buttons
    btnZoomIn.addEventListener('click', () => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const newVp = CanvasCore.zoomTowardPoint(viewport.zoom * 1.2, viewport.zoom, viewport.panX, viewport.panY, cx, cy);
      viewport = newVp;
      updateViewportTransforms();
      Storage.saveViewport(viewport);
    });

    btnZoomOut.addEventListener('click', () => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const newVp = CanvasCore.zoomTowardPoint(viewport.zoom / 1.2, viewport.zoom, viewport.panX, viewport.panY, cx, cy);
      viewport = newVp;
      updateViewportTransforms();
      Storage.saveViewport(viewport);
    });

    zoomLevelText.addEventListener('click', () => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const newVp = CanvasCore.zoomTowardPoint(1.0, viewport.zoom, viewport.panX, viewport.panY, cx, cy);
      viewport = newVp;
      updateViewportTransforms();
      Storage.saveViewport(viewport);
    });

    btnZoomFit.addEventListener('click', fitToContent);

    // Export JSON
    btnExport.addEventListener('click', async () => {
      try {
        const exportData = await Storage.exportAllData();
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `detective-map-canvas-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Export failed: ' + err.message);
      }
    });

    // Import JSON
    fileImport.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const res = await Storage.importAllData(json);
        alert(`Successfully imported ${res.quoteCount} cards and ${res.strokeCount} ink strokes!`);
        quotes = await Storage.getQuotes();
        strokes = await Storage.getStrokes();
        viewport = await Storage.getViewport();
        updateViewportTransforms();
        renderCards();
        renderAllStrokes();
      } catch (err) {
        alert('Import failed: ' + err.message);
      } finally {
        fileImport.value = '';
      }
    });
  }

  /**
   * Switch Active Tool and Dynamically Route Pointer Events
   */
  function setActiveTool(tool) {
    activeTool = tool;
    toolBtns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tool') === tool);
    });

    viewportContainer.className = `cursor-${tool}`;

    // Pointer-events routing:
    // In Select mode, inkCanvas pointer-events is disabled so cards can be clicked/dragged freely.
    // In Pen/Highlighter/Eraser mode, inkCanvas pointer-events is active so drawing can overlay cards.
    if (tool === 'select') {
      inkCanvas.style.pointerEvents = 'none';
    } else {
      inkCanvas.style.pointerEvents = 'auto';
    }
  }

  /**
   * Undo Functionality
   */
  async function handleUndo() {
    if (undoStack.length === 0) return;

    const action = undoStack.pop();

    if (action.type === 'ADD_STROKE') {
      strokes = strokes.filter(s => s.id !== action.stroke.id);
      await Storage.saveStrokes(strokes);
      renderAllStrokes();
      updateStatusPills();
    } else if (action.type === 'DELETE_STROKES') {
      strokes.push(...action.strokes);
      await Storage.saveStrokes(strokes);
      renderAllStrokes();
      updateStatusPills();
    } else if (action.type === 'MOVE_CARD') {
      const quote = quotes.find(q => q.id === action.id);
      if (quote) {
        quote.x = action.prevX;
        quote.y = action.prevY;
        await Storage.updateQuote(action.id, { x: action.prevX, y: action.prevY });
        const cardEl = document.getElementById(`card-${action.id}`);
        if (cardEl) {
          cardEl.style.left = `${action.prevX}px`;
          cardEl.style.top = `${action.prevY}px`;
        }
      }
    }
  }

  /**
   * Fit Viewport to All Content (Cards + Ink Strokes)
   */
  function fitToContent() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    quotes.forEach(q => {
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x + (q.width || 320) > maxX) maxX = q.x + (q.width || 320);
      if (q.y + 200 > maxY) maxY = q.y + 200;
    });

    strokes.forEach(s => {
      s.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });

    if (minX === Infinity) {
      // Empty canvas, reset to origin
      viewport = { panX: 100, panY: 100, zoom: 1.0 };
      updateViewportTransforms();
      Storage.saveViewport(viewport);
      return;
    }

    const padding = 80;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    const scaleX = screenW / contentW;
    const scaleY = screenH / contentH;
    const fitZoom = Math.min(1.5, Math.max(CanvasCore.MIN_ZOOM, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    viewport.zoom = fitZoom;
    viewport.panX = screenW / 2 - centerX * fitZoom;
    viewport.panY = screenH / 2 - centerY * fitZoom;

    updateViewportTransforms();
    Storage.saveViewport(viewport);
  }

  /**
   * Keyboard Shortcuts
   */
  function setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'p' || e.key === 'P') {
        setActiveTool('pen');
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('highlighter');
      } else if (e.key === 'e' || e.key === 'E') {
        setActiveTool('eraser');
      } else if (e.key === 'f' || e.key === 'F') {
        fitToContent();
      } else if (e.code === 'Space' && !isSpacePressed) {
        isSpacePressed = true;
        viewportContainer.classList.add('cursor-panning');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        isSpacePressed = false;
        viewportContainer.classList.remove('cursor-panning');
      }
    });
  }

  /**
   * Real-Time Storage Sync (Side Panel <-> Canvas Live Updates)
   */
  function setupStorageSync() {
    Storage.onChanged(async (changes) => {
      if (changes[STORAGE_KEYS.QUOTES]) {
        quotes = await Storage.getQuotes();
        renderCards();
      }
      if (changes[STORAGE_KEYS.STROKES]) {
        strokes = await Storage.getStrokes();
        renderAllStrokes();
        updateStatusPills();
      }
    });
  }

  /**
   * Status Bar Indicators & Apple Pencil Detection
   */
  function updatePointerDeviceTag(e) {
    if (!e) return;
    const type = e.pointerType || 'mouse';
    if (type === 'pen') {
      const pressureText = e.pressure ? ` (${Math.round(e.pressure * 100)}% pressure)` : '';
      pointerDeviceTag.textContent = `✍️ Apple Pencil / Stylus Active${pressureText}`;
      pointerDeviceTag.style.color = '#38bdf8';
    } else if (type === 'touch') {
      pointerDeviceTag.textContent = `📱 Touch Gesture Active`;
      pointerDeviceTag.style.color = '#10b981';
    } else {
      pointerDeviceTag.textContent = `🖱 Mouse Pointer`;
      pointerDeviceTag.style.color = '#94a3b8';
    }
  }

  function updateCoordsTag(pt) {
    if (!pt) return;
    coordsTag.textContent = `World: (${Math.round(pt.x)}, ${Math.round(pt.y)})`;
  }

  function updateStatusPills() {
    cardCountTag.textContent = `${quotes.length} Card${quotes.length === 1 ? '' : 's'}`;
    strokeCountTag.textContent = `${strokes.length} Stroke${strokes.length === 1 ? '' : 's'}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
