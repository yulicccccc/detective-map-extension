const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function replaceExact(rel, oldText, newText, label) {
  const file = path.join(root, rel);
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(newText)) {
    console.log(`[WC-V2] ${label}: already applied`);
    return;
  }
  if (!text.includes(oldText)) {
    throw new Error(`[WC-V2] ${label}: expected source text not found; refusing broad rewrite`);
  }
  text = text.replace(oldText, newText);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`[WC-V2] ${label}: patched`);
}

replaceExact(
  'canvas.html',
  '  <script src="shared/watercolor-brush-v1.js"></script>\n  <script src="canvas.js"></script>',
  '  <script src="shared/watercolor-brush-v1.js"></script>\n  <script src="shared/watercolor-brush-v2.js"></script>\n  <script src="canvas.js"></script>',
  'load Watercolor V2 after V1'
);

replaceExact(
  'scripts/bundle-assets.js',
  "  'shared/watercolor-brush-v1.js',\n  'shared/storage.js',",
  "  'shared/watercolor-brush-v1.js',\n  'shared/watercolor-brush-v2.js',\n  'shared/storage.js',",
  'bundle Watercolor V2 runtime'
);
