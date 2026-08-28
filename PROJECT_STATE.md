# Detective Map V2.0 — Current Project State

**Last reconciled:** 2026-08-28  
**Product:** Living Learning Map  
**Production:** `https://detectivemap.qchen9108.workers.dev`  
**Status:** 🟢 Core Living Map workflow stable; Structure-First UI browser-verified; expressive Brush Engine V2 is the next product priority.

> This file is the **current implementation / verification snapshot**. Product requirements live in `PRD.md`. Engineering rules live in `AGENTS.md`. The single next task lives in `.ai-bridge/current-plan.md`.

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

Optional browser pen/touch clients can connect to the same Workspace state. Client local storage is cache/offline support; Durable Object state is authoritative for cross-device continuity.

Current real-world device workflow:

- **Work:** Windows Chrome + Wacom-class pen tablet.
- **Home:** Mac Chrome can use the same extension/repo and cloud Workspace.
- **iPad:** optional secondary surface; not required for handwriting now that desktop Wacom input is usable.
- **Obsidian / Excalidraw pivot:** paused. Excalidraw handwriting was smooth, but the additional cross-client architecture is not currently justified while Wacom solves the immediate low-latency handwriting need.

---

## 2. Product Rules Already Locked

### Living Map / AI

- Incremental merge, not whole-map regeneration.
- Source ≠ Concept.
- AI proposes; human commits.
- Preserve IDs, manual edits, positions, accepted edges, ink, and source provenance.
- Proposal subset application prevents dangling temp-ID edges.
- Durable stale proposal recovery and retry behavior.
- Mutation audit trail with provenance guard and atomic map/proposal/audit transaction behavior.

### Concept Boundary / Grounding

Current reasoning policy includes:

1. Explicit Source Subject Preservation.
2. Positive identity evidence + contrastive identity check.
3. Attachment vs independent Concept boundary.
4. Source-Grounded Edge policy: current Source is the evidence authority for emitted relationships; map context is interpretation only.
5. Proposal summary consistency.

Important implementation note: the Source-Grounded Edge protection is **prompt-enforced + cloud/browser regression verified**, not a deterministic semantic post-validator. Do not describe it as an impossible-to-bypass code-level evidence validator.

Browser generalization evidence includes the unseen `Method of Loci` source producing a standalone Concept with no invented relationship to existing learning-method nodes.

### Accepted Pairing Implementation Exception

The current product intentionally retains one **permanent convenience auto-pair mechanism** as an accepted usability/security tradeoff. This is an explicit implementation exception to the idealized PRD rule against hardcoded pairing credentials.

Rules for agents:

- do not remove/redesign this accepted convenience behavior unless the user explicitly reopens the decision,
- do not copy the concrete credential value into documentation, URLs, logs, screenshots, reports, prompts, or new code paths,
- do not introduce any additional hardcoded secrets because this one exception exists.

---

## 3. Structure-First Concept Map UI — Current Baseline

**Status: BROWSER PASS ✅**

The production Canvas now behaves as a Concept Map rather than a wall of note cards:

- Concept nodes are collapsed by default.
- Default view emphasizes **Concept identity + relationships**.
- Description/body is hidden by default.
- Concept labels are fully visible; no ellipsis/line-clamp truncation.
- Long titles wrap naturally.
- Double-click Concept/title or use the explicit chevron to Quick Expand.
- Quick Expand is temporary in-memory view state and does not mutate revision or saved `(x, y)` layout.
- Complete Concept description + supporting Sources live in the Detail Drawer.
- Relationship labels retain the edge text halo for readability.
- Operational failure/retry state is a compact corner toast rather than a wide permanent banner.
- Existing ink survived the UI migration.

Current UI code baseline for this work: `87f27a4`.

Minor non-blocking polish items observed:

- Fit/viewport can still leave a node near the top edge in some layouts.
- Top toolbar can overflow horizontally at narrower widths.

Neither blocks current product work.

---

## 4. Ink Engine — What Is Actually True

### Foundation V1

**CODE VERIFIED ✅**

- Pointer Events pen input.
- `getCoalescedEvents()` capture when available.
- Pressure data capture with safe fallback.
- Tri-layer active rendering:
  - `inkCanvas` = committed strokes,
  - `activeStrokeCanvas` = finalized segments of active stroke,
  - `scratchCanvas` = replaceable live tail.
- Incremental active rendering does not replay the entire historical stroke every pointer move.
- Incremental/replay geometry parity tests exist.
- Pointer-up paints the completed stroke before awaiting persistence, avoiding a blank frame.
- Touch/palm separation is preserved on touch devices.

Tri-layer ink baseline commit: `e4f39f9`.

### Manual Findings

- **Windows Wacom latency:** MANUAL PASS ✅ — handwriting felt essentially as responsive as mouse input.
- **Current expressive pressure feel:** NOT ACCEPTED 🟡 — present generic pressure behavior does not look like the desired fountain-pen writing tool.
- **iPad Safari Apple Pencil latency:** MANUAL FAIL / POOR ❌ — severe latency was observed on the current native Canvas implementation.

The iPad result is why platform alternatives were investigated, but Wacom makes an immediate platform migration unnecessary.

---

## 5. Brush Engine V2 — Locked Next Product Direction

Requirements are defined in `PRD.md §6.10`.

### P1 — Fountain Pen

Target:

- strong visible pressure modulation,
- smooth calibrated pressure curve,
- modest velocity influence,
- start/end taper and pen-lift character,
- optional tilt/nib orientation when device/browser data is reliable,
- device calibration/preset for Wacom vs Apple Pencil,
- deterministic replay/backward compatibility,
- **no perceptible latency regression from the current Wacom baseline**.

Manual acceptance must use real pen input; automated math tests are not sufficient.

### P2 — Watercolor Brush

After Fountain Pen manual acceptance:

- translucent soft-edge wash,
- repeated passes deepen color,
- same/different-color overlaps become richer/darker,
- subtle wet/organic appearance,
- deterministic replay,
- no full-canvas expensive processing during pointer move.

**Do not implement Watercolor in parallel with Fountain Pen unless explicitly requested.**

---

## 6. Current Data / Persistence Direction

Legacy Ink points remain valid:

```js
{x, y, pressure}
```

Brush Engine V2 may add backward-compatible fields:

```js
{
  brushType,
  brushVersion,
  brushParams,
  seed,
  points: [{x, y, pressure, t, tiltX, tiltY, altitudeAngle, azimuthAngle}]
}
```

Historical strokes must not visually change merely because future default brush parameters change.

---

## 7. Verification Snapshot

Use evidence labels rather than self-scored claims:

- **CODE VERIFIED** — implementation/test inspection.
- **CLOUD VERIFIED** — live cloud fixture/API execution.
- **BROWSER PASS** — real browser UX observed.
- **MANUAL REQUIRED** — physical/subjective device test pending.

Last explicit final-working-tree UI test report:

- `tests/verify-all.js`: 9/9 passed.
- `tests/verify-v2.js`: 22/22 passed with zero network calls.

The cloud regression suite evolves as new AI/backend fixtures are added. **Run the current `tests/verify-cloud.js`; do not copy an old fixed test count from this or another report.**

Automated tests must never mutate `ws_default`; live fixtures use isolated `__TEST__` workspaces and clean up after themselves.

---

## 8. Build / Deploy

Build generated assets before deploy:

```text
node scripts/bundle-assets.js
node scripts/build-public.js
```

Current V2 deploy workflow:

```text
DetectiveMap_V2.0.0_detectivemap.qchen9108.workers.dev_一键更新网站.bat
```

Legacy `V1`, `V1.1`, `pages.dev`, `spacedesk`, old local-LAN `server.js`, and old `Pre-iPad` files/scripts are historical artifacts under `legacy/` and must not be treated as current instructions.

### Coordinated Cleanup Still Pending

Two non-blocking leftovers should be cleaned during the **next real frontend build**, not by half-editing generated files now:

1. `canvas.html` still contains a few Apple-Pencil/iPad-specific labels (`Apple Pencil / Pen`, `Pair Another Device (iPad)`, `Apple Pencil Optimized`). Replace with device-neutral Pen/Stylus/Second Device wording, then rebuild `public/*` and `src/assets-bundle.js`.
2. PeerJS-era assets are no longer referenced by current Canvas/Side Panel/storage code, but `scripts/bundle-assets.js` still bundles `shared/peerjs.min.js`. Remove the PeerJS source/download/build entries only as one coordinated source + generated-assets cleanup.

These leftovers do **not** define current architecture and should not be used as guidance by another AI.

---

## 9. Multi-Computer / Multi-AI Handoff Rule

Before any agent starts work:

1. Pull/fetch latest `main` and record remote HEAD.
2. Read `PRD.md`.
3. Read this `PROJECT_STATE.md`.
4. Read `.ai-bridge/current-plan.md`.
5. Confirm the requested work has not already been implemented by another machine/agent.

After requirement/architecture changes, update the appropriate source-of-truth docs in the same change. Never let a local clone or old AI report become the de facto project memory.

---

## 10. Single Next Engineering Priority

**Fountain Pen V2 only.**

Do not start Watercolor, Obsidian/Excalidraw migration, or unrelated architecture work until Fountain Pen has been implemented and manually tested with the desktop Wacom baseline.
