# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-31  
**Single next priority:** **Manual visual acceptance of Concept Node V3 — compact, quiet graph nodes**

## Locked Product Formula

`AI builds the map. You shape it. You think on it. It keeps growing.`

The primary canvas is a persistent AI-generated, human-editable, handwriting-native Concept Map.

## Current Visual Change

Concept Node V2 correctly moved the UI from rectangular cards to soft capsules, but real browser evidence showed the nodes still read too much like large pill-shaped buttons. V3 keeps the same data/interaction model and tightens only the visual footprint:

- resting node width roughly 76–190px,
- title text measure around 156px so common long labels wrap earlier,
- collapsed height reduced from 54px to about 42px,
- border and shadow substantially quieter,
- Source badge smaller and visually subordinate,
- complete labels remain mandatory; no ellipsis,
- expanded summary, drag behavior, Detail Drawer, and Edge geometry remain unchanged.

Principle:

`Concept identity + Relationship + handwriting > node chrome.`

Implementation lives primarily in `canvas.css`. Regression coverage remains `tests/verify-concept-nodes-v2.js` (now including compact V3 visual invariants).

## Manual Acceptance

After syncing and reloading, inspect the same real map that previously showed `Spaced Repetition → Optimized Interval`.

PASS requires:

1. nodes no longer read as large UI buttons,
2. the relationship line/label feels at least as visually important as the node shell,
3. handwriting can sit on the map without competing against heavy node chrome,
4. common multi-word labels stay compact; longer labels wrap naturally,
5. Source badge remains readable but clearly third-level information,
6. hover/select controls still work,
7. Edge endpoints still align with live node dimensions,
8. Quick Expand / Drawer behavior remains unchanged.

Automated tests may establish CODE/CI VERIFIED. The visual result still requires browser/manual acceptance.

## Separate Open Ink Check

Fountain Pen V3 high-frequency Wacom input has requestAnimationFrame batching and resampling, but the final low-latency Wacom feel still requires a separate human re-check. Do not conflate that with Concept Node V3 visual acceptance.
