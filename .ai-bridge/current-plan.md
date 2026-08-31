# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-31  
**Single next priority:** **Manual UI acceptance of independent Pen + Highlighter color selection**

## Read Before Work

1. `PRD.md` — locked product requirements.
2. `PROJECT_STATE.md` — current implementation/verification snapshot.
3. `AGENTS.md` — multi-agent engineering rules.
4. Pull/fetch latest `main` and confirm remote HEAD before editing.

## Locked Toolbar Mapping

```text
Pen         = Fountain Pen behavior
Highlighter = Watercolor Brush behavior
```

Do not add separate Fountain/Watercolor buttons. Do not add a third Ink Wash brush.

## Current Manual Brush Evidence

### Watercolor V2

**MANUAL PASS / ACCEPTED FOR THIS PHASE ✅**

The user judged the V2 Highlighter as substantially correct: "挺好的！很水墨了！我觉得差不多了". The remaining requested Highlighter issue is selectable color, not brush feel.

### Fountain Pen V2

**CODE / CI VERIFIED ✅** and acceptable enough for the current phase; the remaining requested Pen issue is selectable color.

## Independent Ink Color Selection — Current Candidate

Implementation:

`shared/ink-color-palette.js`

**CODE / CI VERIFIED ✅**  
**MANUAL UI CONFIRMATION REQUIRED ⏳**

Locked behavior:

- Pen and Highlighter have independent selected colors.
- Existing toolbar remains exactly two ink tools.
- Each tool receives a compact color dot/swatch; clicking it opens a small palette.
- Pen and Highlighter have separate preset palettes.
- A native custom color picker allows arbitrary color choice.
- Changing Pen color never changes Highlighter color, and vice versa.
- Selected colors are remembered per device/browser using `localStorage`.
- New strokes persist the chosen actual color in the existing stroke `color` field.
- Existing strokes are never recolored when the current preference changes.
- Stroke colors remain correct across cloud reload/devices because color is persisted per stroke.
- Cross-device synchronization of the *last selected preference* is not required in V2.0.

## Automated Evidence

Long-term GitHub Actions verification includes:

- `tests/verify-all.js`
- `tests/verify-v2.js`
- `tests/verify-fountain-v2.js`
- `tests/verify-watercolor-v1.js`
- `tests/verify-watercolor-v2.js`
- `tests/verify-ink-colors.js`

Ink-color coverage checks:

- independent defaults,
- semantic mapping (`fountain_pen` → Pen preference; `watercolor` → Highlighter preference),
- independent color mutation,
- independent local persistence,
- custom hex normalization,
- preset availability,
- Canvas stroke creation uses selected color rather than hardcoded colors,
- palette module loads before `canvas.js`,
- no extra Watercolor/Ink Wash toolbar button is introduced.

## Single Next Action — Manual Color UI Test

On the Windows Wacom machine:

1. pull latest `main`,
2. reload the unpacked Detective Map extension,
3. find the small color dot on **Pen**,
4. choose a noticeably different Pen color and draw a stroke,
5. find the small color dot on **Highlighter**,
6. choose a different Watercolor color and draw a stroke,
7. switch back and forth and confirm the two tools keep independent colors,
8. use **Custom** once to choose an arbitrary color,
9. reload the extension and confirm the two device-local choices remain,
10. confirm old strokes keep their original colors.

Acceptance:

- color choice is easy to discover and does not clutter the toolbar,
- Pen and Highlighter colors are independent,
- selected swatch immediately matches the new stroke color,
- Highlighter preserves the Watercolor light-wash character for every selected pigment,
- old strokes never change color,
- no new lag or drawing regression is introduced.

If this passes, stop ink-tool iteration for this phase unless the user reopens it.
