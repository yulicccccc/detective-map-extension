const fs = require('fs');
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
    console.error('  ✕ FAIL: ' + name + '\n    ' + err.message);
  }
}

console.log('========================================');
console.log('🫧 Concept Node V4 Verification');
console.log('========================================');

test('1. Collapsed Concept uses a soft pill/oval silhouette', () => {
  const block = css.match(/\.concept-node \{([\s\S]*?)\n\}/);
  assert(block, 'Missing .concept-node rule');
  assert(/border-radius:\s*999px/.test(block[1]), 'Collapsed node must use pill/oval radius');
  assert(/min-width:\s*72px/.test(block[1]), 'Short concepts must be allowed to approach a near-circle footprint');
  assert(/max-width:\s*148px/.test(block[1]), 'Collapsed nodes must resist elongated pill growth');
  assert(/width:\s*max-content/.test(block[1]), 'Node width must remain content-adaptive');
});

test('2. Header no longer creates a card-like rectangular band', () => {
  const block = css.match(/\.concept-header \{([\s\S]*?)\n\}/);
  assert(block, 'Missing .concept-header rule');
  assert(/background:\s*transparent/.test(block[1]), 'Collapsed node header must visually merge with node');
  assert(/justify-content:\s*center/.test(block[1]), 'Collapsed label should read as a centered graph node');
  assert(/min-height:\s*42px/.test(block[1]), 'Collapsed node should stay thin enough to read as a graph entity');
});

test('3. Long labels remain complete and wrap instead of ellipsizing', () => {
  const block = css.match(/\.concept-title \{([\s\S]*?)\n\}/);
  assert(block, 'Missing .concept-title rule');
  assert(/white-space:\s*normal/.test(block[1]));
  assert(/overflow-wrap:\s*break-word/.test(block[1]));
  assert(!/text-overflow:\s*ellipsis/.test(block[1]));
  assert(/max-width:\s*104px/.test(block[1]), 'Title measure should make common multi-word Concepts wrap earlier');
});

test('4. Structural controls are visually out-of-flow so short nodes stay compact', () => {
  const actions = css.match(/\.concept-actions \{([\s\S]*?)\n\}/);
  const drag = css.match(/\.concept-drag-handle \{([\s\S]*?)\n\}/);
  assert(actions && /position:\s*absolute/.test(actions[1]), 'Concept actions must not set resting node width');
  assert(drag && /position:\s*absolute/.test(drag[1]), 'Drag handle must not set resting node width');
});

test('5. Explicit touch controls remain reachable without hover', () => {
  assert(css.includes('@media (hover: none), (pointer: coarse)'), 'Touch fallback media query required');
  assert(css.includes('.btn-toggle-expand,'), 'Explicit expand button must remain in touch fallback');
  assert(css.includes('pointer-events: auto;'), 'Touch controls must accept input');
});

test('6. Expanded summary remains a soft bounded surface, not a giant pill', () => {
  const block = css.match(/\.concept-node\.expanded \{([\s\S]*?)\n\}/);
  assert(block, 'Missing expanded node rule');
  assert(/border-radius:\s*24px/.test(block[1]), 'Expanded summary should use a softer panel radius');
  assert(/max-width:\s*320px/.test(block[1]), 'Expanded view must stay bounded');
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
  assert(prd.includes('avoid elongated, button-like pills'));
  assert(prd.includes('Relationship labels should visually outrank Source badges'));
});

test('9. Resting node chrome is visually subordinate', () => {
  const node = css.match(/\.concept-node \{([\s\S]*?)\n\}/);
  const badge = css.match(/\.badge-sources \{([\s\S]*?)\n\}/);
  assert(node && /border:\s*1px solid rgba\(100, 116, 139, 0\.38\)/.test(node[1]), 'Resting outline should stay subtle');
  assert(node && /box-shadow:\s*0 2px 8px -5px/.test(node[1]), 'Resting shadow should stay minimal');
  assert(badge && /opacity:\s*0\.46/.test(badge[1]), 'Source badge should be clearly third-level information');
  assert(badge && /box-shadow:\s*none/.test(badge[1]), 'Source badge should not float like a card control');
});

test('10. Relationship labels visually outrank Source badges', () => {
  const edge = css.match(/\.edge-label-text \{([\s\S]*?)\n\}/);
  const badge = css.match(/\.badge-sources \{([\s\S]*?)\n\}/);
  assert(edge && /font-size:\s*11\.5px/.test(edge[1]), 'Relationship label should receive slightly more visual weight');
  assert(edge && /font-weight:\s*650/.test(edge[1]), 'Relationship label weight should remain stronger than metadata');
  assert(edge && /fill:\s*#bfdbfe/.test(edge[1]), 'Relationship label should remain clearly readable on the dark map');
  assert(badge && /font-size:\s*7px/.test(badge[1]), 'Source badge should stay materially smaller than relationship semantics');
});

console.log('\n========================================');
console.log('Verification Complete: ' + passed + '/' + total + ' tests passed.');
console.log('========================================');
if (passed !== total) process.exit(1);
