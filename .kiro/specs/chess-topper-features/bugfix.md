# Bugfix Requirements Document

## Introduction

Chess Topper (v0.4.0) is a Chrome MV3 extension that overlays a Stockfish evaluation bar and best-move arrow on chess.com, lichess.org, and worldchess.com. This document captures requirements for seven new features and fixes required to reach v0.5.0:

1. **Auto-update notification** — detect a newer GitHub manifest version and surface a dismissable badge on the floating panel and popup.
2. **Post-game analysis** — classify every move in a completed game (Best / Good / Inaccuracy / Mistake / Blunder) using the local WASM engine, with a compact floating move-list UI.
3. **Engine switcher** — allow the user to cycle through all four bundled engines (Stockfish 19, Dragon, Rodent IV, Explanation Engine) directly from the floating panel.
4. **Integrity lock** — halt all analysis and arrow features silently if any JS or CSS file has been tampered with, validated against a build-time SHA-256 hash manifest.
5. **Git LFS for large binaries** — track `*.wasm` and large engine JS files through Git LFS and update the GitHub Actions workflow accordingly.
6. **Remote push** — re-point the git remote to `https://github.com/official-knightly/Chess-topper.git` and push all changes including LFS objects.
7. **Version bump** — update `manifest.json` from `0.4.0` to `0.5.0`.

---

## Bug Analysis

### Current Behavior (Defect)

**Feature 1 — Auto-update notification (missing)**

1.1 WHEN the extension starts and a newer version exists on GitHub THEN the system does not notify the user and the floating panel shows no update indicator.

1.2 WHEN the user opens the popup after a newer GitHub version is available THEN the system shows no badge or banner indicating an update is available.

**Feature 2 — Post-game analysis (missing)**

1.3 WHEN a game ends on chess.com, lichess.org, or worldchess.com THEN the system does not offer any per-move classification overlay, so the user must leave the extension to see move quality.

1.4 WHEN the user wants to review move quality after a game THEN the system provides no floating "Analyze" trigger button on the board overlay.

1.5 WHEN post-game analysis is triggered THEN the system does not classify individual moves into Best / Good / Inaccuracy / Mistake / Blunder categories.

**Feature 3 — Engine switcher (missing)**

1.6 WHEN the user wants to switch from Stockfish 19 to Dragon, Rodent IV, or the Explanation Engine THEN the system requires opening the popup and there is no inline switcher on the floating panel.

1.7 WHEN an alternative engine (dragon.js, rodent/rodent.js, explanation-engine.js) is selected THEN the system does not re-boot the worker or re-analyse the current FEN with the new engine.

**Feature 4 — Integrity lock (missing)**

1.8 WHEN a locally modified copy of board.js or any other JS/CSS file is loaded THEN the system continues to operate normally, providing no tamper detection or silent degradation.

1.9 WHEN the SHA-256 of board.js at runtime does not match the value recorded in `js/integrity.json` THEN the system does not set a tamper flag and analysis/arrow features continue running.

**Feature 5 — Git LFS (incomplete)**

1.10 WHEN `engine/stockfish-19.js` (~34 MB) is committed THEN the system does not track it with Git LFS, risking GitHub's file-size enforcement failure.

1.11 WHEN `engine/stockfish-19.wasm` (~95 MB) is committed THEN the `.gitattributes` explicitly opts it out of LFS with `-filter -diff -merge`, which contradicts the stated requirement to use LFS for large binaries and exceeds GitHub's recommended LFS threshold.

1.12 WHEN the GitHub Actions workflow runs THEN it does not install the `git-lfs` client before checkout, so LFS pointers are not hydrated correctly.

**Feature 6 — Wrong remote URL (defect)**

1.13 WHEN changes are pushed THEN the system targets `https://github.com/akatsukixpain12-stack/Knightly-chess.git` instead of the canonical `https://github.com/official-knightly/Chess-topper.git`.

**Feature 7 — Version not bumped (defect)**

1.14 WHEN the extension is installed THEN `manifest.json` reports version `0.4.0`, which prevents the auto-update notification check from ever detecting a newer version for users already on the current build.

---

### Expected Behavior (Correct)

**Feature 1 — Auto-update notification**

2.1 WHEN board.js initialises THEN the system SHALL fetch `https://raw.githubusercontent.com/official-knightly/Chess-topper/main/manifest.json` once and compare its `version` field against `chrome.runtime.getManifest().version`.

2.2 WHEN the fetched GitHub version is semantically newer than the installed version THEN the system SHALL display a dismissable "Update available ↑ vX.Y.Z" badge on the floating panel card.

2.3 WHEN the update badge is dismissed by the user THEN the system SHALL hide the badge for the remainder of the page session without performing further version checks.

2.4 WHEN the user opens the popup and an update is available THEN the system SHALL show a green "Update available" banner above the Apply button in popup.html/popup.js.

2.5 WHEN the version check fetch fails (network error, timeout, or non-200 response) THEN the system SHALL silently suppress all errors and show no notification.

2.6 WHEN the installed version equals or is newer than the GitHub version THEN the system SHALL show no update notification.

**Feature 2 — Post-game analysis**

2.7 WHEN a game ends on chess.com, lichess.org, or worldchess.com THEN the system SHALL render a small floating "Analyze game" icon button (♟ or Σ) anchored to the board overlay.

2.8 WHEN the user clicks the "Analyze game" button THEN the system SHALL walk through each recorded board position using the local WASM Stockfish engine at a fixed shallow depth (depth 12) and compute the best move and centipawn score for each position.

2.9 WHEN per-move analysis is complete for a position THEN the system SHALL classify the played move against the engine's best move using centipawn-loss thresholds:
  - Best: played move equals engine best move or centipawn loss = 0
  - Good: centipawn loss 1–20
  - Inaccuracy: centipawn loss 21–60
  - Mistake: centipawn loss 61–150
  - Blunder: centipawn loss > 150

2.10 WHEN classification is complete THEN the system SHALL display a compact floating move list showing move number, algebraic notation, and a colored classification dot/icon (green = Best, teal = Good, yellow = Inaccuracy, orange = Mistake, red = Blunder) — no full-width panel, maximum 200 px wide.

2.11 WHEN the post-game analysis panel is open THEN the system SHALL show a close button to dismiss it without affecting the live evaluation bar.

2.12 WHEN the local WASM engine is not yet booted THEN the system SHALL boot it automatically before starting post-game analysis and display a "Analysing…" progress indicator.

2.13 WHEN post-game analysis is running THEN the system SHALL analyse positions sequentially, not in parallel, to avoid overloading a single-threaded WASM worker.

**Feature 3 — Engine switcher**

2.14 WHEN the floating panel card is visible THEN the system SHALL display an engine switcher row showing the active engine name and a cycle button (e.g., "◀ ▶" or "Switch engine").

2.15 WHEN the user activates the engine switcher THEN the system SHALL cycle through: Stockfish 19 → Dragon → Rodent IV → Explanation Engine → Stockfish 19.

2.16 WHEN a new engine is selected THEN the system SHALL terminate the existing Worker, boot a new Worker with the selected engine's JS file via `chrome.runtime.getURL`, and re-analyse the current FEN once the new engine reaches `readyok`.

2.17 WHEN the selected engine's JS or WASM file is not present (e.g. not yet downloaded) THEN the system SHALL display "Engine unavailable" in the status line and revert to Stockfish 19.

2.18 WHEN the user switches engine THEN the system SHALL persist the selection to `chrome.storage.local` so the same engine is used on the next page load.

**Feature 4 — Integrity lock**

2.19 WHEN board.js first runs THEN the system SHALL fetch its own source via `chrome.runtime.getURL('js/board.js')` and compute a SHA-256 digest of the response text.

2.20 WHEN the computed SHA-256 of board.js does not match the value stored in `js/integrity.json` for the `board.js` key THEN the system SHALL set an internal `tampered` flag, halt all analysis, hide the arrow SVG, and display "Integrity check failed" in the panel status — with no error thrown to the console.

2.21 WHEN the computed SHA-256 matches THEN the system SHALL proceed normally with no visible indication that an integrity check occurred.

2.22 WHEN `js/integrity.json` is absent or malformed THEN the system SHALL treat it as a tamper failure and apply the same silent degradation described in 2.20.

2.23 WHEN `scripts/build-integrity.mjs` is run THEN the system SHALL compute SHA-256 hashes of `js/board.js`, `js/background.js`, `js/popup.js`, and `css/style.css`, and write them to `js/integrity.json` as a flat key→hex-digest object.

2.24 WHEN `js/integrity.json` is checked into source control THEN the system SHALL treat it as an immutable release artifact — it is regenerated only by running `build-integrity.mjs` during the release process.

**Feature 5 — Git LFS**

2.25 WHEN `.gitattributes` is applied THEN the system SHALL track `*.wasm` files (including `engine/stockfish-19.wasm`) with Git LFS using `filter=lfs diff=lfs merge=lfs -text`.

2.26 WHEN `.gitattributes` is applied THEN the system SHALL also track `engine/*.js` files (including `engine/stockfish-19.js`, `engine/dragon.js`, `engine/explanation-engine.js`, and `engine/rodent/rodent.js`) with Git LFS, as these files exceed 10 MB.

2.27 WHEN the GitHub Actions workflow runs THEN the system SHALL install the `git-lfs` client (via `git lfs install`) before the `actions/checkout` step so that LFS pointers are resolved during checkout.

2.28 WHEN the workflow commits engine assets THEN the system SHALL use `git lfs track` to confirm tracking and `git add` the LFS-updated files before committing.

**Feature 6 — Remote URL**

2.29 WHEN pushing changes THEN the system SHALL target `https://github.com/official-knightly/Chess-topper.git` as the `origin` remote, replacing the previous stale URL.

2.30 WHEN the push includes LFS objects THEN the system SHALL push LFS objects to the new remote before pushing the regular git objects.

**Feature 7 — Version bump**

2.31 WHEN `manifest.json` is read by Chrome or by the auto-update check THEN the system SHALL report version `0.5.0`.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `supportedAnalysisPath()` is called THEN the system SHALL CONTINUE TO return `true` for all pages (no path restriction introduced).

3.2 WHEN a live analysis position changes THEN the system SHALL CONTINUE TO run the existing `scan()` / `remoteAnalyse()` / `analyse()` loop at the 1 400 ms polling interval.

3.3 WHEN the user toggles the "Show evaluation bar" or "Show best-move arrow" settings THEN the system SHALL CONTINUE TO apply those preferences via `applySettings()` without requiring a page reload.

3.4 WHEN the popup's "Apply to this tab" button is clicked THEN the system SHALL CONTINUE TO save settings to `chrome.storage.local` and send a `CHESS_TOPPER_SETTINGS` message to the active tab.

3.5 WHEN `analysisMode` is set to `wasm` THEN the system SHALL CONTINUE TO boot Stockfish 19 as the default WASM engine and analyse the current FEN locally.

3.6 WHEN `analysisMode` is set to `server` THEN the system SHALL CONTINUE TO send `CT_REMOTE_ANALYZE` messages to the background service worker and display server Stockfish results.

3.7 WHEN `analysisMode` is set to `auto` THEN the system SHALL CONTINUE TO attempt the remote API first and fall back to local WASM on timeout or failure.

3.8 WHEN the remote API returns a valid response THEN the system SHALL CONTINUE TO parse `bestmove`, centipawn score, and PV line using the existing `readRemoteScore()` and `remotePv()` helpers.

3.9 WHEN the floating panel's "Hide" button is clicked THEN the system SHALL CONTINUE TO collapse the card and toggle the button label to "Show".

3.10 WHEN the board is resized or the viewport scrolls THEN the system SHALL CONTINUE TO reposition the best-move arrow via the existing `ResizeObserver` and scroll/resize event listeners.

3.11 WHEN a FEN is read from a native attribute (`data-fen`, `fen`, etc.) THEN the system SHALL CONTINUE TO prefer the native FEN over the DOM-scraped piece grid.

3.12 WHEN `validFen()` receives an invalid FEN string THEN the system SHALL CONTINUE TO return `null` without throwing.

3.13 WHEN the background service worker receives a `CT_REMOTE_ANALYZE` message THEN the system SHALL CONTINUE TO enforce the 6 000 ms abort timeout and return a structured `{ok, data/error}` response.

3.14 WHEN `manifest.json` web_accessible_resources is evaluated THEN the system SHALL CONTINUE TO allow `engine/stockfish-19.js` and `engine/stockfish-19.wasm` to be loaded by content scripts on all supported host patterns.

---

## Bug Condition Summary (Structured Pseudocode)

### Feature 1 — Update Notification

```pascal
FUNCTION isBugCondition_UpdateNotification(state)
  INPUT: state — { githubVersion: string, installedVersion: string, notificationShown: boolean }
  OUTPUT: boolean
  RETURN githubVersion > installedVersion AND NOT notificationShown
END FUNCTION

// Fix Checking
FOR ALL state WHERE isBugCondition_UpdateNotification(state) DO
  result ← notificationSystem'(state)
  ASSERT badge_visible(result) AND badge_dismissable(result)
END FOR

// Preservation Checking
FOR ALL state WHERE NOT isBugCondition_UpdateNotification(state) DO
  ASSERT notificationSystem(state) = notificationSystem'(state)
END FOR
```

### Feature 2 — Post-Game Analysis

```pascal
FUNCTION isBugCondition_PostGame(context)
  INPUT: context — { gameEnded: boolean, moveListAvailable: boolean }
  OUTPUT: boolean
  RETURN context.gameEnded AND context.moveListAvailable
END FUNCTION

// Fix Checking
FOR ALL context WHERE isBugCondition_PostGame(context) DO
  result ← postGameAnalysis'(context)
  ASSERT analyze_button_shown(result) AND per_move_classification_available(result)
END FOR

// Preservation Checking — live game analysis unaffected
FOR ALL context WHERE NOT isBugCondition_PostGame(context) DO
  ASSERT liveAnalysis(context) = liveAnalysis'(context)
END FOR
```

### Feature 4 — Integrity Lock

```pascal
FUNCTION isBugCondition_Tamper(files)
  INPUT: files — { boardJsSha256: string, expectedSha256: string }
  OUTPUT: boolean
  RETURN files.boardJsSha256 ≠ files.expectedSha256
END FUNCTION

// Fix Checking
FOR ALL files WHERE isBugCondition_Tamper(files) DO
  result ← integrityCheck'(files)
  ASSERT analysis_halted(result) AND arrow_hidden(result) AND no_console_error(result)
END FOR

// Preservation Checking
FOR ALL files WHERE NOT isBugCondition_Tamper(files) DO
  ASSERT integrityCheck'(files) = pass AND analysis_runs_normally(result)
END FOR
```
