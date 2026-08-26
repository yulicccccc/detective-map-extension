# Detective Map V2.0 Final Reliability Patch Report

## 1. Core Summary
- **Version**: 2.0 (Living Learning Map — Final Reliability Patch)
- **Status**: Ready for physical iPad device acceptance.

---

## 2. Final Reliability Patch Checklist

### 1. Rotate / Invalidate All Old Device Tokens
- Added `system_meta` SQLite versioning in Durable Objects (`auth_version = 'v2.1_hardened'`).
- Invalidation of pre-v2.1 tokens executes exactly once upon migration deployment.
- Subsequent worker restarts will NOT wipe newly paired devices.
- Old tokens return **HTTP 401 Unauthorized**.

### 2. Secure First-Device Bootstrap (`DM_BOOTSTRAP_SECRET`)
- Public zero-token bootstrap has been removed.
- `/api/auth/bootstrap-pin` strictly requires `X-Bootstrap-Secret` header or body matching Cloudflare environment secret `DM_BOOTSTRAP_SECRET`.
- Unauthenticated requests return **HTTP 403 Forbidden**.
- Removed automatic bootstrap from `service-worker.js`.
- Unpaired extension shows `Cloud: Unpaired`.
- Secrets are never logged, never in URLs, and never in Git.

### 3. Single Authoritative Mutation Path (Double-Write Eliminated)
- REST endpoints (`/api/concepts`, `/api/concepts/delete`, `/api/edges`, `/api/edges/delete`, `/api/proposals/apply`, `/api/proposals/reject`) are the **sole authoritative mutation commands**.
- WebSocket is dedicated to real-time broadcasts (`CONCEPT_UPDATED`, `CONCEPT_DELETED`, `EDGE_ADDED`, `EDGE_DELETED`), active ink stroke streaming, and cursor drag preview (`MOVE_CONCEPT_PREVIEW`).
- Exactly **one user action produces ONE DB write and ONE revision increment (+1)**.

### 4. Safari localStorage Edge Key Typo Fixed
- Corrected `STORAGE_KEYS.EDEdges` typo to `STORAGE_KEYS.EDGES` in `shared/storage.js`.
- Automated test verified edge serialization and deserialization in `localStorage`.

### 5. Real Apple Pencil Palm Rejection Behavior
- When Apple Pencil (`pointerType === 'pen'`) is actively drawing:
  - Any simultaneous `touch` events (resting palm) are completely ignored.
  - Palm touches **NEVER cancel the active pen stroke**.
  - Palm touches **NEVER generate ink**.
  - Pinch-to-zoom is active only when `!isDrawing`.
  - When the Pencil lifts, the full stroke is cleanly committed.

### 6. Persist Proposal Reject / Stale Status
- Server supports statuses: `pending`, `applied`, `rejected`, `stale`.
- 409 Stale: sets proposal status to `stale` in SQLite.
- Added `POST /api/proposals/reject` endpoint.
- Rejection persists to SQLite and broadcasts `PROPOSAL_REJECTED`.
- State queries filter to `pending` only; rejected/stale proposals never resurrect on reload.

### 7. Test Semantics & Shared Production Modules
- Extracted `chunkSourceText` and `validateAndSanitizeOperations` into `shared/engine-core.js`.
- Tests directly import and execute the shared production module.
- 0 toy duplicates, 0 secret printouts.

---

## 3. Verification Summary

| Item | Classification | Result |
|---|---|---|
| Invalidate old tokens | **CLOUD VERIFIED** | Old/invalid token returns HTTP 401 |
| Bootstrap secret required | **CLOUD VERIFIED** | Unauthenticated `/api/auth/bootstrap-pin` returns HTTP 403 |
| Double-write eliminated | **CODE VERIFIED** | REST authoritative mutation + single revision increment |
| Safari localStorage edge typo | **CODE VERIFIED** | `STORAGE_KEYS.EDGES` tested and passing |
| Apple Pencil palm rejection | **CODE VERIFIED** | Touch events ignored while pen stroke is active |
| Proposal reject/stale persistence | **CODE VERIFIED** | Tested rejection state filtering |
| Proposal Review Modal | **CODE VERIFIED** | Per-operation review UI |
| Apple Pencil handwriting smoothness | **MANUAL REQUIRED** | To be verified on physical iPad Safari |
