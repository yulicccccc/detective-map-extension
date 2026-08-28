# Detective Map 🔍✍️

> **Read → Add → AI Merge → Edit → Ink → Sync → Keep Learning.**

Detective Map is a **persistent Living Learning Map**: a cross-device, AI-assisted concept-map workspace that grows as the learner adds new material over time.

The map is not a one-shot mind-map export. New sources are compared against the current Workspace, AI proposes incremental changes, and the learner decides what becomes part of the durable map.

## Start Here — Source of Truth Order

When working from a new computer or with a new AI agent, read these files in this order:

1. [`PRD.md`](PRD.md) — product requirements and locked product rules.
2. [`PROJECT_STATE.md`](PROJECT_STATE.md) — current implementation/verification snapshot and next engineering priority.
3. [`AGENTS.md`](AGENTS.md) — engineering and multi-agent collaboration rules.
4. [`.ai-bridge/current-plan.md`](.ai-bridge/current-plan.md) — short current task/next-action handoff.

If another document, old report, local clone, or AI memory conflicts with these files, **do not guess**. Pull latest `main` and follow the hierarchy above.

## Current Product Model

- **Source ≠ Concept**: captured material is evidence; Concepts are abstracted understanding.
- **Incremental Merge, Not Regeneration**: new learning adds/enriches/connects without replacing the whole map.
- **AI Proposes; Human Commits**: proposals are reviewed/applied by the learner; AI does not silently rewrite the map.
- **Structure-First Concept Map**: Concept nodes are collapsed by default; the default view emphasizes Concept identity + relationships. Descriptions are progressively disclosed by Quick Expand or the Detail Drawer.
- **Source-Grounded Relationships**: map context may help interpret a source, but emitted relationships must be supported by the current Source.
- **Persistent Spatial Ownership**: manual positions, edits, edges, ink, and source provenance are preserved.

## Current Surfaces

### Chrome Side Panel / Full Canvas

The Chrome extension supports:

- right-click capture: **Add to Detective Map**,
- Workspace selection,
- AI proposal review and subset apply,
- Concept/Edge editing,
- collapsed structure-first nodes,
- Detail Drawer for complete Concept knowledge/evidence,
- infinite canvas pan/zoom,
- stylus handwriting and annotation.

### Pen Input

The current browser ink engine accepts Pointer Events from devices such as:

- Wacom-class desktop pen tablets,
- Apple Pencil where the browser/device exposes pen input,
- mouse as a basic fallback.

**Current manual finding:** desktop Wacom input is low-latency enough for normal annotation. iPad Safari handwriting is optional rather than a required dependency.

The next brush-quality target is **Brush Engine V2**:

- ✒ **Fountain Pen** — strong pressure response, velocity influence, taper, optional tilt/nib orientation, attractive handwriting/calligraphic character.
- 🖌 **Watercolor Brush** — translucent soft-edge wash, natural overlap darkening, layered color, low-latency annotation.

See `PRD.md §6.10` for the locked requirements and manual acceptance criteria.

## Cloud Architecture

```text
Chrome clients / supported pen surfaces
               │
          HTTPS / WSS
               ▼
        Cloudflare Worker
               │
               ▼
     Durable Object + SQLite
       authoritative Workspace
               │
               ▼
       Cloudflare Workers AI
```

The Durable Object is the authoritative shared Workspace state for Concepts, Edges, Sources, proposals, revisions, and durable ink. Client-local storage is a cache/offline-support layer, not the cross-device source of truth.

Production deployment:

`https://detectivemap.qchen9108.workers.dev`

## Development / Verification

Build generated assets before deployment:

```text
node scripts/bundle-assets.js
node scripts/build-public.js
```

Run the current test suites from the latest checkout. **Do not rely on test counts copied from old reports** because the suites evolve:

```text
node tests/verify-all.js
node tests/verify-v2.js
node tests/verify-cloud.js
```

Tests must not mutate the real production Workspace. Cloud fixtures use isolated `__TEST__` workspaces and clean them up.

## Multi-Computer / Multi-AI Safety

Before editing:

- `git fetch` / pull latest `main`.
- Check the latest commit SHA.
- Read the source-of-truth files above.
- Never overwrite newer remote work from a stale local clone.

After meaningful product/architecture changes:

- update `PRD.md` if requirements changed,
- update `PROJECT_STATE.md` if implementation/verification status changed,
- update `.ai-bridge/current-plan.md` so the next agent knows the single next task,
- report verification using **CODE VERIFIED / CLOUD VERIFIED / BROWSER PASS / MANUAL REQUIRED** rather than self-scored “100/100” claims.

## Legacy Files

Files/scripts with `V1`, `V1.1`, `pages.dev`, `spacedesk`, or old “Pre-iPad” wording are **legacy historical artifacts** and are not current product guidance. The current deploy script is the V2 Worker deploy workflow.

## License

MIT License.
