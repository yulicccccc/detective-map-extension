# AGENTS.md - Detective Map Extension

## Project Overview
- **Project Name**: `detective-map-extension`
- **Core Philosophy**: Read on the left. Think on the right.
- **Scope**: Manifest V3 Chrome Extension + Standalone Canvas Window with Apple Pencil & Stylus Ink Layer.

---

## Strict Security & Token Rules
1. **Zero Credential / Token Leak**:
   - DO NOT write any Personal Access Token, OAuth Token, Password, or API Key into Git remote URLs, source code, commit messages, command line history, chat messages, or execution reports.
   - DO NOT execute `gh auth token` or print GitHub authentication tokens to stdout/logs.
   - Git remote MUST remain a clean standard HTTPS URL (e.g. `https://github.com/<user>/detective-map-extension.git`).
   - If authentication is required, rely on the official Git Credential Manager or interactive browser authentication.

---

## Technical Constraints & Boundaries (V1 Locked)
- **Architecture**: Plain Manifest V3 Chrome Extension.
- **Allowed Tech**: Vanilla HTML5, Vanilla CSS3, Vanilla JavaScript (ES6+), `chrome.storage.local`, `chrome.sidePanel`, `chrome.contextMenus`.
- **Strictly Forbidden**:
  - No React, Vue, Svelte, Tailwind, Babel, npm build steps, Vite, Webpack.
  - No external CDNs (all assets, scripts, styles must be local and self-contained).
  - No AI APIs, OCR, handwriting recognition, cloud databases, backend servers, or login systems.
  - No DOM-scraping hacks inside ChatGPT (source of truth is selected text, URL, page title, timestamp).

---

## Core Invariants
1. **World Coordinate System**:
   - All quote cards and ink strokes MUST be stored in World Coordinates.
   - Card and ink positions are invariant under zoom, pan, window resize, and display dragging (Windows <-> iPad).
2. **Unified Persistence**:
   - `chrome.storage.local` is the sole source of truth for cards, ink strokes, and canvas viewport state.
   - Side Panel and Canvas Window must synchronize bidirectionally in real-time via `chrome.storage.onChanged`.
3. **Pointer Event Support**:
   - Ink layer must listen to Pointer Events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) with `touch-action: none` to support Mouse, Touch, and Stylus/Pen (Apple Pencil).
