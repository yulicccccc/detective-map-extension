# AGENTS.md — Detective Map V2.0 Engineering Rules

## 1. Project Identity & Source of Truth

- **Product**: Detective Map V2.0 — Living Learning Map.
- **Core principle**: Minimum manual effort, maximum cognitive ownership.
- **Primary product source of truth**: [`PRD.md`](PRD.md).
- **Current implementation / verification snapshot**: [`PROJECT_STATE.md`](PROJECT_STATE.md).
- **Single next engineering task**: [`.ai-bridge/current-plan.md`](.ai-bridge/current-plan.md).

If local files, an old report, an AI conversation, or a stale branch conflicts with those files, pull/fetch latest `main` and use the hierarchy above. Never assume a local clone is current.

## 2. Locked Product Rules

### 2.1 Incremental Merge, Not Regeneration

- AI must **never** regenerate the entire map as the normal update path.
- AI proposals use structured operations such as `add_concept`, `enrich_concept`, `add_edge`, `update_edge`, `suggest_merge`, `flag_conflict`, and `suggest_restructure`.
- Existing Concept IDs, manual positions, user edits, accepted relationships, ink, pinned layout, and source provenance must be preserved.

### 2.2 AI Proposes; Human Commits

- AI does not silently commit proposal operations.
- Proposal application must originate from an explicit human UI action with valid provenance headers/action IDs.
- Destructive or large structural changes require explicit review/confirmation.
- Server-side mutation audit behavior remains authoritative.

### 2.3 Source ≠ Concept

- **Source** = captured evidence/material.
- **Concept** = abstracted understanding represented in the map.
- Concepts preserve `sourceRefs` back to supporting evidence.

### 2.4 Concept Map Is Structure-First

Default Canvas behavior is locked:

- Concept nodes are **collapsed by default**.
- Default node shows Concept identity and compact evidence/status only; descriptive prose is hidden.
- Concept titles are never silently truncated.
- Relationships/edge semantics are visually prominent.
- Double-click or explicit control provides temporary Quick Expand.
- Complete Concept knowledge/evidence belongs in the Detail Drawer.
- Expand/collapse is UI view state; it must not increment Workspace revision or rewrite saved `(x, y)` coordinates.
- Failure/sync/stale notices must be compact and non-intrusive.

### 2.5 Pen / Brush Direction

The ink engine is device-agnostic Pointer Events infrastructure, not an Apple-Pencil-only subsystem.

Supported/target pen surfaces include:

- Wacom-class desktop pen tablets,
- Apple Pencil where the browser exposes reliable pen data,
- mouse as a basic non-expressive fallback.

Current product priority:

1. Preserve low-latency pen input.
2. Implement **Fountain Pen** quality per `PRD.md §6.10`.
3. Implement **Watercolor Brush** after Fountain Pen is manually accepted.

Do not reintroduce perceptible latency for more realistic brush effects.

### 2.6 Cloud / Workspace Authority

- Cloudflare Worker + Durable Object SQLite is the durable authoritative Workspace state.
- Client local storage is cache/offline support, not the cross-device source of truth.
- Workspace mutations are revision-aware.
- WebSocket/REST state must remain authenticated.

## 3. Multi-Computer / Multi-Agent Coordination — Required

Before changing code or docs:

1. Fetch/pull latest `main`.
2. Record the current remote HEAD SHA.
3. Read `PRD.md`, `PROJECT_STATE.md`, and `.ai-bridge/current-plan.md`.
4. Check whether another agent already implemented the requested change.
5. Do not force-push, reset, or overwrite newer remote work from a stale machine.

When requirements change:

- update `PRD.md` first or in the same change,
- update `PROJECT_STATE.md` when implementation/verification state changes,
- update `.ai-bridge/current-plan.md` when the next priority changes.

Old `.ai-bridge` reports and V1 artifacts are historical evidence only; they are not product authority.

## 4. Verification Language

Use only evidence-backed labels:

- **CODE VERIFIED** — inspected implementation/test code supports the claim.
- **CLOUD VERIFIED** — live cloud fixture/API behavior was actually executed and verified.
- **BROWSER PASS** — real browser UX was manually observed and passed.
- **MANUAL REQUIRED** — physical-device/subjective UX still needs a human test.

Do not use self-scored `100/100`, `production perfect`, or `remaining risks: none` as evidence.

For UI/handwriting work, automated tests do not replace real browser/pen testing.

## 5. Test & Production Safety

- Run current suites from the current checkout; do not rely on historical test counts copied into reports.
- Pure in-memory tests must make zero network calls.
- Cloud tests must use isolated `__TEST__` workspaces and clean them up.
- Do not mutate `ws_default` for automated testing.
- Do not ingest test Sources into the production learning map.
- Preserve strict production cleanup/deletion guards.

## 6. Security Rules

- Never put tokens, API keys, passwords, bootstrap secrets, or credentials in URLs, logs, screenshots, reports, or chat instructions.
- Do not introduce new hardcoded secrets or credentials into source.
- **Existing accepted convenience-pairing exception:** the current product intentionally retains one permanent auto-pair convenience mechanism as an explicit usability/security tradeoff. Do not remove or redesign that mechanism unless the user explicitly reopens the decision. Do not copy its concrete credential value into documentation, logs, URLs, screenshots, or new code paths.
- This accepted exception does **not** authorize additional hardcoded secrets.
- WebSocket must authenticate before sending state.
- State APIs require authentication.
- Keep `host_permissions` restricted to the deployed Worker domain; no `<all_urls>`.
- Do not log source text or sensitive auth material unnecessarily.

## 7. Build / Deploy Discipline

Before deploy after frontend/shared changes:

```text
node scripts/bundle-assets.js
node scripts/build-public.js
```

Then run the relevant test suites on the **final working tree**.

Current production deploy target:

`https://detectivemap.qchen9108.workers.dev`

After a successful change, push a new commit SHA and update the state/plan docs when applicable.
