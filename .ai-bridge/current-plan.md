# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-28  
**Single next engineering priority:** **Fountain Pen V2**

## Read Before Work

1. `PRD.md` — locked product requirements.
2. `PROJECT_STATE.md` — current implementation/verification snapshot and accepted implementation exceptions.
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
- Old V1 deploy/LAN scripts and `server.js` are archived under `legacy/`; root is now V2-oriented.
- `docs/PRD.md` is only a pointer to root `PRD.md`; there is one authoritative full PRD.

## Pre-Code PRD Reconciliation — Do First

Use the local editor and make only these targeted PRD wording updates before Fountain Pen code. Inspect the diff; do not rewrite unrelated PRD sections.

1. **§13 Security**: keep the default rule against hardcoded credentials, but document the existing permanent convenience auto-pair mechanism as an explicitly accepted implementation exception. Do not write the concrete credential value into PRD/docs/logs/prompts. State that the exception does not authorize additional hardcoded secrets and is not to be removed unless the user explicitly reopens the decision.
2. **§11 Cross-Device Sync / §12 Architecture**: generalize the examples/diagram from a Windows→iPad-centric picture to the actual supported model: Windows/Mac Chrome clients share the authoritative cloud Workspace; iPad is an optional secondary browser/pen client. Keep iPad realtime behavior as a supported acceptance path, not a mandatory product dependency.

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

### Same-Build Hygiene — Required, Not a Separate Product Project

Because Fountain Pen changes require rebuilding frontend/generated assets anyway, clean these known stale artifacts in the same final build:

1. Replace Apple-Pencil/iPad-specific Canvas labels with device-neutral wording where the feature is actually generic (e.g. `Pen / Stylus`, `Pair Another Device`, `Connect Second Device`, neutral pen-input status).
2. Verify current runtime has no PeerJS references. If still unused, remove `shared/peerjs.min.js`, `scripts/download-peerjs.js`, the PeerJS entry from `scripts/bundle-assets.js`, and the corresponding generated/public copies **together**. Do not leave source/generated assets out of sync.
3. Run `node scripts/bundle-assets.js` and `node scripts/build-public.js` only after the source cleanup so `public/*` and `src/assets-bundle.js` are generated from the final source tree.

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
- no O(total historical points) active-stroke regression,
- final generated assets match source after build,
- existing Structure-First UI invariants remain intact.

Manual Wacom acceptance:

```text
hello
oooooo
888888
Spaced Repetition
```

plus light / normal / firm lines, light→firm→light, quick flicks, slow curves, and tilt tests only if the hardware/browser reports usable tilt.

Do not claim Fountain Pen PASS until the real pen result is manually accepted.
