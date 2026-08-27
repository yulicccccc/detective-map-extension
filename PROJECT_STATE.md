# Detective Map V2.0 — Project State & Memory

**Last Verified:** 2026-08-27  
**Status:** 🟢 Production Stable & Live Verified  
**Cloud Deployment:** `https://detectivemap.qchen9108.workers.dev`  
**Master Pairing Code:** `KIRA-2026`  

---

## 1. Architecture Summary

```text
Chrome Extension (ChatGPT Context Menu / Side Panel / Standalone Canvas)
       │ (REST /api/sources, /api/concepts, /api/edges, /api/state)
       ▼ (WebSocket /api/ws for real-time ink & live event broadcast)
Cloudflare Worker + Durable Object SQLite (Durable State & Single Authoritative Source)
       │ (Durable Object calling this.env.AI)
       ▼
Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct-fast)
       │ (Structured JSON operations)
       ▼
SQLite proposals table (status = 'pending' | 'stale' | 'archived')
       │ (Broadcast PROPOSAL_CREATED & auto-hydrated on /api/state)
       ▼
Side Panel / Canvas UI (Interactive Map + Apply All / Review + Durable Stale Recovery)
```

---

## 2. Locked & Finalized Features

- **Side Panel Interactive Living Map**:
  - Two Tabs: `[ 🗺️ Map ]` (Default) and `[ 📚 Sources ]`.
  - Full pan/zoom viewport in narrow Side Panel with responsive card widths.
  - Live concept node dragging, inline title/description editing, evidence drawer, and connection edges.
  - `↗ Expand` button in header opens full standalone dual-canvas workspace.
- **Workers AI Ingestion Engine**:
  - Model: `@cf/meta/llama-3.1-8b-instruct-fast` (with automatic fallback to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/meta/llama-3-8b-instruct`).
  - Structured JSON Mode: `response_format: { type: 'json_object' }`.
  - Zero mock AI: Live end-to-end verified with real text ingestion and proposal extraction in 1.5–2.0s.
- **Durable Proposal Lifecycle & Stale Recovery Across Reloads**:
  - Automatic `fetchRemoteState()` on startup and workspace switch.
  - Workspace-scoped local storage: saving proposals, stale proposals, dismissed failures, sources, concepts, edges, and ink isolates data per workspace.
  - **Durable Server Stale State (`GET /api/state`)**: Server isolates pending proposals (`status = 'pending'`) from stale proposals (`status = 'stale'`), returning both in distinct properties (`proposals` vs `staleProposals`).
  - **Durable Stale Recovery**: Survives Side Panel close/re-open, Chrome extension reload, browser restart, and multi-device sync. When a 409 `PROPOSAL_STALE` occurs (baseRevision conflict), the proposal is durably persisted as stale with its original `sourceId`. The client displays the amber recovery banner: `"This proposal is outdated because the map changed." [Re-analyze Source]`.
  - **Retry & Stale Archiving (`POST /api/sources/retry`)**: Retrying an outdated source automatically marks old stale proposals as `archived`, resets `source.processingStatus = 'processing'`, re-analyzes against the latest revision, and broadcasts `PROPOSALS_STALE_CLEARED`.
  - **Stale & Failure Dismiss Persistence**: Dismissing stale proposals calls `POST /api/proposals/dismiss-stale` and persists across sessions; dismissing failed source alerts (`dismissedFailedSourceIds`) is durably persisted per workspace.
  - **Banner Hierarchy**: `Pending Proposal (✨ Blue)` > `Stale Proposal Recovery (🔄 Amber)` > `Active Source Failure (⚠️ Yellow)`.
- **Durable Auth & Pairing**:
  - Master PIN: `KIRA-2026` (permanent, case-insensitive, repeatable).
  - Auto-pairing fallback: Extension automatically pairs with `KIRA-2026` if token is missing.
  - One-time PINs (`PIN-XXXXXX`) supported for pairing iPad devices with atomic single-use consumption.
- **Server-Side Mutation Audit Trail ("AI Proposes; Human Commits" Durable Attribution)**:
  - **SQLite table `mutation_audit`**: Durably logs every attempt, conflict, error, and success for proposal applications.
  - **Captured Fields**: `id`, `timestamp`, `workspaceId`, `action` (`proposal_apply_attempt`, `proposal_apply_stale_409`, `proposal_apply_success`, `proposal_apply_error`), `proposalId`, `sourceId`, `baseRevision`, `revisionBefore`, `revisionAfter`, `requestId`, `clientActionId` (must be `act_sp_...` or `act_cv_...` from explicit clicks, else `unknown`), `surface` (`sidepanel` | `canvas` | `unknown`), `deviceFingerprint` (SHA-256 one-way hash `fp_...`), `userAgent`, `result`, `httpStatus`, `metadata` (structural operation counts and created concept/edge IDs).
  - **Privacy & Security Invariant**: Zero raw authentication tokens, pairing codes, source texts, concept content bodies, or secrets are ever recorded.
  - **Authenticated Read-Only Endpoint (`GET /api/audit?workspaceId=...`)**: Allows durable verification of who/what/when/how a concept was committed to the authoritative map.
  - **Client Headers**: Side Panel and Canvas pass unique `clientActionId` and `X-Detective-Surface` on explicit user click events only; startup/reload/fetch routines never call apply or attach mutation headers.
- **Dual-Canvas Ink Layer (iPad & Desktop)**:
  - World coordinate invariance, zoom anchor invariance, resting palm protection (`pointerType === 'touch'` does not cancel active stylus pen stroke).
  - Stroke eraser with point-to-segment distance math.

---

## 3. Test Matrix & Verification Status

| Test Suite | Result | Details |
|---|---|---|
| `tests/verify-all.js` | **9/9 Passed** | MV3 structure, coordinate math, zoom invariance, eraser hit detection, export/import schema |
| `tests/verify-v2.js` | **16/16 Passed** | **Pure In-Memory Test Isolation**: Strict 0-network guard (`DETECTIVE_TEST_MODE`), Workspace CRUD, Safari localStorage, palm rejection, cascading delete, tail chunking, proposal sanitization, subset validation, ink isolation, failure UI, scoped storage, durable stale recovery, dismissed failure persistence, Side Panel startup integrity, **Mutation Audit Invariant & Surface/Action-ID Header Propagation** |
| `tests/verify-cloud.js` | **13/13 Passed** | Live Cloudflare security, legacy token rejection, KIRA-2026 auth, atomic PIN, real Workers AI execution, retry endpoint, durable stale proposals in GET /api/state & dismiss-stale endpoint, 401 stale token auto-healing, strict `__TEST` deletion policy regression, **Live Server-Side Mutation Audit Trail Verification (attempt, stale 409, success, metadata, zero secret leak, 0 pollution left behind)** |

---

## 4. Operational Instructions

- **Rebuild Public & Bundle**: `node scripts/bundle-assets.js; node scripts/build-public.js`
- **One-Click Deploy**: `cmd.exe /c "DetectiveMap_V2.0.0_detectivemap.qchen9108.workers.dev_一键更新网站.bat"`
- **Run Tests**: `node tests/verify-cloud.js; node tests/verify-v2.js; node tests/verify-all.js`

---

## 5. V2.1 Roadmap: Pluggable AI Provider Layer & Benchmark A/B

- **Target Architecture**:
  - `Detective Map -> AI Provider Abstraction Layer`
  - Adapters:
    - `WorkersAIProvider` (Current default, `@cf/meta/llama-3.1-8b-instruct-fast`, 0-config)
    - `AgnesFlashProvider` (OpenAI-compatible `/v1/chat/completions`, 512K context for mature maps)
    - `OpenAIProvider` / `GeminiProvider`
- **Benchmarking Plan**:
  - Feed identical complex text + 50-node existing map to evaluate concept deduplication, relationship precision, and contradiction detection.
- **Rule**: Do not refactor active AI engine until V2.0 user workflow is 100% verified.

