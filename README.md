# Chess Topper — Analysis Bar (MV3)

A Chrome/Chromium extension scaffold for local analysis boards. It provides a white/black evaluation bar, a best-move arrow overlay, and settings for bar/arrow/depth. It intentionally runs only on URLs whose path/query looks like analysis, study, review, or puzzle; it is not intended for live rated games.

## Install
1. Open `chrome://extensions` in desktop Chrome/Chromium.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository folder.
4. Open a supported site's analysis/study/review page and click the extension icon to configure it.

## Important engine asset note
The uploaded `stockfish-19-lite.js` wrapper expects the matching `stockfish-19-lite.wasm` engine binary (and, depending on the distribution build, `stockfish-19-lite.worker.js`) beside it. Those companion assets were not included with the uploaded file, so engine analysis cannot run until matching files from the same Stockfish.js 19 Lite distribution are added. The engine wrapper itself is not included in this GitHub commit yet; add the original licensed file locally before testing. No external scripts or remote code are fetched by this extension.

## Current limitations
- Board DOM layouts vary; this starter detects common Chess.com and Lichess board markup but needs site-specific testing for each page/layout.
- FEN extraction currently assumes White to move and does not yet infer castling rights, en-passant target, move counters, or orientation in every site layout. Treat results as a prototype until verified against known positions.
- The extension is intended for analysis, study, puzzles, and post-game review—not assistance during live rated/competitive games.

## License
The Stockfish.js wrapper supplied by the user retains its upstream GPLv3 copyright/license header. Include matching upstream license and notices for all engine files before redistributing them.