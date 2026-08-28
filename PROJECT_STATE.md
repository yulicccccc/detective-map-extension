# Detective Map V2.0 — Current Project State

**Last reconciled:** 2026-08-28  
**Product:** Living Learning Map  
**Production:** `https://detectivemap.qchen9108.workers.dev`  
**Status:** 🟢 Core Living Map stable; Structure-First UI browser-verified; Pen/Fountain and Highlighter/Watercolor are CODE/CI VERIFIED and awaiting real Wacom feel acceptance.

> This file is the **current implementation / verification snapshot**. Product requirements live in `PRD.md`. Engineering rules live in `AGENTS.md`. The single next action lives in `.ai-bridge/current-plan.md`.

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

Optional browser pen/touch clients can connect to the same Workspace. Client storage is cache/offline support; Durable Object state is authoritative for cross-device continuity.

Current device direction:

- Windows Chrome + Wacom-class pen tablet is the immediate structural + handwriting workflow.
- Mac Chrome can use the same repo/cloud Workspace.
- iPad remains an optional secondary surface, not a required handwriting dependency.
- Obsidian/Excalidraw migration is paused while Wacom satisfies the low-latency desktop need.

---

## 2. Locked Product Rules

### Living Map / AI

- Incremental merge, not whole-map regeneration.
- Source ≠ Concept.
- AI proposes; human commits.
- Preserve Concept IDs, manual edits, positions, accepted edges, ink, and source provenance.
- Proposal subset application prevents dangling temp-ID edges.
- Durable stale proposal recovery/retry remains active.
- Mutation audit trail retains provenance guard and atomic map/proposal/audit commit behavior.

### Concept Boundary / Grounding

Current AI reasoning policy includes:

1. Explicit Source Subject Preservation.
2. Positive identity evidence + contrastive identity check.
3. Attachment vs independent Concept boundary.
4. Source-Grounded Edge policy: current Source is evidence authority for emitted relationships; map context is interpretation only.
5. Proposal summary consistency.

The Source-Grounded Edge protection is **prompt-enforced + regression verified**, not a deterministic semantic post-validator.

### Accepted Pairing Implementation Exception

The current product intentionally retains one permanent convenience auto-pair mechanism as an accepted usability/security tradeoff.

Agents must:

- not remove/redesign that accepted behavior unless the user explicitly reopens the decision,
- not copy its concrete credential value into docs, URLs, logs, screenshots, reports, or prompts,
- not introduce additional hardcoded secrets because this exception exists.

### Two-Button Ink Mapping — Locked

The primary toolbar intentionally has only two ink buttons:

```text
Pen         = Fountain Pen behavior
Highlighter = Watercolor Brush behavior
```

Rules:

- do not add separate Fountain/Watercolor buttons beside Pen/Highlighter,
- do not add a third Ink Wash / Chinese-ink brush to solve highlighting,
- historical generic `tool: pen` and `tool: highlighter` strokes remain replay-compatible,
- new Pen strokes persist Fountain semantics,
- new Highlighter strokes persist Watercolor semantics.

---

## 3. Structure-First Concept Map UI

**BROWSER PASS ✅**

Production baseline:

- Concept nodes collapsed by default.
- Default view prioritizes Concept identity + relationships.
- Description/body hidden by default.
- Complete labels; no ellipsis/line-clamp truncation.
- Long titles wrap naturally.
- Double-click Concept/title or use chevron for Quick Expand.
- Quick Expand is temporary view state; no revision or saved `(x, y)` mutation.
- Complete description + supporting Sources belong in Detail Drawer.
- Edge labels retain text halo.
- Failure/retry state is a compact corner toast.
- Existing ink survived the UI migration.

Structure-First implementation baseline: `87f27a4`.

Minor non-blocking polish still exists around fit-to-view/top-edge placement and narrow-toolbar overflow.

---

## 4. Ink Foundation V1

**CODE VERIFIED ✅**

- Pointer Events pen input.
- `getCoalescedEvents()` when available.
- Pressure capture with fallback.
- Tri-layer active rendering:
  - `inkCanvas` = committed strokes,
  - `activeStrokeCanvas` = finalized active segments,
  - `scratchCanvas` = replaceable live tail.
- Incremental active rendering avoids full historical-stroke replay per move.
- Incremental/replay parity tests exist.
- Pointer-up paints before awaiting persistence.
- Touch/palm separation remains preserved.

Tri-layer baseline: `e4f39f9`.

Manual findings before expressive brushes:

- Windows Wacom latency: **MANUAL PASS ✅** — felt essentially as responsive as mouse input.
- Generic Pen aesthetics/pressure expression: insufficient for the desired handwriting quality.
- iPad Safari Apple Pencil latency on current native Canvas route: **MANUAL FAIL / POOR ❌**.

---

## 5. Pen = Fountain Pen V2

Requirements source: `PRD.md §6.10`.

**CODE VERIFIED ✅**  
**CI VERIFIED ✅**  
**MANUAL WACOM FEEL: REQUIRED ⏳**

Implementation:

`shared/fountain-pen-v2.js`

Behavior:

- strong pressure modulation,
- Light Touch / Balanced / Expressive presets,
- velocity influence,
- start taper,
- tapered pen-lift tip,
- continuous variable-width interpolation,
- optional tilt/azimuth variation,
- graceful missing-time / missing-tilt fallback,
- captured pressure/time/tilt metadata,
- new active Pen strokes persist `tool: fountain_pen`,
- historical `tool: pen` strokes retain the legacy renderer,
- deterministic replay,
- incremental/replay parity,
- O(1) hydration + rendering path.

Automated Fountain suite: `tests/verify-fountain-v2.js`.

Automated success is **not** handwriting-quality acceptance. Real Wacom testing is authoritative for feel.

---

## 6. Highlighter = Watercolor Brush V1

Requirements source: `PRD.md §6.10.2`, §6.10.3, and §10.

**CODE VERIFIED ✅**  
**CI VERIFIED ✅**  
**MANUAL FREEFORM-LIKE FEEL: REQUIRED ⏳**

Implementation:

`shared/watercolor-brush-v1.js`

The existing visible **Highlighter** button is the product entry point. No separate Watercolor button is added.

Behavior:

- semi-transparent layered pigment,
- broad low-alpha outer wash + denser inner pigment for a soft/feathered edge,
- repeated passes and crossings naturally deepen through normal source-over compositing,
- modest pressure-sensitive width,
- slow motion deposits slightly more pigment than fast motion,
- deterministic micro-variation to avoid a perfectly uniform digital-marker edge,
- persisted Watercolor preset/version/seed inside existing points JSON,
- new active Highlighter strokes persist `tool: watercolor`,
- historical `tool: highlighter` strokes retain the legacy flat-marker renderer,
- deterministic replay,
- incremental finalized layer + replaceable live tail parity,
- O(1) hydration and bounded per-point rendering,
- no full-canvas blur, diffusion, or whole-stroke re-render on pointer move.

Automated Watercolor suite: `tests/verify-watercolor-v1.js`.

The target benchmark is **the same class of soft, translucent, layered Watercolor experience as iPad Freeform**, not a pixel-for-pixel proprietary brush clone. Human side-by-side judgment is required.

---

## 7. Ink Persistence Compatibility

Legacy points remain valid:

```js
{x, y, pressure}
```

Expressive-brush points may additionally contain timing, tilt/orientation, and deterministic brush metadata such as:

```js
{
  x,
  y,
  pressure,
  t,
  tiltX,
  tiltY,
  altitudeAngle,
  azimuthAngle,
  fountainPreset,
  brushVersion,
  watercolorPreset,
  watercolorVersion,
  watercolorSeed
}
```

Server persistence already stores `tool`, `width`, `opacity`, `color`, and the entire points JSON, so `tool: fountain_pen` / `tool: watercolor` and point dynamics survive cloud reload without a table migration.

Historical strokes must not change merely because future defaults change.

---

## 8. Build / Generated Asset Discipline

Current source/generated consistency safeguards:

- `.github/workflows/verify-generated-assets.yml` runs build + tests on pushes to `main`.
- Current required suites include core V1/V2, Fountain, and Watercolor verification.
- `scripts/bundle-assets.js` includes both expressive brush runtimes.
- `scripts/build-public.js` removes/recreates `public/` from source on every build, preventing stale generated files from surviving across machines.
- Legacy PeerJS runtime/download/public artifacts remain removed.
- The one-time PRD mapping script was removed after reconciliation; long-term CI is back to normal build/test/generated-asset verification.

Build commands:

```text
node scripts/bundle-assets.js
node scripts/build-public.js
```

Current V2 production deployment entrypoint:

```text
DetectiveMap_V2.0.0_detectivemap.qchen9108.workers.dev_一键更新网站.bat
```

Do not call either expressive brush MANUAL PASS merely because CI is green.

---

## 9. Cross-Device Documentation Alignment

`PRD.md §11/§12` reflects the actual supported model:

- Windows/Mac clients share the authoritative cloud Workspace.
- Connected clients receive structural updates without treating iPad as a mandatory dependency.
- iPad remains an optional supported browser/pen client and acceptance path.

---

## 10. Verification Language

Use only evidence-backed labels:

- **CODE VERIFIED** — implementation/test inspection.
- **CI VERIFIED** — independent GitHub runner executed and passed the specified suites.
- **CLOUD VERIFIED** — live cloud fixture/API execution.
- **BROWSER PASS** — real browser UX observed.
- **MANUAL REQUIRED** — physical/subjective device test pending.

Automated tests never justify a claim that handwriting/highlighting “feels like Freeform.”

Cloud fixtures must continue using isolated `__TEST__` workspaces and must never mutate `ws_default`.

---

## 11. Multi-Computer / Multi-AI Handoff

Before any agent starts work:

1. Pull/fetch latest `main` and record remote HEAD.
2. Read `PRD.md`.
3. Read this `PROJECT_STATE.md`.
4. Read `.ai-bridge/current-plan.md`.
5. Confirm another machine/agent has not already completed the requested change.

Generated artifacts must come from the current source tree, not from a stale local clone.

---

## 12. Single Next Action

**Manual Wacom acceptance of the locked Pen + Highlighter brush pair.**

- Pen should be judged as Fountain handwriting.
- Highlighter should be judged against iPad Freeform Watercolor behavior.

Do not start a third brush, Obsidian/Excalidraw migration, or unrelated architecture work before this manual acceptance/tuning pass.
