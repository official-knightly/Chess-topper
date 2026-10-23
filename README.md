# Chess Topper — Analysis Bar (Manifest V3)

Chess Topper adds an evaluation bar, best-move arrow, engine line, and analysis status to supported chess analysis/study/review pages. It is intended for analysis, puzzles, and post-game review—not live rated games.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in desktop Chrome/Chromium and enable **Developer mode**.
3. Select **Load unpacked** and choose this folder.
4. Open a supported analysis/study/review page and open the extension popup.

## Choose the analysis source

The popup offers three modes:

- **Auto: server → WASM** — request server analysis; if it has not responded within 1 second or fails, switch to local WASM.
- **Local WASM** — run the local Stockfish engine without calling the server.
- **Server only** — use the remote Stockfish API and do not fall back to local.

The Stockfish API key is stored in this browser profile's `chrome.storage.local`. Never commit or share the key. Remote depth is capped at 14.

## Install the local WASM engine

The JavaScript loader is in `engine/stockfish-19-lite.js`. Local analysis also needs a **real, matching WASM binary** and the matching worker file:

- `engine/stockfish.wasm`
- `engine/stockfish.worker.js`

If those files are missing from GitHub, add `assets/stockfish-wasm.zip`. It must contain the real `.wasm` file and its matching worker from the same Stockfish.js distribution. The files may be inside a folder in the ZIP. Push the ZIP to `main`; the **Install local Stockfish WASM assets** GitHub Actions workflow extracts, validates, and commits the engine files.

A valid WASM binary starts with bytes `00 61 73 6d`. A file starting with `version https://git-lfs.github.com/spec/v1` is only a Git LFS pointer, not the binary itself. Git LFS is configured for `.wasm` and `.zip` files.

Preserve Stockfish's GPLv3 license and upstream copyright notices. The WASM and worker must match the JavaScript loader; renaming an unrelated binary is not sufficient.

## Current limitations

- The repository's WASM binary and matching worker are **not currently present in GitHub**, so local fallback cannot be verified until the ZIP is added and the workflow succeeds.
- Board layouts vary by site. Chess.com, Lichess, and WorldChess still need hands-on testing on each site's analysis pages.
- When the page does not expose its actual FEN, the fallback board reader currently assumes White to move and does not infer castling rights, en-passant square, or move counters. This can make engine results incorrect for some positions; it must be fixed before treating the extension as reliable.
- Remote response fields depend on the Stockfish API response schema and API availability.

See the [Stockfish API reference](https://stockfishapi.com/docs/api/evaluatePosition).
