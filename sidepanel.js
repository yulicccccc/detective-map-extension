// sidepanel.js - Controller for Detective Map Side Panel

document.addEventListener('DOMContentLoaded', async () => {
  const quoteCountEl = document.getElementById('quote-count');
  const quotesListEl = document.getElementById('quotes-list');
  const emptyStateEl = document.getElementById('empty-state');
  const btnOpenCanvas = document.getElementById('btn-open-canvas');
  const btnExport = document.getElementById('btn-export');
  const fileImport = document.getElementById('file-import');

  // Initial render
  await renderQuotes();

  // Listen for storage changes in real-time
  Storage.onChanged((changes) => {
    if (changes[STORAGE_KEYS.QUOTES]) {
      renderQuotes();
    }
  });

  // Open Canvas Window
  btnOpenCanvas.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'OPEN_CANVAS_WINDOW' });
    } else {
      window.open('canvas.html', '_blank', 'width=1280,height=900');
    }
  });

  // Export JSON
  btnExport.addEventListener('click', async () => {
    try {
      const exportData = await Storage.exportAllData();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detective-map-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      alert(`Imported ${res.quoteCount} quotes and ${res.strokeCount} strokes successfully!`);
      await renderQuotes();
    } catch (err) {
      alert('Failed to import backup file: ' + err.message);
    } finally {
      fileImport.value = '';
    }
  });

  /**
   * Render Quotes List
   */
  async function renderQuotes() {
    const quotes = await Storage.getQuotes();
    quoteCountEl.textContent = `${quotes.length} Quote${quotes.length === 1 ? '' : 's'}`;

    if (quotes.length === 0) {
      emptyStateEl.style.display = 'block';
      quotesListEl.innerHTML = '';
      return;
    }

    emptyStateEl.style.display = 'none';

    // Sort newest first in side panel list
    const sortedQuotes = [...quotes].reverse();

    quotesListEl.innerHTML = sortedQuotes.map(quote => {
      const domain = CanvasCore.extractDomain(quote.sourceUrl);
      const timeDisplay = CanvasCore.formatCaptureTime(quote.capturedAt);
      const safeText = escapeHtml(quote.text);
      const safeTitle = escapeHtml(quote.sourceTitle || domain);
      const safeUrl = quote.sourceUrl ? escapeHtml(quote.sourceUrl) : '#';

      return `
        <div class="quote-card" data-id="${quote.id}">
          <div class="quote-header">
            <a href="${safeUrl}" target="_blank" class="quote-source" title="${safeTitle}">
              <span>↗</span> ${domain}
            </a>
            <span class="quote-time">${timeDisplay}</span>
          </div>
          <div class="quote-content">${safeText}</div>
          <div class="quote-actions">
            <button class="btn-card-action btn-card-copy" title="Copy text">📋 Copy</button>
            <button class="btn-card-action btn-card-delete" title="Delete quote">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach card event listeners
    quotesListEl.querySelectorAll('.quote-card').forEach(cardEl => {
      const id = cardEl.getAttribute('data-id');

      cardEl.querySelector('.btn-card-copy')?.addEventListener('click', () => {
        const quote = quotes.find(q => q.id === id);
        if (quote) {
          navigator.clipboard.writeText(quote.text);
          const copyBtn = cardEl.querySelector('.btn-card-copy');
          const originalText = copyBtn.textContent;
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => { copyBtn.textContent = originalText; }, 1500);
        }
      });

      cardEl.querySelector('.btn-card-delete')?.addEventListener('click', async () => {
        if (confirm('Delete this quote?')) {
          await Storage.deleteQuote(id);
          await renderQuotes();
        }
      });
    });
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
