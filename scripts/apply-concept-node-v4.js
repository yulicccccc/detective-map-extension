const fs = require('fs');

function replaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) throw new Error(`Missing expected anchor: ${label}`);
  return text.replace(oldText, newText);
}

// 1) Visual refinement: earlier wrapping, quieter source badge, stronger relationships.
let css = fs.readFileSync('canvas.css', 'utf8');

css = replaceOnce(css,
`.edge-label-text {
  fill: #93c5fd;
  font-size: 11px;
  font-weight: 600;`,
`.edge-label-text {
  fill: #bfdbfe;
  font-size: 11.5px;
  font-weight: 650;`,
'edge label emphasis');

css = replaceOnce(css,
`  min-width: 76px;
  max-width: 190px;
  width: max-content;`,
`  min-width: 72px;
  max-width: 148px;
  width: max-content;`,
'compact node V4 width');

css = replaceOnce(css,
`  padding: 7px 14px;
  min-height: 42px;`,
`  padding: 7px 12px;
  min-height: 42px;`,
'compact header horizontal padding');

css = replaceOnce(css,
`  max-width: 156px;
  cursor: text;`,
`  max-width: 104px;
  cursor: text;`,
'title measure for earlier wrapping');

css = replaceOnce(css,
`.badge-sources {
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
}`,
`.badge-sources {
  background: rgba(14, 116, 144, 0.06);
  border: 1px solid rgba(56, 189, 248, 0.14);
  color: #8ecff0;
  font-size: 7px;
  font-weight: 700;
  padding: 1px 3px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: none;
  opacity: 0.46;
}`,
'source badge de-emphasis');

css = replaceOnce(css,
`.badge-sources:hover {
  background: rgba(56, 189, 248, 0.18);
  opacity: 1;
}`,
`.badge-sources:hover {
  background: rgba(56, 189, 248, 0.12);
  opacity: 0.84;
}`,
'source badge hover restraint');

fs.writeFileSync('canvas.css', css);

// 2) Focused Concept Node regression suite evolves to V4.
let focused = fs.readFileSync('tests/verify-concept-nodes-v2.js', 'utf8');
focused = focused.replace('🫧 Concept Node V2 Verification', '🫧 Concept Node V4 Verification');
focused = replaceOnce(focused,
`  assert(/min-width:\\s*76px/.test(block[1]), 'Short concepts must be allowed to stay visually compact');
  assert(/max-width:\\s*190px/.test(block[1]), 'Collapsed nodes must avoid button-like horizontal growth');`,
`  assert(/min-width:\\s*72px/.test(block[1]), 'Short concepts must be allowed to approach a near-circle footprint');
  assert(/max-width:\\s*148px/.test(block[1]), 'Collapsed nodes must resist elongated pill growth');`,
'focused V4 width invariants');
focused = replaceOnce(focused,
`  assert(/max-width:\\s*156px/.test(block[1]), 'Title measure should encourage earlier wrapping instead of a wide button-like pill');`,
`  assert(/max-width:\\s*104px/.test(block[1]), 'Title measure should make common multi-word Concepts wrap earlier');`,
'focused V4 title measure');
focused = replaceOnce(focused,
`  assert(prd.includes('avoid elongated, button-like pills'));`,
`  assert(prd.includes('avoid elongated, button-like pills'));
  assert(prd.includes('Relationship labels should visually outrank Source badges'));`,
'focused PRD relationship hierarchy');
focused = replaceOnce(focused,
`  assert(badge && /opacity:\\s*0\\.72/.test(badge[1]), 'Source badge should be visually subordinate');`,
`  assert(badge && /opacity:\\s*0\\.46/.test(badge[1]), 'Source badge should be clearly third-level information');`,
'focused source badge hierarchy');
focused = replaceOnce(focused,
`});

console.log('\\n========================================');
console.log('Verification Complete: ' + passed + '/' + total + ' tests passed.');`,
`});

test('10. Relationship labels visually outrank Source badges', () => {
  const edge = css.match(/\\.edge-label-text \\{([\\s\\S]*?)\\n\\}/);
  const badge = css.match(/\\.badge-sources \\{([\\s\\S]*?)\\n\\}/);
  assert(edge && /font-size:\\s*11\\.5px/.test(edge[1]), 'Relationship label should receive slightly more visual weight');
  assert(edge && /font-weight:\\s*650/.test(edge[1]), 'Relationship label weight should remain stronger than metadata');
  assert(edge && /fill:\\s*#bfdbfe/.test(edge[1]), 'Relationship label should remain clearly readable on the dark map');
  assert(badge && /font-size:\\s*7px/.test(badge[1]), 'Source badge should stay materially smaller than relationship semantics');
});

console.log('\\n========================================');
console.log('Verification Complete: ' + passed + '/' + total + ' tests passed.');`,
'focused V4 relationship test');
fs.writeFileSync('tests/verify-concept-nodes-v2.js', focused);

// 3) Keep the broad Structure-First invariant aligned with V4.
let broad = fs.readFileSync('tests/verify-v2.js', 'utf8');
broad = replaceOnce(broad,
`    // 22.3 Concept Node V3 footprint: compact, adaptive, visually quiet rather than button-like
    const conceptNodeRule = canvasCss.match(/\\.concept-node \\{([\\s\\S]*?)\\n\\}/);
    assert(conceptNodeRule, 'canvas.css must define .concept-node');
    assert(/min-width:\\s*76px/.test(conceptNodeRule[1]), 'Short Concept nodes must be allowed to remain compact (~76px floor)');
    assert(/max-width:\\s*190px/.test(conceptNodeRule[1]), 'Collapsed Concept nodes must avoid button-like growth beyond ~190px');
    assert(/width:\\s*max-content/.test(conceptNodeRule[1]), 'Collapsed Concept width must adapt to content');
    assert(/border-radius:\\s*999px/.test(conceptNodeRule[1]), 'Collapsed Concept must visually read as a soft oval/capsule node');`,
`    // 22.3 Concept Node V4 footprint: more node-like, earlier wrapping, relationship-first hierarchy
    const conceptNodeRule = canvasCss.match(/\\.concept-node \\{([\\s\\S]*?)\\n\\}/);
    assert(conceptNodeRule, 'canvas.css must define .concept-node');
    assert(/min-width:\\s*72px/.test(conceptNodeRule[1]), 'Short Concept nodes must be allowed to approach a near-circle footprint (~72px floor)');
    assert(/max-width:\\s*148px/.test(conceptNodeRule[1]), 'Collapsed Concept nodes must resist elongated pill growth beyond ~148px');
    assert(/width:\\s*max-content/.test(conceptNodeRule[1]), 'Collapsed Concept width must adapt to content');
    assert(/border-radius:\\s*999px/.test(conceptNodeRule[1]), 'Collapsed Concept must visually read as a soft oval/capsule node');

    const conceptTitleRule = canvasCss.match(/\\.concept-title \\{([\\s\\S]*?)\\n\\}/);
    assert(conceptTitleRule && /max-width:\\s*104px/.test(conceptTitleRule[1]), 'Common multi-word Concept names should wrap earlier instead of staying in long pills');

    const edgeLabelRule = canvasCss.match(/\\.edge-label-text \\{([\\s\\S]*?)\\n\\}/);
    assert(edgeLabelRule && /font-size:\\s*11\\.5px/.test(edgeLabelRule[1]) && /font-weight:\\s*650/.test(edgeLabelRule[1]), 'Relationship labels should visually outrank Source metadata');`,
'broad V4 node hierarchy');
fs.writeFileSync('tests/verify-v2.js', broad);

// 4) PRD: lock the browser-inspired V4 target without changing the interaction/data model.
let prd = fs.readFileSync('PRD.md', 'utf8');
prd = replaceOnce(prd,
`- browser-tested compact sizing direction: resting nodes should generally remain around \`76–190px\` overall width, with a title text measure around \`140–160px\`; longer labels should wrap earlier instead of preserving a button-like single line,`,
`- current V4 compact sizing direction: resting nodes should generally remain around \`72–148px\` overall width, with a title text measure around \`96–108px\`; common multi-word labels should wrap earlier so the graph reads as nodes rather than elongated controls,`,
'PRD V4 compact target');
prd = replaceOnce(prd,
`- source/evidence badges stay compact and subordinate to the Concept label,
- avoid elongated, button-like pills: common multi-word Concepts may wrap to two lines when that keeps the graph footprint compact,`,
`- source/evidence badges stay compact and subordinate to the Concept label,
- **Relationship labels should visually outrank Source badges** so the learner reads Concept → relationship → Concept before metadata,
- avoid elongated, button-like pills: common multi-word Concepts may wrap to two lines when that keeps the graph footprint compact,`,
'PRD relationship over source hierarchy');
fs.writeFileSync('PRD.md', prd);

// 5) Project state: record V3 browser pass and V4 as current refinement awaiting acceptance.
let state = fs.readFileSync('PROJECT_STATE.md', 'utf8');
state = replaceOnce(state,
`**Last reconciled:** 2026-08-31  `,
`**Last reconciled:** 2026-09-01  `,
'project date');
state = replaceOnce(state,
`**Status:** 🟢 Core Living Map stable; Structure-First interaction model browser-verified; Concept Node V3 compact visual refinement implemented and awaiting browser acceptance; Fountain Pen V3 and Transparent Marker retain separate manual device checks.`,
`**Status:** 🟢 Core Living Map stable; Structure-First interaction model browser-verified; Concept Node V3 browser/manual accepted; Concept Node V4 relationship-first visual refinement implemented and awaiting browser acceptance; Fountain Pen V3 and Transparent Marker retain separate manual device checks.`,
'project status V4');
state = replaceOnce(state,
`- Current visual refinement: collapsed Concepts use a compact, quiet oval/capsule footprint (about 76–190px) with earlier wrapping, reduced border/shadow weight, and a more subordinate Source badge so relationships and handwriting dominate the canvas.`,
`- Concept Node V3 browser/manual result: PASS — the map reads materially more like a Concept Map than a row of UI cards/buttons.
- Current V4 refinement: collapsed Concepts target roughly 72–148px with a ~104px title measure so common multi-word labels wrap earlier; Source badges are further de-emphasized; Relationship labels are slightly strengthened so Concept + Relationship + handwriting dominate node chrome/metadata.`,
'project visual state V4');
state = replaceOnce(state,
`**Manual browser acceptance of Concept Node V3 compact visual refinement on a real map.**`,
`**Manual browser acceptance of Concept Node V4 relationship-first refinement on the same real map.**`,
'project next action V4');
fs.writeFileSync('PROJECT_STATE.md', state);

// 6) Current plan: one next action after implementation is visual acceptance of V4.
const plan = `# Current Plan — Detective Map V2.0

**Last updated:** 2026-09-01  
**Single next priority:** **Manual visual acceptance of Concept Node V4 — relationship-first graph refinement**

## Locked Product Formula

\`AI builds the map. You shape it. You think on it. It keeps growing.\`

The primary canvas is a persistent AI-generated, human-editable, handwriting-native Concept Map.

## Current Visual Change

Concept Node V3 passed real-browser acceptance: the map now reads as a Concept Map rather than a row of large pill buttons. V4 is a narrow refinement based on that accepted screenshot, not a redesign.

V4 changes only three visual priorities:

1. **Earlier wrapping / more node-like proportions**
   - resting node width target roughly 72–148px,
   - title measure about 104px,
   - common multi-word Concepts such as \`Spaced Repetition\`, \`Optimized Interval\`, and \`Distributed Practice\` should be allowed to wrap into a more oval/near-circle footprint instead of preserving one long line.

2. **Source badge moves further into the background**
   - smaller text and padding,
   - lower opacity,
   - weaker background/border,
   - still clickable and readable on intent.

3. **Relationship semantics become slightly stronger**
   - relationship label size/weight/contrast increases slightly,
   - relationship information must visually outrank Source metadata without overpowering the Concept name or handwriting.

No changes to Concept coordinates, AI behavior, data model, Ink, Drawer, Quick Expand, drag behavior, or Edge storage.

Principle:

\`Concept Name + Relationship + handwriting > Source metadata > node chrome.\`

## Manual Acceptance

After syncing and reloading, inspect the same real map containing \`Spaced Repetition → Optimized Interval\`, plus surrounding nodes.

PASS requires:

1. common multi-word Concepts feel more like graph nodes than horizontal UI pills,
2. labels remain complete and naturally wrapped; no truncation,
3. relationship labels are easier to read at a glance than Source badges,
4. Source badges remain discoverable but no longer compete with the Concept name,
5. handwriting still feels like a first-class thinking layer over the machine-generated structure,
6. Edge endpoints remain visually aligned with live node dimensions,
7. hover/select/drag/expand behaviors remain unchanged,
8. the overall canvas feels closer to an interactive knowledge network than a flowchart or card layout.

Automated tests may establish CODE/CI VERIFIED. Final aesthetics still require browser/manual acceptance.

## Separate Open Ink Check

Fountain Pen V3 high-frequency Wacom input has requestAnimationFrame batching and resampling, but the final low-latency Wacom feel still requires a separate human re-check. Do not conflate that with Concept Node V4 visual acceptance.
`;
fs.writeFileSync('.ai-bridge/current-plan.md', plan);

console.log('Concept Node V4 relationship-first visual refinement staged successfully.');
