// service-worker.js - Background Service Worker for Detective Map Extension

importScripts('shared/storage.js', 'shared/canvas-core.js');

const CONTEXT_MENU_ID = 'add-to-detective-map';

// Initialize extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  // Create right-click context menu
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Add to Detective Map',
    contexts: ['selection']
  });

  // Configure Side Panel behavior to open on action click if supported
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  console.log('[Detective Map] Service Worker Installed & Context Menu Registered.');
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    const selectedText = (info.selectionText || '').trim();
    if (!selectedText) return;

    const sourceTitle = tab?.title || 'Web / ChatGPT';
    const sourceUrl = tab?.url || info.pageUrl || '';

    // Calculate smart coordinate offset based on existing count
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

    await Storage.addQuote(newQuote);

    // Optional badge notification
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 1800);

    console.log('[Detective Map] Quote captured successfully:', newQuote);
  }
});

// Handle incoming runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_CANVAS_WINDOW') {
    openCanvasWindow();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CAPTURE_MANUAL_QUOTE') {
    Storage.addQuote(message.payload).then(res => {
      sendResponse({ success: true, quote: res });
    });
    return true;
  }
});

/**
 * Open or focus the standalone Detective Map Canvas Window
 */
async function openCanvasWindow() {
  const canvasUrl = chrome.runtime.getURL('canvas.html');

  // Check if a canvas window is already open
  const windows = await chrome.windows.getAll({ populate: true });
  for (const win of windows) {
    if (win.tabs) {
      const match = win.tabs.find(t => t.url === canvasUrl);
      if (match) {
        // Focus existing window
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
  }

  // Create new standalone popup window (ideal for dragging to iPad extended display)
  await chrome.windows.create({
    url: canvasUrl,
    type: 'popup',
    width: 1280,
    height: 900,
    focused: true
  });
}
