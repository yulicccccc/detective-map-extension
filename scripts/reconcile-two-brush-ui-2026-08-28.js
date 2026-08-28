const fs = require('fs');
const path = require('path');

const prdPath = path.join(__dirname, '..', 'PRD.md');
let text = fs.readFileSync(prdPath, 'utf8');

function replaceExact(oldText, newText, label) {
  if (text.includes(newText)) {
    console.log(`[BRUSH-UI] ${label}: already reconciled`);
    return;
  }
  if (!text.includes(oldText)) {
    throw new Error(`[BRUSH-UI] ${label}: expected old text not found; refusing broad rewrite`);
  }
  text = text.replace(oldText, newText);
  console.log(`[BRUSH-UI] ${label}: patched`);
}

replaceExact(
`### 6.10.3 Brush Palette & Interaction Model

Primary creative tools:

\`\`\`text
✒ Fountain Pen      — beautiful handwriting / arrows / notes
🖌 Watercolor Brush — highlighting / emphasis / expressive marks
🧽 Stroke Eraser
↩ Undo
\`\`\`

Utility brushes may remain available:

\`\`\`text
Pen / Ball Pen      — simple predictable writing
Highlighter         — classic flat marker
\`\`\`

The Fountain Pen and Watercolor Brush are the **quality target**; the utility brushes must not dictate their rendering model.`,
`### 6.10.3 Brush Palette & Interaction Model — Two-Button Mapping Locked

The primary toolbar keeps the existing **two ink buttons only**. Product names in the toolbar remain simple and familiar; the expressive brush engine is an implementation detail behind each button.

\`\`\`text
✒ Pen         → Fountain Pen engine
🖌 Highlighter → Watercolor Brush engine
🧽 Eraser
↩ Undo
\`\`\`

Locked rules:

- The visible **Pen** button is the product entry point for the Fountain Pen handwriting experience described in §6.10.1.
- The visible **Highlighter** button is the product entry point for the Watercolor Brush highlighting experience described in §6.10.2.
- Do **not** add separate Fountain Pen and Watercolor Brush buttons beside Pen/Highlighter in the primary toolbar.
- Do **not** add a third "Ink Wash" / Chinese-ink brush to solve the highlighting requirement; Watercolor is the intended expressive highlight behavior.
- Historical generic \`tool: pen\` and flat \`tool: highlighter\` strokes remain supported for backward-compatible replay, but legacy utility rendering does not require a separate primary toolbar button.
- New Pen strokes should persist Fountain semantics; new Highlighter strokes should persist Watercolor semantics once Watercolor V1 is implemented.

This two-button mapping is a low-friction product rule: **Pen = beautiful writing; Highlighter = watercolor emphasis.**`,
  '§6.10.3 two-button mapping'
);

replaceExact(
`# 10. Ink Input & Brush Requirements

Primary target tools:

\`\`\`text
👆 Select
✒ Fountain Pen
🖌 Watercolor Brush
🧽 Stroke Eraser
↩ Undo
\`\`\`

Utility Pen and classic Highlighter may remain available.`,
`# 10. Ink Input & Brush Requirements

Primary toolbar mapping is locked to the existing two ink controls:

\`\`\`text
👆 Select
✒ Pen         = Fountain Pen behavior
🖌 Highlighter = Watercolor Brush behavior
🧽 Eraser
↩ Undo
\`\`\`

Do not expand the main toolbar into separate generic/expressive variants. Legacy Pen/Highlighter rendering remains a backward-compatibility concern, not a reason to add more primary ink buttons.`,
  '§10 primary toolbar mapping'
);

fs.writeFileSync(prdPath, text, 'utf8');
console.log('[BRUSH-UI] PRD reconciliation complete.');
