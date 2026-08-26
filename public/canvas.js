// canvas.js - Detective Map V2.0 Living Learning Map Controller

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const viewportContainer = document.getElementById('viewport-container');
  const gridBackground = document.getElementById('grid-background');
  const worldMapLayer = document.getElementById('world-map-layer');
  const svgEdgesLayer = document.getElementById('svg-edges-layer');
  const conceptsContainer = document.getElementById('concepts-container');
  const inkCanvas = document.getElementById('ink-canvas');
  const scratchCanvas = document.getElementById('scratch-canvas');
  const ctx = inkCanvas.getContext('2d');
  const scratchCtx = scratchCanvas.getContext('2d');

  // Toolbar Elements
  const selectWorkspace = document.getElementById('select-workspace');
  const btnNewWorkspace = document.getElementById('btn-new-workspace');
  const toolBtns = document.querySelectorAll('.tool-btn');
  const btnAddSource = document.getElementById('btn-add-source');
  const btnAddConcept = document.getElementById('btn-add-concept');
  const btnUndo = document.getElementById('btn-undo');
  const btnZoomFit = document.getElementById('btn-zoom-fit');
  const btnExport = document.getElementById('btn-export-canvas');
  const btnCloudSync = document.getElementById('btn-cloud-sync');
  const btnPairDeviceMenu = document.getElementById('btn-pair-device-menu');
  const cloudSyncIcon = document.getElementById('cloud-sync-icon');
  const cloudSyncLabel = document.getElementById('cloud-sync-label');

  // Status & Modal Elements
  const pointerDeviceTag = document.getElementById('pointer-device-tag');
  const coordsTag = document.getElementById('coords-tag');
  const conceptCountTag = document.getElementById('concept-count-tag');
  const edgeCountTag = document.getElementById('edge-count-tag');
  const strokeCountTag = document.getElementById('stroke-count-tag');

  // Proposal Toast & Review Modal
  const proposalToast = document.getElementById('proposal-toast');
  const proposalSummary = document.getElementById('proposal-summary');
  const proposalStats = document.getElementById('proposal-stats');
  const btnApplyProposalAll = document.getElementById('btn-apply-proposal-all');
  const btnReviewProposal = document.getElementById('btn-review-proposal');
  const btnDismissProposal = document.getElementById('btn-dismiss-proposal');

  // Source Failed Toast
  const sourceFailedToast = document.getElementById('source-failed-toast');
  const sourceFailedTitle = document.getElementById('source-failed-title');
  const sourceFailedDesc = document.getElementById('source-failed-desc');
  const btnRetrySource = document.getElementById('btn-retry-source');
  const btnDismissFailedSource = document.getElementById('btn-dismiss-failed-source');
  let currentFailedSourceId = null;

  const proposalReviewModal = document.getElementById('proposal-review-modal');
  const reviewProposalSummary = document.getElementById('review-proposal-summary');
  const reviewOperationsList = document.getElementById('review-operations-list');
  const btnCloseReviewModal = document.getElementById('btn-close-review-modal');
  const btnApplySelectedOps = document.getElementById('btn-apply-selected-ops');
  const btnRejectProposalAll = document.getElementById('btn-reject-proposal-all');

  // Evidence Drawer
  const evidenceDrawer = document.getElementById('evidence-drawer');
  const drawerConceptTitle = document.getElementById('drawer-concept-title');
  const drawerContent = document.getElementById('drawer-content');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');

  // Add Source Modal
  const addSourceModal = document.getElementById('add-source-modal');
  const formAddSource = document.getElementById('form-add-source');
  const inputSourceTitle = document.getElementById('input-source-title');
  const inputSourceUrl = document.getElementById('input-source-url');
  const inputSourceText = document.getElementById('input-source-text');
  const sourceWordCount = document.getElementById('source-word-count');
  const btnCloseSourceModal = document.getElementById('btn-close-source-modal');

  // Device Pairing & PIN Modal
  const pairingModal = document.getElementById('pairing-modal');
  const formPair = document.getElementById('form-pair');
  const inputPairingCode = document.getElementById('input-pairing-code');
  const pairingErrorMsg = document.getElementById('pairing-error-msg');

  const generatePinModal = document.getElementById('generate-pin-modal');
  const generatedPinText = document.getElementById('generated-pin-text');
  const btnClosePinModal = document.getElementById('btn-close-pin-modal');
  const btnCopyPin = document.getElementById('btn-copy-pin');

  // State
  let activeWorkspaceId = 'ws_default';
  let workspaces = [];
  let concepts = [];
  let edges = [];
  let sources = [];
  let strokes = [];
  let pendingProposals = [];
  let viewport = { panX: 100, panY: 100, zoom: 1.0 };
  let activeTool = 'select'; // 'select' | 'connect' | 'pen' | 'highlighter' | 'eraser'

  // Interaction State
  let isDrawing = false;
  let activePenPointerId = null;
  let currentStroke = null;
  let isPanning = false;
  let isSpacePressed = false;
  let panStart = { x: 0, y: 0 };
  let panOrigin = { x: viewport.panX, y: viewport.panY };

  let isDraggingConcept = false;
  let draggedConceptId = null;
  let conceptDragOffset = { x: 0, y: 0 };

  // Connect Mode State
  let connectingFromId = null;

  // Multi-touch gestures (Pinch-to-zoom on iPad)
  const activePointers = new Map();
  let initialPinchDistance = null;
  let initialPinchZoom = 1.0;
  let pinchCenterScreen = { x: 0, y: 0 };
  let dpr = window.devicePixelRatio || 1;

  // Initialize
  await init();

  async function init() {
    setupCanvasResolution();
    window.addEventListener('resize', handleResize);

    // Load initial data & sync workspaces
    activeWorkspaceId = await Storage.getActiveWorkspaceId();
    if (Storage.cloudSync) {
      Storage.cloudSync.activeWorkspaceId = activeWorkspaceId;
    }
    await loadWorkspaceData();

    setupToolListeners();
    setupPointerListeners();
    setupKeyboardListeners();
    setupModals();
    setupCloudSyncUI();
    setupStorageSync();

    setActiveTool('select');
  }

  function setupCanvasResolution() {
    dpr = window.devicePixelRatio || 1;
    const rect = viewportContainer.getBoundingClientRect();
    [inkCanvas, scratchCanvas].forEach(c => {
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    });
  }

  function handleResize() {
    setupCanvasResolution();
    renderAllStrokes();
    renderEdges();
  }

  async function loadWorkspaceData() {
    // Refresh workspaces and hydrate state from cloud on load
    workspaces = await Storage.fetchRemoteWorkspaces();
    updateWorkspaceDropdown();

    await Storage.fetchRemoteState();

    [concepts, edges, sources, strokes, pendingProposals] = await Promise.all([
      Storage.getConcepts(),
      Storage.getEdges(),
      Storage.getSources(),
      Storage.getStrokes(),
      Storage.getProposals()
    ]);

    updateViewportTransforms();
    renderConcepts();
    renderEdges();
    renderAllStrokes();
    updateStatusPills();
    checkPendingProposals();
  }

  function updateWorkspaceDropdown() {
    selectWorkspace.innerHTML = '';
    workspaces.forEach(ws => {
      const opt = document.createElement('option');
      opt.value = ws.id;
      opt.textContent = ws.title || 'Untitled Map';
      opt.selected = ws.id === activeWorkspaceId;
      selectWorkspace.appendChild(opt);
    });
  }

  function updateViewportTransforms() {
    worldMapLayer.style.transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;

    const gridSize = 32 * viewport.zoom;
    gridBackground.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    gridBackground.style.backgroundPosition = `${viewport.panX}px ${viewport.panY}px`;

    renderEdges();
    renderAllStrokes();
  }

  // --- Concept Nodes & Edges Rendering ---
  function renderConcepts() {
    conceptsContainer.innerHTML = '';

    concepts.forEach(c => {
      const node = document.createElement('div');
      node.className = 'concept-node';
      node.id = `concept-${c.id}`;
      node.style.left = `${c.x}px`;
      node.style.top = `${c.y}px`;
      node.style.width = `${c.width || 240}px`;

      const sourceCount = (c.sourceRefs || []).length;
      const badgeHtml = sourceCount > 0 ? `<span class="badge-sources" data-id="${c.id}" title="View supporting evidence">📚 ${sourceCount}</span>` : '';

      node.innerHTML = `
        <div class="concept-header" data-id="${c.id}">
          <span class="concept-title" contenteditable="true" data-id="${c.id}">${escapeHtml(c.label)}</span>
          <div class="concept-actions">
            ${badgeHtml}
            <button class="btn-card-close" data-id="${c.id}" title="Delete Concept">✕</button>
          </div>
        </div>
        <div class="concept-body" contenteditable="true" data-id="${c.id}">${escapeHtml(c.description || '')}</div>
        <div class="concept-connector" data-id="${c.id}" title="Drag to connect"></div>
      `;

      // Header dragging in Select mode
      const headerEl = node.querySelector('.concept-header');
      headerEl.addEventListener('pointerdown', (e) => handleConceptPointerDown(e, c));

      // Inline text editing (Authoritative single-write REST)
      const titleEl = node.querySelector('.concept-title');
      titleEl.addEventListener('blur', async () => {
        const newLabel = titleEl.textContent.trim();
        if (newLabel && newLabel !== c.label) {
          c.label = newLabel;
          await Storage.updateConcept(c.id, { label: newLabel });
        }
      });

      const bodyEl = node.querySelector('.concept-body');
      bodyEl.addEventListener('blur', async () => {
        const newDesc = bodyEl.textContent.trim();
        if (newDesc !== c.description) {
          c.description = newDesc;
          await Storage.updateConcept(c.id, { description: newDesc });
        }
      });

      // Evidence drawer badge click
      const badgeEl = node.querySelector('.badge-sources');
      if (badgeEl) {
        badgeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          openEvidenceDrawer(c);
        });
      }

      // Connector dot (Connect mode)
      const connectorEl = node.querySelector('.concept-connector');
      connectorEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        connectingFromId = c.id;
        viewportContainer.classList.add('cursor-connect');
      });

      node.addEventListener('pointerup', async () => {
        if (connectingFromId && connectingFromId !== c.id) {
          await Storage.addEdge({
            fromId: connectingFromId,
            toId: c.id,
            relation: 'relates',
            label: ''
          });
          edges = await Storage.getEdges();
          renderEdges();
          connectingFromId = null;
          viewportContainer.classList.remove('cursor-connect');
        }
      });

      // Delete concept
      const closeBtn = node.querySelector('.btn-card-close');
      closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove concept "${c.label}"?`)) {
          await Storage.deleteConcept(c.id);
          concepts = await Storage.getConcepts();
          edges = await Storage.getEdges();
          renderConcepts();
          renderEdges();
          updateStatusPills();
        }
      });

      conceptsContainer.appendChild(node);
    });

    updateStatusPills();
  }

  function renderEdges() {
    svgEdgesLayer.innerHTML = '';

    edges.forEach(edge => {
      const fromEl = document.getElementById(`concept-${edge.fromId || edge.from}`);
      const toEl = document.getElementById(`concept-${edge.toId || edge.to}`);
      if (!fromEl || !toEl) return;

      const fromX = parseFloat(fromEl.style.left) + (parseFloat(fromEl.style.width) || 240) / 2;
      const fromY = parseFloat(fromEl.style.top) + fromEl.offsetHeight / 2;
      const toX = parseFloat(toEl.style.left) + (parseFloat(toEl.style.width) || 240) / 2;
      const toY = parseFloat(toEl.style.top) + toEl.offsetHeight / 2;

      const dx = (toX - fromX) / 2;
      const pathD = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('class', 'edge-path');
      svgEdgesLayer.appendChild(path);

      if (edge.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (fromX + toX) / 2);
        text.setAttribute('y', (fromY + toY) / 2 - 5);
        text.setAttribute('class', 'edge-label-text');
        text.textContent = edge.label;
        svgEdgesLayer.appendChild(text);
      }
    });

    edgeCountTag.textContent = `${edges.length} Edge${edges.length === 1 ? '' : 's'}`;
  }

  // --- Dual Canvas Ink Engine ---
  function renderAllStrokes() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);

    ctx.setTransform(
      viewport.zoom * dpr, 0,
      0, viewport.zoom * dpr,
      viewport.panX * dpr, viewport.panY * dpr
    );

    strokes.forEach(stroke => drawStrokeOnContext(ctx, stroke));
  }

  function drawStrokeOnContext(targetCtx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;

    targetCtx.save();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      targetCtx.strokeStyle = stroke.color || '#f59e0b';
      targetCtx.lineWidth = stroke.width || 20;
      targetCtx.globalAlpha = stroke.opacity || 0.35;
    } else {
      targetCtx.strokeStyle = stroke.color || '#38bdf8';
      targetCtx.lineWidth = stroke.width || 3;
      targetCtx.globalAlpha = stroke.opacity || 1.0;
    }

    const pts = stroke.points;
    if (pts.length === 1) {
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, (stroke.width || 3) / 2, 0, Math.PI * 2);
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

    targetCtx.restore();
  }

  // --- Pointer Routing & Apple Pencil / Touch Separation (CRITICAL 5: Palm Rejection) ---
  function setupPointerListeners() {
    viewportContainer.addEventListener('pointerdown', handleViewportPointerDown);
    inkCanvas.addEventListener('pointerdown', handleInkPointerDown);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    viewportContainer.addEventListener('wheel', handleWheel, { passive: false });
  }

  function handleViewportPointerDown(e) {
    if (e.target.closest('.concept-node') || e.target.closest('.proposal-banner') || e.target.closest('.evidence-drawer')) return;

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    updatePointerDeviceTag(e);

    // If pen is currently drawing, ignore palm/touch completely
    if (isDrawing && activePenPointerId !== null) {
      if (e.pointerType === 'touch') return;
    }

    // Multi-touch pinch zoom ONLY when not drawing with pen
    if (activePointers.size === 2 && !isDrawing) {
      isPanning = false;
      const pts = Array.from(activePointers.values());
      initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchZoom = viewport.zoom;
      pinchCenterScreen = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      return;
    }

    // Touch pointer or Space panning: Touch NEVER creates ink
    if (isSpacePressed || e.button === 1 || (e.pointerType === 'touch' && !isDrawing) || (activeTool === 'select' && e.button === 0)) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panOrigin = { x: viewport.panX, y: viewport.panY };
      viewportContainer.classList.add('cursor-panning-active');
    }
  }

  function handleInkPointerDown(e) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    updatePointerDeviceTag(e);

    // Resting palm while pencil is down MUST NOT interrupt pencil stroke
    if (isDrawing && activePenPointerId !== null) {
      if (e.pointerType === 'touch') {
        return;
      }
    }

    // Multi-touch pinch zoom ONLY when no pen stroke is active
    if (activePointers.size === 2 && !isDrawing) {
      isPanning = false;
      const pts = Array.from(activePointers.values());
      initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchZoom = viewport.zoom;
      pinchCenterScreen = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      return;
    }

    // Touch pointer handling: Touch NEVER draws ink!
    if (e.pointerType === 'touch') {
      if (!isDrawing) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        panOrigin = { x: viewport.panX, y: viewport.panY };
        viewportContainer.classList.add('cursor-panning-active');
      }
      return;
    }

    // Spacebar or middle click panning
    if (isSpacePressed || e.button === 1) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panOrigin = { x: viewport.panX, y: viewport.panY };
      viewportContainer.classList.add('cursor-panning-active');
      return;
    }

    const worldPoint = screenToWorld(e.clientX, e.clientY);
    updateCoordsTag(worldPoint);

    // Drawing Tools: Allowed ONLY for Apple Pencil ('pen') or Mouse on desktop!
    if ((e.pointerType === 'pen' || e.pointerType === 'mouse') && (activeTool === 'pen' || activeTool === 'highlighter')) {
      isDrawing = true;
      activePenPointerId = e.pointerId;
      inkCanvas.setPointerCapture(e.pointerId);

      currentStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        workspaceId: activeWorkspaceId,
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

      scratchCtx.setTransform(
        viewport.zoom * dpr, 0,
        0, viewport.zoom * dpr,
        viewport.panX * dpr, viewport.panY * dpr
      );
      return;
    }

    // Eraser Tool
    if (activeTool === 'eraser' && (e.pointerType === 'pen' || e.pointerType === 'mouse')) {
      eraseStrokesAtPoint(worldPoint);
    }
  }

  function handlePointerMove(e) {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    }

    // Multi-touch pinch zoom ONLY when no pen stroke is active
    if (activePointers.size === 2 && initialPinchDistance && !isDrawing) {
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

    if (isPanning && !isDrawing) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      viewport.panX = panOrigin.x + dx;
      viewport.panY = panOrigin.y + dy;
      updateViewportTransforms();
      return;
    }

    if (isDraggingConcept && draggedConceptId) {
      const worldPoint = screenToWorld(e.clientX, e.clientY);
      const newX = Math.round(worldPoint.x - conceptDragOffset.x);
      const newY = Math.round(worldPoint.y - conceptDragOffset.y);

      const node = document.getElementById(`concept-${draggedConceptId}`);
      if (node) {
        node.style.left = `${newX}px`;
        node.style.top = `${newY}px`;
      }
      renderEdges();
      return;
    }

    const worldPoint = screenToWorld(e.clientX, e.clientY);
    updateCoordsTag(worldPoint);

    // Only active pen pointer ID appends ink points; ignore palm movements!
    if (isDrawing && currentStroke && e.pointerId === activePenPointerId) {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) {
        const pt = screenToWorld(ev.clientX, ev.clientY);
        currentStroke.points.push({
          x: pt.x,
          y: pt.y,
          pressure: typeof ev.pressure === 'number' && ev.pressure > 0 ? ev.pressure : 0.5
        });
      }

      scratchCtx.clearRect(-10000, -10000, 20000, 20000);
      drawStrokeOnContext(scratchCtx, currentStroke);
      return;
    }

    if (activeTool === 'eraser' && (e.buttons === 1 || e.pressure > 0) && (e.pointerType === 'pen' || e.pointerType === 'mouse')) {
      eraseStrokesAtPoint(worldPoint);
    }
  }

  async function handlePointerUp(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) initialPinchDistance = null;

    if (isPanning && !isDrawing) {
      isPanning = false;
      viewportContainer.classList.remove('cursor-panning-active');
    }

    if (isDraggingConcept && draggedConceptId) {
      const node = document.getElementById(`concept-${draggedConceptId}`);
      if (node) {
        node.classList.remove('dragging');
        const finalX = parseFloat(node.style.left);
        const finalY = parseFloat(node.style.top);
        await Storage.updateConcept(draggedConceptId, { x: finalX, y: finalY });
      }
      isDraggingConcept = false;
      draggedConceptId = null;
    }

    if (isDrawing && currentStroke && e.pointerId === activePenPointerId) {
      isDrawing = false;
      activePenPointerId = null;
      scratchCtx.clearRect(-10000, -10000, 20000, 20000);

      if (currentStroke.points.length > 0) {
        strokes.push(currentStroke);
        await Storage.addStroke(currentStroke);
        renderAllStrokes();
        updateStatusPills();
      }
      currentStroke = null;
    }
  }

  function handleConceptPointerDown(e, concept) {
    if (e.target.closest('.btn-card-close') || e.target.closest('.badge-sources') || e.target.getAttribute('contenteditable') === 'true') return;

    e.stopPropagation();
    isDraggingConcept = true;
    draggedConceptId = concept.id;

    const worldPoint = screenToWorld(e.clientX, e.clientY);
    conceptDragOffset = {
      x: worldPoint.x - concept.x,
      y: worldPoint.y - concept.y
    };

    const node = document.getElementById(`concept-${concept.id}`);
    if (node) node.classList.add('dragging');
  }

  async function eraseStrokesAtPoint(worldPoint) {
    const eraserRadius = 16 / viewport.zoom;
    const hitIds = [];
    const remaining = [];

    strokes.forEach(s => {
      if (CanvasCore.isStrokeHit(worldPoint, s, eraserRadius)) {
        hitIds.push(s.id);
      } else {
        remaining.push(s);
      }
    });

    if (hitIds.length > 0) {
      strokes = remaining;
      await Storage.deleteStrokes(hitIds);
      renderAllStrokes();
      updateStatusPills();
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const targetZoom = viewport.zoom * zoomFactor;
      const newVp = CanvasCore.zoomTowardPoint(targetZoom, viewport.zoom, viewport.panX, viewport.panY, e.clientX, e.clientY);
      viewport = newVp;
      updateViewportTransforms();
    }
  }

  // --- Proposal Review & Ingestion UI ---
  function checkPendingProposals() {
    if (pendingProposals.length > 0) {
      const p = pendingProposals[0];
      const ops = p.operations || [];
      const addCount = ops.filter(o => o.op === 'add_concept').length;
      const enrichCount = ops.filter(o => o.op === 'enrich_concept').length;
      const edgeCount = ops.filter(o => o.op === 'add_edge').length;

      proposalSummary.textContent = p.summary || 'New learning material processed';
      proposalStats.textContent = `+ ${addCount} Concepts  |  + ${edgeCount} Relationships  |  ~ ${enrichCount} Enriched`;
      proposalToast.style.display = 'block';
      if (sourceFailedToast) sourceFailedToast.style.display = 'none';
    } else {
      proposalToast.style.display = 'none';
      checkFailedSources();
    }
  }

  function checkFailedSources() {
    if (!sourceFailedToast) return;
    const failedSource = sources.find(s => s.processingStatus === 'failed');
    if (failedSource && pendingProposals.length === 0) {
      currentFailedSourceId = failedSource.id;
      sourceFailedTitle.textContent = `AI analysis failed for "${failedSource.title || 'Source'}".`;
      sourceFailedDesc.textContent = failedSource.processingError || 'Your source text is safely saved. Click below to retry AI analysis.';
      sourceFailedToast.style.display = 'block';
    } else {
      sourceFailedToast.style.display = 'none';
    }
  }

  btnRetrySource?.addEventListener('click', async () => {
    if (!currentFailedSourceId) return;
    btnRetrySource.disabled = true;
    btnRetrySource.textContent = 'Retrying...';
    try {
      await Storage.retrySource(currentFailedSourceId);
      sourceFailedToast.style.display = 'none';
    } catch (err) {
      alert('Retry error: ' + err.message);
    }
    btnRetrySource.disabled = false;
    btnRetrySource.textContent = 'Retry Analysis';
  });

  btnDismissFailedSource?.addEventListener('click', () => {
    if (sourceFailedToast) sourceFailedToast.style.display = 'none';
  });

  async function executeApplyProposal(proposalId, operations) {
    try {
      await Storage.applyProposal(proposalId, operations);
      pendingProposals = pendingProposals.filter(p => p.id !== proposalId);
      await Storage.saveProposalsLocal(pendingProposals);
      await loadWorkspaceData();
      proposalToast.style.display = 'none';
      proposalReviewModal.style.display = 'none';
    } catch (err) {
      if (err.status === 409 || err.code === 'PROPOSAL_STALE') {
        alert('⚠️ Map changed since this proposal was created. Re-analyze.');
        pendingProposals = pendingProposals.filter(p => p.id !== proposalId);
        await Storage.saveProposalsLocal(pendingProposals);
        proposalToast.style.display = 'none';
        proposalReviewModal.style.display = 'none';
        checkPendingProposals();
      } else {
        alert(`Error applying proposal: ${err.message}`);
      }
    }
  }

  btnApplyProposalAll.addEventListener('click', async () => {
    if (pendingProposals.length === 0) return;
    const p = pendingProposals[0];
    btnApplyProposalAll.textContent = 'Applying...';
    btnApplyProposalAll.disabled = true;

    await executeApplyProposal(p.id, p.operations);

    btnApplyProposalAll.textContent = 'Apply All';
    btnApplyProposalAll.disabled = false;
  });

  btnReviewProposal.addEventListener('click', () => {
    if (pendingProposals.length === 0) return;
    const p = pendingProposals[0];
    openProposalReviewModal(p);
  });

  function openProposalReviewModal(proposal) {
    reviewProposalSummary.textContent = proposal.summary || 'Review proposed graph modifications:';
    reviewOperationsList.innerHTML = '';

    const ops = proposal.operations || [];
    ops.forEach((op, index) => {
      const card = document.createElement('div');
      const isMerge = op.op === 'suggest_merge';
      card.className = `review-op-card ${isMerge ? 'warning-card' : ''}`;

      let tagClass = 'tag-add-concept';
      let tagText = '+ Concept';
      let titleText = op.label || 'New Concept';
      let descText = op.description || '';

      if (op.op === 'enrich_concept') {
        tagClass = 'tag-enrich-concept';
        tagText = '~ Enrich';
        const target = concepts.find(c => c.id === op.conceptId);
        titleText = target ? target.label : `Concept (${op.conceptId})`;
        descText = `Addition: ${op.addition}`;
      } else if (op.op === 'add_edge') {
        tagClass = 'tag-add-edge';
        tagText = '🔗 Edge';
        titleText = `${op.from} → ${op.to}`;
        descText = `Relation: ${op.relation || 'relates'} ${op.label ? `("${op.label}")` : ''}`;
      } else if (op.op === 'flag_conflict') {
        tagClass = 'tag-flag-conflict';
        tagText = '⚠️ Conflict';
        const target = concepts.find(c => c.id === op.conceptId);
        titleText = target ? target.label : 'Concept Conflict';
        descText = op.note || 'Potential contradiction';
      } else if (op.op === 'suggest_merge') {
        tagClass = 'tag-suggest-merge';
        tagText = '🔀 Merge';
        titleText = `Merge ${op.conceptA} & ${op.conceptB}`;
        descText = `Reason: ${op.reason || 'Semantic overlap'}`;
      }

      card.innerHTML = `
        <input type="checkbox" class="review-op-checkbox" data-index="${index}" data-op="${op.op}" data-tempid="${op.tempId || ''}" data-from="${op.from || ''}" data-to="${op.to || ''}" ${isMerge ? '' : 'checked'} />
        <div class="review-op-body">
          <div class="review-op-header">
            <span class="review-op-tag ${tagClass}">${tagText}</span>
            <span class="review-op-title">${escapeHtml(titleText)}</span>
          </div>
          <div class="review-op-desc">${escapeHtml(descText)}</div>
          ${isMerge ? '<div class="review-merge-warning">⚠️ Merging concepts is structural. Check box to confirm.</div>' : ''}
        </div>
      `;

      const cb = card.querySelector('.review-op-checkbox');
      cb.addEventListener('change', () => syncReviewDependencies());

      reviewOperationsList.appendChild(card);
    });

    syncReviewDependencies();
    proposalReviewModal.style.display = 'flex';
  }

  // CRITICAL 4: Dependency sync preventing dangling edges in UI
  function syncReviewDependencies() {
    const selectedTempIds = new Set();
    const existingConceptIds = new Set(concepts.map(c => c.id));
    const checkboxes = reviewOperationsList.querySelectorAll('.review-op-checkbox');

    checkboxes.forEach(cb => {
      if (cb.checked && cb.dataset.op === 'add_concept' && cb.dataset.tempid) {
        selectedTempIds.add(cb.dataset.tempid);
      }
    });

    checkboxes.forEach(cb => {
      if (cb.dataset.op === 'add_edge') {
        const from = cb.dataset.from;
        const to = cb.dataset.to;
        const fromOk = existingConceptIds.has(from) || selectedTempIds.has(from);
        const toOk = existingConceptIds.has(to) || selectedTempIds.has(to);

        const card = cb.closest('.review-op-card');
        if (!fromOk || !toOk) {
          cb.checked = false;
          cb.disabled = true;
          card.style.opacity = '0.5';
          card.title = 'Requires target concept to be selected';
        } else {
          cb.disabled = false;
          card.style.opacity = '1.0';
          card.removeAttribute('title');
        }
      }
    });
  }

  btnApplySelectedOps.addEventListener('click', async () => {
    if (pendingProposals.length === 0) return;
    const p = pendingProposals[0];
    const checkboxes = reviewOperationsList.querySelectorAll('.review-op-checkbox');
    const selectedOps = [];

    checkboxes.forEach(cb => {
      if (cb.checked && !cb.disabled) {
        const idx = parseInt(cb.getAttribute('data-index'), 10);
        if (p.operations[idx]) selectedOps.push(p.operations[idx]);
      }
    });

    if (selectedOps.length === 0) {
      alert('No valid operations selected to apply.');
      return;
    }

    btnApplySelectedOps.textContent = 'Applying...';
    btnApplySelectedOps.disabled = true;

    await executeApplyProposal(p.id, selectedOps);

    btnApplySelectedOps.textContent = 'Apply Selected Operations';
    btnApplySelectedOps.disabled = false;
  });

  // Reject proposal persists to server
  btnRejectProposalAll.addEventListener('click', async () => {
    if (pendingProposals.length === 0) return;
    const p = pendingProposals[0];
    await Storage.rejectProposal(p.id);
    pendingProposals.shift();
    proposalReviewModal.style.display = 'none';
    checkPendingProposals();
  });

  btnCloseReviewModal.addEventListener('click', () => {
    proposalReviewModal.style.display = 'none';
  });

  btnDismissProposal.addEventListener('click', async () => {
    if (pendingProposals.length === 0) return;
    const p = pendingProposals[0];
    await Storage.rejectProposal(p.id);
    pendingProposals.shift();
    checkPendingProposals();
  });

  // --- Evidence Drawer ---
  function openEvidenceDrawer(concept) {
    drawerConceptTitle.textContent = concept.label;
    drawerContent.innerHTML = '';

    const refSet = new Set(concept.sourceRefs || []);
    const matchingSources = sources.filter(s => refSet.has(s.id));

    if (matchingSources.length === 0) {
      drawerContent.innerHTML = '<p class="text-dim">No direct evidence captured for this concept.</p>';
    } else {
      matchingSources.forEach(s => {
        const card = document.createElement('div');
        card.className = 'evidence-card';
        card.innerHTML = `
          <div class="evidence-card-title">${escapeHtml(s.title || 'Source Evidence')}</div>
          <div class="evidence-card-body">${escapeHtml(s.text)}</div>
          ${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" class="card-source-link" style="margin-top:8px;">↗ Original Link</a>` : ''}
        `;
        drawerContent.appendChild(card);
      });
    }

    evidenceDrawer.style.display = 'flex';
  }

  btnCloseDrawer.addEventListener('click', () => {
    evidenceDrawer.style.display = 'none';
  });

  // --- Tool Listeners ---
  function setupToolListeners() {
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        setActiveTool(tool);
      });
    });

    // Workspace Switching
    selectWorkspace.addEventListener('change', async (e) => {
      activeWorkspaceId = e.target.value;
      await Storage.setActiveWorkspaceId(activeWorkspaceId);
      await loadWorkspaceData();
    });

    btnNewWorkspace.addEventListener('click', async () => {
      const title = prompt('Enter new learning map name:', 'New Topic Map');
      if (title) {
        const ws = await Storage.createWorkspace(title);
        activeWorkspaceId = ws.id;
        await loadWorkspaceData();
      }
    });

    // Manual Add Concept
    btnAddConcept.addEventListener('click', async () => {
      const label = prompt('Enter Concept Name:');
      if (label) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const worldPt = screenToWorld(cx, cy);
        await Storage.addConcept({
          label,
          description: '',
          x: Math.round(worldPt.x - 120),
          y: Math.round(worldPt.y - 40)
        });
        concepts = await Storage.getConcepts();
        renderConcepts();
      }
    });

    // Fit to Content
    btnZoomFit.addEventListener('click', fitToContent);

    // Export Data
    btnExport.addEventListener('click', async () => {
      const exportData = {
        version: '2.0.0',
        workspace: workspaces.find(w => w.id === activeWorkspaceId),
        workspaces,
        concepts,
        edges,
        sources,
        strokes
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detective-map-${activeWorkspaceId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function setActiveTool(tool) {
    activeTool = tool;
    toolBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tool') === tool));
    viewportContainer.className = `cursor-${tool}`;

    if (tool === 'select' || tool === 'connect') {
      inkCanvas.style.pointerEvents = 'none';
      scratchCanvas.style.pointerEvents = 'none';
    } else {
      inkCanvas.style.pointerEvents = 'auto';
      scratchCanvas.style.pointerEvents = 'none';
    }
  }

  // --- Modals Setup ---
  function setupModals() {
    btnAddSource.addEventListener('click', () => {
      addSourceModal.style.display = 'flex';
      inputSourceText.focus();
    });

    btnCloseSourceModal.addEventListener('click', () => {
      addSourceModal.style.display = 'none';
    });

    inputSourceText.addEventListener('input', () => {
      const text = inputSourceText.value.trim();
      const words = text ? text.split(/\s+/).length : 0;
      sourceWordCount.textContent = `${words} words`;
    });

    formAddSource.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = inputSourceTitle.value.trim() || 'Pasted Article';
      const url = inputSourceUrl.value.trim();
      const text = inputSourceText.value.trim();
      if (!text) return;

      const submitBtn = document.getElementById('btn-submit-source');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Ingesting...';

      await Storage.addSource({
        workspaceId: activeWorkspaceId,
        type: 'pasted_article',
        title,
        url,
        text
      });

      sources = await Storage.getSources();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Analyze & Ingest';
      addSourceModal.style.display = 'none';
      inputSourceText.value = '';
      inputSourceTitle.value = '';
      inputSourceUrl.value = '';

      alert('Source added! AI is processing in the background and will propose incremental updates shortly.');
    });

    // Dynamic PIN Generator Modal (for pairing iPad)
    btnPairDeviceMenu?.addEventListener('click', async () => {
      generatePinModal.style.display = 'flex';
      generatedPinText.textContent = 'Generating...';

      const token = await Storage.cloudSync.getToken();
      if (token) {
        try {
          const res = await fetch(`${CLOUDFLARE_BASE_URL}/api/auth/generate-pin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success && data.pin) {
            generatedPinText.textContent = data.pin;
          } else {
            generatedPinText.textContent = 'Error: ' + (data.error || 'Failed');
          }
        } catch (err) {
          generatedPinText.textContent = 'Error generating PIN';
        }
      } else {
        generatedPinText.textContent = 'Authorize host first';
      }
    });

    btnClosePinModal?.addEventListener('click', () => {
      generatePinModal.style.display = 'none';
    });

    btnCopyPin?.addEventListener('click', () => {
      const pin = generatedPinText.textContent;
      if (pin && !pin.startsWith('Generating') && !pin.startsWith('Error')) {
        navigator.clipboard.writeText(pin);
        btnCopyPin.textContent = '✓ PIN Copied!';
        setTimeout(() => { btnCopyPin.textContent = 'Copy Pairing PIN'; }, 2000);
      }
    });
  }

  function setupCloudSyncUI() {
    if (Storage.cloudSync) {
      Storage.cloudSync.onStatusChange((status) => {
        if (status === 'connected') {
          cloudSyncIcon.textContent = '🟢';
          cloudSyncLabel.textContent = 'Sync: Live (Cloud)';
          pairingModal.style.display = 'none';
        } else if (status === 'connecting') {
          cloudSyncIcon.textContent = '🟡';
          cloudSyncLabel.textContent = 'Sync: Connecting...';
        } else if (status === 'unpaired') {
          cloudSyncIcon.textContent = '🔒';
          cloudSyncLabel.textContent = 'Pair Device';
          pairingModal.style.display = 'flex';
        } else {
          cloudSyncIcon.textContent = '🔴';
          cloudSyncLabel.textContent = 'Sync: Offline (Local)';
        }
      });
    }

    btnCloudSync?.addEventListener('click', () => {
      pairingModal.style.display = 'flex';
      inputPairingCode.focus();
    });

    formPair?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inputPairingCode.value.trim();
      if (!code) return;

      const submitBtn = document.getElementById('btn-submit-pair');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      const res = await Storage.cloudSync.pairDevice(code, navigator.userAgent.includes('iPad') ? 'iPad' : 'Desktop');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pair & Connect';

      if (res.success) {
        pairingModal.style.display = 'none';
        await loadWorkspaceData();
      } else {
        pairingErrorMsg.textContent = res.error || 'Invalid or expired Pairing PIN / Secret';
        pairingErrorMsg.style.display = 'block';
      }
    });
  }

  function setupStorageSync() {
    Storage.onChanged(async (changes) => {
      if (changes[STORAGE_KEYS.WORKSPACES]) {
        workspaces = changes[STORAGE_KEYS.WORKSPACES].newValue || await Storage.getWorkspaces();
        updateWorkspaceDropdown();
      }
      if (changes[STORAGE_KEYS.CONCEPTS]) {
        concepts = await Storage.getConcepts();
        renderConcepts();
        renderEdges();
      }
      if (changes[STORAGE_KEYS.EDGES]) {
        edges = await Storage.getEdges();
        renderEdges();
      }
      if (changes[STORAGE_KEYS.SOURCES]) {
        sources = await Storage.getSources();
      }
      if (changes[STORAGE_KEYS.INK_STROKES]) {
        strokes = await Storage.getStrokes();
        renderAllStrokes();
      }
      if (changes[STORAGE_KEYS.PROPOSALS]) {
        pendingProposals = await Storage.getProposals();
        checkPendingProposals();
      }
      if (changes[STORAGE_KEYS.ACTIVE_WS]) {
        activeWorkspaceId = await Storage.getActiveWorkspaceId();
        await loadWorkspaceData();
      }
    });
  }

  function fitToContent() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    concepts.forEach(c => {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + (c.width || 240) > maxX) maxX = c.x + (c.width || 240);
      if (c.y + 150 > maxY) maxY = c.y + 150;
    });

    strokes.forEach(s => {
      s.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });

    if (minX === Infinity) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const padding = 100;
    const fitZoom = Math.min(1.5, Math.max(CanvasCore.MIN_ZOOM, Math.min(screenW / (maxX - minX + padding * 2), screenH / (maxY - minY + padding * 2))));

    viewport.zoom = fitZoom;
    viewport.panX = screenW / 2 - ((minX + maxX) / 2) * fitZoom;
    viewport.panY = screenH / 2 - ((minY + maxY) / 2) * fitZoom;
    updateViewportTransforms();
  }

  function setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.getAttribute('contenteditable') === 'true') return;

      if (e.key === 'v' || e.key === 'V') setActiveTool('select');
      else if (e.key === 'c' || e.key === 'C') setActiveTool('connect');
      else if (e.key === 'p' || e.key === 'P') setActiveTool('pen');
      else if (e.key === 'h' || e.key === 'H') setActiveTool('highlighter');
      else if (e.key === 'e' || e.key === 'E') setActiveTool('eraser');
      else if (e.key === 'f' || e.key === 'F') fitToContent();
      else if (e.code === 'Space' && !isSpacePressed) {
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

  function screenToWorld(sx, sy) {
    return {
      x: (sx - viewport.panX) / viewport.zoom,
      y: (sy - viewport.panY) / viewport.zoom
    };
  }

  function updatePointerDeviceTag(e) {
    if (!e) return;
    const type = e.pointerType || 'mouse';
    if (type === 'pen') {
      const p = e.pressure ? ` (${Math.round(e.pressure * 100)}%)` : '';
      pointerDeviceTag.textContent = `✍️ Apple Pencil Active${p}`;
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
    conceptCountTag.textContent = `${concepts.length} Concept${concepts.length === 1 ? '' : 's'}`;
    strokeCountTag.textContent = `${strokes.length} Stroke${strokes.length === 1 ? '' : 's'}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
});
