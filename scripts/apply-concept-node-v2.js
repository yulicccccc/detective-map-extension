const fs = require('fs');

function replaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) {
    throw new Error(`Missing expected anchor: ${label}`);
  }
  return text.replace(oldText, newText);
}

let css = fs.readFileSync('canvas.css', 'utf8');

css = replaceOnce(css, `.concept-node {
  position: absolute;
  pointer-events: auto;
  background: var(--concept-bg);
  border: 1px solid var(--concept-border);
  border-radius: var(--radius-md);
  box-shadow: var(--concept-shadow);
  display: flex;
  flex-direction: column;
  user-select: text;
  -webkit-user-select: text;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  min-width: 180px;
  max-width: 260px;
  width: max-content;
  box-sizing: border-box;
}`, `.concept-node {
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
}`, 'concept node base rule');

css = replaceOnce(css, `.concept-node:hover {
  border-color: var(--concept-hover-border);
  box-shadow: 0 14px 30px -4px rgba(0, 0, 0, 0.7), 0 0 15px rgba(56, 189, 248, 0.2);
}`, `.concept-node:hover {
  border-color: var(--concept-hover-border);
  background: linear-gradient(145deg, rgba(34, 48, 70, 0.98), rgba(22, 36, 57, 0.98));
  box-shadow: 0 9px 24px -10px rgba(0, 0, 0, 0.82), 0 0 0 1px rgba(56, 189, 248, 0.16), 0 0 18px rgba(56, 189, 248, 0.14);
}`, 'concept hover rule');

css = replaceOnce(css, `.concept-node.selected {
  border-color: var(--concept-selected-border);
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.4);
}`, `.concept-node.selected {
  border-color: var(--concept-selected-border);
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.36), 0 8px 22px -10px rgba(0, 0, 0, 0.78);
}`, 'concept selected rule');

css = replaceOnce(css, `.concept-node.expanded {
  width: 300px;
  max-width: 320px;
}`, `.concept-node.expanded {
  width: 300px;
  min-width: 300px;
  max-width: 320px;
  border-radius: 24px;
}`, 'expanded node rule');

css = replaceOnce(css, `.concept-header {
  padding: 8px 10px;
  background: #182234;
  border-radius: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: grab;
  user-select: none;
  width: 100%;
  box-sizing: border-box;
}`, `.concept-header {
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
}`, 'concept header rule');

css = replaceOnce(css, `.concept-node.expanded .concept-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}`, `.concept-node.expanded .concept-header {
  min-height: 48px;
  padding: 10px 18px;
  justify-content: flex-start;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}`, 'expanded header rule');

css = replaceOnce(css, `.concept-drag-handle {
  font-size: 13px;
  color: #64748b;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  padding: 0 2px 0 0;
  display: flex;
  align-items: center;
  letter-spacing: -1px;
  touch-action: none;
  flex-shrink: 0;
  transition: color 0.15s ease;
}`, `.concept-drag-handle {
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 30px;
  font-size: 12px;
  color: #94a3b8;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: -1px;
  touch-action: none;
  flex-shrink: 0;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.9);
  opacity: 0;
  pointer-events: none;
  transition: color 0.15s ease, opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}`, 'drag handle rule');

css = replaceOnce(css, `.concept-drag-handle:hover {
  color: var(--accent-blue);
}`, `.concept-node:hover .concept-drag-handle,
.concept-node:focus-within .concept-drag-handle,
.concept-node.selected .concept-drag-handle,
.concept-node.dragging .concept-drag-handle {
  opacity: 1;
  pointer-events: auto;
}

.concept-drag-handle:hover {
  color: var(--accent-blue);
  border-color: rgba(56, 189, 248, 0.46);
  background: rgba(15, 23, 42, 0.98);
}`, 'drag handle visibility');

css = replaceOnce(css, `.concept-title {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  outline: none;
  flex: 1 1 auto;
  cursor: text;
  user-select: text;
  white-space: normal;
  word-break: normal;
  overflow-wrap: break-word;
  line-height: 1.35;
}`, `.concept-title {
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
}

.concept-node.expanded .concept-title {
  flex: 1 1 auto;
  max-width: none;
  text-align: left;
}`, 'concept title rule');

css = replaceOnce(css, `.concept-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}`, `.concept-actions {
  position: absolute;
  top: -11px;
  right: -7px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  pointer-events: none;
}

.concept-actions > * {
  pointer-events: auto;
}`, 'concept actions rule');

css = replaceOnce(css, `.btn-toggle-expand {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #94a3b8;
  border-radius: 4px;
  font-size: 9px;
  padding: 2px 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}`, `.btn-toggle-expand {
  width: 22px;
  height: 22px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.24);
  color: #94a3b8;
  border-radius: 999px;
  font-size: 9px;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.9);
  pointer-events: none;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
}`, 'expand button rule');

css = replaceOnce(css, `.btn-card-close {
  background: none;
  border: none;
  color: #64748b;
  font-size: 12px;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
}`, `.btn-card-close {
  width: 22px;
  height: 22px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #64748b;
  font-size: 11px;
  padding: 0;
  cursor: pointer;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.9);
  pointer-events: none;
  transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
}`, 'close button rule');

css = replaceOnce(css, `.badge-sources {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: var(--accent-blue);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
}`, `.badge-sources {
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
}`, 'source badge rule');

const visibilityAnchor = `.badge-sources:hover {
  background: rgba(56, 189, 248, 0.3);
}`;
const visibilityRules = `${visibilityAnchor}

/* Node controls stay out of the resting silhouette and appear on intent. */
.concept-node:hover .btn-toggle-expand,
.concept-node:hover .btn-card-close,
.concept-node:focus-within .btn-toggle-expand,
.concept-node:focus-within .btn-card-close,
.concept-node.selected .btn-toggle-expand,
.concept-node.selected .btn-card-close,
.concept-node.expanded .btn-toggle-expand,
.concept-node.expanded .btn-card-close {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

/* Touch has no hover, so explicit expand/delete affordances remain reachable. */
@media (hover: none), (pointer: coarse) {
  .concept-drag-handle {
    opacity: 0.72;
    pointer-events: auto;
  }

  .btn-toggle-expand,
  .btn-card-close {
    opacity: 0.88;
    transform: scale(1);
    pointer-events: auto;
  }
}`;
css = replaceOnce(css, visibilityAnchor, visibilityRules, 'control visibility insertion');

fs.writeFileSync('canvas.css', css);

let canvasJs = fs.readFileSync('canvas.js', 'utf8');
canvasJs = canvasJs.replace('View State for Concept Cards (in-memory UI only)', 'View State for Concept Nodes (in-memory UI only)');
canvasJs = canvasJs.replace('title="Drag to reposition card"', 'title="Drag to reposition node"');
canvasJs = canvasJs.replace('works on card and Concept Title', 'works on node and Concept Title');
fs.writeFileSync('canvas.js', canvasJs);

const testFile = `const fs = require('fs');
const assert = require('assert');

const css = fs.readFileSync('canvas.css', 'utf8');
const canvasJs = fs.readFileSync('canvas.js', 'utf8');
const prd = fs.readFileSync('PRD.md', 'utf8');
let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log('  ✓ PASS: ' + name);
  } catch (err) {
    console.error('  ✕ FAIL: ' + name + '\\n    ' + err.message);
  }
}

console.log('========================================');
console.log('🫧 Concept Node V2 Verification');
console.log('========================================');

test('1. Collapsed Concept uses a soft pill/oval silhouette', () => {
  const block = css.match(/\\.concept-node \\{([\\s\\S]*?)\\n\\}/);
  assert(block, 'Missing .concept-node rule');
  assert(/border-radius:\\s*999px/.test(block[1]), 'Collapsed node must use pill/oval radius');
  assert(/min-width:\\s*92px/.test(block[1]), 'Short concepts must be allowed to stay compact');
  assert(/max-width:\\s*260px/.test(block[1]), 'Long concept width guard must remain bounded');
  assert(/width:\\s*max-content/.test(block[1]), 'Node width must remain content-adaptive');
});

test('2. Header no longer creates a card-like rectangular band', () => {
  const block = css.match(/\\.concept-header \\{([\\s\\S]*?)\\n\\}/);
  assert(block, 'Missing .concept-header rule');
  assert(/background:\\s*transparent/.test(block[1]), 'Collapsed node header must visually merge with node');
  assert(/justify-content:\\s*center/.test(block[1]), 'Collapsed label should read as a centered graph node');
  assert(/min-height:\\s*54px/.test(block[1]), 'Node needs enough oval body height');
});

test('3. Long labels remain complete and wrap instead of ellipsizing', () => {
  const block = css.match(/\\.concept-title \\{([\\s\\S]*?)\\n\\}/);
  assert(block, 'Missing .concept-title rule');
  assert(/white-space:\\s*normal/.test(block[1]));
  assert(/overflow-wrap:\\s*break-word/.test(block[1]));
  assert(!/text-overflow:\\s*ellipsis/.test(block[1]));
});

test('4. Structural controls are visually out-of-flow so short nodes stay compact', () => {
  const actions = css.match(/\\.concept-actions \\{([\\s\\S]*?)\\n\\}/);
  const drag = css.match(/\\.concept-drag-handle \\{([\\s\\S]*?)\\n\\}/);
  assert(actions && /position:\\s*absolute/.test(actions[1]), 'Concept actions must not set resting node width');
  assert(drag && /position:\\s*absolute/.test(drag[1]), 'Drag handle must not set resting node width');
});

test('5. Explicit touch controls remain reachable without hover', () => {
  assert(css.includes('@media (hover: none), (pointer: coarse)'), 'Touch fallback media query required');
  assert(css.includes('.btn-toggle-expand,'), 'Explicit expand button must remain in touch fallback');
  assert(css.includes('pointer-events: auto;'), 'Touch controls must accept input');
});

test('6. Expanded summary remains a soft bounded surface, not a giant pill', () => {
  const block = css.match(/\\.concept-node\\.expanded \\{([\\s\\S]*?)\\n\\}/);
  assert(block, 'Missing expanded node rule');
  assert(/border-radius:\\s*24px/.test(block[1]), 'Expanded summary should use a softer panel radius');
  assert(/max-width:\\s*320px/.test(block[1]), 'Expanded view must stay bounded');
});

test('7. Edge geometry continues deriving from live DOM node dimensions', () => {
  assert(canvasJs.includes('fromEl.offsetWidth / 2'));
  assert(canvasJs.includes('fromEl.offsetHeight / 2'));
  assert(canvasJs.includes('toEl.offsetWidth / 2'));
  assert(canvasJs.includes('toEl.offsetHeight / 2'));
});

test('8. Product rule is locked in PRD', () => {
  assert(prd.includes('Concept Should Look Like a Node, Not a Card'));
  assert(prd.includes('Short concept → compact oval / near-circle'));
  assert(prd.includes('Long concept  → adaptive soft capsule'));
});

console.log('\\n========================================');
console.log('Verification Complete: ' + passed + '/' + total + ' tests passed.');
console.log('========================================');
if (passed !== total) process.exit(1);
`;
fs.writeFileSync('tests/verify-concept-nodes-v2.js', testFile);

let workflow = fs.readFileSync('.github/workflows/verify-generated-assets.yml', 'utf8');
const workflowAnchor = "          if [ -f tests/verify-ink-colors.js ]; then node tests/verify-ink-colors.js; fi\n";
if (!workflow.includes('verify-concept-nodes-v2.js')) {
  if (!workflow.includes(workflowAnchor)) throw new Error('Missing CI workflow anchor');
  workflow = workflow.replace(workflowAnchor, workflowAnchor + "          if [ -f tests/verify-concept-nodes-v2.js ]; then node tests/verify-concept-nodes-v2.js; fi\n");
}
fs.writeFileSync('.github/workflows/verify-generated-assets.yml', workflow);

let state = fs.readFileSync('PROJECT_STATE.md', 'utf8');
if (!state.includes('## Concept Node V2 — Soft Oval / Adaptive Capsule')) {
  state += `\n\n## Concept Node V2 — Soft Oval / Adaptive Capsule (31Aug26)\n\nProduct direction is now locked to **Concept should look like a node, not a card**. The collapsed Concept surface uses a compact content-adaptive soft oval/capsule silhouette: short labels can approach a near-circle, while long labels expand/wrap without truncation. Drag/edit/delete/expand affordances move visually out of the resting silhouette so controls do not force every Concept into a card-width rectangle. Expanded summaries stay bounded and spatially stable.\n\nAutomated coverage: \`tests/verify-concept-nodes-v2.js\`.\n\nState: **CODE / CI verification required after activation; BROWSER / MANUAL visual acceptance required.**\n`;
  fs.writeFileSync('PROJECT_STATE.md', state);
}

const plan = `# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-31  
**Single next priority:** **Manual visual acceptance of Concept Node V2 — soft oval / adaptive capsule**

## Locked Product Formula

\`AI builds the map. You shape it. You think on it. It keeps growing.\`

The primary canvas is a persistent AI-generated, human-editable, handwriting-native Concept Map.

## Current Visual Change

Collapsed Concepts should read as graph entities rather than miniature document cards:

- short Concept → compact oval / near-circle,
- longer Concept → adaptive soft capsule,
- complete labels; no ellipsis,
- Source badge remains compact and subordinate,
- drag / expand / delete controls must not force resting node width,
- expanded summary remains bounded and does not mutate stored coordinates,
- Edge geometry continues to follow the live node dimensions.

Implementation lives primarily in \`canvas.css\`. Regression coverage: \`tests/verify-concept-nodes-v2.js\`.

## Manual Acceptance

After syncing and reloading the extension, inspect a map containing both short and long labels. PASS requires:

1. the canvas immediately reads more like a Concept Map / relationship network,
2. short Concepts are materially more compact than the old 180px cards,
3. long labels remain complete and readable,
4. Source badge and controls do not clutter the resting node,
5. hover/select still exposes drag / expand / delete affordances,
6. touch still has an explicit expand control,
7. Edge connections remain visually sensible as node sizes change,
8. Quick Expand and Detail Drawer behavior are unchanged.

Automated tests may establish CODE/CI VERIFIED. The visual result requires BROWSER/MANUAL acceptance.

## Separate Open Ink Check

Fountain Pen V3 high-frequency Wacom input was recently optimized with requestAnimationFrame batching and resampling, but its final low-latency feel still requires human Wacom re-check. Do not conflate that manual ink check with Concept Node V2 acceptance.
`;
fs.writeFileSync('.ai-bridge/current-plan.md', plan);

console.log('Concept Node V2 patch staged successfully.');
