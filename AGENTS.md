# AGENTS.md — Detective Map V2.0 Engineering Rules

## 1. Project Identity & Source of Truth
- **Product**: Detective Map V2.0 (Living Learning Map)
- **Core Principle**: Minimum manual effort, maximum cognitive ownership.
- **Source of Truth**: [`docs/PRD.md`](docs/PRD.md) (PRD Version 2.0).

---

## 2. Locked Architecture & Product Rules

### 2.1 Incremental Merge, Not Regeneration (LOCKED)
- AI must **NEVER** regenerate the entire map or replace existing concept IDs.
- AI proposals must be structured operations (`add_concept`, `enrich_concept`, `add_edge`, `update_edge`, `suggest_merge`, `flag_conflict`).
- Existing node coordinates, manual edges, node labels, and ink annotations must be strictly preserved.

### 2.2 Source ≠ Concept Separation (LOCKED)
- **Source**: Evidence/captured material (ChatGPT selection, pasted article, URL).
- **Concept**: Abstracted conceptual understanding node on the canvas.
- Every Concept maintains `sourceRefs` provenance links back to its supporting Sources.

### 2.3 Role Separation (LOCKED)
- **Windows Desktop**: Structural thinking (dragging concepts, editing labels, creating edges, reviewing AI proposals).
- **iPad Safari**: Cognitive annotation (Apple Pencil handwriting, circling, highlighting, freehand arrows).
- Both devices interact with the **same Active Workspace** in real time via Cloudflare Durable Objects + WebSocket.

### 2.4 Cloud Security Hardening (LOCKED)
- Zero hardcoded passwords, tokens, or default pairing codes in source code, Git, or logs.
- WebSocket must authenticate via `AUTH` message handshake before any state (`INIT_STATE`) is transmitted.
- All REST endpoints (`/api/sources`, `/api/concepts`, `/api/state`) require Bearer device token authentication.
- Strict `host_permissions` in `manifest.json` limited to the deployed Cloudflare Worker domain. No `<all_urls>`.
- 100% outbound HTTPS/WSS (port 443). Zero local inbound ports, no Windows Firewall alterations.
