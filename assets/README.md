# Assets

This folder stores extension assets and the optional local-engine archive.

## Add the Stockfish WASM archive

If `engine/stockfish.wasm` is not present in GitHub, upload a file named **`stockfish-wasm.zip`** into this folder. The ZIP must contain the real `.wasm` binary and its matching `stockfish.worker.js` from the **same Stockfish.js build**. The files may be inside a subfolder in the ZIP.

After pushing `assets/stockfish-wasm.zip`, GitHub Actions will extract the files, verify the WASM magic bytes, and commit the usable files as:

- `engine/stockfish.wasm`
- `engine/stockfish.worker.js`

Do not ZIP a Git LFS pointer text file in place of the actual binary. A real WASM file starts with bytes `00 61 73 6d`.

Keep the Stockfish GPLv3 license and copyright notices with the matching distribution. Use the extension only for analysis, study, puzzles, and post-game review—not live rated games.
