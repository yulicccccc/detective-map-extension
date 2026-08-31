# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-31  
**Single next priority:** **Manual Wacom acceptance of Highlighter = Transparent Marker V1**

## Read Before Work

1. `PRD.md` — locked product requirements.
2. `PROJECT_STATE.md` — current implementation/verification snapshot.
3. `AGENTS.md` — multi-agent engineering rules.
4. Pull/fetch latest `main` and confirm remote HEAD before editing.

## Locked Toolbar Mapping

```text
Pen         = Fountain Pen behavior
Highlighter = Transparent Marker behavior
```

Do not add separate Fountain/Marker buttons. Do not add Watercolor/Ink Wash as a third primary brush unless the user explicitly reopens that decision.

## Why Watercolor Was Retired as the Default Highlighter

Watercolor V2 was manually accepted as a watercolor effect, but after real use the user judged it too visually blocking for Detective Map's concept-map annotation role. The product goal is highlighting that protects readability and structure, not painting.

Watercolor V1/V2 stay in the codebase only for historical stroke replay.

## Transparent Marker V1 — Current Candidate

Implementation:

`shared/transparent-marker-v1.js`

**CODE / CI VERIFIED ✅**  
**MANUAL WACOM ACCEPTANCE REQUIRED ⏳**

Behavior:

- one-pass opacity is intentionally low,
- two clean deterministic layers only: faint soft shoulder + controlled marker body,
- mostly uniform fill; no cloud/bloom/wet texture,
- flat `butt` caps for marker/chisel-like ends,
- stable width; pressure variation is intentionally subtle,
- repeated passes/crossings deepen gradually,
- independent Highlighter color preference remains supported,
- selected custom/preset color is preserved into the stroke,
- deterministic replay,
- O(1) incremental active rendering,
- Watercolor V1/V2 histories remain unchanged through renderer delegation.

New Highlighter strokes persist:

```text
tool: transparent_marker
brushType: transparent_marker
brushVersion: 1
```

## Pen + Color State

Fountain Pen V3 is **CODE / CI VERIFIED ✅** (Expressive calligraphic brush with strong thick/thin contrast >8x, sharp start taper, exit taper, velocity modulation, directional nib character, `requestAnimationFrame` render batching, and high-frequency Wacom spatial/dynamic resampling filter).

Independent color selection is CODE/CI VERIFIED and verified across both tools: Pen and Highlighter maintain distinct selected colors while historical strokes retain their originally drawn colors.

`transparent_marker`, historical `watercolor`, and generic `highlighter` semantics resolve to the Highlighter color preference; `fountain_pen` resolves to the Pen preference.

## Automated Evidence

Long-term GitHub Actions verification includes:

- `tests/verify-all.js`
- `tests/verify-v2.js`
- `tests/verify-fountain-v2.js`
- `tests/verify-fountain-v3.js`
- `tests/verify-watercolor-v1.js`
- `tests/verify-watercolor-v2.js`
- `tests/verify-transparent-marker-v1.js`
- `tests/verify-ink-colors.js`

Transparent Marker regression coverage checks:

- historical Watercolor V2 replay unchanged,
- new Highlighter upgrades to `transparent_marker`,
- selected pigment survives upgrade,
- one-pass opacity stays within a low readability budget,
- repeated passes deepen gradually,
- pressure affects width only subtly,
- flat marker-style caps,
- deterministic replay,
- O(1) incremental finalized-segment behavior,
- Highlighter color mapping remains intact,
- toolbar remains exactly one Highlighter button.

## Single Next Action — Manual Marker Test

On the Windows Wacom machine:

1. pull latest `main`,
2. reload the unpacked Detective Map extension,
3. select **Highlighter**,
4. choose a clearly visible color,
5. draw one fresh highlight directly across a Concept title or Edge label,
6. paint over half of it once more,
7. cross it once,
8. repeat with a second color,
9. compare it with the old Watercolor strokes still visible on the map.

Acceptance:

- one pass leaves underlying information clearly readable,
- result looks like a clean translucent marker rather than watercolor/paint,
- interior color is comparatively uniform and controlled,
- edge is only subtly softened and does not bloom outward,
- repeated pass deepens gradually,
- crossings remain readable,
- width feels predictable,
- endpoints feel flatter/more marker-like,
- color selection still works independently,
- no perceptible new drawing lag,
- old Watercolor strokes remain unchanged.

If these pass, stop Highlighter brush iteration for this phase unless the user reopens it.
