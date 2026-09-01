# Detective Map V2.0 — Current Project State

**Last reconciled:** 2026-09-01
**Product:** Living Learning Map
**Production:** `https://detectivemap.qchen9108.workers.dev`
**Status:** 🟢 Core Living Map stable; Structure-First interaction model browser-verified; Concept Node V3 browser/manual accepted; Concept Node V4 relationship-first visual refinement implemented and awaiting browser acceptance; Fountain Pen V3 and Transparent Marker retain separate manual device checks.

> `PRD.md` = product requirements.
> `PROJECT_STATE.md` = current implementation/evidence.
> `.ai-bridge/current-plan.md` = one next action.
> `AGENTS.md` = engineering/multi-agent rules.

---

## 1. Current Architecture

```text
Windows / Mac Chrome Extension + Full Canvas
          │
          │ HTTPS / authenticated WSS
          ▼
Cloudflare Worker
          │
          ▼
Durable Object + SQLite
(authoritative Workspace state)
          │
          ├─ Concepts / Edges / Sources / Ink
          ├─ Revisions / Proposals / Audit
          └─ Workers AI
```

- Windows Chrome + Wacom is the immediate structural + handwriting workflow.
- Mac Chrome shares the same cloud Workspace.
- iPad is optional; it is not required for handwriting.
- Native iPad Safari Pencil latency previously tested poorly.
- Obsidian/Excalidraw migration remains paused.

---

## 2. Locked Product Rules

### Living Map / AI

- Incremental merge, not whole-map regeneration.
- Source ≠ Concept.
- AI proposes; human commits.
- Preserve Concept IDs, manual edits, positions, accepted edges, ink, and source provenance.
- Proposal subset application prevents dangling temp-ID edges.
- Durable stale proposal recovery/retry remains active.
- Mutation audit retains provenance guard + atomic map/proposal/audit commit behavior.

### Concept Boundary / Grounding

Current AI policy includes Explicit Source Subject Preservation, positive identity evidence + contrastive identity check, attachment-vs-independent-Concept boundary, Source-Grounded Edge policy, and proposal-summary consistency.

### Accepted Pairing Exception

The current product intentionally retains one permanent convenience auto-pair mechanism as an accepted usability/security tradeoff. Agents must not expose its concrete credential or use it as justification for additional hardcoded secrets.

### Two-Button Ink Mapping — Locked

```text
Pen         = Fountain Pen behavior
Highlighter = Transparent Marker behavior
```

Rules:

- no separate Fountain / Marker toolbar buttons,
- no third Watercolor / Ink Wash brush unless the user explicitly reopens that decision,
- historical generic Pen/Highlighter and Watercolor V1/V2 replay remain compatible,
- new Pen strokes persist Fountain semantics,
- new Highlighter strokes persist `transparent_marker` semantics,
- Pen and Highlighter keep independent selected colors,
- changing selected color affects future strokes only; historical stroke colors never change.

---

## 3. Structure-First Concept Map UI

**BROWSER PASS ✅**

- Concepts collapsed by default.
- Concept identity + relationships dominate the default map.
- Descriptions hidden by default.
- Complete labels; no ellipsis/line-clamp truncation.
- Quick Expand is temporary view state.
- Full description/sources/evidence belong in Detail Drawer.
- Spatial coordinates remain stable while inspecting details.
- Edge labels retain readable halo.
- Operational errors use compact toast/status UI.
- Concept Node V3 browser/manual result: PASS — the map reads materially more like a Concept Map than a row of UI cards/buttons.
- Current V4 refinement: collapsed Concepts target roughly 72–148px with a ~104px title measure so common multi-word labels wrap earlier; Source badges are further de-emphasized; Relationship labels are slightly strengthened so Concept + Relationship + handwriting dominate node chrome/metadata.

---

## 4. Ink Foundation

**CODE VERIFIED ✅**

- Pointer Events pen input.
- Coalesced events when available.
- Pressure capture with fallback.
- Tri-layer active rendering: committed ink / finalized active segments / replaceable live tail.
- Local-first rendering; cloud persistence never blocks visible input.
- Incremental rendering avoids full historical-stroke replay per pointer move.
- Palm/touch separation remains preserved.

Historical manual evidence:

- Windows Wacom latency on generic Pen: **MANUAL PASS ✅** — essentially mouse-like latency.
- Generic Pen pressure/aesthetics: insufficient.
- iPad Safari native Canvas Apple Pencil: **MANUAL FAIL / POOR ❌** for latency.

---

## 5. Pen = Fountain Pen V3 (Expressive Calligraphic Fountain Pen)

Implementation: `shared/fountain-pen-v3.js`

**CODE VERIFIED ✅**
**CI VERIFIED ✅**
**MANUAL WACOM ACCEPTANCE REQUIRED ⏳**

Includes:
- High thick/thin contrast (hairline <1px to rich swell >6.5px, >8x dynamic range),
- True start taper (rapid ramp from sharp hairline entry into body weight, no blunt circular blobs),
- True exit taper (smooth narrowing to sharp pointed finish on pen lift),
- Velocity + pressure combined width model (fast motion becomes finer, slow curves fuller),
- Directional nib / calligraphic angle modulation (italic chisel slant ~40° or hardware azimuth/tilt),
- Presets: Expressive (Default), Calligraphy Nib, Balanced,
- Deterministic replay parity and $O(1)$ incremental active rendering,
- High-frequency Wacom optimization: `requestAnimationFrame` render batching (at most 1 active render per frame) + spatial/dynamic resampling filter (`CanvasCore.shouldAcceptStrokePoint`) reducing redundant micro-samples by >40% without losing curve or pressure fidelity,
- Byte-for-byte backward compatibility for legacy Pen (V1) and Fountain Pen V2 strokes.

Automated suites: `tests/verify-fountain-v2.js` and `tests/verify-fountain-v3.js` (15/15 passed).

---

## 6. Highlighter History and Current Direction

### Watercolor V1

`shared/watercolor-brush-v1.js`

**CODE / CI VERIFIED ✅**
**MANUAL FAIL ❌**

V1 was too dense and obscured map information.

### Watercolor V2 Light Wash

`shared/watercolor-brush-v2.js`

**CODE / CI VERIFIED ✅**
**MANUAL PASS as a watercolor effect ✅**
**PRODUCT DIRECTION RETIRED ⚪**

The user later judged the watercolor look aesthetically acceptable but still too visually blocking for Detective Map's knowledge-work highlighting role. Watercolor V1/V2 therefore remain historical replay formats only; they are no longer the default Highlighter product behavior.

### Transparent Marker V1 — Current Highlighter Candidate

Implementation: `shared/transparent-marker-v1.js`

**CODE VERIFIED ✅**
**CI VERIFIED ✅**
**MANUAL WACOM ACCEPTANCE REQUIRED ⏳**

Product rationale: highlighting should emphasize Concept/Edge/text information without competing with or covering it.

Implemented behavior:

- clean translucent marker body,
- intentionally low one-pass opacity/readability budget,
- two deterministic layers only: faint soft shoulder + controlled body,
- no watercolor cloud/bloom/texture,
- flat `butt` line caps for a more marker/chisel-like silhouette,
- stable width with only subtle pressure response,
- repeated passes/crossings deepen gradually through `source-over`,
- selected Highlighter color is preserved,
- deterministic replay,
- incremental active rendering remains O(1),
- Watercolor V1/V2 histories delegate to their previous renderers unchanged.

New Highlighter strokes upgrade from `tool: highlighter` to:

```text
tool: transparent_marker
brushType: transparent_marker
brushVersion: 1
```

Automated suite: `tests/verify-transparent-marker-v1.js`.

---

## 7. Independent Ink Color Selection

Implementation: `shared/ink-color-palette.js`

**CODE VERIFIED ✅**
**CI VERIFIED ✅**
**MANUAL PASS for core independent-color behavior ✅**

- Pen and Highlighter maintain separate selected colors.
- Each existing tool button has a compact color dot and palette/custom picker.
- Last selected colors are remembered independently in device/browser `localStorage`.
- New strokes persist their chosen actual color.
- Existing strokes are never recolored.
- `transparent_marker`, historical `watercolor`, and `highlighter` semantics all map to the Highlighter color preference.
- Cross-device preference syncing is not required; cross-device stroke color fidelity is required.

Automated suite: `tests/verify-ink-colors.js`.

---

## 8. Persistence Compatibility

The server already stores `tool`, width, opacity, color, and full points JSON, so Transparent Marker requires no Durable Object table migration.

Historical stroke versions remain versioned and stable. Old Watercolor strokes must keep their original appearance even though Transparent Marker becomes the new default Highlighter.

---

## 9. Build / CI Discipline

Long-term workflow: `.github/workflows/verify-generated-assets.yml`

Required suites include:

```text
node tests/verify-all.js
node tests/verify-v2.js
node tests/verify-fountain-v2.js
node tests/verify-watercolor-v1.js
node tests/verify-watercolor-v2.js
node tests/verify-transparent-marker-v1.js
node tests/verify-ink-colors.js
```

`public/` is a clean generated directory. `src/assets-bundle.js` is rebuilt from the same source tree. Temporary PRD reconciliation tooling has been removed.

Verification labels:

- **CODE VERIFIED** — source/test inspection.
- **CI VERIFIED** — independent GitHub runner executed required suites.
- **CLOUD VERIFIED** — live isolated cloud fixture/API evidence.
- **BROWSER PASS** — actual browser UX observed.
- **MANUAL FAIL/PASS/REQUIRED** — real human/device judgment.

---

## 10. Multi-Computer / Multi-AI Handoff

Before work: fetch/pull latest `main`, confirm remote HEAD, then read `PRD.md`, this file, `.ai-bridge/current-plan.md`, and `AGENTS.md`. Do not overwrite newer remote work from a stale clone.

---

## 11. Single Next Action

**Manual browser acceptance of Concept Node V4 relationship-first refinement on the same real map.**

After pulling/reloading:

1. choose a visible Highlighter color,
2. draw one fresh highlight directly over a Concept title / Edge label,
3. repeat over half once,
4. cross it once,
5. try a second color,
6. compare readability and precision against the retired Watercolor behavior.

Acceptance:

- one pass leaves underlying information clearly readable,
- stroke looks clean and marker-like rather than cloudy/wet,
- fill is mostly uniform and controlled,
- edge is only subtly softened,
- second pass deepens gradually,
- width remains predictable,
- endpoints feel flatter/more chisel-like,
- no perceptible new lag,
- old Watercolor strokes remain unchanged.


## Concept Node V2 — Soft Oval / Adaptive Capsule (31Aug26)

Product direction is now locked to **Concept should look like a node, not a card**. The collapsed Concept surface uses a compact content-adaptive soft oval/capsule silhouette: short labels can approach a near-circle, while long labels expand/wrap without truncation. Drag/edit/delete/expand affordances move visually out of the resting silhouette so controls do not force every Concept into a card-width rectangle. Expanded summaries stay bounded and spatially stable.

Automated coverage: `tests/verify-concept-nodes-v2.js`.

State: **CODE / CI verification required after activation; BROWSER / MANUAL visual acceptance required.**
