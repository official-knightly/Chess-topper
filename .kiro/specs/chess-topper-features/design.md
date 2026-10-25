# Chess Topper v0.5.0 Bugfix Design

## Overview

Chess Topper v0.5.0 introduces seven cohesive improvements to the Chrome MV3 extension. Five address missing features (auto-update notification, post-game analysis, engine switcher, integrity lock, Git LFS tracking) and two correct existing defects (wrong remote URL, stale version string). The fix strategy is additive for new features — existing `scan()`, `analyse()`, `remoteAnalyse()`, and settings flows are left structurally intact. New capabilities are injected as standalone async functions that interleave with the existing state machine without replacing it.

All seven bugs share a common condition: the extension is running at v0.4.0, the user is on a supported chess page, and the feature described in each sub-condition is exercised. Each bug manifests as a completely absent capability rather than incorrect logic in an existing path.

---

## Glossary

- **Bug_Condition (C)**: The condition that identifies when the defect is observable. For features 1–5 this is "the feature is absent"; for features 6–7 it is "the wrong value is present."
- **Property (P)**: The correct observable behavior that must hold for every input satisfying C(X).
- **Preservation**: All existing behaviors documented in bugfix.md §3 that must remain unchanged by every individual fix.
- **`board.js`**: Content script injected into supported chess pages (`js/board.js`). Hosts the panel, arrow, scan loop, and engine worker.
- **`background.js`**: MV3 service worker (`js/background.js`). Handles remote Stockfish API calls via `CT_REMOTE_ANALYZE`.
- **`popup.js`** / **`popup.html`**: Extension popup opened from the toolbar icon.
- **`state`**: Module-level object inside the IIFE in `board.js` that tracks engine readiness, last FEN, analysis mode, etc.
- **`scan()`**: Polling function in `board.js` called every 1 400 ms; reads the board position and dispatches analysis.
- **`bootEngine()`**: Starts the Stockfish WASM Worker from `board.js`.
- **`ENGINES`**: Array of engine descriptor objects added in Feature 3.
- **`isBugCondition_X(input)`**: Pseudocode predicate for each feature's bug condition (defined in Bug Details below).
- **`semverGt(a, b)`**: Returns `true` if semver string `a` is strictly greater than `b` using tuple comparison.
- **Tamper flag (`state.tampered`)**: Boolean added to `state` in Feature 4; halts all analysis when `true`.
- **LFS pointer**: A small text file Git stores in the repository in place of a large binary when Git LFS is active.

---

## Bug Details

### Feature 1 — Auto-Update Notification

#### Bug Condition

The bug manifests when the installed version is older than the latest GitHub release and the user receives no notification. `board.js` never fetches the GitHub manifest and `background.js` never caches a version check result.

**Formal Specification:**
```
FUNCTION isBugCondition_UpdateNotification(state)
  INPUT: state — { githubVersion: string, installedVersion: string, notificationShown: boolean }
  OUTPUT: boolean

  RETURN semverGt(state.githubVersion, state.installedVersion)
         AND NOT state.notificationShown
END FUNCTION
```

#### Examples

- Installed: `0.4.0`, GitHub: `0.5.0` → badge must appear; currently nothing is shown. *(bug)*
- Installed: `0.5.0`, GitHub: `0.5.0` → no badge expected; currently correct (by accident). *(no-op)*
- Installed: `0.5.0`, GitHub: `0.4.0` → no badge expected (downgrade). *(no-op)*
- Fetch fails with network error → no badge, no console error. *(edge case — silent failure required)*
- User dismisses badge → badge removed; no re-injection on same page. *(edge case)*

---

### Feature 2 — Post-Game Analysis

#### Bug Condition

The bug manifests when a game completes on a supported site and no per-move analysis UI appears. None of `isGameOver()`, `getGameMoves()`, `reconstructPositions()`, `analyseGame()`, or `#ct-analyze-btn` exist.

**Formal Specification:**
```
FUNCTION isBugCondition_PostGame(context)
  INPUT: context — { gameEnded: boolean, moveListAvailable: boolean }
  OUTPUT: boolean

  RETURN context.gameEnded AND context.moveListAvailable
END FUNCTION
```

#### Examples

- Game ends on chess.com (`.game-over-modal-content` present), move list available → "Analyze game" button must appear; currently absent. *(bug)*
- Game ends on lichess (`.result-wrap` present) → same. *(bug)*
- Game is still in progress → no analyze button expected. *(no-op / preservation)*
- Post-game analysis triggered, Stockfish not yet booted → engine boots automatically, progress shown. *(edge case)*
- Move extraction returns null (site uses unknown DOM) → analyze button not shown. *(edge case)*

---

### Feature 3 — Engine Switcher

#### Bug Condition

The bug manifests when the user wants to switch engines without reopening the popup. The floating panel has no switcher row and `bootEngine()` always loads `engine/stockfish-19.js` regardless of any stored preference.

**Formal Specification:**
```
FUNCTION isBugCondition_EngineSwitcher(panel)
  INPUT: panel — { switcherRowPresent: boolean, engineIndex: number }
  OUTPUT: boolean

  RETURN NOT panel.switcherRowPresent
         OR panel.engineIndex NOT IN [0, 1, 2, 3]
END FUNCTION
```

#### Examples

- User clicks ▶ on panel → engine cycles to Dragon, panel label updates; currently no button exists. *(bug)*
- User reloads page after selecting Rodent → Rodent is restored from storage; currently always Stockfish 19. *(bug)*
- Selected engine JS file is absent → status shows "Engine unavailable", reverts to Stockfish 19. *(edge case)*
- User cycles all four engines and returns to Stockfish 19 → wrap-around at index 3 → 0. *(edge case)*

---

### Feature 4 — Integrity Lock

#### Bug Condition

The bug manifests when a tampered `board.js` runs without detection. No SHA-256 check is performed; `js/integrity.json` does not exist; `state.tampered` does not exist.

**Formal Specification:**
```
FUNCTION isBugCondition_Tamper(files)
  INPUT: files — { boardJsSha256: string, expectedSha256: string }
  OUTPUT: boolean

  RETURN files.boardJsSha256 ≠ files.expectedSha256
END FUNCTION
```

#### Examples

- `board.js` SHA-256 matches `integrity.json` → analysis runs normally. *(no-op / preservation)*
- `board.js` SHA-256 does not match → analysis halted, arrow hidden, status shows "Integrity check failed", no console error. *(bug when absent)*
- `integrity.json` is absent → treated as tamper failure. *(edge case)*
- `integrity.json` is malformed JSON → treated as tamper failure. *(edge case)*

---

### Feature 5 — Git LFS

#### Bug Condition

The bug manifests when large binaries (`.wasm`, large engine `.js` files) are pushed to GitHub without LFS, risking file-size enforcement failures. `.gitattributes` currently opts `*.wasm` out of LFS with `-filter -diff -merge`. The GitHub Actions workflow does not call `git lfs install` before checkout.

**Formal Specification:**
```
FUNCTION isBugCondition_LFS(repo)
  INPUT: repo — { wasm_tracked_by_lfs: boolean, large_js_tracked_by_lfs: boolean, workflow_installs_lfs: boolean }
  OUTPUT: boolean

  RETURN NOT repo.wasm_tracked_by_lfs
         OR NOT repo.large_js_tracked_by_lfs
         OR NOT repo.workflow_installs_lfs
END FUNCTION
```

#### Examples

- `engine/stockfish-19.wasm` (~95 MB) committed without LFS → GitHub rejects push. *(bug)*
- `.gitattributes` has `-filter` for `*.wasm` → LFS disabled for all wasm files. *(bug)*
- Workflow runs `actions/checkout` without `git lfs install` → LFS pointers not hydrated. *(bug)*

---

### Feature 6 — Wrong Remote URL

#### Bug Condition

The bug manifests when `git push` targets the wrong remote. The stale URL `https://github.com/akatsukixpain12-stack/Knightly-chess.git` is set as `origin`.

**Formal Specification:**
```
FUNCTION isBugCondition_RemoteURL(remote)
  INPUT: remote — { originUrl: string }
  OUTPUT: boolean

  RETURN remote.originUrl ≠ "https://github.com/official-knightly/Chess-topper.git"
END FUNCTION
```

#### Examples

- `git remote get-url origin` returns stale URL → push goes to wrong repo. *(bug)*
- After `git remote set-url origin https://github.com/official-knightly/Chess-topper.git` → correct. *(fix)*

---

### Feature 7 — Version Not Bumped

#### Bug Condition

The bug manifests when `manifest.json` still reports `0.4.0`, which prevents the auto-update check (Feature 1) from ever detecting a newer version for users already on the current build.

**Formal Specification:**
```
FUNCTION isBugCondition_Version(manifest)
  INPUT: manifest — { version: string }
  OUTPUT: boolean

  RETURN manifest.version ≠ "0.5.0"
END FUNCTION
```

#### Examples

- `manifest.json` has `"version": "0.4.0"` → update check never fires for existing users. *(bug)*
- After bump to `"0.5.0"` → update check fires correctly. *(fix)*

---

## Expected Behavior

### Preservation Requirements

The following behaviors are defined as immutable — every feature fix must leave them completely unchanged:

**Unchanged Behaviors (from bugfix.md §3):**
- `supportedAnalysisPath()` continues to return `true` for all pages (3.1).
- `scan()` / `remoteAnalyse()` / `analyse()` polling loop continues at 1 400 ms (3.2).
- `applySettings()` continues to apply bar/arrow toggle preferences without page reload (3.3).
- Popup "Apply to this tab" saves to `chrome.storage.local` and sends `CHESS_TOPPER_SETTINGS` (3.4).
- `analysisMode = wasm` boots Stockfish 19 and analyses locally (3.5).
- `analysisMode = server` sends `CT_REMOTE_ANALYZE` and displays server results (3.6).
- `analysisMode = auto` tries remote first and falls back to WASM (3.7).
- `readRemoteScore()` and `remotePv()` parsing helpers are unchanged (3.8).
- Panel Hide/Show toggle continues to work (3.9).
- Arrow repositions on resize/scroll via `ResizeObserver` and event listeners (3.10).
- Native FEN attributes take priority over DOM-scraped grid (3.11).
- `validFen()` returns `null` for invalid input without throwing (3.12).
- Background enforces 6 000 ms abort timeout and structured response (3.13).
- `web_accessible_resources` continues to allow `stockfish-19.js` and `.wasm` on supported hosts (3.14) — and is extended (not replaced) to include the new engine files.

**Scope:** Any input that does not involve the seven feature conditions listed in Bug Details is unaffected. This includes all mouse interactions, the existing keyboard-free UI, all engine analysis outputs, popup settings, and the scan loop.

---

## Hypothesized Root Cause

**Feature 1 — Auto-Update Notification:**
No version-check code exists in any of the three JS files. Root cause: the feature was never implemented. No prior attempt at a fetch or comparison is present.

**Feature 2 — Post-Game Analysis:**
No game-over detection, move-list extraction, sequential analysis loop, or review UI exists. Root cause: feature absent entirely; no scaffolding to build on.

**Feature 3 — Engine Switcher:**
`bootEngine()` hardcodes `'engine/stockfish-19.js'` and the panel HTML has no switcher row. Root cause: engine selection is a single hardcoded value with no abstraction layer.

**Feature 4 — Integrity Lock:**
No `checkIntegrity()` function, no `state.tampered` property, and no `js/integrity.json` file exist. Root cause: security feature was never implemented; no build step for hashing exists either.

**Feature 5 — Git LFS:**
`.gitattributes` explicitly disables LFS for `*.wasm` with `-filter -diff -merge`. The workflow YAML has no `git lfs install` step. Root cause: a prior `.gitattributes` authoring error disabled LFS for the very files that need it most.

**Feature 6 — Wrong Remote URL:**
The git remote `origin` points to a stale repository URL from a prior fork or rename. Root cause: one-time configuration error; the remote was never updated after the canonical repo moved.

**Feature 7 — Version Not Bumped:**
`manifest.json` `"version"` field was not updated at the start of the v0.5.0 development cycle. Root cause: manual oversight; no automated version bump tooling exists.

---

## Correctness Properties

Property 1: Bug Condition — Auto-Update Badge Visibility

_For any_ extension state where `semverGt(githubVersion, installedVersion)` holds and the badge has not been dismissed, the fixed `checkForUpdate()` function SHALL inject a `.ct-update-badge` element into `.ct-card` displaying the GitHub version, with a working dismiss button that removes the badge and prevents re-injection for the remainder of the page session.

**Validates: Requirements 2.1, 2.2, 2.3, 2.5**

Property 2: Preservation — No-Op When Up-To-Date or Fetch Fails

_For any_ extension state where `semverGt(githubVersion, installedVersion)` does NOT hold, or where the fetch throws, the fixed code SHALL produce no visible badge, no console error, and no change to the existing panel DOM — identical to the original code's observable output.

**Validates: Requirements 2.5, 2.6, 3.1, 3.2**

Property 3: Bug Condition — Post-Game Analysis UI Appears

_For any_ page context where `isGameOver()` returns `true` and `getGameMoves()` returns a non-null move list, the fixed `board.js` SHALL render `#ct-analyze-btn` adjacent to the board within one scan cycle (≤ 1 400 ms after game end), and clicking it SHALL trigger sequential per-move analysis at depth 12 and display a `#ct-game-review` panel with classification dots.

**Validates: Requirements 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13**

Property 4: Preservation — Live Analysis Unaffected by Post-Game Code

_For any_ page context where `isGameOver()` returns `false`, the fixed code SHALL produce exactly the same `scan()` → `analyse()` / `remoteAnalyse()` behavior as the original code, with no `#ct-analyze-btn` or `#ct-game-review` element present in the DOM.

**Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.7**

Property 5: Bug Condition — Engine Switcher Cycles Correctly

_For any_ user interaction on the ◀ / ▶ switcher buttons, the fixed `switchEngine(delta)` function SHALL terminate the current Worker, advance `state.engineIndex` modulo 4, boot the new engine via `bootEngine()`, update the panel label, re-analyse `state.lastFen` once ready, and persist the selection to `chrome.storage.local`.

**Validates: Requirements 2.14, 2.15, 2.16, 2.18**

Property 6: Preservation — Default Engine Unchanged Until User Intervenes

_For any_ page load where no `engineIndex` is stored and the user does not click the switcher, the fixed code SHALL boot Stockfish 19 (index 0) exactly as the original `bootEngine()` did, with identical analysis output.

**Validates: Requirements 3.5, 2.17**

Property 7: Bug Condition — Tampered File Halts Analysis Silently

_For any_ runtime state where the SHA-256 of `board.js` does not match `integrity.json['board.js']` (or `integrity.json` is absent/malformed), the fixed `checkIntegrity()` function SHALL set `state.tampered = true`, causing all calls to `analyse()`, `remoteAnalyse()`, and `bootEngine()` to return immediately, the arrow SVG to be hidden, and the panel status to read "Integrity check failed" — with no exception thrown to the console.

**Validates: Requirements 2.19, 2.20, 2.22**

Property 8: Preservation — Clean File Runs Normally

_For any_ runtime state where the SHA-256 of `board.js` matches `integrity.json['board.js']`, the fixed code SHALL leave `state.tampered = false` and all analysis paths SHALL execute identically to the original code.

**Validates: Requirements 2.21, 3.1, 3.2**

Property 9: Bug Condition — LFS Tracks Large Binaries

_For any_ repository state where `.gitattributes` is applied, `*.wasm` and `engine/*.js` files SHALL be tracked as LFS objects (filter=lfs diff=lfs merge=lfs -text) and the GitHub Actions workflow SHALL install the LFS client before checkout.

**Validates: Requirements 2.25, 2.26, 2.27, 2.28**

Property 10: Bug Condition — Correct Remote URL and Version

_For any_ push operation, the git remote `origin` SHALL resolve to `https://github.com/official-knightly/Chess-topper.git` and `manifest.json` SHALL report version `0.5.0`.

**Validates: Requirements 2.29, 2.30, 2.31**

---

## Fix Implementation

### Feature 1 — Auto-Update Notification

**File:** `js/board.js`

**Changes:**
1. **`checkForUpdate()` (new async function):** Fetches `https://raw.githubusercontent.com/official-knightly/Chess-topper/main/manifest.json` with `AbortSignal.timeout(4000)`. Parses `version`. Calls `semverGt(fetched, installed)`. If true, injects `.ct-update-badge` into `.ct-card`. Entire body wrapped in `try { } catch(_) {}` for silent failure.
2. **`semverGt(a, b)` (new helper):** Splits both strings on `.`, compares as integer tuples left-to-right; returns `true` if `a > b`.
3. **Module-level `updateDismissed` flag:** Set to `true` when dismiss button is clicked; guards re-injection.
4. **Init call:** `setTimeout(checkForUpdate, 2000)` added at the bottom of the IIFE after the panel and scan loop are set up.
5. **CSS addition in `style.css`:** `.ct-update-badge { background:#2f855a; color:#fff; border-radius:5px; padding:3px 7px; font-size:10px; margin-top:5px; display:flex; justify-content:space-between; align-items:center; gap:6px; }` and `.ct-update-badge button { background:transparent; color:#fff; border:0; padding:0; cursor:pointer; font-size:12px; margin:0; }`.

**File:** `js/background.js`

**Changes:**
1. **Cached version state:** Module-level `let updateCache = { newer: false, version: '' }`.
2. **`checkVersionInBackground()` (new async function):** Same fetch/compare logic as `checkForUpdate()` in board.js; updates `updateCache`.
3. **`chrome.runtime.onStartup` / `chrome.runtime.onInstalled` listeners:** Call `checkVersionInBackground()`.
4. **`CT_CHECK_UPDATE` message handler:** Returns `sendResponse(updateCache)`.

**File:** `js/popup.js`

**Changes:**
1. On DOMContentLoaded, send `{type:'CT_CHECK_UPDATE'}` to background via `chrome.runtime.sendMessage`.
2. If response has `newer: true`, inject `.update-banner` div above the Apply button.

**File:** `html/popup.html`

**Changes:**
1. Add `<div id="update-banner" style="display:none" class="update-banner"></div>` above the Apply button.

**File:** `css/popup.css`

**Changes:**
1. Add `.update-banner { background:#276749; color:#fff; border-radius:6px; padding:7px 10px; margin-bottom:8px; font-size:11px; }`.

---

### Feature 2 — Post-Game Analysis

**File:** `js/board.js`

**Changes:**
1. **`isGameOver()` (new function):** Returns `true` if any of `.game-over-modal-content`, `.result-wrap`, `[data-game-over]`, or `.game-result` is present in the DOM.
2. **`getGameMoves()` (new function):** Tries `.move-list-wrapper move-text` (chess.com), `l4x > l4x` (lichess), `.moves-list` (worldchess) selectors; returns array of move strings or `null`.
3. **`reconstructPositions(moves, engine)` (new async function):** For each move, posts `position startpos moves m1 m2 ... mn` followed by `d` to the engine; listens for the `Fen:` line in engine output; collects FEN array.
4. **`analyseGame(positions)` (new async function):** Iterates positions sequentially; for each sends `go depth 12`; awaits `bestmove`; records `{fen, played, best, cpLoss}` and classifies using the thresholds from requirement 2.9.
5. **`renderGameReview(results)` (new function):** Creates `#ct-game-review` div (max-width 200px, max-height 300px, overflow-y auto) with one row per move: colored classification dot + move notation.
6. **Game-over scan branch in `scan()`:** If `isGameOver()` is true and `#ct-analyze-btn` is not yet in DOM, call `showAnalyzeButton()`. If game is not over, remove `#ct-analyze-btn` if present (game restarted).
7. **`showAnalyzeButton()` (new function):** Creates `#ct-analyze-btn` button, positions it relative to the board `getBoundingClientRect()` bottom-right, attaches click handler that calls `startPostGameAnalysis()`.
8. **`startPostGameAnalysis()` (new async function):** Boots engine if not ready, shows "Analysing…" status, calls `getGameMoves()` → `reconstructPositions()` → `analyseGame()` → `renderGameReview()`.

**File:** `css/style.css`

**Changes:**
1. `#ct-analyze-btn { position:fixed; background:#176b45; color:#fff; border:0; border-radius:50%; width:36px; height:36px; font-size:18px; cursor:pointer; z-index:2147483645; box-shadow:0 2px 8px #0003; }`
2. `#ct-game-review { position:fixed; z-index:2147483645; background:#fff; border:1px solid #d8dde3; border-radius:9px; padding:8px; max-width:200px; max-height:300px; overflow-y:auto; font:11px/1.4 system-ui,sans-serif; }`
3. Classification dot colors: `.ct-dot-best{color:#48bb78}` `.ct-dot-good{color:#68d391}` `.ct-dot-inaccuracy{color:#ecc94b}` `.ct-dot-mistake{color:#ed8936}` `.ct-dot-blunder{color:#f56565}`

---

### Feature 3 — Engine Switcher

**File:** `js/board.js`

**Changes:**
1. **`ENGINES` constant (new):** Array of 4 engine descriptors at module top:
   ```js
   const ENGINES = [
     {id:'sf19',    label:'Stockfish 19', js:'engine/stockfish-19.js'},
     {id:'dragon',  label:'Dragon',       js:'engine/dragon.js'},
     {id:'rodent',  label:'Rodent IV',    js:'engine/rodent/rodent.js'},
     {id:'explain', label:'Explain Eng',  js:'engine/explanation-engine.js'},
   ];
   ```
2. **`state.engineIndex`:** Add `engineIndex: 0` to the `state` object.
3. **Panel HTML:** Add `<div class="ct-line ct-eng-row"><button class="ct-eng-prev">◀</button><span class="ct-eng-name">Stockfish 19</span><button class="ct-eng-next">▶</button></div>` to the panel's inner HTML.
4. **`switchEngine(delta)` (new function):**
   - If `state.engine`: call `.terminate()`, set `state.engine = null`, `state.ready = false`, `state.uciReady = false`.
   - `state.engineIndex = ((state.engineIndex + delta) % 4 + 4) % 4`.
   - Update `.ct-eng-name` text.
   - Call `bootEngine()`.
   - `chrome.storage.local.set({engineIndex: state.engineIndex})`.
5. **Button wiring:** `$('.ct-eng-prev').onclick = () => switchEngine(-1)`, `$('.ct-eng-next').onclick = () => switchEngine(1)`.
6. **`bootEngine()` refactor:** Replace hardcoded `'engine/stockfish-19.js'` with `ENGINES[state.engineIndex].js`. Add try/catch around `new Worker(...)` that catches unavailable engine: sets status to "Engine unavailable", resets `state.engineIndex = 0`, re-calls `bootEngine()` once with index 0.
7. **Startup restore:** Inside the existing `chrome.storage.local.get(...)` init call, also read `engineIndex`; set `state.engineIndex = Math.min(3, Math.max(0, Number(v.engineIndex) || 0))`.

**File:** `manifest.json`

**Changes:**
1. Add all engine files to `web_accessible_resources`:
   ```json
   "engine/dragon.js", "engine/dragon.wasm",
   "engine/explanation-engine.js", "engine/explanation-engine.wasm",
   "engine/rodent/rodent.js", "engine/rodent/rodent.wasm", "engine/rodent/rodent.data"
   ```

**File:** `css/style.css`

**Changes:**
1. `.ct-eng-row { display:flex; align-items:center; gap:4px; margin:4px 0; }` `.ct-eng-row button { padding:2px 6px; font-size:10px; margin:0; }`

---

### Feature 4 — Integrity Lock

**File:** `js/board.js`

**Changes:**
1. **`state.tampered`:** Add `tampered: false` to the `state` object.
2. **`checkIntegrity()` (new async function):**
   ```
   fetch board.js source and integrity.json in parallel
   compute SHA-256 of source text via crypto.subtle.digest
   compare hex digest to manifest['board.js']
   on mismatch or any error: set state.tampered = true
   ```
3. **Guard clauses:** Add `if (state.tampered) return;` at the top of `analyse()`, `remoteAnalyse()`, and `bootEngine()`.
4. **`scan()` guard:** After `if (!supportedAnalysisPath())` check, add `if (state.tampered) { status('Integrity check failed'); return; }`.
5. **Arrow hide:** When tampered, `arrowSvg.style.display = 'none'` (in the scan guard branch).
6. **Init call:** `checkIntegrity()` called immediately (no delay) at module init, before the `scan` interval and before `bootEngine()` could be called. Since it's async, analysis entry points already guard on `state.tampered`, so there's no race condition — `tampered` defaults to `false` and is set asynchronously; the first scan fires at 1 400 ms which is well after the integrity check resolves.

**File:** `scripts/build-integrity.mjs` (new file):
```js
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const files = {
  'board.js':     'js/board.js',
  'background.js':'js/background.js',
  'popup.js':     'js/popup.js',
  'style.css':    'css/style.css',
};

const out = {};
for (const [key, path] of Object.entries(files)) {
  out[key] = createHash('sha256').update(readFileSync(path)).digest('hex');
}

writeFileSync('js/integrity.json', JSON.stringify(out, null, 2) + '\n');
console.log('integrity.json written');
```

**File:** `js/integrity.json` (new file, generated by build script — checked in as a release artifact, regenerated by running `node scripts/build-integrity.mjs` after each source change):
- Format: `{ "board.js": "<hex>", "background.js": "<hex>", "popup.js": "<hex>", "style.css": "<hex>" }`

---

### Feature 5 — Git LFS

**File:** `.gitattributes`

**Changes:**
1. Remove the line `*.wasm -filter -diff -merge` (or equivalent opt-out line).
2. Add or ensure the following lines are present:
   ```
   *.wasm filter=lfs diff=lfs merge=lfs -text
   engine/*.js filter=lfs diff=lfs merge=lfs -text
   engine/rodent/*.js filter=lfs diff=lfs merge=lfs -text
   ```

**File:** `.github/workflows/fetch-stockfish-assets.yml`

**Changes:**
1. Add before the `actions/checkout` step:
   ```yaml
   - name: Install git-lfs
     run: git lfs install
   ```
2. In the commit/push step, add `git lfs push --all origin main` before the regular `git push`.

---

### Feature 6 — Remote URL

**Commands (run once by developer, not automated):**
```sh
git remote set-url origin https://github.com/official-knightly/Chess-topper.git
git lfs push --all origin main
git push -u origin main
```

No source file changes required. The `.github/workflows/` YAML already handles the push path for CI; this is a local developer environment fix.

---

### Feature 7 — Version Bump

**File:** `manifest.json`

**Changes:**
1. `"version": "0.4.0"` → `"version": "0.5.0"`.
2. Update `"description"` to: `"v0.5.0 — four-engine switcher (Stockfish 19, Dragon, Rodent IV, Explanation), post-game move analysis, auto-update notifications, and integrity lock. Server-first with local WASM fallback."`.

---

## Testing Strategy

### Validation Approach

Testing follows the two-phase bug condition methodology across all seven features:
1. **Exploratory / Bug Condition Checking** — demonstrate the defect on the unfixed code.
2. **Fix Checking** — verify C(X) inputs now produce P(result).
3. **Preservation Checking** — verify ¬C(X) inputs produce identical output to the original.

---

### Exploratory Bug Condition Checking

**Goal:** Surface counterexamples on the *unfixed* codebase before any changes are made.

**Test Plan:**

1. **Feature 1 — Update Badge (Exploratory)**
   - Load the extension on a chess page; inspect the panel DOM — no `.ct-update-badge` element present even when GitHub version is newer. *(will fail on unfixed code: element is absent)*
   - Open popup with a newer GitHub version available — no banner visible. *(will fail on unfixed code)*

2. **Feature 2 — Post-Game Button (Exploratory)**
   - Navigate to a completed chess.com game with `.game-over-modal-content` in the DOM. Wait 1 400 ms — no `#ct-analyze-btn` appears. *(will fail on unfixed code)*
   - Same on lichess with `.result-wrap`. *(will fail on unfixed code)*

3. **Feature 3 — Engine Switcher (Exploratory)**
   - Inspect the panel HTML — no `.ct-eng-row` or ◀/▶ buttons present. *(will fail on unfixed code)*
   - `chrome.storage.local.get('engineIndex')` returns undefined. *(will fail on unfixed code)*

4. **Feature 4 — Integrity Check (Exploratory)**
   - Manually modify a single character in `board.js`, reload the extension — analysis continues normally without any "Integrity check failed" message. *(will fail on unfixed code: tamper not detected)*

5. **Feature 5 — LFS Tracking (Exploratory)**
   - Run `git check-attr filter engine/stockfish-19.wasm` on the unfixed repo — reports `-filter` (LFS disabled). *(confirms bug)*
   - Inspect workflow YAML — no `git lfs install` step before checkout. *(confirms bug)*

6. **Feature 6 — Remote URL (Exploratory)**
   - Run `git remote get-url origin` — returns `https://github.com/akatsukixpain12-stack/Knightly-chess.git`. *(confirms bug)*

7. **Feature 7 — Version (Exploratory)**
   - Read `manifest.json` — `"version": "0.4.0"`. *(confirms bug)*

**Expected Counterexamples:**
- Panel DOM contains no `.ct-update-badge` regardless of GitHub version.
- No `#ct-analyze-btn` after game ends.
- No engine switcher UI in panel.
- Tampered `board.js` runs without detection.
- `*.wasm` not LFS-tracked.
- Remote URL is stale.
- Manifest version is `0.4.0`.

---

### Fix Checking

**Goal:** For all inputs where C(X) holds, verify P(result) after the fix.

**Pseudocode (generalized):**
```
FOR ALL input WHERE isBugCondition_X(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Feature-Specific Fix Checks:**

- **F1:** Inject `state` with `githubVersion='1.0.0'`, `installedVersion='0.5.0'` → `.ct-update-badge` appears in `.ct-card`.
- **F1 dismiss:** Click dismiss button → `badge.remove()` fires; calling `checkForUpdate()` again does not re-inject.
- **F2:** Inject `.game-over-modal-content` into DOM, call `scan()` → `#ct-analyze-btn` appears within the scan cycle.
- **F2 analysis:** Click `#ct-analyze-btn` with a mock move list → `#ct-game-review` appears with one row per move, each row has a colored dot.
- **F3 cycle:** Call `switchEngine(1)` twice → `state.engineIndex` is 2, panel label is "Rodent IV", a new Worker is running.
- **F3 wrap:** Call `switchEngine(1)` four times from index 0 → index returns to 0, panel label is "Stockfish 19".
- **F3 unavailable:** Mock Worker constructor to throw for Dragon → status shows "Engine unavailable", falls back to Stockfish 19.
- **F4 tampered:** Set `board.js` hash to differ from `integrity.json` → `state.tampered = true`; `analyse()` returns immediately; status shows "Integrity check failed".
- **F4 absent json:** Remove `integrity.json` → `state.tampered = true`.
- **F5:** After `.gitattributes` update, `git check-attr filter engine/stockfish-19.wasm` → `lfs`.
- **F6:** After `git remote set-url`, `git remote get-url origin` → `https://github.com/official-knightly/Chess-topper.git`.
- **F7:** `manifest.json` `"version"` field → `"0.5.0"`.

---

### Preservation Checking

**Goal:** For all inputs where ¬C(X) holds, verify output is identical to the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_X(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach:** Property-based testing is recommended for preservation checking because it generates diverse input combinations that exercise the scan loop, settings application, FEN parsing, and remote analysis across many scenarios automatically.

**Preservation Test Cases:**

1. **Scan Loop Preservation:** With `isGameOver()` returning `false` and integrity check passing, run 10 scan cycles — `scan()` behavior is byte-for-byte identical to original: position read → analyse/remoteAnalyse dispatched → arrow drawn.
2. **Settings Toggle Preservation:** Call `applySettings({bar: false, arrow: false})` → panel bar and arrow SVG hidden as before; no new side effects from Feature 1–4 code paths.
3. **WASM Analysis Preservation:** With `analysisMode = 'wasm'` and `engineIndex = 0`, `bootEngine()` loads `engine/stockfish-19.js` and responds to `bestmove` identically to original.
4. **Remote Analysis Preservation:** With `analysisMode = 'server'`, `remoteAnalyse(fen)` sends `CT_REMOTE_ANALYZE` and parses the response identically.
5. **FEN Parsing Preservation:** `validFen()` and `readNativeFen()` receive the same inputs as before and return the same results; no changes to these functions.
6. **Hide/Show Toggle Preservation:** Clicking the Hide button hides `.ct-card` and changes label to "Show" as before.
7. **Arrow Resize Preservation:** Firing a `resize` event calls `drawArrow(state.bestmove)` as before.
8. **Integrity Pass Preservation:** With `board.js` hash matching `integrity.json`, `state.tampered` stays `false` and every original code path executes unchanged.
9. **Engine Persistence Preservation:** On startup with no stored `engineIndex`, `state.engineIndex` defaults to `0` and Stockfish 19 is booted — identical to original behavior.

---

### Unit Tests

- `semverGt('0.5.0', '0.4.0')` returns `true`; `semverGt('0.4.0', '0.5.0')` returns `false`; `semverGt('0.5.0', '0.5.0')` returns `false`.
- `isGameOver()` returns `true` when `.game-over-modal-content` is injected; `false` when absent.
- `getGameMoves()` returns move array from mocked chess.com DOM; returns `null` when no known selector matches.
- Classification thresholds: cp loss 0 → "best"; 20 → "good"; 21 → "inaccuracy"; 60 → "inaccuracy"; 61 → "mistake"; 150 → "mistake"; 151 → "blunder".
- `switchEngine(1)` from index 3 wraps to index 0.
- `switchEngine(-1)` from index 0 wraps to index 3.
- `checkIntegrity()` sets `state.tampered = true` on hash mismatch and on missing `integrity.json`.
- `checkIntegrity()` leaves `state.tampered = false` on hash match.
- `analyse()` returns immediately without posting to engine when `state.tampered = true`.
- `semverGt` handles `1.0.0` vs `0.9.9` correctly (major version comparison).

---

### Property-Based Tests

- **Random version pairs:** For all pairs `(a, b)` from random semver triples, `semverGt(a, b)` is consistent with lexicographic tuple comparison and mutually exclusive with `semverGt(b, a)` when `a ≠ b`.
- **Random game states — scan preservation:** For any combination of `{analysisMode, bar, arrow, depth, tampered: false, gameOver: false}`, the scan loop produces the same analysis dispatch as the original.
- **Random FEN inputs:** `validFen()` never throws and returns `null` for any random string that is not a valid FEN.
- **Random engine switch sequences:** Any sequence of `switchEngine(1)` / `switchEngine(-1)` calls leaves `state.engineIndex` in `[0, 1, 2, 3]` and panel label equal to `ENGINES[state.engineIndex].label`.
- **Random cp loss values:** Classification function maps any non-negative integer to exactly one of the five categories with no gaps and no overlaps.

---

### Integration Tests

- **Full update flow:** Load extension, mock GitHub manifest fetch to return `0.6.0`, wait 2 seconds → badge appears in panel; open popup → banner appears; dismiss badge → removed; reload → dismissed state is reset (page-session scope).
- **Full post-game flow:** Load a completed chess.com game page, wait for scan → `#ct-analyze-btn` appears; click → engine boots, "Analysing…" shown, `#ct-game-review` appears with correct classification dots; close review → panel is clean.
- **Engine switch + analysis:** Switch to Dragon, verify label updates and a new `bestmove` arrives; switch back to Stockfish 19, verify re-analysis fires.
- **Integrity flow:** Run `build-integrity.mjs`, load extension normally → analysis works; modify one byte of `board.js` without regenerating `integrity.json` → "Integrity check failed" in status, no arrow, no analysis.
- **Popup update banner:** With background cache showing `newer: true`, open popup → `.update-banner` visible above Apply button.
- **Settings apply after engine switch:** Switch engine, then change `analysisMode` via popup Apply → `applySettings()` fires correctly without interfering with engine switcher state.
