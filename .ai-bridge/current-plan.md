# Current Plan — Detective Map V2.0

**Last updated:** 2026-09-01
**Single next priority:** **Manual visual acceptance of Concept Node V4 — relationship-first graph refinement**

## Locked Product Formula

`AI builds the map. You shape it. You think on it. It keeps growing.`

The primary canvas is a persistent AI-generated, human-editable, handwriting-native Concept Map.

## Current Visual Change

Concept Node V3 passed real-browser acceptance: the map now reads as a Concept Map rather than a row of large pill buttons. V4 is a narrow refinement based on that accepted screenshot, not a redesign.

V4 changes only three visual priorities:

1. **Earlier wrapping / more node-like proportions**
   - resting node width target roughly 72–148px,
   - title measure about 104px,
   - common multi-word Concepts such as `Spaced Repetition`, `Optimized Interval`, and `Distributed Practice` should be allowed to wrap into a more oval/near-circle footprint instead of preserving one long line.

2. **Source badge moves further into the background**
   - smaller text and padding,
   - lower opacity,
   - weaker background/border,
   - still clickable and readable on intent.

3. **Relationship semantics become slightly stronger**
   - relationship label size/weight/contrast increases slightly,
   - relationship information must visually outrank Source metadata without overpowering the Concept name or handwriting.

No changes to Concept coordinates, AI behavior, data model, Ink, Drawer, Quick Expand, drag behavior, or Edge storage.

Principle:

`Concept Name + Relationship + handwriting > Source metadata > node chrome.`

## Manual Acceptance

After syncing and reloading, inspect the same real map containing `Spaced Repetition → Optimized Interval`, plus surrounding nodes.

PASS requires:

1. common multi-word Concepts feel more like graph nodes than horizontal UI pills,
2. labels remain complete and naturally wrapped; no truncation,
3. relationship labels are easier to read at a glance than Source badges,
4. Source badges remain discoverable but no longer compete with the Concept name,
5. handwriting still feels like a first-class thinking layer over the machine-generated structure,
6. Edge endpoints remain visually aligned with live node dimensions,
7. hover/select/drag/expand behaviors remain unchanged,
8. the overall canvas feels closer to an interactive knowledge network than a flowchart or card layout.

Automated tests may establish CODE/CI VERIFIED. Final aesthetics still require browser/manual acceptance.

## Separate Open Ink Check

Fountain Pen V3 high-frequency Wacom input has requestAnimationFrame batching and resampling, but the final low-latency Wacom feel still requires a separate human re-check. Do not conflate that with Concept Node V4 visual acceptance.
