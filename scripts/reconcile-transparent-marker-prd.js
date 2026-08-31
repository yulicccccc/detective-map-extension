// One-time deterministic PRD reconciliation: current Highlighter = Transparent Marker.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'PRD.md');
let text = fs.readFileSync(file, 'utf8');

function replaceExact(oldText, newText, label) {
  if (text.includes(newText)) { console.log(`[MARKER-PRD] ${label}: already current`); return; }
  if (!text.includes(oldText)) throw new Error(`[MARKER-PRD] ${label}: expected old text not found`);
  text = text.replace(oldText, newText);
  console.log(`[MARKER-PRD] ${label}: patched`);
}

function replaceSection(startHeading, nextHeading, replacement, label) {
  if (text.includes(replacement)) { console.log(`[MARKER-PRD] ${label}: already current`); return; }
  const start = text.indexOf(startHeading);
  const end = text.indexOf(nextHeading, start + startHeading.length);
  if (start < 0 || end < 0) throw new Error(`[MARKER-PRD] ${label}: section boundaries not found`);
  text = text.slice(0, start) + replacement + '\n\n' + text.slice(end);
  console.log(`[MARKER-PRD] ${label}: replaced`);
}

replaceExact(
  '## 6.10 Brush Engine V2 — Fountain Pen + Watercolor Brush — Locked',
  '## 6.10 Brush Engine V2 — Fountain Pen + Transparent Marker — Locked',
  'brush-engine heading'
);

replaceExact(
`The product must move beyond generic line drawing toward **beautiful, expressive handwriting and annotation**. The two priority brushes are locked as:

1. **Fountain Pen** — the primary handwriting brush.
2. **Watercolor Brush** — the primary expressive highlighting / emphasis brush.

These are not cosmetic themes. Each brush has distinct input semantics, rendering behavior, persistence requirements, and manual acceptance criteria.`,
`The product must move beyond generic line drawing toward **beautiful, expressive handwriting and annotation**. The two primary ink behaviors are locked as:

1. **Fountain Pen** — the primary handwriting brush.
2. **Transparent Marker** — the primary highlighting / emphasis brush.

Watercolor V1/V2 remain historical replay formats only; they are not the current Highlighter product behavior. These are not cosmetic themes. Each current brush has distinct rendering behavior, persistence requirements, and manual acceptance criteria.`,
  'priority brush statement'
);

replaceSection(
  '### 6.10.2 Watercolor Brush — Primary Expressive Highlight Brush',
  '### 6.10.3 Brush Palette & Interaction Model — Two-Button Mapping Locked',
`### 6.10.2 Transparent Marker — Primary Highlight Brush

The Transparent Marker is optimized for a **knowledge-work concept map**, where emphasis must never compete with the information being emphasized. It should feel like a clean, premium translucent chisel/marker highlighter rather than paint or watercolor.

**Hard product rule — Readability First:** one normal pass over text, a Concept label, an Edge label, or structural lines must keep the underlying information clearly readable. If the highlight materially blocks reading, it fails regardless of visual attractiveness.

Required behavior:

- **Light Uniform First Pass**: A first pass adds a clear band of emphasis without a dense center or paint-like buildup.
- **Transparent Marker Body**: The interior should be comparatively even and controlled rather than cloud-like, grainy, or wet.
- **Subtle Soft Shoulder**: A faint softer outer edge is allowed so the marker does not look digitally harsh, but the edge must stay tighter and more precise than Watercolor.
- **Flat / Chisel-Like Character**: End caps and overall silhouette should read as marker/highlighter-like rather than circular paint blobs.
- **Stable Width**: Pressure may change width only subtly. Highlighter width must remain predictable when targeting compact Concept labels and Edge labels.
- **Gradual Overlap Darkening**: Repeated passes and crossings deepen naturally through normal compositing; a single pass must remain light.
- **Independent Color Choice**: Any selected Highlighter pigment must preserve the same transparency/readability behavior.
- **Dark-Canvas Legibility**: Preset pigments should remain visible on the dark map without requiring high opacity.
- **Stable Local Preview**: Active drawing must remain low-latency and visually consistent with persisted replay.
- **Performance Guardrail**: No full-canvas blur/diffusion, pigment simulation, or whole-stroke replay per pointer move.

Visual target:

\`\`\`text
one pass        → clean translucent highlight; underlying content remains clearly readable
inside stroke   → mostly even controlled color, no cloud/paint core
second pass     → gradually deeper emphasis
stroke crossing → locally darker but still readable
edge            → slightly softened, tighter than Watercolor
end             → flat/chisel-like marker character
\`\`\`

A successful Transparent Marker should look like **a transparent emphasis layer placed over the map**, not paint applied onto the map. Watercolor V1/V2 remain backward-compatible historical renderers only.`,
  'current Highlighter specification'
);

replaceExact(
`\`\`\`text
✒ Pen         → Fountain Pen engine
🖌 Highlighter → Watercolor Brush engine
🧽 Eraser
↩ Undo
\`\`\``,
`\`\`\`text
✒ Pen         → Fountain Pen engine
🖍 Highlighter → Transparent Marker engine
🧽 Eraser
↩ Undo
\`\`\``,
  'toolbar mapping'
);

replaceExact(
`- The visible **Highlighter** button is the product entry point for the Watercolor Brush highlighting experience described in §6.10.2.
- Do **not** add separate Fountain Pen and Watercolor Brush buttons beside Pen/Highlighter in the primary toolbar.
- Do **not** add a third "Ink Wash" / Chinese-ink brush to solve the highlighting requirement; Watercolor is the intended expressive highlight behavior.
- Historical generic \`tool: pen\` and flat \`tool: highlighter\` strokes remain supported for backward-compatible replay, but legacy utility rendering does not require a separate primary toolbar button.
- New Pen strokes must persist Fountain semantics; new Highlighter strokes must persist versioned Watercolor semantics. Historical failed/tuned brush versions remain replay-compatible without redefining the current default brush.`,
`- The visible **Highlighter** button is the product entry point for the Transparent Marker highlighting experience described in §6.10.2.
- Do **not** add separate Fountain Pen / Transparent Marker buttons beside Pen/Highlighter in the primary toolbar.
- Do **not** add a third Watercolor / Ink Wash brush to solve the highlighting requirement unless the user explicitly reopens the product decision.
- Historical generic \`tool: pen\`, flat \`tool: highlighter\`, and Watercolor V1/V2 strokes remain supported for backward-compatible replay; legacy rendering does not require a separate primary toolbar button.
- New Pen strokes must persist Fountain semantics; new Highlighter strokes must persist versioned Transparent Marker semantics. Historical Watercolor versions remain replay-compatible without redefining the current default Highlighter.`,
  'toolbar rules'
);

replaceExact(
  'This two-button mapping is a low-friction product rule: **Pen = beautiful writing; Highlighter = watercolor emphasis.**',
  'This two-button mapping is a low-friction product rule: **Pen = beautiful writing; Highlighter = transparent readable emphasis.**',
  'mapping summary'
);

replaceExact(
  "brushType: 'fountain_pen' | 'watercolor' | 'pen' | 'highlighter',",
  "brushType: 'fountain_pen' | 'transparent_marker' | 'watercolor' | 'pen' | 'highlighter',",
  'brushType data model'
);

replaceExact(
  '- Watercolor randomness/texture, if used, must be deterministic from persisted data/seed so reloading does not visibly redraw a different stroke.',
  '- Historical Watercolor randomness/texture must remain deterministic from persisted data/seed; current Transparent Marker rendering should avoid stochastic texture entirely unless a future requirement explicitly introduces it.',
  'replay rule'
);

replaceSection(
  '### 6.10.7 Manual Acceptance — Watercolor Brush',
  '### 6.10.8 Explicit Non-Goal for Brush Fidelity',
`### 6.10.7 Manual Acceptance — Transparent Marker

Manual test fixture:

1. Highlight directly across a Concept title once.
2. Highlight directly across an Edge label once.
3. Paint over half of the first highlight a second time.
4. Cross it once with the same color.
5. Repeat with at least two different selected colors.
6. Draw short marks on compact UI targets and one longer freehand highlight.

Acceptance — all must pass:
- **Hard gate:** one normal pass leaves underlying text / Concept / Edge information clearly readable,
- first pass looks like a clean translucent marker rather than watercolor, paint, or a dense fluorescent block,
- interior pigment is comparatively uniform and controlled,
- edge is slightly softened but does not bloom/cloud outward,
- repeated passes deepen gradually,
- crossings darken locally without becoming opaque,
- marker width remains predictable under light vs firm pressure,
- endpoints read flatter / more marker-like than the Watercolor blob silhouette,
- every selected pigment preserves readability,
- active motion remains low-latency,
- historical Watercolor strokes retain their original saved appearance after the new Marker becomes default.`,
  'manual marker acceptance'
);

replaceSection(
  '### 6.10.8 Explicit Non-Goal for Brush Fidelity',
  '---\n\n# 7. Map Data Model',
`### 6.10.8 Explicit Non-Goals for Transparent Marker

Transparent Marker does **not** require:
- watercolor blooms, cloud-like pigment, wet edges, or paper-fiber simulation,
- physically accurate pigment mixing,
- stochastic texture/granulation,
- exact reproduction of a proprietary marker brush,
- GPU-heavy effects that compromise interaction latency.

The product goal is a **clean, readable, attractive highlighting instrument for a concept map**, not a painting brush.`,
  'marker non-goals'
);

fs.writeFileSync(file, text, 'utf8');
console.log('[MARKER-PRD] PRD reconciliation complete');
