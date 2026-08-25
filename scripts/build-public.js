// scripts/build-public.js
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      if (entry === 'node' || entry === 'node_modules' || entry === '.git' || entry === 'public') continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy single files
const files = [
  'canvas.html',
  'canvas.css',
  'canvas.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'manifest.json'
];

files.forEach(file => {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(publicDir, file));
  }
});

// Copy directories
['shared', 'icons'].forEach(dir => {
  const src = path.join(rootDir, dir);
  if (fs.existsSync(src)) {
    copyRecursive(src, path.join(publicDir, dir));
  }
});

// Ensure index.html exists in public (same as canvas.html)
if (fs.existsSync(path.join(publicDir, 'canvas.html'))) {
  fs.copyFileSync(path.join(publicDir, 'canvas.html'), path.join(publicDir, 'index.html'));
}

console.log('Public directory prepared successfully.');
