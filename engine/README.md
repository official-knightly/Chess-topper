# Engine assets

## Stockfish 19 Lite

The extension's Stockfish wrapper is `stockfish-19-lite.js`. It loads two companion files relative to itself:

- `stockfish.wasm` — the WebAssembly binary from the matching Stockfish.js 19.0.0 lite distribution.
- `stockfish.worker.js` — the pthread worker used by the multi-threaded wrapper, if included by the upstream package.

The GitHub Actions workflow `.github/workflows/fetch-stockfish-assets.yml` downloads the companion assets from the published `stockfish@19.0.0` npm package and commits them into this directory. Check the Actions tab if the files do not appear. Do not mix JS and WASM files from different Stockfish.js versions.

The extension requests two threads. Multi-threaded WASM needs cross-origin isolation; the extension manifest declares COOP/COEP policies, but actual support still needs to be checked in the installed browser. If the browser cannot start the threaded build, use the upstream single-threaded lite pair instead and remove the Threads option.

## Andromeda

The selector and loader are wired for these local files:

- `andromeda.js` — a browser-compatible UCI worker wrapper
- `andromeda.wasm` — Andromeda compiled to WASM
- `andromeda.worker.js` — only if that wrapper requires a separate worker

**These Andromeda files are not in the repository yet.** The native C++ engine cannot run directly in a browser extension; it must be compiled for WebAssembly with a UCI-compatible worker wrapper. Until those files are added, selecting Andromeda should show an engine-load error rather than silently running Stockfish.

## Licensing

Stockfish.js is GPL-3.0. Keep the upstream copyright and license notices and provide the corresponding source/license when distributing the engine. Andromeda's own source and license notices must also be preserved.
