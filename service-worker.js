// service-worker.js - Background Service Worker for Detective Map Extension

importScripts('shared/storage.js', 'shared/canvas-core.js');

const CONTEXT_MENU_ID = 'add-to-detective-map';
const CLOUDFLARE_WORKER_URL = 'https://detectivemap.qchen9108.workers.dev';

// Initialize extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Add to Detective Map',
    contexts: ['selection'],
    documentUrlPatterns: ['https://chatgpt.com/*']
  });

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  // Pre-pair device token if not exists
  chrome.storage.local.get(['detective_device_token', 'detective_pairing_code'], (res) => {
    const code = res.detective_pairing_code || 'MAP-2026';
    if (!res.detective_device_token) {
      fetch(`${CLOUDFLARE_WORKER_URL}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: code })
      }).then(r => r.json()).then(data => {
        if (data.success && data.token) {
          chrome.storage.local.set({
            detective_device_token: data.token,
            detective_pairing_code: code
          });
          console.log('[Detective Map] Chrome Extension paired with Cloudflare Worker successfully.');
        }
      }).catch(() => {});
    }
  });

  console.log('[Detective Map] Service Worker Installed & ChatGPT Context Menu Registered.');
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    const selectedText = (info.selectionText || '').trim();
    if (!selectedText) return;

    const sourceTitle = tab?.title || 'ChatGPT Conversation';
    const sourceUrl = tab?.url || info.pageUrl || '';

    // Calculate coordinate offset based on existing count
    const existingQuotes = await Storage.getQuotes();
    const index = existingQuotes.length;
    const defaultX = 120 + (index % 6) * 45;
    const defaultY = 120 + (index % 6) * 45;

    const newQuote = {
      id: `quote-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      type: 'quote',
      text: selectedText,
      sourceTitle: sourceTitle,
      sourceUrl: sourceUrl,
      capturedAt: new Date().toISOString(),
      x: defaultX,
      y: defaultY,
      width: 320,
      height: 'auto'
    };

    // 1. Save locally in chrome.storage.local (Source of truth on PC)
    await Storage.addQuote(newQuote);

    // 2. Transmit to Cloudflare Worker (Instant WSS push to iPad Canvas)
    try {
      const res = await chrome.storage.local.get(['detective_device_token', 'detective_pairing_code']);
      const token = res.detective_device_token || res.detective_pairing_code || 'MAP-2026';

      fetch(`${CLOUDFLARE_WORKER_URL}/api/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newQuote)
      }).catch(err => {
        console.warn('[Cloud Sync] Worker upload failed, quote saved locally:', err);
      });
    } catch (e) {
      console.warn('[Cloud Sync] Offline fallback used.');
    }

    // Badge notification
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 1800);

    console.log('[Detective Map] Quote captured successfully from ChatGPT:', newQuote);
  }
});

// Handle incoming runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_CANVAS_WINDOW') {
    openCanvasWindow();
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Open or focus the standalone Detective Map Canvas Window
 */
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
    width: 1280,
    height: 900,
    focused: true
  });
}
