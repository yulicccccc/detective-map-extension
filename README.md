# Detective Map 🔍✍️

> **Read → Add → AI Merge → Edit → Ink → Sync → Keep Learning.**

Detective Map is a **persistent Living Learning Map**: a cross-device, AI-assisted concept-map workspace that grows as the learner adds new material over time.

The map is not a one-shot mind-map export. New sources are compared against the current Workspace, AI proposes incremental changes, and the learner decides what becomes part of the durable map.

## Start Here — Source of Truth Order

When working from a new computer or with a new AI agent, read these files in this order:

1. [`PRD.md`](PRD.md) — product requirements and locked product rules.
2. [`PROJECT_STATE.md`](PROJECT_STATE.md) — current implementation/verification snapshot.
3. [`AGENTS.md`](AGENTS.md) — engineering and multi-agent collaboration rules.
4. [`.ai-bridge/current-plan.md`](.ai-bridge/current-plan.md) — the single current next action.

If another document, old report, local clone, or AI memory conflicts with these files, **do not guess**. Pull latest `main` and follow the hierarchy above.

## Current Product Model

- **Source ≠ Concept**: captured material is evidence; Concepts are abstracted understanding.
- **Incremental Merge, Not Regeneration**: new learning adds/enriches/connects without replacing the whole map.
- **AI Proposes; Human Commits**: proposals are reviewed/applied by the learner; AI does not silently rewrite the map.
- **Structure-First Concept Map**: Concept nodes are collapsed by default; the default view emphasizes Concept identity + relationships. Descriptions are progressively disclosed by Quick Expand or the Detail Drawer.
- **Source-Grounded Relationships**: map context may help interpret a source, but emitted relationships must be supported by the current Source.
- **Persistent Spatial Ownership**: manual positions, edits, edges, ink, and source provenance are preserved.

## Current Surfaces

### Chrome Side Panel / Full Canvas

The Chrome extension supports right-click capture, Workspace selection, AI proposal review/subset apply, Concept/Edge editing, structure-first Concept nodes, Detail Drawer, infinite canvas pan/zoom, and stylus annotation.

### Locked Two-Button Ink Model

```text
Pen         = Fountain Pen behavior
Highlighter = Watercolor Brush behavior
```

There is no separate Fountain button, no separate Watercolor button, and no third Ink Wash brush in the primary toolbar.

Historical generic `tool: pen` / `tool: highlighter` strokes remain replay-compatible.

### Pen Input

The browser ink engine accepts Pointer Events from Wacom-class desktop pen tablets, Apple Pencil where supported, and mouse as a basic fallback.

**Manual baseline:** desktop Wacom input is low-latency enough for normal annotation. iPad Safari is optional rather than a required handwriting dependency.

### Pen → Fountain Pen V2

✒ **CODE/CI VERIFIED; real Wacom feel remains user-authoritative.**

New active Pen strokes persist `tool: fountain_pen`; historical `tool: pen` strokes retain the legacy renderer.

Implemented behavior includes strong pressure modulation, Light Touch/Balanced/Expressive presets, velocity influence, start/end taper, optional tilt/orientation variation, deterministic replay, and O(1) hydration + incremental rendering.

### Highlighter → Watercolor

#### Watercolor V1

🖌 **CODE/CI VERIFIED but MANUAL FAIL ❌.**

The real Wacom screenshot showed a dense saturated orange block that obscured underlying map text. Automated tests did not make that visual result acceptable.

#### Watercolor V2 Light Wash — current candidate

🖌 **CODE/CI VERIFIED; MANUAL RETEST REQUIRED.**

New active Highlighter strokes use the V2 light-wash renderer while persisted V1 watercolor strokes continue using V1 so historical appearance does not silently change.

V2 corrections include:

- opacity reduced from the legacy `0.35` path to `0.18`,
- width reduced from `20` to `17`,
- lighter warm-yellow default,
- three translucent layers instead of five,
- no dense center pigment core,
- one quadratic path per translucent layer instead of many round-capped mini-segments,
- strict one-pass readability/translucency regression budget,
- gradual repeat/crossing accumulation,
- deterministic replay,
- O(1) active path.

The human benchmark remains the same class of soft, translucent, layered Watercolor experience as iPad Freeform.

## Cloud Architecture

```text
Chrome clients / supported pen surfaces
               │
          HTTPS / WSS
               ▼
        Cloudflare Worker
               │
               ▼
     Durable Object + SQLite
       authoritative Workspace
               │
               ▼
       Cloudflare Workers AI
```

The Durable Object is the authoritative shared Workspace state. Client-local storage is cache/offline support, not the cross-device source of truth.

Production deployment:

`https://detectivemap.qchen9108.workers.dev`

## Development / Verification

Generated assets are rebuilt from source by GitHub Actions. `public/` is a clean generated directory and `src/assets-bundle.js` is rebuilt from the same source tree.

Local build commands:

```text
node scripts/bundle-assets.js
node scripts/build-public.js
```

Current deterministic suites:

```text
node tests/verify-all.js
node tests/verify-v2.js
node tests/verify-fountain-v2.js
node tests/verify-watercolor-v1.js
node tests/verify-watercolor-v2.js
node tests/verify-cloud.js   # live isolated cloud fixtures when intentionally run
```

Verification language:

- **CODE VERIFIED** — implementation/test inspection.
- **CI VERIFIED** — independent GitHub runner executed the specified suites.
- **CLOUD VERIFIED** — live isolated cloud evidence.
- **BROWSER PASS** — real browser UX observed.
- **MANUAL PASS/FAIL/REQUIRED** — physical/subjective device judgment.

Automated tests never override human brush-feel evidence.

## Multi-Computer / Multi-AI Safety

Before editing, fetch/pull latest `main`, check remote HEAD, read the source-of-truth files, verify another agent has not already implemented the task, and never overwrite newer remote work from a stale clone.

## Legacy Files

V1/V1.1 Pages/LAN/spacedesk-era scripts and the former local `server.js` live under `legacy/` and are historical only. PeerJS-era runtime/build assets are not part of current V2 production source.

## License

MIT License.
