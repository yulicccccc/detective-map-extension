// sidepanel.js - Detective Map V2.0 Side Panel Controller

document.addEventListener('DOMContentLoaded', async () => {
  const selectWorkspace = document.getElementById('sp-select-workspace');
  const btnNewWs = document.getElementById('sp-btn-new-ws');
  const btnOpenCanvas = document.getElementById('btn-open-canvas');
  const btnAddSource = document.getElementById('sp-btn-add-source');
  const sourceFeed = document.getElementById('sp-source-feed');
  const sourceCount = document.getElementById('sp-source-count');
  const syncStatus = document.getElementById('sp-sync-status');

  let activeWsId = await Storage.getActiveWorkspaceId();
  let workspaces = await Storage.getWorkspaces();

  await refreshUI();

  // Workspace change
  selectWorkspace.addEventListener('change', async (e) => {
    activeWsId = e.target.value;
    await Storage.setActiveWorkspaceId(activeWsId);
    await refreshUI();
  });

  // Create Workspace
  btnNewWs.addEventListener('click', async () => {
    const title = prompt('Enter new learning map name:', 'New Topic');
    if (title) {
      const ws = await Storage.createWorkspace(title);
      activeWsId = ws.id;
      await refreshUI();
    }
  });

  // Open Canvas Window
  btnOpenCanvas.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_CANVAS_WINDOW' });
  });

  // Add Source
  btnAddSource.addEventListener('click', async () => {
    const text = prompt('Paste notes, quote, or article text:');
    if (text && text.trim()) {
      await Storage.addSource({
        workspaceId: activeWsId,
        type: 'pasted_article',
        title: 'Manual Ingestion',
        text: text.trim()
      });
      await refreshUI();
    }
  });

  // Listen for changes
  Storage.onChanged(async () => {
    await refreshUI();
  });

  async function refreshUI() {
    workspaces = await Storage.getWorkspaces();
    selectWorkspace.innerHTML = '';
    workspaces.forEach(ws => {
      const opt = document.createElement('option');
      opt.value = ws.id;
      opt.textContent = ws.title || 'Untitled Map';
      opt.selected = ws.id === activeWsId;
      selectWorkspace.appendChild(opt);
    });

    const sources = await Storage.getSources();
    sourceCount.textContent = sources.length;
    sourceFeed.innerHTML = '';

    if (sources.length === 0) {
      sourceFeed.innerHTML = `
        <div class="sp-empty">
          <span class="sp-empty-icon">💡</span>
          <p>No sources captured yet in this topic.</p>
          <span class="sp-empty-hint">Select text on ChatGPT or paste an article above.</span>
        </div>
      `;
      return;
    }

    sources.forEach(s => {
      const card = document.createElement('div');
      card.className = 'sp-card';
      const timeStr = CanvasCore.formatCaptureTime(s.capturedAt);
      const domain = CanvasCore.extractDomain(s.url);

      card.innerHTML = `
        <div class="sp-card-header">
          <span class="sp-card-source">${domain || s.type}</span>
          <span class="sp-card-time">${timeStr}</span>
        </div>
        <div class="sp-card-body">${escapeHtml(s.text)}</div>
      `;
      sourceFeed.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
});
