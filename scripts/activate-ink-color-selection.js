// One-time exact patch for independent Pen/Highlighter color selection.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function patchExact(rel, oldText, newText, label) {
  const file = path.join(root, rel);
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(newText)) {
    console.log(`[INK-COLOR] ${label}: already applied`);
    return;
  }
  if (!text.includes(oldText)) {
    throw new Error(`[INK-COLOR] ${label}: expected old text not found; refusing broad rewrite`);
  }
  text = text.replace(oldText, newText);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`[INK-COLOR] ${label}: patched`);
}

patchExact(
  'canvas.js',
  "        color: activeTool === 'highlighter' ? '#f59e0b' : '#38bdf8',",
  "        color: (typeof InkColorPalette !== 'undefined' && InkColorPalette.getColor(activeTool)) || (activeTool === 'highlighter' ? '#ffd166' : '#38bdf8'),",
  'stroke creation reads independent selected color'
);

patchExact(
  'canvas.html',
  '  <script src="shared/watercolor-brush-v2.js"></script>\n  <script src="canvas.js"></script>',
  '  <script src="shared/watercolor-brush-v2.js"></script>\n  <script src="shared/ink-color-palette.js"></script>\n  <script src="canvas.js"></script>',
  'load color palette before Canvas controller'
);

patchExact(
  'scripts/bundle-assets.js',
  "  'shared/watercolor-brush-v2.js',\n  'shared/storage.js',",
  "  'shared/watercolor-brush-v2.js',\n  'shared/ink-color-palette.js',\n  'shared/storage.js',",
  'bundle color palette runtime'
);

patchExact(
  'PRD.md',
  `- New Pen strokes must persist Fountain semantics; new Highlighter strokes must persist versioned Watercolor semantics. Historical failed/tuned brush versions remain replay-compatible without redefining the current default brush.\n\nThis two-button mapping is a low-friction product rule: **Pen = beautiful writing; Highlighter = watercolor emphasis.**`,
  `- New Pen strokes must persist Fountain semantics; new Highlighter strokes must persist versioned Watercolor semantics. Historical failed/tuned brush versions remain replay-compatible without redefining the current default brush.\n- **Independent Color Selection**: Pen and Highlighter each own an independent selected color. Changing Pen color must never silently change Highlighter color, and vice versa.\n- **Low-Friction Color UI**: Color selection must not add another primary brush/tool button. Each of the two existing ink tools may expose a compact color dot/swatch that opens a small palette.\n- **Presets + Custom Color**: Each tool should offer a small useful preset palette plus a custom color picker; selecting a color applies to future strokes only.\n- **Historical Stroke Stability**: Changing the selected color must never recolor existing strokes. Every stroke persists its actual chosen color as part of stroke data and replays identically across devices.\n- **Preference Scope**: The last selected Pen and Highlighter colors may be remembered per device/browser for low-friction reuse. Cross-device preference synchronization is not required for V2.0; synchronized stroke color fidelity is required.\n\nThis two-button mapping is a low-friction product rule: **Pen = beautiful writing; Highlighter = watercolor emphasis.**`,
  'lock independent color-selection behavior'
);
