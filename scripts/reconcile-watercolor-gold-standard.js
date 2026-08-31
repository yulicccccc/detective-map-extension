// One-time exact PRD patch for Watercolor visual benchmark after manual V1 failure.
const fs = require('fs');
const path = require('path');

const prdPath = path.join(__dirname, '..', 'PRD.md');
let text = fs.readFileSync(prdPath, 'utf8');
let changed = false;

function replaceExact(oldText, newText, label) {
  if (text.includes(newText)) {
    console.log(`[PRD-WC] ${label}: already reconciled`);
    return;
  }
  if (!text.includes(oldText)) {
    throw new Error(`[PRD-WC] ${label}: expected old text not found; refusing broad rewrite`);
  }
  text = text.replace(oldText, newText);
  changed = true;
  console.log(`[PRD-WC] ${label}: patched`);
}

replaceExact(
  '**Last updated:** 2026-08-28  ',
  '**Last updated:** 2026-08-31  ',
  'document date'
);

replaceExact(
  'The Watercolor Brush should feel soft, translucent, layered, and slightly wet rather than like a rigid fluorescent marker.\n\nRequired behavior:',
  'The Watercolor Brush should feel soft, translucent, layered, airy, and slightly wet rather than like a rigid fluorescent marker. Its visual benchmark is the same *class* of elegant watercolor wash seen in iPad Freeform: cloud-like pigment, soft blooms, gentle internal variation, and transparent color that emphasizes without destroying the map underneath.\n\n**Hard product rule — Structure-Preserving Wash:** a normal single pass over text, a Concept, or an Edge must keep the underlying information clearly readable. If one ordinary pass obscures or materially reduces readability, the brush fails regardless of how attractive the pigment looks.\n\nRequired behavior:',
  'Watercolor visual benchmark and readability gate'
);

replaceExact(
`- **Semi-Transparent Pigment**: A single pass remains translucent so underlying Concepts, edges, and writing remain readable.
- **Soft / Feathered Edge**: Brush edges should be visually softer than a standard highlighter; avoid a hard rectangular/solid marker boundary.
- **Layer Accumulation**: Painting over the same area multiple times must visibly deepen the color.
- **Natural Overlap Darkening**: Crossings between two watercolor strokes should become richer/darker at the overlap instead of visually replacing one another.
- **Color Interaction**: When different watercolor colors overlap, ordinary alpha/pigment compositing should create a natural mixed/deeper region. Exact physical-fluid color simulation is not required.
- **Wet-Looking Texture**: A subtle variation in opacity/edge density may be used to avoid a perfectly uniform digital marker appearance, but texture must not become distracting or noisy.
- **Stable Local Preview**: The active brush preview must remain responsive. Expensive post-processing may happen after pointer-up only if the visible result does not jump dramatically.
- **Performance Guardrail**: Do not implement full-canvas blur/diffusion or whole-stroke re-rendering on every pointer move. Watercolor quality may degrade gracefully before sacrificing writing responsiveness.`,
`- **Very Light First Pass**: A normal first pass is intentionally light and translucent; it adds emphasis without covering the underlying map.
- **Readability Is Non-Negotiable**: Text, Concept labels, relationship labels, and structural lines remain clearly readable through one normal pass.
- **Airy Pigment, Not a Solid Core**: Avoid a dense opaque center stripe or marker-like body. Pigment density may vary gently across the stroke so the wash feels cloud-like rather than uniformly filled.
- **Soft / Feathered / Blooming Edge**: Brush edges should fade softly with subtle bloom/feather character; avoid hard rectangular or hard circular marker boundaries.
- **Layer Accumulation**: Painting over the same area multiple times must visibly deepen color in a gradual way. Depth should emerge from repeated painting, not from an already-heavy first pass.
- **Natural Overlap Darkening**: Crossings between watercolor strokes should become richer/darker at the overlap instead of visually replacing one another.
- **Color Interaction**: Different watercolor colors should overlap into a soft mixed/deeper region using deterministic compositing; exact physical-fluid pigment simulation is not required.
- **Gentle Internal Variation**: Subtle uneven pigment density may create a wet/cloudy appearance, but variation must remain elegant rather than noisy, speckled, or dirty.
- **Soft Default Palette Behavior**: Default Watercolor colors should avoid excessively saturated, paint-like blocks. Perceived output should remain light enough for annotation over content.
- **Stable Local Preview**: The active brush preview must remain responsive. Expensive post-processing may happen after pointer-up only if the visible result does not jump dramatically.
- **Performance Guardrail**: Do not implement full-canvas blur/diffusion or whole-stroke re-rendering on every pointer move. Watercolor quality may degrade gracefully before sacrificing input responsiveness.`,
  'expanded Watercolor rendering requirements'
);

replaceExact(
`Visual target:

\`\`\`text
one pass       → soft translucent wash
second pass    → visibly deeper color
stroke crossing→ locally darker/richer overlap
edge           → soft, not fluorescent-marker hard
\`\`\``,
`Visual target:

\`\`\`text
one pass        → airy, pale, transparent wash; underlying text remains clearly readable
inside stroke   → gentle cloud-like pigment variation; no dense opaque center
second pass     → visibly but gradually deeper color
stroke crossing → locally richer/darker overlap
edge            → soft feather/bloom, never marker-hard
color impression→ elegant translucent pigment, not a saturated paint block
\`\`\`

A successful Watercolor stroke should look like **transparent pigment suspended over the map**, not colored paint covering the map.`,
  'Watercolor visual target'
);

replaceExact(
`Acceptance:
- one pass is translucent,
- repeated painting visibly deepens the color,
- crossings visibly darken/richen,
- different colors create a natural overlap region,
- edges are visibly softer than the classic Highlighter,
- underlying map content remains readable,
- active brush motion remains fluid enough for normal annotation.`,
`Acceptance — all must pass:
- **Hard gate:** one normal pass directly over text/Concept labels/Edge labels leaves the underlying information clearly readable; if readability is obscured, Watercolor fails immediately,
- the first pass feels light/airy rather than dense or paint-like,
- there is no obvious opaque center blob or solid-marker core,
- repeated painting visibly and gradually deepens the color,
- crossings visibly darken/richen,
- different colors create a soft natural overlap region,
- edges are visibly soft/feathered/bloomed rather than classic Highlighter-hard,
- pigment shows subtle elegant internal variation rather than a perfectly uniform digital fill,
- active brush motion remains fluid enough for normal annotation,
- when judged beside iPad Freeform Watercolor, the user considers it the same **class of light, elegant, wet watercolor wash**, even though exact proprietary rendering is not required.`,
  'Watercolor manual acceptance hard gate'
);

if (changed) {
  fs.writeFileSync(prdPath, text, 'utf8');
  console.log('[PRD-WC] Reconciliation written.');
} else {
  console.log('[PRD-WC] No changes required.');
}
