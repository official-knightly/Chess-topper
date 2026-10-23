# Chess Topper — Analysis Bar (Manifest V3)

Chess Topper provides an evaluation bar, best-move arrow, principal variation, and server/local analysis choices on supported chess analysis, study, puzzle, and review pages. It is intended for analysis and post-game review—not live rated games.

## Install

1. Download or clone this repository.
2. On desktop Chrome/Chromium, open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Choose this folder, then reload the chess analysis page.
4. Open the extension popup and select the analysis source.

## Analysis source

- **Auto: server → WASM** — try the configured Stockfish API; on error or a 1-second timeout, switch to local Stockfish WASM.
- **Local WASM** — analyze locally without a server request.
- **Server only** — use the configured API only.

The API key is stored in `chrome.storage.local` for this browser profile. Do not commit or share it. Server analysis depends on API access, quota, and the API response schema.

## Local engine files

GitHub Actions downloads the official Stockfish.js 19.0.1 **lite single-threaded** distribution from [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1), verifies its published SHA-256 checksums and WASM magic bytes, and commits:

- `engine/stockfish-19-lite-single.js`
- `engine/stockfish-19-lite-single.wasm`

The single-threaded build is intentional: it does not require cross-origin isolation headers that a browser extension cannot impose on chess.com, Lichess, or WorldChess pages. It is smaller than the full engine and does not use multiple CPU threads.

Stockfish is GPLv3. Preserve upstream license/copyright notices and review the upstream release terms when redistributing.

## Known limitations to test

- Chess sites change their board DOM frequently; each supported site's analysis page must be tested in a real browser.
- When the site does not expose its actual FEN, the fallback reader currently reconstructs piece placement only and assumes White to move, no castling rights, no en-passant square, and move counters `0 1`. That is not sufficient for exact analysis of arbitrary positions. Reliable full-position analysis requires reading the site's actual FEN or reconstructing it from the complete move history.
- The remote API may return a different JSON shape than the parser expects. If server mode fails, check the extension status and the API's current documentation.

