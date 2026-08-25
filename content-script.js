// content-script.js - Injected into web pages & ChatGPT for selection monitoring

(() => {
  // Lightweight content script to support potential page interactions
  // V1 adheres strictly to standard selection APIs without brittle DOM scraping.
  
  // Optional keyboard shortcut listener (e.g. Alt+D to quick capture selection)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      const selected = window.getSelection()?.toString().trim();
      if (selected) {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_MANUAL_QUOTE',
          payload: {
            text: selected,
            sourceTitle: document.title || 'Web / ChatGPT',
            sourceUrl: window.location.href,
            capturedAt: new Date().toISOString()
          }
        });
      }
    }
  });
})();
