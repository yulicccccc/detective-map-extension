# Detective Map V2.0 (Living Learning Map) Stabilization Report

## 1. PRD Path & Version
- **Path**: [`docs/PRD.md`](docs/PRD.md)
- **Version**: 2.0 (Living Learning Map — Stabilization Patch)
- **Core Principle**: Incremental merge, not regeneration. Human in the loop (AI propose, Human review/commit).

---

## 2. Stabilization Fixes Completed (CRITICAL A through I)

### 🛡️ CRITICAL A — Permanent Removal of Hardcoded Secrets & Atomic One-Time PIN
- **Purged**: Removed every runtime occurrence of `MAP-2026` from `src/worker.js`, `service-worker.js`, `canvas.html`, and runtime configurations.
- **Atomic One-Time PIN**: When `/api/auth/pair` succeeds, the matching PIN is **immediately and atomically deleted** from `pairing_pins`. Reusing the same PIN a second time returns **HTTP 401 Unauthorized**.
- **Dynamic PIN Generation**: Authorized devices generate short-lived, dynamic PINs (`POST /api/auth/generate-pin`) for pairing secondary devices (e.g. iPad Safari).
- **Secure Bootstrap**: `/api/auth/bootstrap-pin` only works if zero authorized tokens exist, preventing unauthorized token generation once initialized.

### 🛡️ CRITICAL B — Real Stale-Proposal Protection
- `/api/proposals/apply` loads `proposal.baseRevision` and compares against the live `workspace.revision`.
- If `proposal.baseRevision !== currentRevision`, returns **HTTP 409 `PROPOSAL_STALE`** and aborts without mutating concepts or edges.
- UI gracefully notifies the user: `"Map changed since this proposal was created. Re-analyze."`

### 🛡️ CRITICAL C — Real AI Contract & Strict Schema Validation
- **Deleted**: Removed sentence-splitter / first-line fake fallback completely.
- If Workers AI is unavailable or produces invalid JSON, source status is marked as `failed` and existing graph remains 100% untouched.
- Strict schema validator validates:
  - Allowed operations: `add_concept`, `enrich_concept`, `add_edge`, `flag_conflict`, `suggest_merge`.
  - Non-empty labels and sanitization.
  - Verification that referenced `conceptId`, `fromId`, `toId` exist or map to valid `tempId` within the same patch.

### 🛡️ CRITICAL D — Long-Source Processing & Deterministic Chunking
- Implemented `chunkSourceText(text, 2800, 250)` to break articles up to ~10,000 words along paragraph and sentence boundaries.
- AI extracts candidates across chunks and reconciles into ONE consolidated `ChangeProposal`.
- Validated via test that facts located at the tail of long text participate in the proposal.

### 🛡️ CRITICAL E — Workspace Switching WebSocket Correctness
- Client sends `{ type: "SWITCH_WORKSPACE", workspaceId: "<new_id>" }`.
- Server validates and updates session `workspaceId`, then replies with `{ type: "WORKSPACE_SWITCHED", ...state }`.
- All subsequent ink, move, and edge mutations affect only the newly active workspace.

### 🛡️ CRITICAL F — Desktop Structural Sync (Full Server Persistence)
- Concept label/description edits, node moves, node deletions, and edge creation/deletion now synchronize across REST endpoints (`/api/concepts`, `/api/concepts/delete`, `/api/edges`, `/api/edges/delete`) and WebSockets.
- Concept deletion cascades to delete connected edges.
- Reloading from cloud preserves deletions and edits without resurrected nodes.

### 🛡️ CRITICAL G — Real Proposal Review Flow
- Wired `[Review]` button to open `#proposal-review-modal`.
- Renders each operation individually with:
  - Operation type badge (`+ Concept`, `~ Enrich`, `🔗 Edge`, `⚠️ Conflict`, `🔀 Merge`).
  - Individual selection checkbox.
  - Explicit confirmation check required for structural actions (`suggest_merge`).
- `[Apply Selected Operations]` applies only the checked operations.

### 🛡️ CRITICAL H — Apple Pencil / Touch Separation (Palm Rejection)
- `pointerType === "touch"`: **NEVER creates ink**. Exclusively handles single-finger pan and two-finger pinch-zoom.
- `pointerType === "pen"`: Allowed to create ink in Pen/Highlighter mode.
- `pointerType === "mouse"`: Allowed to create ink on desktop.
- Removed marketing exaggerations from UI badges and comments.

### 🧪 CRITICAL I — Production Test Suite
- Rewrote `tests/verify-v2.js` and `tests/verify-cloud.js` to execute real production logic without toy assertions.
- 100% of Cloud tests, V2 production tests, and unit tests PASS.

---

## 3. Verification Matrix

| # | Verification Item | Status | Verification Detail |
|---|---|---|---|
| 1 | `MAP-2026` permanently rejected | **CLOUD VERIFIED** | Tested live `/api/auth/pair` with `MAP-2026` = HTTP 401 |
| 2 | One-time PIN atomic consumption | **CLOUD VERIFIED** | 1st use = 200 (token issued), 2nd use = 401 |
| 3 | Unauthorized `/api/state` access | **CLOUD VERIFIED** | Request without Bearer token = HTTP 401 |
| 4 | Stale proposal revision guard | **CODE VERIFIED** | Mismatched revision returns HTTP 409 without mutating graph |
| 5 | Strict AI schema validation | **CODE VERIFIED** | Disallowed & invalid operations filtered before proposal creation |
| 6 | Long-source tail participation | **CODE VERIFIED** | Deterministic chunking tested on >3500 char text |
| 7 | Workspace isolation across writes | **CODE VERIFIED** | Multi-workspace CRUD and switching verified |
| 8 | Concept label/description sync | **CODE VERIFIED** | Full Storage and REST persistence verified |
| 9 | Concept deletion cascading edges | **CODE VERIFIED** | Tested concept deletion removes node and connected edges |
| 10 | Touch pointer ink prevention | **CODE VERIFIED** | Verified touch only pans and never creates ink |
| 11 | Proposal review UI dialog | **BROWSER PASS** | Wired to review modal with per-op accept/reject checkboxes |
| 12 | Apple Pencil handwriting smoothness | **MANUAL REQUIRED** | To be tested on physical iPad Safari |
