# Detective Map Prototype V1 - Hardening & Execution Status Report

## Summary
Applied ChatGPT hardening patch to **Detective Map Prototype V1** (`detective-map-extension`):

1. **Fix 1 — Minimal Permissions & ChatGPT Scoping**:
   - Completely removed `content_scripts` and broad `<all_urls>` from `manifest.json`.
   - Deleted `content-script.js` and removed non-essential Alt+D capture shortcut.
   - Scoped the `"Add to Detective Map"` context menu specifically to `documentUrlPatterns: ["https://chatgpt.com/*"]`.
2. **Fix 2 — Ink Canvas & Quote Card Pointer Routing**:
   - In `Select` mode: `inkCanvas.style.pointerEvents = 'none'`, allowing direct click, drag, source link navigation, and text selection on Quote Cards.
   - In `Pen` / `Highlighter` / `Eraser` mode: `inkCanvas.style.pointerEvents = 'auto'`, allowing handwritten annotations and highlights to overlay cards without permanently blocking future card interactions.
   - Background canvas panning is handled directly on `#viewport-container` and via Middle Click / Space+Drag across all modes.
3. **Fix 3 — Strict Verification Semantics**:
   - All items explicitly classified into `CODE VERIFIED` (proven by static analysis & unit tests) vs `MANUAL REQUIRED` (requiring human testing in Chrome / iPad). No fake `BROWSER PASS` claims.
4. **Fix 4 — Status Maintenance**:
   - Replaced fragile hardcoded commit hashes with dynamic implementation references.

---

## Files Changed

- `manifest.json`: Removed `content_scripts` to adhere strictly to minimal permissions.
- `service-worker.js`: Scoped context menu to `https://chatgpt.com/*` and removed unused message handlers.
- `canvas.js`: Dynamic pointer routing between `select` and drawing tools (`pen`, `highlighter`, `eraser`).
- `tests/verify-all.js`: Updated automated test suite to 9 tests covering manifest permissions, ChatGPT scoping, and pointer-events routing.
- `AGENTS.md`: Updated security and scope boundaries.
- `.ai-bridge/current-plan.md`: Updated task tracking.
- `.ai-bridge/antigravity-status.md`: Comprehensive report with strict verification semantics.
- `content-script.js`: Deleted.

---

## GitHub

- **Repository URL**: `https://github.com/yulicccccc/detective-map-extension`
- **Remote Origin**: `https://github.com/yulicccccc/detective-map-extension.git` (Clean HTTPS, Zero Tokens)
- **Branch**: `main`

---

## Windows & Environment Setup

- **Windows Version**: Microsoft Windows 11 Enterprise (Version 10.0.26200, Build 26200)
- **Google Chrome**: Installed (`C:\Program Files\Google\Chrome\Application\chrome.exe`)
- **Git Version**: `git version 2.54.0.windows.1`
- **spacedesk Driver**: Not installed on Windows.
  - **Action Required for User**:
    1. Download Windows Driver: [https://www.spacedesk.net/](https://www.spacedesk.net/)
    2. Run installer with Administrator approval.
    3. Install spacedesk Viewer on iPad and connect over Wi-Fi.

---

## Verification Matrix

| # | Feature / Test Item | Status | Verification Detail |
|---|---|---|---|
| 1 | Manifest V3 Minimal Permissions | **CODE VERIFIED** | Validated via `tests/verify-all.js` (no `content_scripts`, permissions: `storage`, `contextMenus`, `sidePanel`, `activeTab`) |
| 2 | ChatGPT Scoped Context Menu | **CODE VERIFIED** | Scoped to `documentUrlPatterns: ["https://chatgpt.com/*"]` |
| 3 | Pointer Routing (Select vs Pen) | **CODE VERIFIED** | Canvas `pointerEvents` toggles `'none'` / `'auto'` dynamically in `setActiveTool` |
| 4 | World Coordinate Math & Invariance | **CODE VERIFIED** | Math validated: Screen $\leftrightarrow$ World and anchor zoom invariance |
| 5 | Stroke Eraser Hit Math | **CODE VERIFIED** | Geometry test passed: Point-to-segment distance algorithm |
| 6 | Domain & Time Formatting | **CODE VERIFIED** | Unit test passed for ChatGPT URLs and ISO timestamps |
| 7 | Storage Schema & Backup Integrity | **CODE VERIFIED** | Export/Import serialization tested and verified |
| 8 | Load Unpacked in Chrome | **MANUAL REQUIRED** | User opens `chrome://extensions` and loads folder |
| 9 | Click Extension -> Side Panel Opens | **MANUAL REQUIRED** | Test side panel appearance in real browser |
| 10 | ChatGPT Selection -> Context Menu | **MANUAL REQUIRED** | Test selecting text on `https://chatgpt.com` |
| 11 | Quote Appears in Side Panel & Canvas | **MANUAL REQUIRED** | Test live sync across panels |
| 12 | Quote Card Drag & Source Link Click | **MANUAL REQUIRED** | Test header dragging and link click in Select mode |
| 13 | Drawing over Cards in Pen Mode | **MANUAL REQUIRED** | Test pen stroke overlay on top of Quote Cards |
| 14 | Highlighter & Stroke Eraser UI | **MANUAL REQUIRED** | Test visual highlight and stroke deletion |
| 15 | Undo (`Ctrl+Z`) | **MANUAL REQUIRED** | Test undoing ink strokes and card movements |
| 16 | Data Persistence on Window Reopen | **MANUAL REQUIRED** | Test closing and reopening Canvas Window |
| 17 | spacedesk Windows $\rightarrow$ iPad Extend | **MANUAL REQUIRED** | Test physical display extension |
| 18 | Apple Pencil Tap & Stroke on iPad | **MANUAL REQUIRED** | Test physical Apple Pencil handwriting |

---

## Security Verification

- [x] **No Token Leaks**: Verified `.git/config`, source code, and command history contain no PAT or OAuth tokens.
- [x] **Clean HTTPS Remote**: Remote origin is `https://github.com/yulicccccc/detective-map-extension.git`.
- [x] **No Hardcoded Secrets / API Keys**: Pure client-side Manifest V3 extension.
- [x] **No Broad Page Access**: No `<all_urls>` content scripts; scoped exclusively to ChatGPT context menus.

---

## Remaining Items for Human Verification

1. **Chrome Load Unpacked**: Load `detective-map-extension` into Chrome.
2. **ChatGPT Capture Test**: Select text in ChatGPT and verify quote card generation.
3. **Select Mode Test**: Verify card dragging and source link opening.
4. **Pen Mode Test**: Verify writing on top of cards.
5. **iPad Apple Pencil Test**: Connect iPad via spacedesk and test handwriting.
