// service-worker.js - Background Service Worker for Detective Map V2.0

importScripts('shared/storage.js', 'shared/canvas-core.js');

const CONTEXT_MENU_ID = 'add-to-detective-map';

// Initialize extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Add to Active Detective Map',
      contexts: ['selection'],
      documentUrlPatterns: ['https://chatgpt.com/*']
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          '[Detective Map] Context menu initialization:',
          chrome.runtime.lastError.message
        );
      }
    });
  });

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {});
  }

  console.log('[Detective Map V2] Service Worker Installed.');
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    const selectedText = (info.selectionText || '').trim();
    if (!selectedText) return;

    const sourceTitle = tab?.title || 'ChatGPT Conversation';
    const sourceUrl = tab?.url || info.pageUrl || '';
    const activeWsId = await Storage.getActiveWorkspaceId();

    const newSource = {
      id: `src_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId: activeWsId,
      type: 'chatgpt_selection',
      title: sourceTitle,
      text: selectedText,
      url: sourceUrl,
      capturedAt: new Date().toISOString()
    };

    // Save locally in chrome.storage.local immediately
    await Storage.addSource(newSource);

    // Badge notification
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 1800);
  }
});

// Handle runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_CANVAS_WINDOW') {
    openCanvasWindow();
    sendResponse({ success: true });
    return true;
  }
});

async function openCanvasWindow() {
  const canvasUrl = chrome.runtime.getURL('canvas.html');

  const windows = await chrome.windows.getAll({ populate: true });
  for (const win of windows) {
    if (win.tabs) {
      const match = win.tabs.find(t => t.url === canvasUrl);
      if (match) {
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
  }

  await chrome.windows.create({
    url: canvasUrl,
    type: 'popup',
    width: 1360,
    height: 920,
    focused: true
  });
}
