# Detective Map V2.0 — Current Project State

**Last reconciled:** 2026-08-28  
**Product:** Living Learning Map  
**Production:** `https://detectivemap.qchen9108.workers.dev`  
**Status:** 🟢 Core Living Map stable; Structure-First UI browser-verified; Fountain Pen V2 is CODE/CI VERIFIED and awaiting real Wacom feel acceptance.

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

Manual findings before Fountain Pen V2:

- Windows Wacom latency: **MANUAL PASS ✅** — felt essentially as responsive as mouse input.
- Generic Pen aesthetics/pressure expression: insufficient for the desired handwriting quality.
- iPad Safari Apple Pencil latency on current native Canvas route: **MANUAL FAIL / POOR ❌**.

---

## 5. Fountain Pen V2 — Current Implementation

Requirements source: `PRD.md §6.10`.

**CODE VERIFIED ✅**  
**CI VERIFIED ✅**  
**MANUAL WACOM FEEL: REQUIRED ⏳**

Implementation lives in:

`shared/fountain-pen-v2.js`

### Behavior Implemented

- Strong pressure modulation with a true calibrated curve around normal pressure.
- Three pressure presets:
  - `Light Touch`
  - `Balanced`
  - `Expressive` — current default.
- Velocity influence: faster movement becomes modestly finer; slow movement remains fuller.
- Sharp start taper.
- Tapered live/final pen-lift tip.
- Continuous variable-width interpolation using bounded constant-step segments.
- Optional tilt/azimuth-aware directional width variation when Pointer Events expose usable orientation data.
- Graceful missing-time / missing-tilt fallback.
- Captures pressure/time/tilt-orientation metadata through PointerEvent capture.
- New active `Pen` strokes upgrade to persistent `tool: fountain_pen` semantics.
- Fountain preset/version identity is stored inside the existing points JSON so reload can reproduce the same brush behavior without a Durable Object schema migration.
- Historical persisted `tool: pen` strokes continue through the old renderer and do not silently change appearance.
- Existing Highlighter remains unchanged until Watercolor work begins.

### Rendering Invariants

- Full Fountain replay is deterministic for the same persisted points.
- Incremental finalized layer + replaceable live tail matches full replay geometry/width at the completed state.
- Active rendering remains O(1) per appended point; no full-stroke replay regression.
- Fountain rendering remains layered on top of the stable tri-layer Canvas architecture.

### Automated Verification

GitHub Actions workflow:

`Verify and Rebuild Generated Assets`

Independent runner evidence after Fountain implementation:

- `tests/verify-all.js`: **9/9 passed**
- `tests/verify-v2.js`: **22/22 passed**, zero network calls
- `tests/verify-fountain-v2.js`: **11/11 passed**

Fountain-specific coverage includes:

- byte-for-byte legacy Pen renderer compatibility,
- light/normal/firm pressure separation,
- velocity effect,
- start taper,
- tilt-aware variation,
- new-stroke Fountain upgrade,
- pressure/time/tilt capture + fallback,
- end taper,
- deterministic replay,
- incremental/replay parity,
- O(1) behavior through a 500-point stroke.

Automated success is **not** handwriting-quality acceptance. Real Wacom testing is authoritative for feel.

---

## 6. Watercolor Brush — P2, Not Started

Only after Fountain Pen manual acceptance/tuning:

- translucent soft-edge wash,
- repeated passes deepen color,
- same/different-color overlaps become richer/darker,
- subtle wet/organic appearance,
- deterministic replay,
- no full-canvas expensive processing during pointer move.

Do not implement Watercolor in parallel with unresolved Fountain feel tuning.

---

## 7. Ink Persistence Compatibility

Legacy points remain valid:

```js
{x, y, pressure}
```

New Fountain points may additionally contain:

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
  brushVersion
}
```

Server persistence already stores `tool`, `width`, `opacity`, `color`, and the entire points JSON, so `tool: fountain_pen` and point dynamics survive cloud reload without a table migration.

Historical strokes must not change merely because future defaults change.

---

## 8. Build / Generated Asset Discipline

Current source/generated consistency safeguards:

- `.github/workflows/verify-generated-assets.yml` runs build + tests on pushes to `main`.
- `scripts/bundle-assets.js` includes Fountain Pen V2 and no longer bundles legacy PeerJS.
- `scripts/build-public.js` now removes/recreates `public/` from source on every build, preventing stale generated files from surviving across machines.
- Legacy PeerJS runtime/download/public artifacts were removed.
- Device-specific Canvas wording was generalized to Fountain Pen / Pen-Stylus / Second Device language.

Build commands remain:

```text
node scripts/bundle-assets.js
node scripts/build-public.js
```

Current V2 production deployment entrypoint remains:

```text
DetectiveMap_V2.0.0_detectivemap.qchen9108.workers.dev_一键更新网站.bat
```

Do not deploy Fountain Pen as “accepted” merely because CI is green; manual Wacom feel should be checked first.

---

## 9. Verification Language

Use only evidence-backed labels:

- **CODE VERIFIED** — implementation/test inspection.
- **CI VERIFIED** — independent GitHub runner executed and passed the specified suites.
- **CLOUD VERIFIED** — live cloud fixture/API execution.
- **BROWSER PASS** — real browser UX observed.
- **MANUAL REQUIRED** — physical/subjective device test pending.

Automated tests never justify a claim that handwriting “feels good.”

Cloud fixtures must continue using isolated `__TEST__` workspaces and must never mutate `ws_default`.

---

## 10. Multi-Computer / Multi-AI Handoff

Before any agent starts work:

1. Pull/fetch latest `main` and record remote HEAD.
2. Read `PRD.md`.
3. Read this `PROJECT_STATE.md`.
4. Read `.ai-bridge/current-plan.md`.
5. Confirm another machine/agent has not already completed the requested change.

Generated artifacts must come from the current source tree, not from a stale local clone.

---

## 11. Single Next Action

**Manual Wacom acceptance of Fountain Pen V2.**

Do not start Watercolor, Obsidian/Excalidraw migration, or unrelated architecture work until Fountain Pen has been tested with the real Wacom and tuned if necessary.

Two small wording-only PRD reconciliation items remain queued in `.ai-bridge/current-plan.md`; they do not block the manual brush test.
