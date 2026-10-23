# Chess Topper — Analysis Bar (Manifest V3)

A Chrome/Chromium extension scaffold for local analysis boards. It provides an evaluation bar, a best-move arrow overlay, and popup settings for bar/arrow/depth. It is designed for analysis, study, puzzles, and post-game review—not live rated games.

## Project structure

```text
Chess-topper/
├── manifest.json
├── html/
│   └── popup.html
├── js/
│   ├── board.js
│   └── popup.js
├── css/
│   ├── style.css
│   └── popup.css
├── engine/
│   └── README.md
├── assets/
│   └── README.md
└── README.md
```

## Install
1. Open `chrome://extensions` in desktop Chrome/Chromium.
2. Enable Developer mode.
3. Choose **Load unpacked** and select the repository folder containing `manifest.json`.
4. Open a supported site's analysis/study/review page and click the extension icon to configure it.

## Engine assets still required

The code expects the matching Stockfish.js wrapper and its companion WASM/worker files in `engine/`:
- `engine/stockfish-19-lite.js`
- `engine/stockfish-19-lite.wasm`
- `engine/stockfish-19-lite.worker.js` (if required by that exact build)

These files are not yet present, so engine analysis cannot run until matching assets from the same distribution are added. Preserve upstream GPLv3 license and copyright notices.

## Current limitations
- Board DOM layouts vary; Chess.com, Lichess, and WorldChess layouts have not yet been fully tested.
- FEN extraction currently assumes White to move and does not infer castling rights, en-passant target, or move counters. Treat it as a prototype until verified against known positions.
- The extension is restricted by code to analysis/study/review/puzzle URL patterns; site-specific path handling still needs testing.
