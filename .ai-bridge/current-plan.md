# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-28  
**Single next engineering priority:** **Fountain Pen V2**

## Read Before Work

1. `PRD.md` — locked product requirements.
2. `PROJECT_STATE.md` — current implementation/verification snapshot.
3. `AGENTS.md` — multi-agent engineering rules.
4. Pull/fetch latest `main` and confirm remote HEAD before editing.

## Current Baseline

- Living Learning Map incremental AI workflow: stable.
- Explicit Source Subject Preservation: browser-verified.
- Source-Grounded Edge generalization: browser-verified on unseen Method of Loci fixture.
- Structure-First Concept Map UI: **BROWSER PASS ✅**.
- Default Concept nodes: collapsed; descriptions hidden; complete labels; Quick Expand + Detail Drawer.
- Tri-layer low-latency ink foundation: implemented.
- Windows Wacom latency: **MANUAL PASS ✅**.
- Current generic pen aesthetics/pressure feel: insufficient for desired handwriting quality.
- iPad Safari Pencil latency: poor; iPad/Obsidian/Excalidraw migration is **paused**, not the current task.

## Next Task — Fountain Pen V2

Implement only the Fountain Pen requirements in `PRD.md §6.10`:

- strong visible pressure response,
- calibrated/smoothed pressure curve,
- modest velocity influence,
- start taper,
- end/pen-lift taper,
- continuous width interpolation,
- optional tilt/nib orientation when reliable pen data exists,
- graceful no-tilt fallback,
- Wacom/Apple Pencil sensitivity calibration or preset support,
- deterministic replay/backward compatibility,
- preserve current low-latency Wacom feel.

## Do Not Start Yet

- Watercolor Brush — P2 after Fountain Pen manual acceptance.
- Obsidian / Excalidraw migration.
- iPad realtime POC.
- unrelated AI/provider refactors.
- production-map cleanup or test ingestion into `ws_default`.

## Required Verification

Automated:

- pressure/velocity/taper math bounds and smoothing,
- missing-pressure / missing-time / missing-tilt fallback,
- deterministic replay,
- backward compatibility with old `{x,y,pressure}` strokes,
- no O(total historical points) active-stroke regression.

Manual Wacom acceptance:

```text
hello
oooooo
888888
Spaced Repetition
```

plus light / normal / firm lines, light→firm→light, quick flicks, slow curves, and tilt tests only if the hardware/browser reports usable tilt.

Do not claim Fountain Pen PASS until the real pen result is manually accepted.
