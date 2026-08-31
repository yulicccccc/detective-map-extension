const fs = require('fs');

function replaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) throw new Error(`Missing expected anchor: ${label}`);
  return text.replace(oldText, newText);
}

// 1) Compact, quiet collapsed Concept nodes.
let css = fs.readFileSync('canvas.css', 'utf8');

css = replaceOnce(css, `.concept-node {
  position: absolute;
  pointer-events: auto;
  background: linear-gradient(145deg, rgba(30, 41, 59, 0.96), rgba(20, 31, 49, 0.96));
  border: 1px solid rgba(100, 116, 139, 0.58);
  border-radius: 999px;
  box-shadow: 0 6px 18px -8px rgba(0, 0, 0, 0.78), 0 2px 8px rgba(0, 0, 0, 0.32);
  display: flex;
  flex-direction: column;
  user-select: text;
  -webkit-user-select: text;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  min-width: 92px;
  max-width: 260px;
  width: max-content;
  box-sizing: border-box;
  overflow: visible;
}`, `.concept-node {
  position: absolute;
  pointer-events: auto;
  background: rgba(20, 30, 46, 0.88);
  border: 1px solid rgba(100, 116, 139, 0.38);
  border-radius: 999px;
  box-shadow: 0 2px 8px -5px rgba(0, 0, 0, 0.72);
  display: flex;
  flex-direction: column;
  user-select: text;
  -webkit-user-select: text;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  min-width: 76px;
  max-width: 190px;
  width: max-content;
  box-sizing: border-box;
  overflow: visible;
}`, 'compact concept node base');

css = replaceOnce(css, `.concept-node:hover {
  border-color: var(--concept-hover-border);
  background: linear-gradient(145deg, rgba(34, 48, 70, 0.98), rgba(22, 36, 57, 0.98));
  box-shadow: 0 9px 24px -10px rgba(0, 0, 0, 0.82), 0 0 0 1px rgba(56, 189, 248, 0.16), 0 0 18px rgba(56, 189, 248, 0.14);
}`, `.concept-node:hover {
  border-color: rgba(56, 189, 248, 0.62);
  background: rgba(24, 37, 56, 0.94);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.10), 0 3px 10px -7px rgba(0, 0, 0, 0.72);
}`, 'quiet concept hover');

css = replaceOnce(css, `.concept-node.selected {
  border-color: var(--concept-selected-border);
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.36), 0 8px 22px -10px rgba(0, 0, 0, 0.78);
}`, `.concept-node.selected {
  border-color: rgba(96, 165, 250, 0.82);
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.28), 0 3px 10px -7px rgba(0, 0, 0, 0.72);
}`, 'quiet concept selected');

css = replaceOnce(css, `.concept-header {
  position: relative;
  padding: 11px 18px;
  min-height: 54px;
  background: transparent;
  border-radius: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  cursor: grab;
  user-select: none;
  width: 100%;
  box-sizing: border-box;
}`, `.concept-header {
  position: relative;
  padding: 7px 14px;
  min-height: 42px;
  background: transparent;
  border-radius: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  cursor: grab;
  user-select: none;
  width: 100%;
  box-sizing: border-box;
}`, 'compact concept header');

css = replaceOnce(css, `.concept-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #f8fafc;
  outline: none;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 220px;
  cursor: text;
  user-select: text;
  white-space: normal;
  word-break: normal;
  overflow-wrap: break-word;
  line-height: 1.3;
  text-align: center;
}`, `.concept-title {
  font-size: 13px;
  font-weight: 650;
  color: #f8fafc;
  outline: none;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 156px;
  cursor: text;
  user-select: text;
  white-space: normal;
  word-break: normal;
  overflow-wrap: break-word;
  line-height: 1.22;
  text-align: center;
}`, 'compact concept title measure');

css = replaceOnce(css, `.badge-sources {
  background: rgba(14, 116, 144, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.34);
  color: #7dd3fc;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.12);
}`, `.badge-sources {
  background: rgba(14, 116, 144, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.24);
  color: #7dd3fc;
  font-size: 8px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: none;
  opacity: 0.72;
}`, 'subordinate source badge');

css = replaceOnce(css, `.badge-sources:hover {
  background: rgba(56, 189, 248, 0.3);
}`, `.badge-sources:hover {
  background: rgba(56, 189, 248, 0.18);
  opacity: 1;
}`, 'source badge hover');

fs.writeFileSync('canvas.css', css);

// 2) Align focused regression tests with the compact-node visual target.
let test = fs.readFileSync('tests/verify-concept-nodes-v2.js', 'utf8');
test = replaceOnce(test,
`  assert(/min-width:\\s*92px/.test(block[1]), 'Short concepts must be allowed to stay compact');
  assert(/max-width:\\s*260px/.test(block[1]), 'Long concept width guard must remain bounded');`,
`  assert(/min-width:\\s*76px/.test(block[1]), 'Short concepts must be allowed to stay visually compact');
  assert(/max-width:\\s*190px/.test(block[1]), 'Collapsed nodes must avoid button-like horizontal growth');`,
'focused test compact width');

test = replaceOnce(test,
`  assert(/min-height:\\s*54px/.test(block[1]), 'Node needs enough oval body height');`,
`  assert(/min-height:\\s*42px/.test(block[1]), 'Collapsed node should stay thin enough to read as a graph entity');`,
'focused test compact height');

test = replaceOnce(test,
`  assert(!/text-overflow:\\s*ellipsis/.test(block[1]));`,
`  assert(!/text-overflow:\\s*ellipsis/.test(block[1]));
  assert(/max-width:\\s*156px/.test(block[1]), 'Title measure should encourage earlier wrapping instead of a wide button-like pill');`,
'focused test title measure');

test = replaceOnce(test,
`test('8. Product rule is locked in PRD', () => {
  assert(prd.includes('Concept Should Look Like a Node, Not a Card'));
  assert(prd.includes('Short concept → compact oval / near-circle'));
  assert(prd.includes('Long concept  → adaptive soft capsule'));
});`,
`test('8. Product rule is locked in PRD', () => {
  assert(prd.includes('Concept Should Look Like a Node, Not a Card'));
  assert(prd.includes('Short concept → compact oval / near-circle'));
  assert(prd.includes('Long concept  → adaptive soft capsule'));
  assert(prd.includes('avoid elongated, button-like pills'));
});

test('9. Resting node chrome is visually subordinate', () => {
  const node = css.match(/\\.concept-node \\{([\\s\\S]*?)\\n\\}/);
  const badge = css.match(/\\.badge-sources \\{([\\s\\S]*?)\\n\\}/);
  assert(node && /border:\\s*1px solid rgba\\(100, 116, 139, 0\\.38\\)/.test(node[1]), 'Resting outline should stay subtle');
  assert(node && /box-shadow:\\s*0 2px 8px -5px/.test(node[1]), 'Resting shadow should stay minimal');
  assert(badge && /opacity:\\s*0\\.72/.test(badge[1]), 'Source badge should be visually subordinate');
  assert(badge && /box-shadow:\\s*none/.test(badge[1]), 'Source badge should not float like a card control');
});`,
'focused test visual quietness');

fs.writeFileSync('tests/verify-concept-nodes-v2.js', test);

// 2b) Align the older Structure-First reliability invariant with the same browser-tested sizing rule.
let verifyV2 = fs.readFileSync('tests/verify-v2.js', 'utf8');
verifyV2 = replaceOnce(verifyV2,
`    // 22.3 Concept Node V2 footprint: compact, adaptive, node-like rather than card-like
    const conceptNodeRule = canvasCss.match(/\\.concept-node \\{([\\s\\S]*?)\\n\\}/);
    assert(conceptNodeRule, 'canvas.css must define .concept-node');
    assert(/min-width:\\s*92px/.test(conceptNodeRule[1]), 'Short Concept nodes must be allowed to remain compact (~92px floor)');
    assert(/max-width:\\s*260px/.test(conceptNodeRule[1]), 'Concept node collapsed max-width must remain ~260px');`,
`    // 22.3 Concept Node V3 footprint: compact, adaptive, visually quiet rather than button-like
    const conceptNodeRule = canvasCss.match(/\\.concept-node \\{([\\s\\S]*?)\\n\\}/);
    assert(conceptNodeRule, 'canvas.css must define .concept-node');
    assert(/min-width:\\s*76px/.test(conceptNodeRule[1]), 'Short Concept nodes must be allowed to remain compact (~76px floor)');
    assert(/max-width:\\s*190px/.test(conceptNodeRule[1]), 'Collapsed Concept nodes must avoid button-like growth beyond ~190px');`,
'legacy Structure-First compact sizing invariant');
fs.writeFileSync('tests/verify-v2.js', verifyV2);

// 3) Lock the browser-learned visual rule into PRD.
let prd = fs.readFileSync('PRD.md', 'utf8');
prd = replaceOnce(prd,
`- approximate sizing direction: compact floor around \`88–120px\` when controls/badges permit, adaptive preferred width, and approximately \`260px\` maximum unless later usability testing changes these values,`,
`- browser-tested compact sizing direction: resting nodes should generally remain around \`76–190px\` overall width, with a title text measure around \`140–160px\`; longer labels should wrap earlier instead of preserving a button-like single line,`,
'PRD compact sizing target');

prd = replaceOnce(prd,
`- source/evidence badges stay compact and subordinate to the Concept label,
- selection/focus may strengthen the node outline and connected relationships without mutating stored layout,`,
`- source/evidence badges stay compact and subordinate to the Concept label,
- avoid elongated, button-like pills: common multi-word Concepts may wrap to two lines when that keeps the graph footprint compact,
- resting node chrome stays visually quiet: border and shadow should be subtler than the Concept label, Relationship semantics, and learner handwriting,
- selection/focus may strengthen the node outline and connected relationships without mutating stored layout,`,
'PRD quiet node chrome');

fs.writeFileSync('PRD.md', prd);

// 4) Reconcile project handoff state.
let state = fs.readFileSync('PROJECT_STATE.md', 'utf8');
state = replaceOnce(state,
`**Status:** 🟢 Core Living Map stable; Structure-First UI browser-verified; Fountain Pen + independent color selection accepted for this phase; Transparent Marker V1 is CODE/CI VERIFIED and awaits manual Wacom acceptance as the new Highlighter.`,
`**Status:** 🟢 Core Living Map stable; Structure-First interaction model browser-verified; Concept Node V3 compact visual refinement implemented and awaiting browser acceptance; Fountain Pen V3 and Transparent Marker retain separate manual device checks.`,
'project status');

state = replaceOnce(state,
`- Operational errors use compact toast/status UI.`,
`- Operational errors use compact toast/status UI.
- Current visual refinement: collapsed Concepts use a compact, quiet oval/capsule footprint (about 76–190px) with earlier wrapping, reduced border/shadow weight, and a more subordinate Source badge so relationships and handwriting dominate the canvas.`,
'project concept visual state');

state = replaceOnce(state,
`**Manual Wacom acceptance of a fresh Highlighter = Transparent Marker stroke.**`,
`**Manual browser acceptance of Concept Node V3 compact visual refinement on a real map.**`,
'project single next action');

fs.writeFileSync('PROJECT_STATE.md', state);

const plan = `# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-31  
**Single next priority:** **Manual visual acceptance of Concept Node V3 — compact, quiet graph nodes**

## Locked Product Formula

\`AI builds the map. You shape it. You think on it. It keeps growing.\`

The primary canvas is a persistent AI-generated, human-editable, handwriting-native Concept Map.

## Current Visual Change

Concept Node V2 correctly moved the UI from rectangular cards to soft capsules, but real browser evidence showed the nodes still read too much like large pill-shaped buttons. V3 keeps the same data/interaction model and tightens only the visual footprint:

- resting node width roughly 76–190px,
- title text measure around 156px so common long labels wrap earlier,
- collapsed height reduced from 54px to about 42px,
- border and shadow substantially quieter,
- Source badge smaller and visually subordinate,
- complete labels remain mandatory; no ellipsis,
- expanded summary, drag behavior, Detail Drawer, and Edge geometry remain unchanged.

Principle:

\`Concept identity + Relationship + handwriting > node chrome.\`

Implementation lives primarily in \`canvas.css\`. Regression coverage remains \`tests/verify-concept-nodes-v2.js\` (now including compact V3 visual invariants).

## Manual Acceptance

After syncing and reloading, inspect the same real map that previously showed \`Spaced Repetition → Optimized Interval\`.

PASS requires:

1. nodes no longer read as large UI buttons,
2. the relationship line/label feels at least as visually important as the node shell,
3. handwriting can sit on the map without competing against heavy node chrome,
4. common multi-word labels stay compact; longer labels wrap naturally,
5. Source badge remains readable but clearly third-level information,
6. hover/select controls still work,
7. Edge endpoints still align with live node dimensions,
8. Quick Expand / Drawer behavior remains unchanged.

Automated tests may establish CODE/CI VERIFIED. The visual result still requires browser/manual acceptance.

## Separate Open Ink Check

Fountain Pen V3 high-frequency Wacom input has requestAnimationFrame batching and resampling, but the final low-latency Wacom feel still requires a separate human re-check. Do not conflate that with Concept Node V3 visual acceptance.
`;
fs.writeFileSync('.ai-bridge/current-plan.md', plan);

console.log('Concept Node V3 compact visual patch staged successfully.');
