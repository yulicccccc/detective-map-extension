# Antigravity Handoff Status — Detective Map V2.0

**Last reconciled:** 2026-08-28

> This file is a convenience handoff for Antigravity. It is **not** the product source of truth. If it conflicts with `PRD.md`, `PROJECT_STATE.md`, or `AGENTS.md`, follow those files in that order.

## Current Verified Baseline

### Living Map / AI

- Incremental merge workflow is active.
- Explicit Source Subject Preservation has browser evidence.
- Source-Grounded Edge policy has live cloud regression fixtures and an unseen browser generalization pass (`Method of Loci` created as a standalone Concept with no invented edge).
- The Source-Grounded Edge protection is prompt-enforced + regression verified; do not describe it as a deterministic semantic post-validator.
- AI proposal application remains human-initiated with server-side provenance/audit protection.

### Structure-First UI

**BROWSER PASS ✅**

- Concept nodes collapsed by default.
- Descriptions hidden in default graph view.
- Complete Concept titles; no ellipsis/line-clamp clipping.
- Quick Expand via double-click/title/card or explicit control.
- Complete description + Sources in Detail Drawer.
- Temporary expansion does not alter stored layout/revision.
- Failure/retry notices are compact corner toasts.
- Relationship labels remain visible/readable.

UI baseline commit: `87f27a4`.

### Ink Foundation

**CODE VERIFIED ✅**

- Tri-layer active rendering: committed ink / finalized active stroke / live-tail scratch.
- Incremental active rendering avoids whole-stroke replay on each pointer move.
- Pointer-up paints before persistence wait.
- Old `{x,y,pressure}` stroke data remains supported.

Tri-layer baseline commit: `e4f39f9`.

### Physical Input Findings

- Windows + Wacom latency: **MANUAL PASS ✅** — effectively no noticeable lag for normal handwriting.
- Current generic pressure aesthetics: **NOT ACCEPTED 🟡** — does not yet produce the desired fountain-pen look.
- iPad Safari + Apple Pencil on the current Canvas: **MANUAL FAIL / POOR ❌** due to severe latency.
- Excalidraw on iPad was manually observed to be smooth, but the Obsidian/Excalidraw architecture pivot is paused because Wacom removes the immediate need for it.

## Current Product Decision

The next priority is **Brush Engine V2**, in this order:

1. ✒ **Fountain Pen** — implement and manually accept first.
2. 🖌 **Watercolor Brush** — only after Fountain Pen passes manual Wacom testing.

See `PRD.md §6.10` for locked behavior and acceptance fixtures.

## Single Next Task

Implement Fountain Pen V2 only:

- strong visible pressure modulation,
- smoothed calibrated pressure curve,
- modest velocity influence,
- attractive start/end taper,
- continuous width interpolation,
- optional tilt/nib orientation when available,
- device sensitivity calibration/preset,
- deterministic replay and old-stroke compatibility,
- no perceptible latency regression from the current Wacom baseline.

Do **not** start Watercolor, Obsidian/Excalidraw migration, iPad realtime POC, or unrelated AI-provider work.

## Verification Rules

Use:

- CODE VERIFIED
- CLOUD VERIFIED
- BROWSER PASS
- MANUAL REQUIRED

Do not use `100/100`, `remaining risks: none`, or a green test count as a substitute for inspecting the final commit and performing required manual UX tests.

Run tests on the final working tree. Cloud test fixtures must stay isolated from `ws_default`.
