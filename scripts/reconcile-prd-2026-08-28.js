// One-time, exact-string PRD reconciliation for 2026-08-28.
// This intentionally patches only three known stale passages and refuses broad rewriting.
const fs = require('fs');
const path = require('path');

const prdPath = path.join(__dirname, '..', 'PRD.md');
let text = fs.readFileSync(prdPath, 'utf8');
let changed = false;

function replaceExact(oldText, newText, label) {
  if (text.includes(newText)) {
    console.log(`[PRD] ${label}: already reconciled`);
    return;
  }
  if (!text.includes(oldText)) {
    throw new Error(`[PRD] ${label}: expected old text not found; refusing broad rewrite`);
  }
  text = text.replace(oldText, newText);
  changed = true;
  console.log(`[PRD] ${label}: patched`);
}

replaceExact(
  'A Windows capture should appear on an already-open iPad without refresh. An iPad ink stroke should persist and reappear after reopening.',
  'A capture or structural update from an active Windows or Mac client should propagate to other already-open connected clients without refresh. iPad remains a supported optional browser/pen client: an iPad ink stroke should persist and reappear after reopening.',
  '§11 cross-device example'
);

replaceExact(
`\`\`\`text
Chrome Extension / Desktop Canvas
             │
             │ HTTPS / WSS
             ▼
       Cloudflare Worker
             │
             ▼
       Durable Object
             │
     persistent Workspace state
             │
             ▼
        iPad Safari
\`\`\``,
`\`\`\`text
Windows / Mac Chrome Extension + Desktop Canvas
             │
             │ HTTPS / WSS
             ▼
       Cloudflare Worker
             │
             ▼
       Durable Object
             │
     authoritative Workspace state
             │
       connected clients
        ├─ Windows / Mac Chrome
        └─ optional iPad Safari / pen browser
\`\`\``,
  '§12 architecture diagram'
);

replaceExact(
`- no hardcoded pairing codes,
- no credentials in Git,
- no credentials in URLs,`,
`- default rule: do not introduce new hardcoded pairing codes, credentials, or secrets,
- accepted implementation exception: the existing permanent convenience auto-pair mechanism remains unless the user explicitly reopens that decision; do not expose its concrete credential in PRD/docs/logs/URLs/prompts and do not treat the exception as permission to add other hardcoded secrets,
- do not introduce new credentials into Git,
- no credentials in URLs,`,
  '§13 accepted pairing exception'
);

if (changed) {
  fs.writeFileSync(prdPath, text, 'utf8');
  console.log('[PRD] Reconciliation written successfully.');
} else {
  console.log('[PRD] No changes required.');
}
