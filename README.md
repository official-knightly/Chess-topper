# Chess Topper — Analysis Bar (Manifest V3)

Chess Topper provides an evaluation bar, best-move arrow, principal variation, and server/local analysis choices on supported live, analysis, study, puzzle, and review pages. Use engine assistance only where the chess site permits it.

## Install

1. Download or clone this repository.
2. On desktop Chrome/Chromium, open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Choose this folder, then reload the chess analysis page.
4. Open the extension popup and select the analysis source.

## Analysis source

- **Auto: server → WASM** — try the Stockfish API; if it errors or does not respond within 1.5 seconds, switch to local Stockfish WASM.
- **Berserk WASM (local)** — use the Berserk engine directly in the browser; this is the default engine and does not need a server API.
- **Local WASM** — analyze with the currently selected local engine (Berserk, Stockfish 19, or Dragon).
- **Auto: server → WASM** — try the Stockfish API; if it errors or does not respond within 1.5 seconds, switch to the selected local WASM engine.
- **Server only** — use the remote API only.

The API key is optional because the API allows limited keyless requests. If supplied, it is stored in `chrome.storage.local` for this browser profile. Do not commit or share it. Remote results are parsed from the current API's `eval`, `bestmove`, and `pvs` response fields. API availability and quotas still apply.

## Local engine

GitHub Actions downloads the official Stockfish.js 19.0.1 **full single-threaded** release and synchronizes the matching Berserk wasm-bindgen JavaScript and WASM files from [Berserk Web](https://github.com/official-knightly/Berserk-web). It validates both binaries, runs engine smoke tests, and commits the assets. The Berserk WASM file is tracked with Git LFS.

- `engine/stockfish-19.js`
- `engine/stockfish-19.wasm`

This is the **full neural-network build**, not Lite. It avoids the cross-origin isolation requirement that prevents the multithreaded build from working reliably when an extension runs on third-party chess websites. It uses one CPU thread; the full multithreaded build can be faster on supported isolated pages, but cannot be guaranteed to run on every supported site. The WASM file is stored using Git LFS.

Do not mix the JavaScript loader and WASM file from different variants.

Stockfish is GPLv3. Preserve upstream license and copyright notices when redistributing.

## Project layout

- `manifest.json` — extension manifest and engine resource permissions
- `html/popup.html`, `js/popup.js`, `css/popup.css` — settings popup
- `js/engine-loader.js` — Stockfish and Berserk/WASM worker bootstraps
- `js/board.js`, `css/style.css` — analysis overlay and board reader
- `js/background.js` — server API requests and timeout
- `engine/berserk/berserk.js` + `berserk_bg.wasm` — matching Berserk WebAssembly bindings and engine binary (WASM tracked with Git LFS)
- `engine/stockfish-19.js` + `.wasm` — full Stockfish 19 local engine
- `scripts/smoke-stockfish.mjs` — CI test that starts Stockfish and requests a move
- `scripts/smoke-berserk.mjs` — CI test that initializes Berserk WASM and verifies a UCI best move

## Known limitations

- The engine is checked with a UCI smoke test in GitHub Actions; browser-level testing on each chess site is still needed. The full engine is approximately 94 MB combined, so first load can be slow and uses substantial storage.
- The extension activates on supported chess domains and chooses the largest visible board, so it can follow live games as well as analysis/review boards. Site URL patterns and board DOM may change.
- The reader prefers a site's native FEN when exposed. Otherwise it estimates FEN from piece DOM. That fallback cannot reliably recover castling rights or en-passant state and may not know whose turn it is; the panel labels those positions as estimated. Do not trust estimated-FEN results for exact game analysis.
- Server requests time out after 1.5 seconds by design. Slow servers will cause local fallback even if they might eventually respond.

## References

- [Stockfish API evaluation endpoint](https://stockfishapi.com/docs/api/evaluatePosition)
- [Official Stockfish.js 19.0.1 release](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1)


## Engine and arrow behavior

The default local engine is now Berserk WASM. Chess Topper loads its wasm-bindgen bundle into an isolated classic worker and adapts UCI commands so the existing analysis panel can consume its `info` and `bestmove` output. Stockfish 19 remains available as an alternate local engine.

The best-move arrow accounts for black-side board orientation and the Chess.com `wc-chess-board` element, keeps its position current after scrolling/resizing, and offsets its arrowhead so it does not sit directly over the destination piece. Auto mode starts the local worker while the server is being tried, then falls back quickly when the server is unavailable.
