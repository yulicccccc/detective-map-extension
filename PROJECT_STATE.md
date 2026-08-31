# Detective Map V2.0 — Current Project State

**Last reconciled:** 2026-08-31  
**Product:** Living Learning Map  
**Production:** `https://detectivemap.qchen9108.workers.dev`  
**Status:** 🟢 Core Living Map stable; Structure-First UI browser-verified; Pen/Highlighter expressive brushes accepted for this phase; independent color selection is CODE/CI VERIFIED and awaiting manual UI confirmation.

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

Device direction:

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

Current AI policy includes:

1. Explicit Source Subject Preservation.
2. Positive identity evidence + contrastive identity check.
3. Attachment vs independent Concept boundary.
4. Source-Grounded Edge policy: current Source is evidence authority; existing map is interpretation context only.
5. Proposal summary consistency.

### Accepted Pairing Exception

The current product intentionally retains one permanent convenience auto-pair mechanism as an accepted usability/security tradeoff.

Agents must not expose its concrete credential or use it as justification for adding additional hardcoded secrets.

### Two-Button Ink Mapping — Locked

```text
Pen         = Fountain Pen behavior
Highlighter = Watercolor Brush behavior
```

Rules:

- no separate Fountain/Watercolor toolbar buttons,
- no third Ink Wash brush,
- historical generic `tool: pen` and `tool: highlighter` replay remain compatible,
- new Pen strokes persist Fountain semantics,
- new Highlighter strokes persist Watercolor semantics,
- Pen and Highlighter have independent selected colors,
- changing a selected color only affects future strokes; historical stroke colors never change.

---

## 3. Structure-First Concept Map UI

**BROWSER PASS ✅**

- Concepts collapsed by default.
- Concept identity + relationships dominate the default map.
- Descriptions hidden by default.
- Complete labels; no ellipsis/line-clamp truncation.
- Long labels wrap naturally.
- Quick Expand is temporary view state.
- Full description/sources/evidence belong in Detail Drawer.
- Spatial coordinates remain stable while inspecting details.
- Edge labels retain readable halo.
- Operational errors use compact toast/status UI.

---

## 4. Ink Foundation

**CODE VERIFIED ✅**

- Pointer Events pen input.
- Coalesced events when available.
- Pressure capture with fallback.
- Tri-layer active rendering:
  - `inkCanvas` = committed strokes,
  - `activeStrokeCanvas` = finalized active segments,
  - `scratchCanvas` = replaceable live tail.
- Local-first rendering; cloud persistence never blocks visible input.
- Incremental rendering avoids full historical-stroke replay per pointer move.
- Palm/touch separation remains preserved.

Historical manual evidence:

- Windows Wacom latency on generic Pen: **MANUAL PASS ✅** — essentially mouse-like latency.
- Generic Pen pressure/aesthetics: insufficient.
- iPad Safari native Canvas Apple Pencil: **MANUAL FAIL / POOR ❌** for latency.

---

## 5. Pen = Fountain Pen V2

Implementation:

`shared/fountain-pen-v2.js`

**CODE VERIFIED ✅**  
**CI VERIFIED ✅**  
**CURRENT PHASE: ACCEPTABLE; remaining user-requested Pen issue is color choice ✅**

Implemented:

- strong pressure modulation,
- Light Touch / Balanced / Expressive presets,
- velocity influence,
- start/end taper,
- optional tilt/orientation variation,
- deterministic replay,
- incremental/replay parity,
- O(1) hydration + rendering path,
- historical `tool: pen` replay unchanged.

Automated suite:

`tests/verify-fountain-v2.js`

---

## 6. Highlighter = Watercolor

### Watercolor V1

Implementation:

`shared/watercolor-brush-v1.js`

**CODE / CI VERIFIED ✅**  
**MANUAL FAIL ❌**

The real Wacom screenshot showed V1 as a dense saturated orange block that obscured underlying map text. Do not use V1 as the successful visual baseline.

### Watercolor V2 Light Wash

Implementation:

`shared/watercolor-brush-v2.js`

**CODE VERIFIED ✅**  
**CI VERIFIED ✅**  
**MANUAL PASS / ACCEPTED FOR THIS PHASE ✅**

User feedback after the V2 retest: the result was described as "挺好的！很水墨了！我觉得差不多了", and the remaining requested Highlighter issue became selectable color rather than brush feel.

V2 corrections include:

- low-opacity first pass,
- lighter default width/color,
- three translucent layers,
- no dense center core,
- one-pass readability budget,
- continuous quadratic wash instead of round-capped mini-segment buildup,
- gradual overlap accumulation,
- deterministic micro-variation/replay,
- O(1) active hydration/rendering.

Persisted V1 strokes continue to use the V1 renderer; V2 only governs new V2 Watercolor strokes.

Automated suite:

`tests/verify-watercolor-v2.js`

---

## 7. Independent Ink Color Selection

Implementation:

`shared/ink-color-palette.js`

**CODE VERIFIED ✅**  
**CI VERIFIED ✅**  
**MANUAL UI CONFIRMATION REQUIRED ⏳**

Behavior:

- Pen and Highlighter maintain separate selected colors.
- Each existing tool button receives a compact color dot; no new brush/tool button is added.
- Clicking the color dot opens a small preset palette plus native custom color picker.
- Pen presets are optimized for writing on the dark canvas.
- Highlighter presets use softer watercolor-friendly pigments.
- The last selected Pen and Highlighter colors are remembered independently in device/browser `localStorage`.
- New strokes read the selected color at stroke start and persist that actual color in stroke data.
- Existing strokes are never recolored by changing the current preference.
- Cross-device preference syncing is not required; cross-device stroke color fidelity is required and already supported by persisted stroke `color`.

Automated suite:

`tests/verify-ink-colors.js`

Coverage includes independent defaults, semantic tool mapping, independent mutation/persistence, custom hex normalization, palette availability, Canvas integration, module load order, and preservation of the locked two-button toolbar.

---

## 8. Ink Persistence Compatibility

Legacy points remain valid:

```js
{x, y, pressure}
```

Expressive-brush points may additionally contain timing, tilt/orientation, and persisted brush metadata including Fountain/Watercolor preset/version/seed data.

The server stores `tool`, width, opacity, color, and full points JSON. Historical strokes must not change because brush defaults or currently selected colors change.

---

## 9. Build / CI Discipline

Long-term workflow:

`.github/workflows/verify-generated-assets.yml`

Required suites:

```text
node tests/verify-all.js
node tests/verify-v2.js
node tests/verify-fountain-v2.js
node tests/verify-watercolor-v1.js
node tests/verify-watercolor-v2.js
node tests/verify-ink-colors.js
```

Generated assets are rebuilt from source:

```text
node scripts/bundle-assets.js
node scripts/build-public.js
```

`public/` is a clean generated directory. Legacy PeerJS/LAN runtime remains removed from current V2 production source.

Verification labels:

- **CODE VERIFIED** — source/test inspection.
- **CI VERIFIED** — independent GitHub runner executed required suites.
- **CLOUD VERIFIED** — live isolated cloud fixture/API evidence.
- **BROWSER PASS** — actual browser UX observed.
- **MANUAL FAIL/PASS** — real human/device judgment.

Automated success never overrides manual brush/UI evidence.

---

## 10. Multi-Computer / Multi-AI Handoff

Before work:

1. fetch/pull latest `main`,
2. confirm remote HEAD,
3. read `PRD.md`,
4. read this file,
5. read `.ai-bridge/current-plan.md`,
6. confirm another agent has not already completed the task.

Do not overwrite newer remote work from a stale clone.

---

## 11. Single Next Action

**Manual UI confirmation of independent Pen and Highlighter color selection.**

After pulling/reloading:

1. choose a Pen color and draw a new Pen stroke,
2. choose a different Highlighter color and draw a new Watercolor stroke,
3. verify each tool remembers its own color,
4. verify switching one tool's color does not change the other,
5. reload and confirm both device-local preferences remain,
6. confirm older strokes retain their original colors.

If these pass, the current two-brush ink experience is complete enough for this phase.
