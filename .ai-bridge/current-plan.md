# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-31  
**Single next priority:** **Manual visual acceptance of Concept Node V2 — soft oval / adaptive capsule**

## Locked Product Formula

`AI builds the map. You shape it. You think on it. It keeps growing.`

The primary canvas is a persistent AI-generated, human-editable, handwriting-native Concept Map.

## Current Visual Change

Collapsed Concepts should read as graph entities rather than miniature document cards:

- short Concept → compact oval / near-circle,
- longer Concept → adaptive soft capsule,
- complete labels; no ellipsis,
- Source badge remains compact and subordinate,
- drag / expand / delete controls must not force resting node width,
- expanded summary remains bounded and does not mutate stored coordinates,
- Edge geometry continues to follow the live node dimensions.

Implementation lives primarily in `canvas.css`. Regression coverage: `tests/verify-concept-nodes-v2.js`.

## Manual Acceptance

After syncing and reloading the extension, inspect a map containing both short and long labels. PASS requires:

1. the canvas immediately reads more like a Concept Map / relationship network,
2. short Concepts are materially more compact than the old 180px cards,
3. long labels remain complete and readable,
4. Source badge and controls do not clutter the resting node,
5. hover/select still exposes drag / expand / delete affordances,
6. touch still has an explicit expand control,
7. Edge connections remain visually sensible as node sizes change,
8. Quick Expand and Detail Drawer behavior are unchanged.

Automated tests may establish CODE/CI VERIFIED. The visual result requires BROWSER/MANUAL acceptance.

## Separate Open Ink Check

Fountain Pen V3 high-frequency Wacom input was recently optimized with requestAnimationFrame batching and resampling, but its final low-latency feel still requires human Wacom re-check. Do not conflate that manual ink check with Concept Node V2 acceptance.
