# Assets

The local engine is downloaded automatically by the GitHub Actions workflow from the official Stockfish.js release. You do not need to upload a ZIP manually.

Workflow: [Install and verify local Stockfish WASM](../.github/workflows/fetch-stockfish-assets.yml)

It installs the matching single-threaded JS and WASM pair in `engine/`, verifies SHA-256 checksums and the WASM magic bytes, then commits the files with Git LFS handling for `.wasm`.
