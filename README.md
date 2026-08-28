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

The Chrome extension supports:

- right-click capture: **Add to Detective Map**,
- Workspace selection,
- AI proposal review and subset apply,
- Concept/Edge editing,
- collapsed structure-first nodes,
- Detail Drawer for complete Concept knowledge/evidence,
- infinite canvas pan/zoom,
- stylus handwriting and annotation.

### Locked Two-Button Ink Model

The primary toolbar intentionally keeps only the existing two ink controls:

```text
Pen         = Fountain Pen behavior
Highlighter = Watercolor Brush behavior
```

There is no separate Fountain button, no separate Watercolor button, and no third Ink Wash brush in the primary toolbar.

Historical generic `tool: pen` / `tool: highlighter` strokes remain replay-compatible, but new strokes use the expressive brush semantics.

### Pen Input

The browser ink engine accepts Pointer Events from devices such as:

- Wacom-class desktop pen tablets,
- Apple Pencil where the browser/device exposes pen input,
- mouse as a basic fallback.

**Manual baseline:** desktop Wacom input is low-latency enough for normal annotation. iPad Safari handwriting is optional rather than a required dependency.

### Pen → Fountain Pen V2

✒ **Fountain Pen V2 is implemented and CODE/CI VERIFIED; real Wacom feel remains user-authoritative.**

New active Pen strokes use persistent `tool: fountain_pen` semantics while historical `tool: pen` strokes retain the legacy renderer.

Implemented Fountain behavior includes:

- strong pressure modulation,
- `Light Touch / Balanced / Expressive` pressure presets (`Expressive` default),
- modest velocity influence,
- start and pen-lift taper,
- smooth variable-width interpolation,
- optional tilt/orientation variation when the device exposes it,
- graceful missing-time/missing-tilt fallback,
- deterministic replay,
- O(1) hydration + incremental active rendering.

### Highlighter → Watercolor Brush V1

🖌 **Watercolor Brush V1 is implemented behind the existing Highlighter button and is CODE/CI VERIFIED; visual similarity to iPad Freeform Watercolor requires manual comparison.**

New active Highlighter strokes use persistent `tool: watercolor` semantics while historical `tool: highlighter` strokes retain the legacy flat-marker renderer.

Implemented Watercolor behavior includes:

- translucent layered pigment,
- soft/feathered multi-layer edge,
- natural darkening when strokes overlap,
- modest pressure-sensitive width,
- slightly richer pigment during slower movement,
- deterministic micro-variation for a less uniform digital edge,
- deterministic replay,
- O(1) hydration and bounded incremental rendering,
- no blur/diffusion/full-canvas processing on pointer move.

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

The Durable Object is the authoritative shared Workspace state for Concepts, Edges, Sources, proposals, revisions, and durable ink. Client-local storage is a cache/offline-support layer, not the cross-device source of truth.

Production deployment:

`https://detectivemap.qchen9108.workers.dev`

## Development / Verification

Generated assets are rebuilt from source by GitHub Actions on pushes to `main`. `public/` is treated as a clean generated directory, and `src/assets-bundle.js` is rebuilt from the same source tree.

Local build commands remain:

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
node tests/verify-cloud.js   # live isolated cloud fixtures when intentionally run
```

Tests must not mutate the real production Workspace. Cloud fixtures use isolated `__TEST__` workspaces and clean them up.

Verification language:

- **CODE VERIFIED** — implementation/test inspection.
- **CI VERIFIED** — independent GitHub runner actually executed the specified suites.
- **CLOUD VERIFIED** — live cloud fixture/API execution.
- **BROWSER PASS** — real browser UX manually observed.
- **MANUAL REQUIRED** — physical/subjective device test pending.

Automated tests do not prove either brush feels like iPad Freeform.

## Multi-Computer / Multi-AI Safety

Before editing:

- pull/fetch latest `main`,
- check remote HEAD,
- read the source-of-truth files above,
- verify another agent did not already implement the task,
- never overwrite newer remote work from a stale clone.

After meaningful product/architecture changes:

- update `PRD.md` if requirements changed,
- update `PROJECT_STATE.md` if implementation/verification status changed,
- update `.ai-bridge/current-plan.md` so the next agent has one next action.

## Legacy Files

V1/V1.1 Pages/LAN/spacedesk-era scripts and the former local `server.js` live under `legacy/` and are historical only. PeerJS-era runtime/build assets are no longer part of the current V2 production source tree.

## License

MIT License.
