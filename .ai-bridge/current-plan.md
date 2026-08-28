# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-28  
**Single next priority:** **Manual Wacom acceptance of Fountain Pen V2**

## Read Before Work

1. `PRD.md` — locked product requirements.
2. `PROJECT_STATE.md` — current implementation/verification snapshot and accepted implementation exceptions.
3. `AGENTS.md` — multi-agent engineering rules.
4. Pull/fetch latest `main` and confirm remote HEAD before editing.

## Current Baseline

- Living Learning Map incremental AI workflow: stable.
- Structure-First Concept Map UI: **BROWSER PASS ✅**.
- Default Concept nodes: collapsed; descriptions hidden; complete labels; Quick Expand + Detail Drawer.
- Tri-layer low-latency ink foundation: implemented.
- Windows Wacom latency on the prior generic pen: **MANUAL PASS ✅**.
- iPad Safari Pencil latency on the native Canvas path: poor; iPad/Obsidian/Excalidraw migration remains paused.
- Old V1 deploy/LAN scripts and `server.js` are archived under `legacy/`.
- `docs/PRD.md` is only a pointer to root `PRD.md`; there is one authoritative full PRD.
- Legacy PeerJS runtime/download/generated assets were removed from the current V2 build.
- `public/` is rebuilt as a clean generated directory rather than an accumulating copy target.
- PRD §11/§12 now reflects Windows/Mac cloud clients with iPad as an optional secondary client.
- PRD §13 now records the accepted permanent convenience auto-pair exception without exposing its concrete credential.

## Fountain Pen V2 — Implemented, Awaiting Human Feel Test

**CODE / CI VERIFIED ✅**

Implementation: `shared/fountain-pen-v2.js`.

The current Pen tool upgrades a newly drawn stroke to persistent `tool: fountain_pen` semantics while historical `tool: pen` strokes retain the previous renderer.

Implemented behavior:

- strong visible pressure modulation,
- calibrated pressure presets: `Light Touch / Balanced / Expressive`,
- `Expressive` is the default,
- modest velocity influence so fast movement is slightly finer,
- sharp start taper,
- tapered live/final pen-lift tip,
- continuous width interpolation through constant-step variable-width segments,
- optional tilt/orientation width modulation when Pointer Events expose usable tilt/azimuth data,
- graceful no-tilt/no-time fallback,
- captured pressure/time/tilt metadata persisted inside the existing points JSON,
- Fountain preset/version identity persisted with the stroke points for stable replay,
- deterministic full replay,
- incremental finalized layer + replaceable live tail parity,
- O(1) per-point incremental work,
- existing Highlighter remains unchanged until Watercolor work begins.

### Automated Evidence

GitHub Actions workflow: `Verify and Rebuild Generated Assets`.

Verified on an independent GitHub runner after Fountain implementation:

- `tests/verify-all.js`: **9/9 passed**
- `tests/verify-v2.js`: **22/22 passed**, zero network calls
- `tests/verify-fountain-v2.js`: **11/11 passed**

Fountain-specific tests cover:

- legacy `tool: pen` replay unchanged,
- pressure separation,
- velocity influence,
- start taper,
- tilt-aware variation,
- new-stroke `fountain_pen` upgrade,
- pressure/time/tilt capture fallback,
- end taper,
- deterministic replay,
- incremental/replay segment parity,
- O(1) behavior through a 500-point stroke.

**Do not call this MANUAL PASS yet.** Beautiful handwriting is subjective and requires the real Wacom device.

## Single Next Action — Wacom Manual Acceptance

On the Windows machine with the Wacom tablet, pull latest `main`, reload the unpacked Detective Map extension, open Full Canvas, select **Fountain**, leave the preset on **Expressive**, and write:

```text
hello
oooooo
888888
Spaced Repetition
```

Then test:

- one very light line,
- one normal line,
- one firm line,
- light → firm → light in one continuous stroke,
- a few quick flicks,
- several slow curves,
- tilt only if the Wacom/browser actually reports usable tilt.

Human acceptance questions:

1. Is pressure variation immediately obvious?
2. Do starts/finishes look pointed rather than blunt?
3. Does normal English handwriting look materially prettier than the old Pen?
4. Is there still effectively no perceptible Wacom lag?
5. Does `Expressive` feel too dramatic, too weak, or about right?

Do not tune Watercolor until these answers are known.

## Do Not Start Yet

- Watercolor Brush — P2 only after Fountain Pen manual acceptance/tuning.
- Obsidian / Excalidraw migration.
- iPad realtime POC.
- unrelated AI/provider refactors.
- production-map test ingestion into `ws_default`.
