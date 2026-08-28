// scripts/bundle-assets.js - Inlines static files into src/assets-bundle.js for Cloudflare Worker
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

if (!fs.existsSync(srcDir)) {
  fs.mkdirSync(srcDir, { recursive: true });
}

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

const assets = {};

function addFile(relPath) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return;

  const ext = path.extname(relPath).toLowerCase();
  const mime = MIME_MAP[ext] || 'application/octet-stream';
  const isBinary = ext === '.png';

  const normalized = '/' + relPath.replace(/\\/g, '/');

  if (isBinary) {
    const b64 = fs.readFileSync(fullPath).toString('base64');
    assets[normalized] = {
      mime,
      isBase64: true,
      content: b64
    };
  } else {
    const text = fs.readFileSync(fullPath, 'utf8');
    assets[normalized] = {
      mime,
      isBase64: false,
      content: text
    };
  }
}

// Add current production assets. PeerJS/LAN sync is legacy and intentionally excluded.
[
  'canvas.html',
  'canvas.css',
  'canvas.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'shared/canvas-core.js',
  'shared/fountain-pen-v2.js',
  'shared/storage.js',
  'shared/engine-core.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
].forEach(addFile);

// Alias /index.html -> /canvas.html
if (assets['/canvas.html']) {
  assets['/index.html'] = assets['/canvas.html'];
}

let code = `// Auto-generated assets bundle for Cloudflare Worker\nexport const ASSETS_MANIFEST = {\n`;

for (const [key, val] of Object.entries(assets)) {
  if (val.isBase64) {
    code += `  ${JSON.stringify(key)}: {\n    mime: ${JSON.stringify(val.mime)},\n    content: Uint8Array.from(atob(${JSON.stringify(val.content)}), c => c.charCodeAt(0))\n  },\n`;
  } else {
    code += `  ${JSON.stringify(key)}: {\n    mime: ${JSON.stringify(val.mime)},\n    content: ${JSON.stringify(val.content)}\n  },\n`;
  }
}

code += `};\n`;

fs.writeFileSync(path.join(srcDir, 'assets-bundle.js'), code, 'utf8');
console.log('Successfully generated src/assets-bundle.js (' + Object.keys(assets).length + ' assets bundled)');
