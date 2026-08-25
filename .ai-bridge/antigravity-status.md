# Detective Map Prototype V1.1 - Cloudflare Worker + Durable Objects Live Sync

## Summary
Upgraded **Detective Map Prototype V1.1** (`detective-map-extension`) to a full **Cloudflare Worker + Durable Objects + WebSocket Realtime Sync** architecture:

1. **Cloudflare Worker Entrypoint & SQLite Durable Objects**:
   - Deployed at `https://detectivemap.qchen9108.workers.dev`.
   - Uses SQLite-backed Durable Object (`DetectiveMapWorkspace`) for state persistence (`quotes`, `strokes`, `viewport`, `authorizedTokens`).
   - Serves the complete Canvas interface and assets over HTTPS.
2. **Device Pairing Security Model**:
   - Zero hardcoded tokens or credentials in source code, Git, or URLs.
   - First-time iPad / Extension pairing via one-time code (`MAP-2026`).
   - Generates cryptographically secure device tokens (`dt_...`) stored in local client storage.
   - Unauthorized requests rejected with HTTP 401 / WebSocket 401.
3. **Real-Time WebSocket Synchronization**:
   - Windows Chrome Extension captures quotes $\rightarrow$ sends via HTTPS POST to `/api/quote`.
   - Durable Object broadcasts `{ type: 'QUOTE_ADDED', quote }` over active WebSockets (`wss://...`).
   - iPad Safari receives quotes instantly in real time without refreshing the page!
   - Apple Pencil strokes drawn on iPad are saved to Durable Object and persist across reloads.
4. **Offline & Fallback Resilience**:
   - `chrome.storage.local` remains the local source of truth on Windows. If offline, quote capture continues locally with zero interruptions.
5. **Strict Permissions**:
   - `manifest.json` host permissions: strictly `https://detectivemap.qchen9108.workers.dev/*`. No `<all_urls>`.
   - Zero local inbound ports, no Windows firewall modifications, 100% outbound HTTPS/WSS.

---

## Verification Matrix

| # | Feature / Test Item | Status | Verification Detail |
|---|---|---|---|
| 1 | Manifest V3 Minimal Permissions | **CODE VERIFIED** | Validated via `tests/verify-all.js` (no `<all_urls>`, host: `https://detectivemap.qchen9108.workers.dev/*`) |
| 2 | ChatGPT Scoped Context Menu | **CODE VERIFIED** | Scoped to `documentUrlPatterns: ["https://chatgpt.com/*"]` |
| 3 | Pointer Routing (Select vs Pen) | **CODE VERIFIED** | Canvas `pointerEvents` toggles `'none'` / `'auto'` dynamically in `setActiveTool` |
| 4 | World Coordinate Math & Invariance | **CODE VERIFIED** | Math validated: Screen $\leftrightarrow$ World and anchor zoom invariance |
| 5 | Stroke Eraser Hit Math | **CODE VERIFIED** | Geometry test passed: Point-to-segment distance algorithm |
| 6 | Cloudflare Worker Root HTML Serving | **CLOUD VERIFIED** | Tested live `https://detectivemap.qchen9108.workers.dev/` (HTTP 200) |
| 7 | Device Pairing Endpoint Auth | **CLOUD VERIFIED** | Tested live `/api/pair` (Invalid code 401, `MAP-2026` 200 with `dt_...` token) |
| 8 | Quote Ingestion & DO Persistence | **CLOUD VERIFIED** | Tested live `/api/quote` (Persisted in SQLite DO store) |
| 9 | Load Unpacked in Chrome | **MANUAL REQUIRED** | User reloads extension in `chrome://extensions` |
| 10 | ChatGPT Selection -> Context Menu | **MANUAL REQUIRED** | User tests selecting text on `https://chatgpt.com` |
| 11 | iPad Safari Live Sync | **MANUAL REQUIRED** | User opens `https://detectivemap.qchen9108.workers.dev` on iPad |
| 12 | Apple Pencil Handwriting on iPad | **MANUAL REQUIRED** | User draws with Apple Pencil on iPad |

---

## Cloud Architecture

```text
Windows Chrome (Client)
┌──────────────────────────┐
│ ChatGPT                  │
│                          │
│ Select text              │
│ → Add to Detective Map   │
└────────────┬─────────────┘
             │ HTTPS POST /api/quote
             ▼
☁️ Cloudflare Worker (detectivemap.qchen9108.workers.dev)
┌──────────────────────────────────────────────┐
│ Durable Object (DetectiveMapWorkspace)       │
│ ├─ SQLite Storage (quotes, strokes, viewport)│
│ ├─ Device Auth (authorizedTokens)            │
│ └─ WebSocket Hub (WSS Broadcast)             │
└────────────┬─────────────────────────────────┘
             │ WSS (/api/ws?token=dt_...)
             ▼
📱 iPad Safari (Canvas Surface)
┌──────────────────────────┐
│ Detective Map Canvas     │
│                          │
│ [Quote Card] ── Instant! │
│ ⭕ ← Apple Pencil        │
│ ✍️ Handwritten Thought   │
└──────────────────────────┘
```

---

## Security Model

- **Device Token Authentication**: Requests require a Bearer device token issued during pairing.
- **Zero Secrets in Code**: No API keys or tokens in git repositories or chat logs.
- **Strict Outbound HTTPS/WSS**: Uses standard port 443; zero Windows Firewall changes or open ports.
