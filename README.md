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


## Server and local analysis modes

The popup offers three modes: **Auto** tries the Stockfish API for up to 1 second and then starts local WASM; **Local WASM** never calls the server; **Server only** does not fall back. The API key is stored in this browser profile's `chrome.storage.local`; never commit or share it. Remote depth is capped at 14. The server response schema and local engine assets must match the actual service/build to produce valid results.

The extension is intended for analysis, study, puzzles, and post-game review—not live rated games. See the [Stockfish API reference](https://stockfishapi.com/docs/api/evaluatePosition).

The extension can request evaluations from `https://stockfishapi.com/v1/eval` first. In the extension popup, paste a **newly rotated** API key and apply settings. The key is stored in this browser profile's `chrome.storage.local`; it is not embedded in source files. Do not commit or share the key. The API free tier supports depth up to 14, so remote requests cap depth at 14. If a server request fails or times out, Chess Topper tries its local Stockfish worker.

The local fallback still requires matching Stockfish JS/WASM assets in `engine/`; those assets are not included in this repository at present, so fallback will not work until they are added. API access and quotas are controlled by Stockfish API. See [API reference](https://stockfishapi.com/docs/api/evaluatePosition).
