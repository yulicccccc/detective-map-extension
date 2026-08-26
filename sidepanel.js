// sidepanel.js - Detective Map V2.0 Living Learning Map Side Panel Controller

document.addEventListener('DOMContentLoaded', async () => {
  // Tabs & Nav
  const tabBtnMap = document.getElementById('tab-btn-map');
  const tabBtnSources = document.getElementById('tab-btn-sources');
  const tabContentMap = document.getElementById('tab-content-map');
  const tabContentSources = document.getElementById('tab-content-sources');
  const conceptBadge = document.getElementById('sp-concept-badge');
  const sourceBadge = document.getElementById('sp-source-badge');

  // Header Elements
  const selectWorkspace = document.getElementById('sp-select-workspace');
  const btnNewWs = document.getElementById('sp-btn-new-ws');
  const btnAddSourceQuick = document.getElementById('sp-btn-add-source-quick');
  const btnOpenCanvas = document.getElementById('btn-open-canvas');
  const statusText = document.getElementById('sp-status-text');

  // Map Viewport Elements
  const viewportContainer = document.getElementById('sp-viewport-container');
  const gridBackground = document.getElementById('sp-grid-bg');
  const worldLayer = document.getElementById('sp-world-layer');
  const svgEdges = document.getElementById('sp-svg-edges');
  const conceptsContainer = document.getElementById('sp-concepts-container');

  // Mini Map Controls
  const btnZoomIn = document.getElementById('sp-btn-zoom-in');
  const btnZoomOut = document.getElementById('sp-btn-zoom-out');
  const btnZoomFit = document.getElementById('sp-btn-zoom-fit');
  const btnAddConcept = document.getElementById('sp-btn-add-concept');

  // Proposal Toast
  const proposalToast = document.getElementById('sp-proposal-toast');
  const proposalSummary = document.getElementById('sp-proposal-summary');
  const proposalStats = document.getElementById('sp-proposal-stats');
  const btnApplyProposal = document.getElementById('sp-btn-apply-proposal');
  const btnReviewProposal = document.getElementById('sp-btn-review-proposal');
  const btnDismissProposal = document.getElementById('sp-btn-dismiss-proposal');

  // Failure Toast
  const failedToast = document.getElementById('sp-failed-toast');
  const failedTitle = document.getElementById('sp-failed-title');
  const failedDesc = document.getElementById('sp-failed-desc');
  const btnRetry = document.getElementById('sp-btn-retry');
  const btnDismissFailed = document.getElementById('sp-btn-dismiss-failed');

  // Sources Feed Tab
  const btnAddSourceTab = document.getElementById('sp-btn-add-source-tab');
  const sourceFeed = document.getElementById('sp-source-feed');

  // Modals
  const proposalModal = document.getElementById('sp-proposal-modal');
  const reviewSummary = document.getElementById('sp-review-summary');
  const reviewOpsList = document.getElementById('sp-review-ops-list');
  const btnCloseModal = document.getElementById('sp-btn-close-modal');
  const btnRejectAll = document.getElementById('sp-btn-reject-all');
  const btnApplySelected = document.getElementById('sp-btn-apply-selected');

  const evidenceModal = document.getElementById('sp-evidence-modal');
  const evidenceTitle = document.getElementById('sp-evidence-title');
  const evidenceBody = document.getElementById('sp-evidence-body');
  const btnCloseEvidence = document.getElementById('sp-btn-close-evidence');

  const addSourceModal = document.getElementById('sp-add-source-modal');
  const formAddSource = document.getElementById('sp-form-add-source');
  const inputTitle = document.getElementById('sp-input-title');
  const inputText = document.getElementById('sp-input-text');
  const btnSubmitSource = document.getElementById('sp-btn-submit-source');
  const btnCloseAddSource = document.getElementById('sp-btn-close-add-source');

  // State
  let activeWsId = 'ws_default';
  let workspaces = [];
  let concepts = [];
  let edges = [];
  let sources = [];
  let pendingProposals = [];
  let failedSourceId = null;

  // Viewport transformation state
  let viewport = { panX: 20, panY: 20, zoom: 0.85 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let panOrigin = { x: 20, y: 20 };

  let isDraggingCard = false;
  let draggedCardId = null;
  let dragOffset = { x: 0, y: 0 };

  // --- Initialize ---
  await init();

  async function init() {
    activeWsId = await Storage.getActiveWorkspaceId();
    if (Storage.cloudSync) {
      Storage.cloudSync.activeWorkspaceId = activeWsId;
    }

    setupTabs();
    setupMapInteractions();
    setupModals();
    setupHeader();

    await loadData();
    setupStorageListener();

    fitToContent();
  }

  // --- Data Loading ---
  async function loadData() {
    workspaces = await Storage.fetchRemoteWorkspaces();
    updateWorkspaceDropdown();

    [concepts, edges, sources, pendingProposals] = await Promise.all([
      Storage.getConcepts(),
      Storage.getEdges(),
      Storage.getSources(),
      Storage.getProposals()
    ]);

    conceptBadge.textContent = concepts.length;
    sourceBadge.textContent = sources.length;

    renderConcepts();
    renderEdges();
    renderSourceFeed();
    checkBanners();
  }

  function updateWorkspaceDropdown() {
    selectWorkspace.innerHTML = '';
    workspaces.forEach(ws => {
      const opt = document.createElement('option');
      opt.value = ws.id;
      opt.textContent = ws.title || 'Untitled Map';
      opt.selected = ws.id === activeWsId;
      selectWorkspace.appendChild(opt);
    });
  }

  // --- Tabs Navigation ---
  function setupTabs() {
    tabBtnMap.addEventListener('click', () => switchTab('map'));
    tabBtnSources.addEventListener('click', () => switchTab('sources'));
  }

  function switchTab(tabName) {
    if (tabName === 'map') {
      tabBtnMap.classList.add('active');
      tabBtnSources.classList.remove('active');
      tabContentMap.classList.add('active');
      tabContentSources.classList.remove('active');
      tabContentMap.style.display = 'flex';
      tabContentSources.style.display = 'none';
      updateViewportTransforms();
    } else {
      tabBtnSources.classList.add('active');
      tabBtnMap.classList.remove('active');
      tabContentSources.classList.add('active');
      tabContentMap.classList.remove('active');
      tabContentSources.style.display = 'flex';
      tabContentMap.style.display = 'none';
    }
  }

  // --- Header Actions ---
  function setupHeader() {
    selectWorkspace.addEventListener('change', async (e) => {
      activeWsId = e.target.value;
      await Storage.setActiveWorkspaceId(activeWsId);
      await loadData();
      fitToContent();
    });

    btnNewWs.addEventListener('click', async () => {
      const title = prompt('Enter new learning map name:', 'New Topic Map');
      if (title && title.trim()) {
        const ws = await Storage.createWorkspace(title.trim());
        activeWsId = ws.id;
        await loadData();
        fitToContent();
      }
    });

    btnOpenCanvas.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_CANVAS_WINDOW' });
    });

    btnAddSourceQuick.addEventListener('click', () => {
      addSourceModal.style.display = 'flex';
      inputText.focus();
    });

    btnAddSourceTab.addEventListener('click', () => {
      addSourceModal.style.display = 'flex';
      inputText.focus();
    });

    if (Storage.cloudSync) {
      Storage.cloudSync.onStatusChange(st => {
        statusText.textContent = st === 'connected' ? 'Live Cloud Sync' : (st === 'connecting' ? 'Connecting...' : 'Local Mode');
      });
    }
  }

  // --- Map Viewport & Navigation ---
  function setupMapInteractions() {
    viewportContainer.addEventListener('pointerdown', handleMapPointerDown);
    window.addEventListener('pointermove', handleMapPointerMove);
    window.addEventListener('pointerup', handleMapPointerUp);
    viewportContainer.addEventListener('wheel', handleWheel, { passive: false });

    btnZoomIn.addEventListener('click', () => zoomBy(1.15));
    btnZoomOut.addEventListener('click', () => zoomBy(0.85));
    btnZoomFit.addEventListener('click', fitToContent);

    btnAddConcept.addEventListener('click', async () => {
      const label = prompt('Concept Name:');
      if (label && label.trim()) {
        const rect = viewportContainer.getBoundingClientRect();
        const centerWorld = screenToWorld(rect.width / 2, rect.height / 2);
        await Storage.addConcept({
          label: label.trim(),
          description: '',
          x: Math.round(centerWorld.x - 90),
          y: Math.round(centerWorld.y - 30)
        });
        concepts = await Storage.getConcepts();
        renderConcepts();
        conceptBadge.textContent = concepts.length;
      }
    });
  }

  function handleMapPointerDown(e) {
    if (e.target.closest('.sp-concept-card') || e.target.closest('.sp-proposal-banner') || e.target.closest('.sp-map-controls')) return;

    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panOrigin = { x: viewport.panX, y: viewport.panY };
    viewportContainer.classList.add('panning');
  }

  function handleMapPointerMove(e) {
    if (isPanning) {
      viewport.panX = panOrigin.x + (e.clientX - panStart.x);
      viewport.panY = panOrigin.y + (e.clientY - panStart.y);
      updateViewportTransforms();
      return;
    }

    if (isDraggingCard && draggedCardId) {
      const worldPt = screenToWorld(e.clientX, e.clientY);
      const newX = Math.round(worldPt.x - dragOffset.x);
      const newY = Math.round(worldPt.y - dragOffset.y);

      const card = document.getElementById(`sp-node-${draggedCardId}`);
      if (card) {
        card.style.left = `${newX}px`;
        card.style.top = `${newY}px`;
      }
      renderEdges();
    }
  }

  async function handleMapPointerUp(e) {
    if (isPanning) {
      isPanning = false;
      viewportContainer.classList.remove('panning');
    }

    if (isDraggingCard && draggedCardId) {
      const card = document.getElementById(`sp-node-${draggedCardId}`);
      if (card) {
        card.classList.remove('dragging');
        const finalX = parseFloat(card.style.left);
        const finalY = parseFloat(card.style.top);
        await Storage.updateConcept(draggedCardId, { x: finalX, y: finalY });
      }
      isDraggingCard = false;
      draggedCardId = null;
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    zoomToward(viewport.zoom * factor, e.clientX, e.clientY);
  }

  function zoomBy(factor) {
    const rect = viewportContainer.getBoundingClientRect();
    zoomToward(viewport.zoom * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function zoomToward(targetZoom, screenX, screenY) {
    const minZoom = 0.2;
    const maxZoom = 2.0;
    const clampedZoom = Math.min(maxZoom, Math.max(minZoom, targetZoom));

    const rect = viewportContainer.getBoundingClientRect();
    const localX = screenX - rect.left;
    const localY = screenY - rect.top;

    const worldX = (localX - viewport.panX) / viewport.zoom;
    const worldY = (localY - viewport.panY) / viewport.zoom;

    viewport.zoom = clampedZoom;
    viewport.panX = localX - worldX * clampedZoom;
    viewport.panY = localY - worldY * clampedZoom;

    updateViewportTransforms();
  }

  function updateViewportTransforms() {
    worldLayer.style.transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;

    const gridSize = 24 * viewport.zoom;
    gridBackground.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    gridBackground.style.backgroundPosition = `${viewport.panX}px ${viewport.panY}px`;

    renderEdges();
  }

  function screenToWorld(sx, sy) {
    const rect = viewportContainer.getBoundingClientRect();
    const localX = sx - rect.left;
    const localY = sy - rect.top;
    return {
      x: (localX - viewport.panX) / viewport.zoom,
      y: (localY - viewport.panY) / viewport.zoom
    };
  }

  function fitToContent() {
    if (concepts.length === 0) {
      viewport = { panX: 30, panY: 30, zoom: 0.85 };
      updateViewportTransforms();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    concepts.forEach(c => {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + 180 > maxX) maxX = c.x + 180;
      if (c.y + 100 > maxY) maxY = c.y + 100;
    });

    const rect = viewportContainer.getBoundingClientRect();
    const padding = 40;
    const fitZoom = Math.min(1.2, Math.max(0.35, Math.min((rect.width - padding) / (maxX - minX + 20), (rect.height - padding) / (maxY - minY + 20))));

    viewport.zoom = fitZoom;
    viewport.panX = rect.width / 2 - ((minX + maxX) / 2) * fitZoom;
    viewport.panY = rect.height / 2 - ((minY + maxY) / 2) * fitZoom;
    updateViewportTransforms();
  }

  // --- Concept Rendering ---
  function renderConcepts() {
    conceptsContainer.innerHTML = '';

    concepts.forEach(c => {
      const card = document.createElement('div');
      card.className = 'sp-concept-card';
      card.id = `sp-node-${c.id}`;
      card.style.left = `${c.x}px`;
      card.style.top = `${c.y}px`;

      const sourceCount = (c.sourceRefs || []).length;
      const badgeHtml = sourceCount > 0 ? `<span class="sp-card-badge" data-id="${c.id}" title="View evidence">📚 ${sourceCount}</span>` : '';

      card.innerHTML = `
        <div class="sp-card-head" data-id="${c.id}">
          <span class="sp-card-title" contenteditable="true" data-id="${c.id}">${escapeHtml(c.label)}</span>
          <div style="display:flex;align-items:center;">
            ${badgeHtml}
            <button class="sp-card-close" data-id="${c.id}" title="Delete">✕</button>
          </div>
        </div>
        <div class="sp-card-body" contenteditable="true" data-id="${c.id}">${escapeHtml(c.description || '')}</div>
      `;

      // Dragging
      const headEl = card.querySelector('.sp-card-head');
      headEl.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.sp-card-close') || e.target.closest('.sp-card-badge') || e.target.getAttribute('contenteditable') === 'true') return;
        e.stopPropagation();
        isDraggingCard = true;
        draggedCardId = c.id;

        const worldPt = screenToWorld(e.clientX, e.clientY);
        dragOffset = { x: worldPt.x - c.x, y: worldPt.y - c.y };
        card.classList.add('dragging');
      });

      // Inline text edit
      const titleEl = card.querySelector('.sp-card-title');
      titleEl.addEventListener('blur', async () => {
        const val = titleEl.textContent.trim();
        if (val && val !== c.label) {
          c.label = val;
          await Storage.updateConcept(c.id, { label: val });
        }
      });

      const bodyEl = card.querySelector('.sp-card-body');
      bodyEl.addEventListener('blur', async () => {
        const val = bodyEl.textContent.trim();
        if (val !== c.description) {
          c.description = val;
          await Storage.updateConcept(c.id, { description: val });
        }
      });

      // Evidence Modal
      const badgeEl = card.querySelector('.sp-card-badge');
      if (badgeEl) {
        badgeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          openEvidenceModal(c);
        });
      }

      // Delete
      const closeBtn = card.querySelector('.sp-card-close');
      closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove concept "${c.label}"?`)) {
          await Storage.deleteConcept(c.id);
          concepts = await Storage.getConcepts();
          edges = await Storage.getEdges();
          renderConcepts();
          renderEdges();
          conceptBadge.textContent = concepts.length;
        }
      });

      conceptsContainer.appendChild(card);
    });
  }

  function renderEdges() {
    svgEdges.innerHTML = '';

    edges.forEach(edge => {
      const fromEl = document.getElementById(`sp-node-${edge.fromId || edge.from}`);
      const toEl = document.getElementById(`sp-node-${edge.toId || edge.to}`);
      if (!fromEl || !toEl) return;

      const fromX = parseFloat(fromEl.style.left) + 90;
      const fromY = parseFloat(fromEl.style.top) + fromEl.offsetHeight / 2;
      const toX = parseFloat(toEl.style.left) + 90;
      const toY = parseFloat(toEl.style.top) + toEl.offsetHeight / 2;

      const dx = (toX - fromX) / 2;
      const pathD = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('class', 'sp-edge-path');
      svgEdges.appendChild(path);

      if (edge.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (fromX + toX) / 2);
        text.setAttribute('y', (fromY + toY) / 2 - 4);
        text.setAttribute('class', 'sp-edge-label');
        text.textContent = edge.label;
        svgEdges.appendChild(text);
      }
    });
  }

  // --- Sources Feed Rendering ---
  function renderSourceFeed() {
    sourceFeed.innerHTML = '';

    if (sources.length === 0) {
      sourceFeed.innerHTML = `
        <div class="sp-empty">
          <span class="sp-empty-icon">💡</span>
          <p>No sources captured in this topic yet.</p>
          <span style="font-size:10px;color:var(--text-dim);margin-top:4px;display:block;">
            Select text in ChatGPT or click Add above.
          </span>
        </div>
      `;
      return;
    }

    sources.forEach(s => {
      const card = document.createElement('div');
      card.className = 'sp-source-card';

      const statusClass = s.processingStatus === 'completed' ? 'sp-status-completed' : (s.processingStatus === 'failed' ? 'sp-status-failed' : 'sp-status-processing');
      const statusLabel = s.processingStatus === 'completed' ? '✓ Processed' : (s.processingStatus === 'failed' ? '⚠️ Failed (Retry)' : '● Analyzing...');

      card.innerHTML = `
        <div class="sp-src-head">
          <span class="sp-src-title">${escapeHtml(s.title || 'Source Material')}</span>
          <span class="sp-src-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="sp-src-body">${escapeHtml(s.text)}</div>
      `;

      if (s.processingStatus === 'failed') {
        const statusBadge = card.querySelector('.sp-status-failed');
        statusBadge.addEventListener('click', async () => {
          statusBadge.textContent = 'Retrying...';
          await Storage.retrySource(s.id);
        });
      }

      sourceFeed.appendChild(card);
    });
  }

  // --- Proposal & Failure Banners ---
  function checkBanners() {
    if (pendingProposals.length > 0) {
      const p = pendingProposals[0];
      const ops = p.operations || [];
      const addCount = ops.filter(o => o.op === 'add_concept').length;
      const edgeCount = ops.filter(o => o.op === 'add_edge').length;

      proposalSummary.textContent = p.summary || 'AI proposed incremental updates';
      proposalStats.textContent = `+ ${addCount} Concepts | + ${edgeCount} Relationships`;
      proposalToast.style.display = 'block';
      failedToast.style.display = 'none';
    } else {
      proposalToast.style.display = 'none';
      checkFailedBanner();
    }
  }

  function checkFailedBanner() {
    const failed = sources.find(s => s.processingStatus === 'failed');
    if (failed) {
      failedSourceId = failed.id;
      failedTitle.textContent = `AI analysis failed for "${failed.title || 'Source'}"`;
      failedDesc.textContent = failed.processingError || 'Your source text is safely saved. Click Retry.';
      failedToast.style.display = 'block';
    } else {
      failedToast.style.display = 'none';
    }
  }

  // --- Modals Setup ---
  function setupModals() {
    // Apply All Proposal
    btnApplyProposal.addEventListener('click', async () => {
      if (pendingProposals.length === 0) return;
      const p = pendingProposals[0];
      btnApplyProposal.textContent = 'Applying...';
      btnApplyProposal.disabled = true;

      try {
        await Storage.applyProposal(p.id, p.operations);
        pendingProposals.shift();
        await Storage.saveProposalsLocal(pendingProposals);
        await loadData();
        fitToContent();
      } catch (err) {
        alert('Error applying proposal: ' + err.message);
      }

      btnApplyProposal.textContent = 'Apply All';
      btnApplyProposal.disabled = false;
    });

    // Review Proposal
    btnReviewProposal.addEventListener('click', () => {
      if (pendingProposals.length === 0) return;
      const p = pendingProposals[0];
      openProposalModal(p);
    });

    btnDismissProposal.addEventListener('click', async () => {
      if (pendingProposals.length === 0) return;
      const p = pendingProposals[0];
      await Storage.rejectProposal(p.id);
      pendingProposals.shift();
      checkBanners();
    });

    // Retry
    btnRetry.addEventListener('click', async () => {
      if (!failedSourceId) return;
      btnRetry.textContent = 'Retrying...';
      btnRetry.disabled = true;
      await Storage.retrySource(failedSourceId);
      failedToast.style.display = 'none';
      btnRetry.textContent = 'Retry';
      btnRetry.disabled = false;
    });

    btnDismissFailed.addEventListener('click', () => {
      failedToast.style.display = 'none';
    });

    // Review Modal Handlers
    function openProposalModal(proposal) {
      reviewSummary.textContent = proposal.summary || 'Select operations to apply:';
      reviewOpsList.innerHTML = '';

      const ops = proposal.operations || [];
      ops.forEach((op, index) => {
        const item = document.createElement('div');
        item.className = 'sp-op-card';

        let tagText = '+ Concept';
        let labelText = op.label || 'Concept';
        if (op.op === 'enrich_concept') {
          tagText = '~ Enrich';
          const target = concepts.find(c => c.id === op.conceptId);
          labelText = target ? target.label : op.conceptId;
        } else if (op.op === 'add_edge') {
          tagText = '🔗 Edge';
          labelText = `${op.from} → ${op.to}`;
        }

        item.innerHTML = `
          <input type="checkbox" class="sp-op-cb" data-index="${index}" checked />
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
              <span class="sp-op-tag">${tagText}</span>
              <strong style="color:#fff;">${escapeHtml(labelText)}</strong>
            </div>
            <div style="color:var(--text-muted);">${escapeHtml(op.description || op.addition || '')}</div>
          </div>
        `;
        reviewOpsList.appendChild(item);
      });

      proposalModal.style.display = 'flex';
    }

    btnCloseModal.addEventListener('click', () => {
      proposalModal.style.display = 'none';
    });

    btnRejectAll.addEventListener('click', async () => {
      if (pendingProposals.length === 0) return;
      const p = pendingProposals[0];
      await Storage.rejectProposal(p.id);
      pendingProposals.shift();
      proposalModal.style.display = 'none';
      checkBanners();
    });

    btnApplySelected.addEventListener('click', async () => {
      if (pendingProposals.length === 0) return;
      const p = pendingProposals[0];
      const checkboxes = reviewOpsList.querySelectorAll('.sp-op-cb');
      const selectedOps = [];

      checkboxes.forEach(cb => {
        if (cb.checked) {
          const idx = parseInt(cb.dataset.index, 10);
          if (p.operations[idx]) selectedOps.push(p.operations[idx]);
        }
      });

      if (selectedOps.length === 0) {
        alert('Please select at least one operation to apply.');
        return;
      }

      btnApplySelected.textContent = 'Applying...';
      btnApplySelected.disabled = true;

      try {
        await Storage.applyProposal(p.id, selectedOps);
        pendingProposals.shift();
        await Storage.saveProposalsLocal(pendingProposals);
        proposalModal.style.display = 'none';
        await loadData();
        fitToContent();
      } catch (err) {
        alert('Error: ' + err.message);
      }

      btnApplySelected.textContent = 'Apply Selected';
      btnApplySelected.disabled = false;
    });

    // Evidence Modal
    function openEvidenceModal(concept) {
      evidenceTitle.textContent = `📚 ${concept.label}`;
      evidenceBody.innerHTML = '';

      const refSet = new Set(concept.sourceRefs || []);
      const matched = sources.filter(s => refSet.has(s.id));

      if (matched.length === 0) {
        evidenceBody.innerHTML = '<p style="color:var(--text-dim);">No direct text evidence attached.</p>';
      } else {
        matched.forEach(s => {
          const block = document.createElement('div');
          block.style.marginBottom = '8px';
          block.style.padding = '6px';
          block.style.background = 'rgba(0,0,0,0.3)';
          block.style.borderRadius = '4px';
          block.innerHTML = `
            <div style="font-weight:700;color:#fff;margin-bottom:2px;">${escapeHtml(s.title || 'Source Evidence')}</div>
            <div style="color:var(--text-muted);font-size:10px;">${escapeHtml(s.text)}</div>
          `;
          evidenceBody.appendChild(block);
        });
      }

      evidenceModal.style.display = 'flex';
    }

    btnCloseEvidence.addEventListener('click', () => {
      evidenceModal.style.display = 'none';
    });

    // Add Source Form
    formAddSource.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = inputTitle.value.trim() || 'Notes Excerpt';
      const text = inputText.value.trim();
      if (!text) return;

      btnSubmitSource.disabled = true;
      btnSubmitSource.textContent = 'Ingesting...';

      await Storage.addSource({
        workspaceId: activeWsId,
        type: 'pasted_article',
        title,
        text
      });

      inputTitle.value = '';
      inputText.value = '';
      btnSubmitSource.disabled = false;
      btnSubmitSource.textContent = 'Analyze & Ingest into Map';
      addSourceModal.style.display = 'none';

      await loadData();
    });

    btnCloseAddSource.addEventListener('click', () => {
      addSourceModal.style.display = 'none';
    });
  }

  // --- Real-time Reactive Storage Listener ---
  function setupStorageListener() {
    Storage.onChanged(async (changes) => {
      if (changes[STORAGE_KEYS.WORKSPACES]) {
        workspaces = changes[STORAGE_KEYS.WORKSPACES].newValue || await Storage.getWorkspaces();
        updateWorkspaceDropdown();
      }
      if (changes[STORAGE_KEYS.CONCEPTS] || changes[STORAGE_KEYS.EDGES]) {
        concepts = await Storage.getConcepts();
        edges = await Storage.getEdges();
        conceptBadge.textContent = concepts.length;
        renderConcepts();
        renderEdges();
      }
      if (changes[STORAGE_KEYS.SOURCES]) {
        sources = await Storage.getSources();
        sourceBadge.textContent = sources.length;
        renderSourceFeed();
        checkFailedBanner();
      }
      if (changes[STORAGE_KEYS.PROPOSALS]) {
        pendingProposals = await Storage.getProposals();
        checkBanners();
      }
      if (changes[STORAGE_KEYS.ACTIVE_WS]) {
        activeWsId = await Storage.getActiveWorkspaceId();
        await loadData();
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
});
