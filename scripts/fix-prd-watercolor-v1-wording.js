const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'PRD.md');
let text = fs.readFileSync(file, 'utf8');
const oldText = '- New Pen strokes should persist Fountain semantics; new Highlighter strokes should persist Watercolor semantics once Watercolor V1 is implemented.';
const newText = '- New Pen strokes must persist Fountain semantics; new Highlighter strokes must persist versioned Watercolor semantics. Historical failed/tuned brush versions remain replay-compatible without redefining the current default brush.';
if (text.includes(newText)) {
  console.log('[PRD-WC] implementation wording already current');
} else {
  if (!text.includes(oldText)) throw new Error('[PRD-WC] expected old mapping wording not found');
  text = text.replace(oldText, newText);
  fs.writeFileSync(file, text, 'utf8');
  console.log('[PRD-WC] implementation wording patched');
}
