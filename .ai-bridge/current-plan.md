# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-28  
**Single next priority:** **Manual Wacom acceptance of the two locked ink tools: Pen + Highlighter**

## Read Before Work

1. `PRD.md` — locked product requirements.
2. `PROJECT_STATE.md` — current implementation/verification snapshot and accepted implementation exceptions.
3. `AGENTS.md` — multi-agent engineering rules.
4. Pull/fetch latest `main` and confirm remote HEAD before editing.

## Locked Toolbar Mapping

The primary toolbar has exactly two ink buttons:

```text
Pen         = Fountain Pen behavior
Highlighter = Watercolor Brush behavior
```

Do not add separate Fountain/Watercolor buttons. Do not add a third Ink Wash brush. Legacy generic Pen/Highlighter rendering exists only for historical-stroke compatibility.

## Current Baseline

- Living Learning Map incremental AI workflow: stable.
- Structure-First Concept Map UI: **BROWSER PASS ✅**.
- Default Concept nodes: collapsed; descriptions hidden; complete labels; Quick Expand + Detail Drawer.
- Tri-layer low-latency ink foundation: implemented.
- Windows Wacom latency on the prior generic pen: **MANUAL PASS ✅**.
- iPad Safari native Canvas Pencil latency remains poor; iPad/Obsidian/Excalidraw migration is paused.
- Fountain Pen V2: **CODE / CI VERIFIED ✅**, real handwriting feel remains user-authoritative.
- Watercolor Brush V1 behind the existing Highlighter button: **CODE / CI VERIFIED ✅**, visual feel requires manual comparison with iPad Freeform Watercolor.
- `public/` is rebuilt from source; generated asset consistency is CI-enforced.

## Fountain Pen V2

Implementation: `shared/fountain-pen-v2.js`.

New active Pen strokes persist `tool: fountain_pen`; historical `tool: pen` strokes retain the legacy renderer.

Implemented:

- strong pressure modulation,
- Light Touch / Balanced / Expressive presets,
- velocity influence,
- start/end taper,
- optional tilt/orientation variation,
- deterministic replay,
- incremental/replay parity,
- O(1) hydration + rendering path.

## Watercolor Brush V1

Implementation: `shared/watercolor-brush-v1.js`.

The visible **Highlighter** button now upgrades newly drawn strokes to persistent `tool: watercolor` semantics while historical `tool: highlighter` strokes retain the legacy flat-marker renderer.

Implemented:

- semi-transparent layered pigment,
- broad low-alpha outer wash + denser inner pigment for a soft/feathered edge,
- repeated passes and crossings naturally deepen through source-over compositing,
- modest pressure-sensitive width,
- slow movement deposits slightly more pigment than fast movement,
- deterministic micro-variation for a less perfectly uniform digital edge,
- persisted Watercolor preset/version/seed inside points JSON,
- deterministic replay,
- incremental finalized layer + replaceable live tail parity,
- O(1) hydration and bounded per-point rendering,
- no blur, diffusion, or full-canvas re-render on pointer move.

### Automated Evidence

GitHub Actions workflow: `Verify and Rebuild Generated Assets`.

Current required suites:

- `tests/verify-all.js`
- `tests/verify-v2.js`
- `tests/verify-fountain-v2.js`
- `tests/verify-watercolor-v1.js`

Watercolor-specific deterministic tests cover:

- legacy Highlighter replay unchanged,
- feathered multi-layer profile,
- repeated-pass darkening,
- pressure width modulation,
- slow/fast pigment difference,
- deterministic organic variation,
- new Highlighter → Watercolor upgrade,
- incremental dynamics hydration,
- deterministic replay,
- incremental/replay parity,
- O(1) 500-point active path,
- exact two-button toolbar mapping.

## Single Next Action — Manual Wacom Brush Acceptance

On the Windows Wacom machine, pull latest `main`, reload the unpacked extension, then test both existing buttons.

### Pen

Use the **Pen** button and confirm ordinary handwriting still feels attractive and low-latency.

### Highlighter

Use the **Highlighter** button and test:

1. one single pass,
2. paint over half of that pass again,
3. cross two strokes of the same color,
4. cross strokes of different colors if the current color control permits,
5. draw over/behind Concept nodes and Edge areas,
6. make fast sweeps and slow sweeps,
7. scribble loops/figure-eights to expose gaps or destructive clearing.

Acceptance questions:

- Does one pass look translucent and soft rather than like a rigid fluorescent marker?
- Does repeated painting visibly deepen the color?
- Are crossings richer/darker?
- Does the edge feel softly feathered/wet rather than hard?
- Is Wacom latency still effectively imperceptible?
- Most importantly: when compared with **iPad Freeform Watercolor**, does this feel like the same class of brush?

Do not call Watercolor MANUAL PASS until the user performs this comparison.

## Do Not Start Yet

- no third Ink Wash brush,
- no Obsidian / Excalidraw migration,
- no iPad realtime POC,
- no unrelated AI/provider refactor,
- no production-map test ingestion into `ws_default`.
