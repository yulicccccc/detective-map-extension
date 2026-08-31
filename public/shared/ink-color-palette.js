// shared/ink-color-palette.js
// Low-friction independent color preferences for the two locked ink tools.
// Pen and Highlighter keep separate remembered colors; every stroke persists its chosen color.

const InkColorPalette = (() => {
  const STORAGE_KEYS = Object.freeze({
    pen: 'dm_pen_color_v1',
    highlighter: 'dm_highlighter_color_v1'
  });

  const DEFAULTS = Object.freeze({
    pen: '#38bdf8',
    highlighter: '#ffd166'
  });

  const PRESETS = Object.freeze({
    pen: Object.freeze([
      '#f8fafc', // white
      '#38bdf8', // cyan / current default
      '#60a5fa', // blue
      '#34d399', // green
      '#facc15', // yellow
      '#fb7185', // rose
      '#c084fc', // purple
      '#111827'  // black / light-background use
    ]),
    highlighter: Object.freeze([
      '#ffd166', // warm yellow / current watercolor default
      '#ff9f9f', // coral pink
      '#f0a6ca', // pink
      '#a8d8ff', // pale blue
      '#8ee3c8', // mint
      '#cdb4ff', // lavender
      '#ffbd7a', // peach
      '#bde0fe'  // powder blue
    ])
  });

  const state = {
    pen: DEFAULTS.pen,
    highlighter: DEFAULTS.highlighter,
    openTool: null,
    popover: null,
    dots: {}
  };

  function normalizeTool(tool) {
    if (tool === 'pen' || tool === 'fountain_pen') return 'pen';
    if (tool === 'highlighter' || tool === 'watercolor') return 'highlighter';
    return null;
  }

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    if (/^#[0-9a-f]{3}$/.test(v)) {
      return '#' + v.slice(1).split('').map(ch => ch + ch).join('');
    }
    return null;
  }

  function readStored(tool) {
    const normalized = normalizeTool(tool);
    if (!normalized || typeof localStorage === 'undefined') return null;
    try {
      return normalizeHex(localStorage.getItem(STORAGE_KEYS[normalized]));
    } catch {
      return null;
    }
  }

  function persist(tool, color) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS[tool], color);
    } catch {}
  }

  function initializeState() {
    state.pen = readStored('pen') || DEFAULTS.pen;
    state.highlighter = readStored('highlighter') || DEFAULTS.highlighter;
  }

  function getColor(tool) {
    const normalized = normalizeTool(tool);
    if (!normalized) return null;
    return state[normalized] || DEFAULTS[normalized];
  }

  function updateDot(tool) {
    const dot = state.dots[tool];
    if (!dot) return;
    dot.style.background = getColor(tool);
    dot.setAttribute('aria-label', `${tool === 'pen' ? 'Pen' : 'Highlighter'} color ${getColor(tool)}`);
    dot.title = `${tool === 'pen' ? 'Pen' : 'Highlighter'} color`;
  }

  function setColor(tool, value, options = {}) {
    const normalized = normalizeTool(tool);
    const color = normalizeHex(value);
    if (!normalized || !color) return false;
    state[normalized] = color;
    if (options.persist !== false) persist(normalized, color);
    updateDot(normalized);
    if (state.openTool === normalized) renderPopover(normalized);
    return true;
  }

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('ink-color-palette-styles')) return;
    const style = document.createElement('style');
    style.id = 'ink-color-palette-styles';
    style.textContent = `
      .ink-tool-color-dot {
        width: 14px;
        height: 14px;
        min-width: 14px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,.78);
        box-shadow: 0 0 0 1px rgba(15,23,42,.65), 0 1px 3px rgba(0,0,0,.35);
        display: inline-block;
        margin-left: 5px;
        vertical-align: middle;
        cursor: pointer;
        box-sizing: border-box;
      }
      .ink-tool-color-dot:focus-visible {
        outline: 2px solid #60a5fa;
        outline-offset: 2px;
      }
      .ink-color-popover {
        position: fixed;
        z-index: 10050;
        min-width: 188px;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid rgba(148,163,184,.24);
        background: rgba(15,23,42,.97);
        box-shadow: 0 12px 30px rgba(0,0,0,.4);
        color: #e5e7eb;
        backdrop-filter: blur(10px);
      }
      .ink-color-popover-title {
        font-size: 11px;
        font-weight: 700;
        margin: 0 0 8px;
        color: #cbd5e1;
      }
      .ink-color-swatch-grid {
        display: grid;
        grid-template-columns: repeat(8, 18px);
        gap: 6px;
        margin-bottom: 10px;
      }
      .ink-color-swatch {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 1px solid rgba(255,255,255,.45);
        cursor: pointer;
        padding: 0;
        box-sizing: border-box;
      }
      .ink-color-swatch.selected {
        outline: 2px solid #f8fafc;
        outline-offset: 2px;
      }
      .ink-color-custom-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
        color: #94a3b8;
      }
      .ink-color-custom-input {
        width: 44px;
        height: 28px;
        border: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePopover() {
    if (typeof document === 'undefined') return null;
    if (state.popover) return state.popover;
    const popover = document.createElement('div');
    popover.className = 'ink-color-popover';
    popover.style.display = 'none';
    document.body.appendChild(popover);
    state.popover = popover;
    return popover;
  }

  function renderPopover(tool) {
    const popover = ensurePopover();
    if (!popover) return;
    const current = getColor(tool);
    popover.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ink-color-popover-title';
    title.textContent = tool === 'pen' ? 'Pen color' : 'Highlighter color';
    popover.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'ink-color-swatch-grid';
    for (const color of PRESETS[tool]) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'ink-color-swatch' + (normalizeHex(color) === current ? ' selected' : '');
      swatch.style.background = color;
      swatch.title = color;
      swatch.setAttribute('aria-label', `Choose ${color}`);
      swatch.addEventListener('click', e => {
        e.stopPropagation();
        setColor(tool, color);
      });
      grid.appendChild(swatch);
    }
    popover.appendChild(grid);

    const customRow = document.createElement('div');
    customRow.className = 'ink-color-custom-row';
    const label = document.createElement('span');
    label.textContent = 'Custom';
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'ink-color-custom-input';
    input.value = current;
    input.setAttribute('aria-label', `Custom ${tool} color`);
    input.addEventListener('input', e => setColor(tool, e.target.value));
    customRow.append(label, input);
    popover.appendChild(customRow);
  }

  function closePopover() {
    state.openTool = null;
    if (state.popover) state.popover.style.display = 'none';
  }

  function openPopover(tool, anchor) {
    const popover = ensurePopover();
    if (!popover || !anchor) return;
    state.openTool = tool;
    renderPopover(tool);
    popover.style.display = 'block';
    const rect = anchor.getBoundingClientRect();
    const width = 208;
    const left = Math.min(Math.max(8, rect.left - 10), Math.max(8, window.innerWidth - width - 8));
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.min(window.innerHeight - 120, rect.bottom + 8)}px`;
  }

  function installDot(tool, buttonId) {
    if (typeof document === 'undefined') return;
    const button = document.getElementById(buttonId);
    if (!button || button.querySelector('.ink-tool-color-dot')) return;

    const dot = document.createElement('span');
    dot.className = 'ink-tool-color-dot';
    dot.role = 'button';
    dot.tabIndex = 0;
    dot.dataset.inkTool = tool;
    state.dots[tool] = dot;
    updateDot(tool);

    const activate = e => {
      e.preventDefault();
      e.stopPropagation();
      if (state.openTool === tool && state.popover && state.popover.style.display !== 'none') closePopover();
      else openPopover(tool, dot);
    };

    dot.addEventListener('click', activate);
    dot.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
    button.appendChild(dot);
  }

  function installUI() {
    if (typeof document === 'undefined') return;
    injectStyles();
    installDot('pen', 'tool-pen');
    installDot('highlighter', 'tool-highlighter');

    document.addEventListener('pointerdown', e => {
      if (!state.popover || state.popover.style.display === 'none') return;
      if (state.popover.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.ink-tool-color-dot')) return;
      closePopover();
    }, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closePopover();
    });
  }

  initializeState();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUI, { once: true });
    else installUI();
  }

  return {
    STORAGE_KEYS,
    DEFAULTS,
    PRESETS,
    normalizeTool,
    normalizeHex,
    getColor,
    setColor,
    initializeState,
    installUI,
    closePopover,
    _state: state
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InkColorPalette };
}
