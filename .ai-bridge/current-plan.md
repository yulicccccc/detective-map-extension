# Current Plan — Detective Map V2.0

**Last updated:** 2026-08-31  
**Single next priority:** **Manual Wacom retest of Highlighter = Watercolor V2 Light Wash**

## Read Before Work

1. `PRD.md` — locked product requirements.
2. `PROJECT_STATE.md` — current implementation/verification snapshot and accepted implementation exceptions.
3. `AGENTS.md` — multi-agent engineering rules.
4. Pull/fetch latest `main` and confirm remote HEAD before editing.

## Locked Toolbar Mapping

```text
Pen         = Fountain Pen behavior
Highlighter = Watercolor Brush behavior
```

Do not add separate Fountain/Watercolor buttons. Do not add a third Ink Wash brush. Legacy generic Pen/Highlighter rendering exists only for historical-stroke compatibility.

## Human Evidence — Watercolor V1

**MANUAL FAIL ❌**

User screenshot/feedback on Windows Wacom showed:

- the Highlighter rendered as a dense saturated orange block,
- underlying map text was obscured,
- the visual result felt like a thick marker rather than the light translucent Watercolor benchmark from iPad Freeform.

Do not describe Watercolor V1 as successful simply because its automated suite passed.

## Watercolor V2 Light Wash — Current Candidate

Implementation: `shared/watercolor-brush-v2.js`.

**CODE / CI VERIFIED ✅**  
**MANUAL RETEST REQUIRED ⏳**

V2 intentionally preserves persisted V1 watercolor strokes and applies the correction only to newly drawn Highlighter strokes.

Manual-failure corrections:

- new Highlighter default opacity reduced from the legacy `0.35` path to `0.18`,
- new default width reduced from `20` to `17`,
- saturated orange default replaced by a lighter warm yellow,
- five-layer V1 profile reduced to a three-layer light-wash profile,
- dense center pigment removed,
- a strict one-pass translucency/readability budget is regression-tested,
- quadratic curves are painted once per translucent layer rather than split into many round-capped mini-segments,
- repeated passes/crossings still deepen naturally through source-over compositing,
- deterministic texture/replay and O(1) active rendering remain preserved.

Historical Watercolor V1 strokes are delegated to the V1 renderer so their saved appearance does not silently change.

## Fountain Pen V2

**CODE / CI VERIFIED ✅**; real Wacom feel remains user-authoritative.

Implementation: `shared/fountain-pen-v2.js`.

## Automated Evidence

Long-term GitHub Actions verification includes:

- `tests/verify-all.js`
- `tests/verify-v2.js`
- `tests/verify-fountain-v2.js`
- `tests/verify-watercolor-v1.js`
- `tests/verify-watercolor-v2.js`

Watercolor V2 regression coverage explicitly checks:

- V1 persisted replay unchanged,
- new Highlighter → V2 light-wash defaults,
- low single-pass opacity/readability budget,
- gradual repeat-pass accumulation,
- lighter feather profile without dense center core,
- removal of multi-mini-segment pigment buildup,
- deterministic texture/replay,
- incremental/replay parity,
- O(1) 500-point active path,
- no separate Watercolor toolbar button.

## Single Next Action — Manual Highlighter Retest

On the Windows Wacom machine:

1. pull latest `main`,
2. reload the unpacked Detective Map extension,
3. select **Highlighter**,
4. draw a fresh stroke (old V1 strokes intentionally remain visually unchanged),
5. draw across readable text / an edge label,
6. repeat over half once,
7. cross the stroke once.

Acceptance:

- one fresh pass must leave underlying text clearly readable,
- one fresh pass should feel light/transparent rather than dense,
- a second pass should deepen without becoming a solid block,
- crossings should show local accumulation,
- edges should feel softer than a conventional marker,
- motion must remain low-latency,
- the user should judge it materially closer to iPad Freeform Watercolor than V1.

If V2 is still too dense or too marker-like, tune **Highlighter only**. Do not create another brush.
