# Detective Map Product Requirements Document (PRD)

**Document status:** Living Source of Truth  
**PRD version:** 2.0  
**Last updated:** 2026-08-31  
**Product:** Detective Map / 侦探外脑  
**Primary concept:** Living Learning Map  
**Core principle:** *Minimum manual effort, maximum cognitive ownership.*

> This PRD supersedes the former “one-shot AI mind-map generator” framing.
> Detective Map is now a persistent visual learning workspace that evolves with the learner’s understanding over time.
> The map is not an output. The map is the learner’s current state of understanding.

---

# 1. Product Vision

## 1.1 Product Positioning

Detective Map is a **persistent, cross-device, AI-assisted visual learning workspace**.

It helps a learner continuously convert new learning material—whether a sentence, paragraph, ChatGPT conversation, article, pasted text, or later a document/PDF—into **one evolving concept map for a topic**.

The learner can continuously add new learning material, let AI propose how the new material changes the existing understanding, edit the concept map structurally on a computer, annotate the same map by hand with a pressure-sensitive desktop pen tablet or Apple Pencil, keep all changes synchronized, return to the source behind every important concept, and continue learning without starting over.

The product must feel like a **living external model of understanding**, not a collection of disconnected notes.

---

# 2. Core Product Thesis

## 2.1 The Map Is Never “Finished”

```text
Learn something
→ Add it to the current Workspace
→ AI compares it with the existing map
→ AI proposes incremental changes
→ User accepts / edits
→ User restructures on computer
→ User annotates by hand with pen input
→ Everything syncs
→ Learn something else
→ Add again
→ Same map keeps growing
```

A Workspace is a persistent learning topic.

Examples: AI-assisted learning, Pharmaceutical microbiology, Regulatory affairs, Interview preparation, English pronunciation, a book, a course, or a research question.

A new input does **not** create a new concept map unless the learner explicitly creates a new Workspace.

---

# 3. Locked Product Principles

## 3.1 Incremental Merge, Not Regeneration

When new material is added, AI must **not regenerate the entire map**.

Default behavior: add genuinely new concepts, enrich an existing concept, add a new relationship, flag a contradiction, suggest a merge, or suggest a structural change.

AI must preserve existing node IDs, user-created relationships, manual edits, node positions, ink, pinned layout, and source provenance.

Large-scale restructuring must be shown as a proposal and require explicit user approval.

## 3.2 AI Proposes; Human Commits

AI must not silently rewrite the learner’s map.

After processing new material, show a compact proposal:

```text
New learning processed

+ 3 new concepts
+ 2 new relationships
~ 1 existing concept enriched
! 1 possible conflict

[Apply All]   [Review]
```

The low-friction default is **Apply All**. Review allows per-operation accept/reject. Destructive operations such as merge, delete, replacement, or large restructuring always require confirmation.

### 3.2.1 Durable Server-Side Mutation Audit Trail
To provide a durable, attributable server-side mutation audit trail ensuring "AI Proposes; Human Commits" is verifiable and traceable:
- **Server Mutation Audit Table (`mutation_audit`)**: Every proposal apply attempt, stale conflict (409), unprovenanced block (403), error, and successful application is durably recorded in SQLite.
- **Provenance Guard**: Calls without valid human UI action headers (`X-Detective-Surface` and `X-Detective-Action-Id`) are blocked with HTTP 403 `PROVENANCE_REQUIRED`, recorded as `proposal_apply_blocked`, and produce zero map mutation.
- **Atomic Transaction Guarantee**: Map mutation, revision increment, proposal status update (`applied`), and `proposal_apply_success` audit recording execute inside a single atomic SQLite transaction (`executeTransaction`). Any failure inside the transaction triggers a complete rollback to the prior state.
- **Enrichment Audit (`enrich_concept`)**: Tracks structural `enrichedConceptIds` and `enrichedConceptCount` in success audit metadata for complete attribution of incremental knowledge updates.
- **Zero-Secret & Zero-Content Logging**: Device tokens are SHA-256 fingerprinted (`fp_...`). Raw auth tokens, pairing codes, source bodies, summaries, and concept content text are strictly excluded from audit records.
- **Authenticated Audit Endpoint**: `GET /api/audit?workspaceId=...` exposes recent mutation events for auditability without data leakage.

## 3.3 Source ≠ Concept

Raw learning material and conceptual understanding are separate layers.

**Source** = evidence the learner consumed, such as a ChatGPT quote, paragraph, article, pasted text, web URL, or later PDF/document section.

**Concept** = the learner’s abstracted understanding.

Every AI-created or AI-enriched concept should maintain provenance links back to supporting Sources.

## 3.4 Preserve Cognitive Ownership

The system automates mechanical work: parsing, concept extraction, deduplication, relationship detection, source linking, and initial placement.

The learner retains cognitive decisions: what matters, what is wrong, what belongs together, what should be emphasized, how concepts should be arranged, and what handwritten annotations mean.

## 3.5 Never Separate an Insight from Its Context

A learner must be able to move from Concept → supporting Source → original ChatGPT conversation / webpage.

Captured Sources preserve source text, title, URL when available, timestamp, originating Workspace, and source type.

---

# 4. Primary User Experience

## 4.1 Windows / Desktop Role: Structural Thinking + Pen Annotation

Desktop is optimized for capturing new material, selecting Workspace, reviewing AI proposals, moving nodes, editing concept titles/descriptions, creating/deleting edges, merging concepts, pinning concepts, searching, undo, managing sources, and pressure-sensitive handwriting with a pen tablet such as Wacom.

Desktop remains the primary **structural editing surface**, while a pen tablet may also act as a low-latency annotation surface without requiring a second device.

## 4.2 iPad Role: Cognitive Annotation

iPad Safari is optimized for viewing the same live concept map, Apple Pencil handwriting, circling concepts, freehand arrows, highlighting, question marks, handwritten comments, erasing strokes, and pan/zoom.

iPad is an optional **thinking / ink surface** rather than a required dependency for handwriting.

Windows and iPad are two interfaces to the **same Workspace state**, not two copies.

---

# 5. Core Workflow

## 5.1 Create or Select Workspace

The extension and canvas must always have an **Active Workspace**.

First run:

```text
Create your first learning map
Workspace name: __________
[Create]
```

The extension Side Panel includes a Workspace selector.

## 5.2 Add Learning Material

V2.0 supports three ingestion paths:

### Path A — Chrome Selection Capture

On ChatGPT: select text → right-click → Add to Detective Map. The content is added to the current Active Workspace. Capture remains locally successful even if cloud/AI processing fails.

### Path B — Paste / Add Source

Desktop Canvas includes `+ Add Source`. User can paste one sentence, one paragraph, long notes, or article text. V2.0 target: support at least ~10,000 words through server-side chunking.

### Path C — Manual Concept

User can create a Concept directly without AI.

---

# 6. AI Incremental Update Engine

## 6.1 Input

The AI update endpoint receives Workspace metadata, current Concepts, current Edges, relevant Sources, the new Source, relevant user edits, and map revision number.

Do not send raw ink to AI in V2.0 unless explicitly requested.

## 6.2 Required AI Output

AI returns a **structured patch**, not a whole replacement map.

```json
{
  "workspaceId": "ws_...",
  "baseRevision": 17,
  "sourceId": "src_...",
  "summary": "What this source adds to the learner's current model.",
  "operations": [
    {
      "op": "add_concept",
      "tempId": "tmp_1",
      "label": "Independent Retrieval",
      "description": "Ability to produce knowledge without cues.",
      "sourceRefs": ["src_..."]
    },
    {
      "op": "enrich_concept",
      "conceptId": "concept_existing",
      "addition": "Understanding can exist without successful retrieval.",
      "sourceRefs": ["src_..."]
    },
    {
      "op": "add_edge",
      "from": "concept_existing",
      "to": "tmp_1",
      "relation": "does_not_guarantee",
      "label": "≠",
      "sourceRefs": ["src_..."]
    }
  ]
}
```

## 6.3 Allowed Patch Operations

- `add_concept`
- `enrich_concept`
- `add_edge`
- `update_edge`
- `suggest_merge`
- `flag_conflict`
- `suggest_restructure`

AI must not directly emit destructive `delete_concept` operations as automatic actions.

## 6.4 Explicit Source Subject Preservation & Three-Pillar Concept Boundary Policy

AI adheres to a strict reasoning order: **Explicit Subject $\rightarrow$ Positive Identity & Contrastive Check $\rightarrow$ Three-Pillars $\rightarrow$ Grounded Operations $\rightarrow$ Consistent Summary**:
- **Precondition 1: Explicit Source Subject Preservation**:
  - When the source explicitly introduces/names candidate concept $A$, $A$'s identity is preserved and not substituted by a similar existing concept $X$.
- **Precondition 2: Positive Identity Evidence & Contrastive Check**:
  - Only map $A$ to existing $X$ if positive identity evidence exists (exact name match, true alias like `PCR` $\leftrightarrow$ `Polymerase Chain Reaction`, explicit equivalence).
  - *Contrastive Test*: "If $A$ was replaced with $X$, would the technical meaning be distorted?" If yes $\rightarrow$ $A \neq X$.
  - *Sibling-Concept Anti-Collapse*: Close conceptual neighbors (e.g. `Self-Explanation` vs `Elaborative Interrogation`, `Retrieval Practice` vs `Spaced Repetition`, `Accuracy` vs `Precision`, `Sensitivity` vs `Specificity`, `Validation` vs `Verification`) are strictly kept separate.
- **Three-Pillar Concept Boundary & Merge Policy**:
  - *1. Attachment Test (Anti-Fragmentation)*: Internal mechanisms, definitions, and properties of $X$ itself MUST generate `enrich_concept` targeting $X$.
  - *2. Independence Test (Anti-Over-Merging)*: Claims that have independent identity (counterfactually true without $X$, broader scope, or sibling identity) MUST generate `add_concept` without inventing ungrounded edges.
- **Hard Rule: Source-Grounded Edge Gate (Evidence Authority)**:
  - Existing Map context is for disambiguation only; current Source is the EXCLUSIVE authority for emitted edges.
  - An edge $A \leftrightarrow X$ is allowed ONLY when the source text explicitly states an interaction (causes, improves, inhibits, subtype of, combines with, requires, contrasts with).
  - Merely sharing a domain, having similar outcomes, or making the graph more connected is strictly prohibited as grounds for emitting edges.
- **Proposal Consistency**:
  - The summary field must strictly match the emitted operations (e.g., never claim "Added..." when only emitting `enrich_concept`).
- **Deduplication**: Semantic equivalents enrich existing concepts or create merge suggestions rather than duplicating nodes.

## 6.5 Long Source Processing

```text
Source
→ chunk
→ extract candidate concepts/relationships
→ reconcile candidates
→ compare against existing map
→ produce one consolidated patch
```

The user receives one proposal, not chunk-level result spam.

## 6.6 Human-Readable Proposal Review UI ("AI Proposes; Human Commits")

- **ID Resolution**: All `tempId` and `conceptId` references in `add_edge` and `suggest_merge` are automatically resolved to human-readable concept titles before rendering the review card.
- **Direction & Relation Clarity**: Review modal displays explicit `From → To` directional flow, semantic `relation` badges, and proposed explanatory labels.
- **Subset Preservation**: Users can selectively check/uncheck individual concepts, enrichments, or edges without dangling references.

## 6.7 Concept Card Dragging & Edge Label Readability

- **Dedicated Grab Handle**: Every concept card features a dedicated `.concept-drag-handle` (`⋮⋮`) with `cursor: grab` / `cursor: grabbing` to ensure reliable repositioning on the spatial canvas.
- **Select Mode Enforcement**: Node dragging is strictly bound to `activeTool === 'select'`, preventing accidental node repositioning during pen drawing, highlighting, erasing, or connecting.
- **Protected Contenteditable**: Clicking editable titles or descriptions preserves text editing and never triggers dragging.
- **Edge Label Readability**: SVG edge labels feature a protective high-contrast halo (`paint-order: stroke fill; stroke: #0f172a; stroke-width: 4px;`) ensuring text remains legible when crossing grid lines and ink strokes.

## 6.8 Concept Map Information Hierarchy & Progressive Disclosure — Locked

The primary canvas is a **Concept Map**, not a wall of note cards. The default visual hierarchy must prioritize **Concept identity + Concept-to-Concept relationships** over descriptive prose.

### 6.8.1 Default Concept Node = Collapsed Structure View

Every Concept renders **collapsed by default**. The collapsed node shows only information required to read the map structurally:

```text
┌────────────────────────┐
│ Spaced Repetition   📚2 │
└────────────────────────┘
           │
    increases effectiveness
           ↓
┌────────────────────────┐
│ Optimized Interval     │
└────────────────────────┘
```

Default collapsed nodes:
- show the complete Concept label,
- may show a compact source/evidence count or status badge,
- do **not** show the full Concept description,
- do **not** contain internal body scrollbars,
- keep relationship edges and edge labels visually prominent.

A learner should be able to glance at the canvas and answer: **What are the concepts, and how are they related?** without reading paragraphs inside nodes.

### 6.8.2 Concept Labels Must Never Be Silently Truncated

Concept identity is semantic data and must remain readable.

Rules:
- no default ellipsis such as `Elaborative Rehe...`,
- node width may adapt within bounded limits,
- longer titles wrap naturally when necessary,
- target sizing: approximately `min-width: 180px`, adaptive preferred width, `max-width: 260px` unless later usability testing changes these values,
- title wrapping changes node height but must not hide part of the label.

### 6.8.3 Quick Expand = Temporary Summary View

A collapsed Concept can be temporarily expanded to inspect its short description without leaving the map.

Desktop interactions:
- double-click Concept → expand/collapse,
- explicit chevron/details control → expand/collapse.

iPad/touch interactions:
- explicit chevron/details control must be available; double-click is a convenience, not the only affordance.

Quick Expand:
- reveals a concise description/summary,
- must not introduce an internal scrollbar for ordinary content,
- is temporary by default,
- should collapse when focus moves away unless the learner explicitly pins/keeps it expanded.

Expansion is a **view state**, not a structural map mutation, and must not change the Concept's semantic identity.

### 6.8.4 Full Detail Belongs in a Detail Drawer, Not a Giant Node

Full Concept knowledge must be presented in a dedicated Detail Drawer / Inspector rather than indefinitely enlarging the spatial node.

The Detail Drawer may contain:
- full description,
- supporting Sources,
- evidence excerpts / provenance,
- source links,
- annotations,
- future history/conflict information.

Principle:

```text
Card / Node = Concept identity in the graph
Drawer      = Concept knowledge and evidence
```

Opening full details must not force neighboring nodes to move or destroy the user's spatial mental model.

### 6.8.5 Expansion Must Preserve Spatial Stability

Temporary expansion must not silently rewrite stored layout coordinates. The spatial graph remains stable while the learner inspects details.

If a node is temporarily expanded:
- neighboring Concepts are not automatically rearranged by default,
- its saved `(x, y)` position remains unchanged,
- closing the expansion returns to the same collapsed structural footprint,
- permanent/pinned expansion, if supported later, must be an explicit user decision.

### 6.8.6 Visual Priority Order

The canvas visual hierarchy is locked to:

1. **Concept Name** — highest priority,
2. **Relationship / Edge semantics** — directional/type/label information,
3. **Evidence/source count or compact status**,
4. **Concept description** — hidden by default; available via Quick Expand,
5. **Full Sources / evidence / history** — Detail Drawer.

Descriptive prose must never visually dominate the graph in its default state.

### 6.8.7 Non-Map Status UI Must Be Non-Intrusive

Operational notifications such as `AI analysis failed`, sync warnings, retries, or stale-source notices must not consume a large permanent strip of the Concept Map canvas.

Preferred behavior:
- compact corner toast/status chip,
- dismissible notification center entry,
- clear Retry action when relevant.

The majority of canvas real estate must remain dedicated to **Concepts + Relationships + learner annotations**.

## 6.9 Ink Engine Foundation V1 — Low-Latency, Pressure-Aware, Replay-Safe

The existing ink foundation is device-agnostic. It must support any browser pen input that exposes Pointer Events, including Wacom-class desktop pen tablets and Apple Pencil where available.

- **Pressure-Aware Stroke Scaling**: Pressure values may affect stroke rendering, with safe fallback for devices that report missing/constant pressure.
- **Incremental Active Rendering**: During active pen input, newly stable segments are rendered incrementally without replaying the full stroke history on each pointer event.
- **Tri-Layer Active Ink Rendering**: `inkCanvas` holds committed strokes; `activeStrokeCanvas` holds finalized segments of the current stroke; `scratchCanvas` holds only the replaceable live tail. Replacing the live tail must never erase finalized active ink.
- **Replay Parity**: Incremental finalized segments + live tail use the same canonical geometry rules as persisted replay so pointer-up does not visibly change the final stroke shape.
- **Palm & Gesture Separation**: On touch devices, touch is reserved for navigation; palm touch while pen input is active cannot interrupt the pen stroke.
- **Local-First Input**: Pen rendering must never wait for cloud/network persistence before showing the stroke locally.

## 6.10 Brush Engine V2 — Fountain Pen + Watercolor Brush — Locked

The product must move beyond generic line drawing toward **beautiful, expressive handwriting and annotation**. The two priority brushes are locked as:

1. **Fountain Pen** — the primary handwriting brush.
2. **Watercolor Brush** — the primary expressive highlighting / emphasis brush.

These are not cosmetic themes. Each brush has distinct input semantics, rendering behavior, persistence requirements, and manual acceptance criteria.

### 6.10.1 Fountain Pen — Primary Handwriting Brush

The Fountain Pen should evoke the attractive writing feel of a pressure-sensitive calligraphy/fountain-pen tool: clear stroke modulation, tapered entry/exit, and responsive pen dynamics.

Required behavior:

- **Strong Pressure Response**: Light pressure produces visibly thinner strokes; normal pressure produces the default writing weight; firm pressure produces visibly thicker strokes. The difference must be obvious to the eye rather than technically present but imperceptible.
- **Pressure Curve, Not Raw Mapping**: Width must use a smooth calibrated curve with bounds and smoothing; raw pressure must never directly cause noisy width spikes.
- **Velocity Influence**: Stroke speed contributes modestly to width/shape. Faster movement should generally feel lighter/finer and slower movement slightly fuller, without overwhelming pressure input.
- **Start Taper**: The beginning of a stroke should naturally sharpen rather than begin as a blunt circular cap when sufficient motion exists.
- **End Taper / Pen Lift**: The end of a stroke should narrow smoothly into a visible pen-lift point rather than terminate abruptly.
- **Continuous Width Interpolation**: Width changes between points must interpolate smoothly; no per-point stair-step thickness changes.
- **Tilt / Nib Orientation When Available**: If the device/browser reports reliable `tiltX` / `tiltY`, altitude/azimuth, or equivalent orientation data, the renderer should use it to alter nib aspect/orientation so angled strokes produce a more calligraphic pen edge.
- **Graceful Tilt Fallback**: Tilt is an enhancement, not a dependency. Devices that do not provide stable tilt data must still produce an attractive Fountain Pen using pressure + velocity + taper.
- **Device Calibration**: Provide at least a simple pressure-sensitivity control or preset curve so Wacom and Apple Pencil input can be tuned independently if their reported pressure ranges feel different.
- **No New Perceptible Latency**: Fountain Pen quality must not reintroduce noticeable lag relative to the current low-latency Wacom baseline.

Visual target:

```text
light pressure  → fine hairline
normal pressure → comfortable handwriting weight
firm pressure   → clearly fuller stroke
fast exit       → tapered lift
supported tilt  → directional nib / calligraphic variation
```

The target is **beautiful everyday handwriting and English/calligraphy-like stroke character**, not merely a round pen whose radius changes.

### 6.10.2 Watercolor Brush — Primary Expressive Highlight Brush

The Watercolor Brush should feel soft, translucent, layered, airy, and slightly wet rather than like a rigid fluorescent marker. Its visual benchmark is the same *class* of elegant watercolor wash seen in iPad Freeform: cloud-like pigment, soft blooms, gentle internal variation, and transparent color that emphasizes without destroying the map underneath.

**Hard product rule — Structure-Preserving Wash:** a normal single pass over text, a Concept, or an Edge must keep the underlying information clearly readable. If one ordinary pass obscures or materially reduces readability, the brush fails regardless of how attractive the pigment looks.

Required behavior:

- **Very Light First Pass**: A normal first pass is intentionally light and translucent; it adds emphasis without covering the underlying map.
- **Readability Is Non-Negotiable**: Text, Concept labels, relationship labels, and structural lines remain clearly readable through one normal pass.
- **Airy Pigment, Not a Solid Core**: Avoid a dense opaque center stripe or marker-like body. Pigment density may vary gently across the stroke so the wash feels cloud-like rather than uniformly filled.
- **Soft / Feathered / Blooming Edge**: Brush edges should fade softly with subtle bloom/feather character; avoid hard rectangular or hard circular marker boundaries.
- **Layer Accumulation**: Painting over the same area multiple times must visibly deepen color in a gradual way. Depth should emerge from repeated painting, not from an already-heavy first pass.
- **Natural Overlap Darkening**: Crossings between watercolor strokes should become richer/darker at the overlap instead of visually replacing one another.
- **Color Interaction**: Different watercolor colors should overlap into a soft mixed/deeper region using deterministic compositing; exact physical-fluid pigment simulation is not required.
- **Gentle Internal Variation**: Subtle uneven pigment density may create a wet/cloudy appearance, but variation must remain elegant rather than noisy, speckled, or dirty.
- **Soft Default Palette Behavior**: Default Watercolor colors should avoid excessively saturated, paint-like blocks. Perceived output should remain light enough for annotation over content.
- **Stable Local Preview**: The active brush preview must remain responsive. Expensive post-processing may happen after pointer-up only if the visible result does not jump dramatically.
- **Performance Guardrail**: Do not implement full-canvas blur/diffusion or whole-stroke re-rendering on every pointer move. Watercolor quality may degrade gracefully before sacrificing input responsiveness.

Visual target:

```text
one pass        → airy, pale, transparent wash; underlying text remains clearly readable
inside stroke   → gentle cloud-like pigment variation; no dense opaque center
second pass     → visibly but gradually deeper color
stroke crossing → locally richer/darker overlap
edge            → soft feather/bloom, never marker-hard
color impression→ elegant translucent pigment, not a saturated paint block
```

A successful Watercolor stroke should look like **transparent pigment suspended over the map**, not colored paint covering the map.

### 6.10.3 Brush Palette & Interaction Model — Two-Button Mapping Locked

The primary toolbar keeps the existing **two ink buttons only**. Product names in the toolbar remain simple and familiar; the expressive brush engine is an implementation detail behind each button.

```text
✒ Pen         → Fountain Pen engine
🖌 Highlighter → Watercolor Brush engine
🧽 Eraser
↩ Undo
```

Locked rules:

- The visible **Pen** button is the product entry point for the Fountain Pen handwriting experience described in §6.10.1.
- The visible **Highlighter** button is the product entry point for the Watercolor Brush highlighting experience described in §6.10.2.
- Do **not** add separate Fountain Pen and Watercolor Brush buttons beside Pen/Highlighter in the primary toolbar.
- Do **not** add a third "Ink Wash" / Chinese-ink brush to solve the highlighting requirement; Watercolor is the intended expressive highlight behavior.
- Historical generic `tool: pen` and flat `tool: highlighter` strokes remain supported for backward-compatible replay, but legacy utility rendering does not require a separate primary toolbar button.
- New Pen strokes must persist Fountain semantics; new Highlighter strokes must persist versioned Watercolor semantics. Historical failed/tuned brush versions remain replay-compatible without redefining the current default brush.
- **Independent Color Selection**: Pen and Highlighter each own an independent selected color. Changing Pen color must never silently change Highlighter color, and vice versa.
- **Low-Friction Color UI**: Color selection must not add another primary brush/tool button. Each of the two existing ink tools may expose a compact color dot/swatch that opens a small palette.
- **Presets + Custom Color**: Each tool should offer a small useful preset palette plus a custom color picker; selecting a color applies to future strokes only.
- **Historical Stroke Stability**: Changing the selected color must never recolor existing strokes. Every stroke persists its actual chosen color as part of stroke data and replays identically across devices.
- **Preference Scope**: The last selected Pen and Highlighter colors may be remembered per device/browser for low-friction reuse. Cross-device preference synchronization is not required for V2.0; synchronized stroke color fidelity is required.

This two-button mapping is a low-friction product rule: **Pen = beautiful writing; Highlighter = watercolor emphasis.**

### 6.10.4 Persistent Brush Semantics & Backward Compatibility

Brush output must remain stable after save/reload and across future renderer changes.

New Ink Strokes should support additive metadata such as:

```js
{
  brushType: 'fountain_pen' | 'watercolor' | 'pen' | 'highlighter',
  brushVersion: 1,
  brushParams: { ... },
  seed: optionalDeterministicSeed,
  points: [
    {
      x,
      y,
      pressure,
      t,          // timestamp / monotonic time for velocity reconstruction
      tiltX,      // optional
      tiltY,      // optional
      altitudeAngle, // optional when available
      azimuthAngle   // optional when available
    }
  ]
}
```

Rules:

- Old strokes containing only `{x, y, pressure}` must continue rendering safely without migration.
- Missing pressure falls back to a normal/default writing pressure.
- Missing timestamps disable/reduce velocity effects rather than corrupting the stroke.
- Missing tilt data disables tilt-specific nib behavior without changing stroke identity.
- Persist `brushVersion` and brush parameters required for deterministic replay so changing future default brush settings does not silently change historical handwriting.
- Watercolor randomness/texture, if used, must be deterministic from persisted data/seed so reloading does not visibly redraw a different stroke.

### 6.10.5 Rendering Priority Order

For both brushes, engineering priorities are locked to:

1. **Input responsiveness / no perceptible lag**
2. **Stable pointer-tip tracking**
3. **No visual snap on pointer-up**
4. **Deterministic persistence/replay**
5. **Expressive brush aesthetics**
6. **Advanced physical simulation**

A more realistic brush that feels laggy is a product regression.

### 6.10.6 Manual Acceptance — Fountain Pen

Automated tests can verify math and replay invariants, but handwriting quality requires human pen testing.

Manual test fixture:

```text
hello
oooooo
888888
Spaced Repetition
```

Then draw:
- one very light line,
- one normal-pressure line,
- one firm-pressure line,
- one line that transitions continuously light → firm → light,
- several quick flicks / check marks,
- several slow curves,
- tilted strokes when the hardware reports tilt.

Acceptance:
- pressure differences are immediately visible,
- transitions remain smooth,
- no obvious width spikes,
- beginnings/endings show attractive taper,
- quick writing remains responsive,
- pointer-up does not change the visible stroke shape,
- tilt affects nib character when supported,
- the user judges the writing materially more attractive than the current generic Pen.

### 6.10.7 Manual Acceptance — Watercolor Brush

Manual test fixture:

1. Paint one horizontal wash once.
2. Paint over half of it a second time.
3. Cross it with a vertical wash of the same color.
4. Cross it with a second color.
5. Highlight across Concept nodes and edge labels.

Acceptance — all must pass:
- **Hard gate:** one normal pass directly over text/Concept labels/Edge labels leaves the underlying information clearly readable; if readability is obscured, Watercolor fails immediately,
- the first pass feels light/airy rather than dense or paint-like,
- there is no obvious opaque center blob or solid-marker core,
- repeated painting visibly and gradually deepens the color,
- crossings visibly darken/richen,
- different colors create a soft natural overlap region,
- edges are visibly soft/feathered/bloomed rather than classic Highlighter-hard,
- pigment shows subtle elegant internal variation rather than a perfectly uniform digital fill,
- active brush motion remains fluid enough for normal annotation,
- when judged beside iPad Freeform Watercolor, the user considers it the same **class of light, elegant, wet watercolor wash**, even though exact proprietary rendering is not required.

### 6.10.8 Explicit Non-Goal for Brush Fidelity

The target is **functionally and aesthetically similar brush behavior**, not a pixel-for-pixel clone of any proprietary native app brush engine.

V2 Brush Engine does **not** require:
- physically accurate fluid dynamics,
- paper-fiber simulation,
- pigment granulation physics,
- exact reproduction of a specific proprietary brush,
- GPU-heavy effects that compromise interaction latency.

---

# 7. Map Data Model

## Workspace

```js
{ id, title, createdAt, updatedAt, revision, archived }
```

## Source

```js
{
  id,
  workspaceId,
  type,
  title,
  text,
  url,
  capturedAt,
  contentHash,
  processingStatus
}
```

## Concept

```js
{
  id,
  workspaceId,
  label,
  description,
  x,
  y,
  width,
  pinned,
  createdAt,
  updatedAt,
  sourceRefs,
  createdBy
}
```

## Edge

```js
{
  id,
  workspaceId,
  from,
  to,
  relation,
  label,
  sourceRefs,
  createdBy
}
```

## Ink Stroke

```js
{
  id,
  workspaceId,
  tool,
  brushType,
  brushVersion,
  brushParams,
  seed,
  color,
  width,
  opacity,
  points: [
    {
      x,
      y,
      pressure,
      t,
      tiltX,
      tiltY,
      altitudeAngle,
      azimuthAngle
    }
  ],
  createdAt
}
```

All new point-dynamics fields are optional for backward compatibility. Legacy strokes containing only `{x, y, pressure}` remain valid.

## Change Proposal

```js
{
  id,
  workspaceId,
  sourceId,
  baseRevision,
  createdAt,
  summary,
  operations,
  status
}
```

---

# 8. Visual Layers

```text
Infinite World Space
│
├── Ink Layer
│   ├── Fountain Pen handwriting
│   ├── Watercolor Brush highlighting/emphasis
│   ├── utility Pen / Highlighter
│   ├── free arrows
│   └── sketches
├── Edge Layer
├── Concept Layer
├── Source / Evidence UI
└── Application UI
```

All spatial content uses the same pan/zoom/world-coordinate model.

The **default Concept Layer is structure-first**: Concept labels and relationship edges are visible; descriptions are progressively disclosed through temporary expansion or the Detail Drawer.

---

# 9. Desktop Map Editing Requirements

V2.0 must support drag Concept, edit label, edit description, delete Concept with confirmation, manually create Edge, delete Edge, edit relationship label, pin/unpin Concept, pan, zoom, Undo, fit map, select Concept, view supporting Sources, open original source URL, apply/reject AI proposals, and low-latency pressure-sensitive handwriting from Wacom-class pen tablets when available.

Concept-map view requirements additionally include:
- collapsed Concept nodes by default,
- complete non-truncated labels,
- double-click or explicit control for Quick Expand,
- a full Detail Drawer for long descriptions and evidence,
- no default internal body scrollbar on Concept nodes,
- temporary expansion that does not mutate saved layout coordinates.

Manual structural edits and persistent ink synchronize across supported clients.

---

# 10. Ink Input & Brush Requirements

Primary toolbar mapping is locked to the existing two ink controls:

```text
👆 Select
✒ Pen         = Fountain Pen behavior
🖌 Highlighter = Watercolor Brush behavior
🧽 Eraser
↩ Undo
```

Do not expand the main toolbar into separate generic/expressive variants. Legacy Pen/Highlighter rendering remains a backward-compatibility concern, not a reason to add more primary ink buttons.

Browser pen input (`pointerType === "pen"`) should create ink from pressure-sensitive devices such as Wacom and Apple Pencil. Mouse input may remain as a functional fallback but is not expected to reproduce pressure/tilt expression.

On touch devices, Pen/Brush tools must ignore accidental single-finger ink. Touch is primarily navigation. Two-finger pan/zoom is preferred. While a pen stroke is active, unrelated touch pointers should not create ink.

The ink system should capture pressure, timing, and tilt/orientation data when the device/browser exposes them. Missing advanced data must degrade gracefully.

Touch users must have an explicit tap target for Concept Quick Expand / Details; desktop-only double-click interactions may not be the sole way to reveal Concept information.

---

# 11. Cross-Device Synchronization

Synchronize Concepts, Concept positions, Concept edits, Edges, Sources, AI proposal/status, Ink, and Workspace changes.

A capture or structural update from an active Windows or Mac client should propagate to other already-open connected clients without refresh. iPad remains a supported optional browser/pen client: an iPad ink stroke should persist and reappear after reopening.

Use revision-aware updates to avoid silent overwrites.

Temporary UI-only view state such as a non-pinned Quick Expand does not need to be synchronized unless later product testing shows value.

---

# 12. Cloud Architecture

```text
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
```

Frontend remains Vanilla HTML/CSS/JavaScript unless a later PRD changes this.

---

# 13. Security Requirements — Locked

- default rule: do not introduce new hardcoded pairing codes, credentials, or secrets,
- accepted implementation exception: the existing permanent convenience auto-pair mechanism remains unless the user explicitly reopens that decision; do not expose its concrete credential in PRD/docs/logs/URLs/prompts and do not treat the exception as permission to add other hardcoded secrets,
- do not introduce new credentials into Git,
- no credentials in URLs,
- no public `/api/state`,
- all state APIs require authentication,
- WebSocket sends no state before authentication,
- old compromised pairing credentials must be invalidated,
- device tokens stored locally only,
- Chrome capture continues locally when cloud fails,
- no `<all_urls>` extension permission,
- extension host permission limited to deployed Worker domain,
- do not log source content or auth tokens unnecessarily.

Pairing secrets must be provisioned securely outside source control.

---

# 14. AI Provider Architecture

The Worker exposes a provider-neutral internal AI interface.

Preferred order:

1. Detect whether the current Cloudflare account can use a supported Cloudflare Workers AI text model.
2. If available, configure Workers AI through an account binding rather than hardcoded secrets.
3. If unavailable, implement the provider interface and clearly report that an external AI provider must be configured.

Do not fake AI output with a simple sentence splitter and call it AI.

AI response must be validated against the patch schema before becoming a Proposal. Invalid AI output fails safely without modifying the existing map.

---

# 15. Workspace Revision / Conflict Model

Every structural Workspace mutation increments a revision.

Each AI Proposal records `baseRevision`.

If `currentRevision !== baseRevision`, do not blindly apply. Rebase/regenerate or mark the Proposal stale.

---

# 16. Failure Behavior

## AI unavailable

```text
Source saved
AI update pending / unavailable
[Retry]
```

Existing map remains untouched.

UI presentation must follow §6.8.7: failure state is compact and non-intrusive and must not permanently cover a large portion of the Concept Map.

## Cloud unavailable

```text
Saved locally
Cloud sync pending
```

## WebSocket disconnect

Reconnect with backoff. Do not discard local edits.

## Invalid AI patch

Reject patch. Do not mutate map.

---

# 17. V2.0 Acceptance Scenarios

## Scenario 1 — First Learning Input

Create Workspace `AI Learning`. Capture `Active recall improves retrieval strength.` AI proposes an initial concept map. User applies it.

## Scenario 2 — Incremental Learning

Later capture `Understanding something does not mean you can independently retrieve it.` AI compares against the existing map, proposes incremental changes, does not create a new map, and preserves existing node positions.

## Scenario 3 — Long Article

Paste a multi-thousand-word article. Source is saved, processing happens in background, chunking produces one consolidated proposal, duplicates are avoided, and the existing map is preserved.

## Scenario 4 — Desktop Manual Editing

User drags a node, edits its label, and creates an edge. Changes persist and sync. AI may not silently reverse them on the next ingestion.

## Scenario 5 — Handwriting Annotation

Open the same Workspace on a pressure-sensitive input surface. On Windows, use a Wacom-class pen tablet; on iPad, use Apple Pencil. Circle, write, highlight/paint, and erase. Ink uses map world coordinates and persists.

## Scenario 6 — Continuous Growth

Capture five additional Sources over multiple sessions. The same Workspace keeps evolving with no duplicate maps and no loss of prior manual structure or ink.

## Scenario 7 — Structure-First Concept Map Reading

Open a mature Workspace containing many Concepts with long descriptions. By default, the canvas shows compact Concept identities and readable relationship labels rather than paragraph-heavy cards. No Concept title is truncated. Double-clicking or activating the expand control temporarily reveals a concise description; opening Details shows full description and Sources in a drawer without permanently changing the map layout. Closing details returns the learner to the same spatial structure.

## Scenario 8 — Expressive Fountain Pen Writing

Using a Wacom-class pen tablet, write `hello`, `oooooo`, `888888`, and `Spaced Repetition`, then draw light/normal/firm lines and fast flicks. Fountain Pen shows clearly visible pressure modulation, smooth taper, stable pointer-tip tracking, and no new perceptible lag versus the current low-latency Pen baseline. Reloading reproduces the same stroke geometry/character.

## Scenario 9 — Watercolor Layering

Paint one translucent wash, repaint half of it, and cross it with same-color and different-color washes. Repeated/overlapping regions visibly deepen, edges remain softer than classic Highlighter, underlying Concept Map content remains readable, and the brush stays responsive during normal annotation.

---

# 18. V2.0 Non-Goals

Do not implement yet: handwriting OCR, AI interpretation of handwritten symbols, automatic conversion of ink arrow to semantic Edge, collaborative multi-user editing, public sharing, complex knowledge graph analytics, spaced-repetition generation, automatic PDF OCR, full Obsidian integration, autonomous large-scale AI rearrangement, physically accurate watercolor fluid simulation, or pixel-for-pixel cloning of a proprietary native brush engine.

---

# 19. V2.1 / Future Direction

## 19.1 Human-AI Co-thinking Canvas
```text
User circles concepts
+ writes “same thing?”
+ draws an arrow
        ↓
AI interprets selected ink context
        ↓
AI proposes merge / relation / clarification
        ↓
Human approves
```
This is the intended **Human-AI Co-thinking Canvas** direction.

## 19.2 Pluggable AI Provider Layer & Long-Context Evolution
```text
Detective Map Core
        │
        ▼
AI Provider Abstraction Layer
  ├─ Cloudflare Workers AI (Default / Built-in / 0-config)
  ├─ Agnes 2.5 Flash (OpenAI-compatible / 512K Long Context candidate)
  └─ External Providers (OpenAI GPT-4o / Gemini 1.5 Pro)
```

**Key Architectural Decisions**:
1. **Zero Coupling to Single Model**: The core concept map, workspace, SQLite schema, and proposal state machine remain strictly isolated from LLM provider details.
2. **Long-Context Advantage for Large Living Maps**: As a map grows to hundreds of concepts and source documents, 512K context models (like Agnes 2.5 Flash) can ingest the entire existing knowledge graph + new incoming text to make highly contextual decisions (`add_concept` vs `enrich_concept` vs `detect_conflict` vs `add_edge`).
3. **A/B Benchmark Strategy**: Run side-by-side evaluations on identical sources and mature maps (`Workers AI` vs `Agnes 2.5 Flash` vs `GPT-4o-mini`) to measure structural extraction accuracy and relationship quality before promoting any secondary provider.
4. **Credential Security**: All third-party provider keys must reside exclusively in Cloudflare Worker Secrets (`wrangler secret put`), never in chat logs, client storage, or code commits.

---

# 20. Product Definition

> **Detective Map is a persistent visual learning workspace that continuously updates with what you learn, while preserving your own spatial edits, handwritten thinking, and source context.**

Short form:

> **Learn → Add → AI Merge → Edit → Ink → Sync → Keep Learning.**

The product succeeds when the learner can study for days or weeks and feel that one map is becoming an increasingly accurate external representation of their own understanding.