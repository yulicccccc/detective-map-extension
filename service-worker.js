// service-worker.js - Background Service Worker for Detective Map V2.0

importScripts('shared/storage.js', 'shared/canvas-core.js');

const CONTEXT_MENU_ID = 'add-to-detective-map';
const CLOUDFLARE_WORKER_URL = 'https://detectivemap.qchen9108.workers.dev';

// Initialize extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Add to Active Detective Map',
    contexts: ['selection'],
    documentUrlPatterns: ['https://chatgpt.com/*']
  });

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  // Securely bootstrap initial device token if zero devices exist
  chrome.storage.local.get(['dm_device_token_v2'], (res) => {
    if (!res.dm_device_token_v2) {
      fetch(`${CLOUDFLARE_WORKER_URL}/api/auth/bootstrap-pin`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.pin) {
            return fetch(`${CLOUDFLARE_WORKER_URL}/api/auth/pair`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pairingCode: data.pin, deviceName: 'Chrome Extension (Host)' })
            }).then(r => r.json()).then(pairData => {
              if (pairData.success && pairData.token) {
                chrome.storage.local.set({ dm_device_token_v2: pairData.token });
                console.log('[Detective Map V2] Host extension dynamically paired.');
              }
            });
          }
        })
        .catch(() => {});
    }
  });

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

    // 1. Save locally in chrome.storage.local immediately
    await Storage.addSource(newSource);

    // Badge notification
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 1800);

    console.log('[Detective Map V2] Source captured to Workspace [' + activeWsId + ']:', newSource);
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
