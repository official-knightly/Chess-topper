# Chess Topper — Analysis Bar (Manifest V3)

Chess Topper provides an evaluation bar, best-move arrow, principal variation, and server/local analysis choices on supported chess analysis, study, puzzle, and review pages. It is intended for analysis and post-game review—not live rated games.

## Install

1. Download or clone this repository.
2. On desktop Chrome/Chromium, open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Choose this folder, then reload the chess analysis page.
4. Open the extension popup and select the analysis source.

## Analysis source

- **Auto: server → WASM** — try the Stockfish API; if it errors or does not respond within 1 second, switch to local Stockfish WASM.
- **Local WASM** — analyze locally without a server request.
- **Server only** — use the remote API only.

The API key is optional because the API allows limited keyless requests. If supplied, it is stored in `chrome.storage.local` for this browser profile. Do not commit or share it. Remote results are parsed from the current API's `eval`, `bestmove`, and `pvs` response fields. API availability and quotas still apply.

## Local engine

GitHub Actions downloads the official Stockfish.js 19.0.1 **lite single-threaded** release, verifies published SHA-256 checksums and WASM magic bytes, then commits:

- `engine/stockfish-19-lite-single.js`
- `engine/stockfish-19-lite-single.wasm`

The single-threaded build avoids the cross-origin isolation requirement that the multithreaded build would impose on chess sites. The WASM file is stored using Git LFS; GitHub's source view may show an LFS pointer, but the workflow log confirms the actual 1.8 MB binary was uploaded to LFS and verified.

The previous `engine/stockfish-19-lite.js` file is a multithreaded loader and is **not used** by the current manifest. Do not substitute it for the single-threaded pair.

Stockfish is GPLv3. Preserve upstream license and copyright notices when redistributing.

## Project layout

- `manifest.json` — extension manifest and engine resource permissions
- `html/popup.html`, `js/popup.js`, `css/popup.css` — settings popup
- `js/board.js`, `css/style.css` — analysis overlay and board reader
- `js/background.js` — server API requests and timeout
- `engine/stockfish-19-lite-single.js` + `.wasm` — local Stockfish engine
- `scripts/smoke-stockfish.mjs` — CI test that starts the engine and requests a move

## Known limitations

- The engine itself now passes a real UCI smoke test in GitHub Actions, but browser-level testing on each chess site is still needed.
- The extension only activates on analysis/study/review/puzzle-style URL paths; site URL patterns and board DOM may change.
- The reader prefers a site's native FEN when exposed. Otherwise it estimates FEN from piece DOM. That fallback cannot reliably recover castling rights or en-passant state and may not know whose turn it is; the panel labels those positions as estimated. Do not trust estimated-FEN results for exact game analysis.
- Server requests time out after 1 second by design. Slow servers will cause local fallback even if they might eventually respond.

## References

- [Stockfish API evaluation endpoint](https://stockfishapi.com/docs/api/evaluatePosition)
- [Official Stockfish.js 19.0.1 release](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1)


## Engine and arrow behavior

The local fallback uses the official **Stockfish.js 19 Lite single-threaded** JS/WASM pair. It is deliberately compact and does not require cross-origin isolation, but it is weaker than the full Stockfish 19 build. The full multi-threaded build can use multiple CPU threads but needs cross-origin isolation (`SharedArrayBuffer`); the full single-threaded build avoids that requirement at the cost of using one thread. A `.wasm` filename alone does not identify the strength—the matching JavaScript loader and WASM file must come from the same distribution variant.

The best-move arrow accounts for black-side board orientation and the Chess.com `wc-chess-board` element, keeps its position current after scrolling/resizing, and offsets its arrowhead so it does not sit directly over the destination piece. Server requests have a longer timeout before Auto mode falls back to local WASM.
