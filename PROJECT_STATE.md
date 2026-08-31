# Detective Map V2.0 — Current Project State

**Last reconciled:** 2026-08-31  
**Product:** Living Learning Map  
**Production:** `https://detectivemap.qchen9108.workers.dev`  
**Status:** 🟢 Core Living Map stable; Structure-First UI browser-verified; expressive Pen/Highlighter engines implemented; Watercolor V2 Light Wash awaiting manual Wacom retest.

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
- new Highlighter strokes persist Watercolor semantics.

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
**MANUAL WACOM FEEL REQUIRED ⏳**

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

User's real Windows Wacom screenshot showed the V1 Highlighter as a dense saturated orange block that obscured underlying map text. This fails the core Watercolor/highlighting requirement even though deterministic tests passed.

Root causes identified:

- legacy Highlighter defaults were still `width: 20`, `opacity: 0.35`, saturated orange,
- V1 stacked five pigment layers,
- quadratic curves were subdivided into multiple round-capped mini-segments, creating repeated local alpha buildup.

Do not describe Watercolor V1 as a successful visual baseline.

### Watercolor V2 Light Wash — Current Candidate

Implementation:

`shared/watercolor-brush-v2.js`

**CODE VERIFIED ✅**  
**CI VERIFIED ✅**  
**MANUAL RETEST REQUIRED ⏳**

V2 corrections:

- new Highlighter default opacity: `0.18`,
- new default width: `17`,
- lighter warm-yellow default instead of saturated orange,
- three translucent layers instead of five,
- lighter center profile; no dense core,
- strict one-pass opacity/readability regression budget,
- one quadratic path per translucent layer instead of many round-capped mini-segments,
- repeat/crossing accumulation remains source-over and gradual,
- deterministic micro-variation/replay remains preserved,
- O(1) active hydration/rendering remains preserved.

### Backward Compatibility

Persisted V1 watercolor strokes continue to route through the V1 renderer. V2 applies only to newly created Highlighter strokes, so historical saved appearance does not silently change.

Automated suite:

`tests/verify-watercolor-v2.js`

Coverage includes:

- persisted V1 replay unchanged,
- new Highlighter → V2 semantics/defaults,
- low single-pass opacity budget,
- gradual repeated-pass accumulation,
- feathered profile without dense center,
- removal of mini-segment pigment buildup,
- deterministic texture/replay,
- incremental/replay parity,
- O(1) 500-point path,
- toolbar remains Pen + Highlighter only.

The visual benchmark remains the same class of soft, translucent, layered Watercolor experience as iPad Freeform; human side-by-side judgment is authoritative.

---

## 7. Ink Persistence Compatibility

Legacy points remain valid:

```js
{x, y, pressure}
```

Expressive-brush points may additionally contain timing, tilt/orientation, and persisted brush metadata including Fountain/Watercolor preset/version/seed data.

The existing server stores `tool`, width, opacity, color, and full points JSON, so the expressive brushes do not require a Durable Object table migration.

Historical strokes must not change merely because future brush defaults change.

---

## 8. Build / CI Discipline

Long-term workflow:

`.github/workflows/verify-generated-assets.yml`

Required suites:

```text
node tests/verify-all.js
node tests/verify-v2.js
node tests/verify-fountain-v2.js
node tests/verify-watercolor-v1.js
node tests/verify-watercolor-v2.js
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

Automated success never overrides a manual brush-feel failure.

---

## 9. Multi-Computer / Multi-AI Handoff

Before work:

1. fetch/pull latest `main`,
2. confirm remote HEAD,
3. read `PRD.md`,
4. read this file,
5. read `.ai-bridge/current-plan.md`,
6. confirm another agent has not already completed the task.

Do not overwrite newer remote work from a stale clone.

---

## 10. Single Next Action

**Manual Wacom retest of a fresh Highlighter stroke using Watercolor V2 Light Wash.**

Old V1 strokes intentionally remain unchanged, so the user must draw a new stroke after pulling/reloading.

If V2 is still too dense/marker-like, tune the existing Highlighter only. Do not create another brush.
