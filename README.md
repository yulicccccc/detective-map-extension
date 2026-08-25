# Detective Map Extension 🔍✍️

> **Read on the left. Think on the right.**

Detective Map is a lightweight spatial knowledge canvas and Apple Pencil handwriting companion for ChatGPT and web reading. 

Windows main screen is used for reading and research. When you spot an insightful sentence, highlight it, right-click, and send it straight to Detective Map. Drag the standalone Detective Map Canvas Window to your iPad (extended via spacedesk) and freely annotate, connect, highlight, and circle ideas with Apple Pencil.

---

## 🌟 Key Features

- **Minimum Manual Effort, Maximum Cognitive Ownership**:
  - 1-Click capture from ChatGPT or any webpage via context menu (`Add to Detective Map`).
  - Automatically captures selected text, source conversation URL, page title, and timestamp.
- **Dual UI Experience**:
  - **Side Panel**: Compact sidebar for fast capture verification and quote browsing.
  - **Standalone Canvas Window (`canvas.html`)**: Clean full-screen canvas designed specifically to be moved onto your iPad extended screen.
- **Apple Pencil & Stylus Handwriting**:
  - 👆 **Select**: Drag quote cards and pan the infinite canvas.
  - ✍️ **Pen**: Native Pointer Events (`mouse`, `touch`, `pen`) with smooth ink curves and pressure detection.
  - 🖍 **Highlighter**: Semi-transparent, wide strokes that never obscure underlying text.
  - 🧽 **Stroke Eraser**: Deletes entire touched strokes instantly.
  - ↩ **Undo**: Multi-level undo for strokes, erasures, and card repositioning (`Ctrl+Z` / `Cmd+Z`).
- **Unified World Coordinate System**:
  - Quote cards and handwritten ink strokes share the exact same infinite 2D world space.
  - Pan, zoom (20%–400%), window resize, and moving across screens maintain 100% stable relative positions.
- **Unified Local Persistence**:
  - All quotes, strokes, and canvas viewport state are synchronized live across windows via `chrome.storage.local`.
  - Full JSON backup export and import.

---

## 🚀 Quick Start (Load Unpacked in Chrome)

1. Open Google Chrome.
2. Navigate to: `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (top-left button).
5. Select the `detective-map-extension` folder.
6. The Detective Map extension icon will appear in your Chrome toolbar.
7. Click the extension icon to open the **Side Panel**, or click **Open Canvas** to launch the full-screen canvas window!

---

## 📱 Windows + iPad Second Screen Setup (spacedesk)

To use your iPad as an extended display with Apple Pencil input:

### 1. Windows PC Setup:
1. Download and install the official Windows DRIVER from [spacedesk.net](https://www.spacedesk.net/).
2. Restart Windows or ensure the `spacedeskService` is running.

### 2. iPad Setup:
1. Install **spacedesk (multi monitor display)** from the Apple App Store on your iPad.
2. Ensure Windows PC and iPad are connected to the **same Wi-Fi network** (or USB tethering).
3. Open spacedesk Viewer on iPad and tap your Windows PC's name to connect.
4. On Windows: Press `Win + P` and select **Extend** (or go to `Settings -> System -> Display -> Extend these displays`).

### 3. Canvas Window on iPad:
1. In the Detective Map Side Panel, click **Open Canvas**.
2. Drag the opened `canvas.html` window across the edge of your screen onto the iPad display.
3. Maximize or adjust the window on the iPad.
4. Pick up your **Apple Pencil** to write, highlight, and organize your ideas!

---

## 🛠️ Architecture & Tech Stack

- **Manifest Version**: Manifest V3
- **Frontend**: Vanilla HTML5, Vanilla CSS3, Vanilla JavaScript (ES6+)
- **Storage**: `chrome.storage.local` with real-time `chrome.storage.onChanged` event bus
- **Rendering**: Hybrid DOM + Hardware-Accelerated HTML5 2D Canvas (crisp typography + high-DPI ink)
- **Zero External Dependencies**: No React, no Tailwind, no npm build step, no external CDNs, no cloud servers, 100% private and local.

---

## 📄 License

MIT License.
