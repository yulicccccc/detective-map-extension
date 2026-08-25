// scripts/resolve-artifact.js
const fs = require('fs');
const path = require('path');

const roots = [
  'C:\\Users\\qchen\\Downloads',
  'C:\\Users\\qchen\\OneDrive - Professional Compounding Centers of America, Inc\\Documents'
];

const patterns = [
  'Detective_Map_V2_Handoff',
  'ANTIGRAVITY_BUILD_DETECTIVE_MAP_V2',
  'Detective_Map_PRD_V2_0_Living_Learning_Map'
];

const results = [];

function search(dir, depth = 0) {
  if (depth > 3) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'AppData') continue;
        search(fullPath, depth + 1);
      } else if (entry.isFile()) {
        for (const pat of patterns) {
          if (entry.name.toLowerCase().includes(pat.toLowerCase())) {
            const stats = fs.statSync(fullPath);
            results.push({
              name: entry.name,
              fullPath,
              size: stats.size,
              mtime: stats.mtime
            });
            break;
          }
        }
      }
    }
  } catch (err) {}
}

for (const r of roots) {
  if (fs.existsSync(r)) search(r);
}

results.sort((a, b) => b.mtime - a.mtime);

console.log(JSON.stringify(results, null, 2));
