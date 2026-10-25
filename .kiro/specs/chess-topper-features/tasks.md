# Implementation Plan

- [ ] 1. Write bug condition exploration tests (BEFORE implementing any fixes)
  - **Property 1: Bug Condition** - Seven Missing/Broken Capabilities at v0.4.0
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms each bug exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: Each test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate each of the seven bugs
  - **Scoped PBT Approach**: For deterministic bugs (F6, F7), scope the property to the concrete failing case to ensure reproducibility
  - Bug F1 — Check panel DOM on a page with githubVersion > installedVersion: assert `.ct-update-badge` is present in `.ct-card`; on unfixed code the element is absent
  - Bug F2 — Inject `.game-over-modal-content` into the DOM, wait one scan cycle (1 400 ms): assert `#ct-analyze-btn` is present; on unfixed code it never appears
  - Bug F3 — Inspect the panel HTML: assert `.ct-eng-row` and ◀/▶ buttons are present; on unfixed code no switcher row exists
  - Bug F4 — Modify one character in `board.js` and reload the extension: assert status reads "Integrity check failed" and analysis is halted; on unfixed code analysis continues normally
  - Bug F5 — Run `git check-attr filter engine/stockfish-19.wasm`: assert result is `lfs`; on unfixed `.gitattributes` result is `-filter`
  - Bug F6 — Run `git remote get-url origin`: assert URL is `https://github.com/official-knightly/Chess-topper.git`; on unfixed repo result is stale URL
  - Bug F7 — Read `manifest.json`: assert `"version"` is `"0.5.0"`; on unfixed file it is `"0.4.0"`
  - Run all tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests FAIL (this is correct — it proves each bug exists)
  - Document counterexamples found (e.g. "no `.ct-update-badge` in DOM", "`#ct-analyze-btn` never injected", "`.ct-eng-row` absent", "tamper not detected", "`-filter` on wasm", "stale remote URL", "version `0.4.0`")
  - Mark task complete when tests are written, run, and each failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 1.10, 1.11, 1.13, 1.14_

- [ ] 2. Write preservation property tests (BEFORE implementing any fixes)
  - **Property 2: Preservation** - Existing Live-Analysis and UI Behaviors Unchanged
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code, observe outputs, then encode them as properties
  - Observe: `scan()` fires every 1 400 ms and dispatches `analyse()` / `remoteAnalyse()` for any FEN change; record this baseline
  - Observe: `applySettings({bar:false, arrow:false})` hides bar and arrow SVG with no new side effects
  - Observe: `analysisMode='wasm'` boots `engine/stockfish-19.js` and returns a `bestmove` UCI token
  - Observe: `analysisMode='server'` sends `CT_REMOTE_ANALYZE` and parses response via `readRemoteScore()` / `remotePv()`
  - Observe: `analysisMode='auto'` attempts remote first, falls back to WASM on timeout/failure
  - Observe: Hide/Show toggle collapses `.ct-card` and changes button text correctly
  - Observe: `resize`/`scroll` events re-draw the arrow via `drawArrow(state.bestmove)`
  - Observe: `validFen()` returns `null` for any random non-FEN string without throwing
  - Observe: background enforces 6 000 ms abort and returns structured `{ok, data/error}`
  - Write property-based tests: for all `{analysisMode, bar, arrow, depth, tampered:false, gameOver:false}` combinations, scan loop output is identical to unfixed baseline
  - Write property-based test: for any random string input, `validFen()` never throws
  - Verify ALL preservation tests PASS on UNFIXED code before proceeding
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_

- [ ] 3. Fix manifest.json — version bump and engine resource declarations

  - [ ] 3.1 Bump version and update description
    - Change `"version": "0.4.0"` to `"version": "0.5.0"` in `manifest.json`
    - Update `"description"` to `"v0.5.0 — four-engine switcher (Stockfish 19, Dragon, Rodent IV, Explanation), post-game move analysis, auto-update notifications, and integrity lock. Server-first with local WASM fallback."`
    - _Bug_Condition: isBugCondition_Version(manifest) where manifest.version ≠ "0.5.0"_
    - _Expected_Behavior: manifest.version = "0.5.0" so auto-update check fires correctly for existing v0.4.0 users_
    - _Preservation: web_accessible_resources entry for stockfish-19.js and stockfish-19.wasm must remain intact (3.14)_
    - _Requirements: 2.31, 3.14_

  - [ ] 3.2 Extend web_accessible_resources with additional engine files
    - Add to the existing `web_accessible_resources` resources array: `"engine/dragon.js"`, `"engine/dragon.wasm"`, `"engine/explanation-engine.js"`, `"engine/explanation-engine.wasm"`, `"engine/rodent/rodent.js"`, `"engine/rodent/rodent.wasm"`, `"engine/rodent/rodent.data"`
    - The existing `matches` array (all five supported host patterns) stays unchanged
    - _Preservation: original stockfish-19 entries must not be removed (3.14)_
    - _Requirements: 2.16, 2.17, 3.14_

- [ ] 4. Fix css/style.css — add all new UI styles

  - [ ] 4.1 Add update badge styles to style.css
    - Append `.ct-update-badge { background:#2f855a; color:#fff; border-radius:5px; padding:3px 7px; font-size:10px; margin-top:5px; display:flex; justify-content:space-between; align-items:center; gap:6px; }`
    - Append `.ct-update-badge button { background:transparent; color:#fff; border:0; padding:0; cursor:pointer; font-size:12px; margin:0; }`
    - _Requirements: 2.2, 2.3_

  - [ ] 4.2 Add engine switcher row styles
    - Append `.ct-eng-row { display:flex; align-items:center; gap:4px; margin:4px 0; }` and `.ct-eng-row button { padding:2px 6px; font-size:10px; margin:0; }`
    - _Requirements: 2.14, 2.15_

  - [ ] 4.3 Add post-game analysis button and review panel styles
    - Append `#ct-analyze-btn { position:fixed; background:#176b45; color:#fff; border:0; border-radius:50%; width:36px; height:36px; font-size:18px; cursor:pointer; z-index:2147483645; box-shadow:0 2px 8px #0003; }`
    - Append `#ct-game-review { position:fixed; z-index:2147483645; background:#fff; border:1px solid #d8dde3; border-radius:9px; padding:8px; max-width:200px; max-height:300px; overflow-y:auto; font:11px/1.4 system-ui,sans-serif; }`
    - Append classification dot color rules: `.ct-dot-best{color:#48bb78}`, `.ct-dot-good{color:#68d391}`, `.ct-dot-inaccuracy{color:#ecc94b}`, `.ct-dot-mistake{color:#ed8936}`, `.ct-dot-blunder{color:#f56565}`
    - _Requirements: 2.7, 2.9, 2.10, 2.11_

- [ ] 5. Fix css/popup.css and html/popup.html — update banner

  - [ ] 5.1 Add update-banner style to popup.css
    - Append `.update-banner { background:#276749; color:#fff; border-radius:6px; padding:7px 10px; margin-bottom:8px; font-size:11px; }`
    - _Requirements: 2.4_

  - [ ] 5.2 Add update-banner element to popup.html
    - Insert `<div id="update-banner" style="display:none" class="update-banner"></div>` immediately before the `<button id="apply">` element in `html/popup.html`
    - _Requirements: 2.4_

- [ ] 6. Fix js/background.js — version check cache and message handler

  - [ ] 6.1 Add module-level update cache state
    - Add `let updateCache = { newer: false, version: '' };` at module scope
    - _Requirements: 2.1_

  - [ ] 6.2 Implement checkVersionInBackground()
    - New async function that fetches `https://raw.githubusercontent.com/official-knightly/Chess-topper/main/manifest.json` with a 4 000 ms abort timeout
    - Parses the response JSON to extract `version`
    - Compares against `chrome.runtime.getManifest().version` using the same `semverGt` tuple-comparison logic (split on `.`, compare integer tuples left-to-right)
    - On `semverGt(fetched, installed)`: sets `updateCache = { newer: true, version: fetched }`
    - Entire body wrapped in `try { } catch(_) {}` for silent failure on network errors or non-200 responses
    - _Requirements: 2.1, 2.5_

  - [ ] 6.3 Wire startup listeners and CT_CHECK_UPDATE handler
    - Add `chrome.runtime.onStartup.addListener(() => checkVersionInBackground())` 
    - Add `chrome.runtime.onInstalled.addListener(() => checkVersionInBackground())`
    - In the existing `chrome.runtime.onMessage.addListener` callback, add a branch: `if (message?.type === 'CT_CHECK_UPDATE') { sendResponse(updateCache); return true; }`
    - _Preservation: existing CT_REMOTE_ANALYZE handler must remain exactly as-is (3.13)_
    - _Requirements: 2.4, 2.5, 3.13_

- [ ] 7. Fix js/popup.js — update banner injection

  - [ ] 7.1 Send CT_CHECK_UPDATE on popup load and inject banner
    - After the existing `chrome.storage.local.get(...)` block, add a `chrome.runtime.sendMessage({type:'CT_CHECK_UPDATE'})` call
    - In the response callback: if `response?.newer === true`, set `document.getElementById('update-banner').style.display = ''` and set its `textContent` to `'Update available ↑ v' + response.version`
    - _Preservation: existing settings load and Apply button handler must remain unchanged (3.4)_
    - _Requirements: 2.4, 3.4_

- [ ] 8. Fix js/board.js — full feature integration (largest task)

  - [ ] 8.1 Add ENGINES constant and extend state object
    - At the top of the IIFE, before `state`, add the `ENGINES` constant array with four entries:
      ```js
      const ENGINES = [
        {id:'sf19',    label:'Stockfish 19', js:'engine/stockfish-19.js'},
        {id:'dragon',  label:'Dragon',       js:'engine/dragon.js'},
        {id:'rodent',  label:'Rodent IV',    js:'engine/rodent/rodent.js'},
        {id:'explain', label:'Explain Eng',  js:'engine/explanation-engine.js'},
      ];
      ```
    - Add `engineIndex: 0` and `tampered: false` to the `state` object literal
    - _Requirements: 2.15, 2.19_

  - [ ] 8.2 Add engine switcher row to panel HTML
    - Inside the panel `innerHTML` string, add a new `<div class="ct-line ct-eng-row">` after the mode line:
      ```html
      <div class="ct-line ct-eng-row"><button class="ct-eng-prev">◀</button><span class="ct-eng-name">Stockfish 19</span><button class="ct-eng-next">▶</button></div>
      ```
    - _Requirements: 2.14_

  - [ ] 8.3 Implement switchEngine(delta) and refactor bootEngine()
    - Add `switchEngine(delta)` function: terminates existing Worker if present (`.terminate()`, nullifies `state.engine`, resets `state.ready` and `state.uciReady`), advances `state.engineIndex = ((state.engineIndex + delta) % 4 + 4) % 4`, updates `.ct-eng-name` text content, calls `bootEngine()`, and persists with `chrome.storage.local.set({engineIndex: state.engineIndex})`
    - Wire button handlers: `$('.ct-eng-prev').onclick = () => switchEngine(-1)` and `$('.ct-eng-next').onclick = () => switchEngine(1)`
    - Refactor `bootEngine()`: replace hardcoded `'engine/stockfish-19.js'` references with `ENGINES[state.engineIndex].js` and `ENGINES[state.engineIndex].label`; wrap `new Worker(...)` in try/catch — on error show "Engine unavailable", reset `state.engineIndex = 0`, and retry once with index 0
    - In the existing `chrome.storage.local.get(...)` init call, also read `engineIndex` and set `state.engineIndex = Math.min(3, Math.max(0, Number(v.engineIndex) || 0))`
    - _Bug_Condition: isBugCondition_EngineSwitcher(panel) where switcherRowPresent=false OR engineIndex NOT IN [0,1,2,3]_
    - _Expected_Behavior: panel shows active engine label; switchEngine(delta) cycles index modulo 4; persists to storage; re-analyses current FEN_
    - _Preservation: default boot with no stored engineIndex uses Stockfish 19 at index 0, identical to original (3.5)_
    - _Requirements: 2.14, 2.15, 2.16, 2.17, 2.18, 3.5_

  - [ ] 8.4 Implement checkIntegrity() and add tamper guard clauses
    - Implement `checkIntegrity()` as an async function: fetches `board.js` source via `chrome.runtime.getURL('js/board.js')` and `integrity.json` via `chrome.runtime.getURL('js/integrity.json')` in parallel; computes SHA-256 of source text via `crypto.subtle.digest('SHA-256', ...)` and converts to hex; compares against `manifest['board.js']`; on mismatch, absent file, or any error sets `state.tampered = true`; entire function wrapped in try/catch
    - Add `if (state.tampered) return;` guard at the top of `analyse()`, `remoteAnalyse()`, and `bootEngine()`
    - In `scan()`, after the `supportedAnalysisPath()` check, add: `if (state.tampered) { status('Integrity check failed'); arrowSvg.style.display = 'none'; return; }`
    - Call `checkIntegrity()` immediately at module init (before the `setInterval` and before any `bootEngine()` call)
    - _Bug_Condition: isBugCondition_Tamper(files) where boardJsSha256 ≠ expectedSha256_
    - _Expected_Behavior: state.tampered=true → analyse/remoteAnalyse/bootEngine return immediately; status="Integrity check failed"; arrow hidden; no console error_
    - _Preservation: when SHA-256 matches, state.tampered stays false and all analysis paths execute identically to original (3.1, 3.2)_
    - _Requirements: 2.19, 2.20, 2.21, 2.22, 3.1, 3.2_

  - [ ] 8.5 Implement semverGt() and checkForUpdate()
    - Add `semverGt(a, b)` helper: splits both strings on `.`, compares as integer tuples left-to-right; returns `true` only if `a > b` (strict)
    - Add module-level `let updateDismissed = false;` flag
    - Implement `checkForUpdate()` as an async function: fetches `https://raw.githubusercontent.com/official-knightly/Chess-topper/main/manifest.json` with `AbortSignal.timeout(4000)`; parses `version`; if `semverGt(fetched, installed)` and `!updateDismissed`: creates `.ct-update-badge` element with text `"Update available ↑ v" + fetched`, appends a dismiss button that sets `updateDismissed = true` and removes the badge, appends badge to `.ct-card`; entire body in `try { } catch(_) {}`
    - At the bottom of the IIFE init block (after panel and scan setup), call `setTimeout(checkForUpdate, 2000)`
    - _Bug_Condition: isBugCondition_UpdateNotification(state) where semverGt(githubVersion, installedVersion) AND NOT notificationShown_
    - _Expected_Behavior: .ct-update-badge injected into .ct-card with dismiss button; badge not re-injected after dismiss_
    - _Preservation: when installed ≥ GitHub version or fetch fails, no badge, no console error, no DOM change (2.5, 2.6, 3.1)_
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1_

  - [ ] 8.6 Implement post-game analysis helpers
    - `isGameOver()`: returns `true` if any of `.game-over-modal-content`, `.result-wrap`, `[data-game-over]`, `.game-result` is present in the DOM
    - `getGameMoves()`: tries `.move-list-wrapper move-text` (chess.com), `l4x > l4x` (lichess), `.moves-list` (worldchess) selectors; returns array of move strings or `null`
    - `reconstructPositions(moves)`: async; for each move, posts `position startpos moves m1 … mn` then `d` to `state.engine`; collects the `Fen:` output line; returns array of FEN strings
    - `analyseGame(positions)`: async; iterates positions sequentially (not in parallel); for each sends `go depth 12`, awaits `bestmove` token and final `score cp` info line; records `{fen, played, best, cpLoss}`; returns results array
    - `classifyMove(cpLoss)`: returns `{label, cssClass}` using thresholds: 0 → best/ct-dot-best; 1–20 → good/ct-dot-good; 21–60 → inaccuracy/ct-dot-inaccuracy; 61–150 → mistake/ct-dot-mistake; >150 → blunder/ct-dot-blunder
    - `renderGameReview(results)`: creates `#ct-game-review` div (max-width 200px, max-height 300px, overflow-y auto, positioned fixed near board); renders one row per result with colored classification dot span and move notation; appends a close button that removes the element
    - _Bug_Condition: isBugCondition_PostGame(context) where gameEnded=true AND moveListAvailable=true_
    - _Requirements: 2.8, 2.9, 2.10, 2.11, 2.12, 2.13_

  - [ ] 8.7 Implement post-game UI triggers and wire scan() game-over branch
    - `showAnalyzeButton()`: creates `#ct-analyze-btn` button (♟ symbol); positions it using `state.board.getBoundingClientRect()` bottom-right; attaches click handler calling `startPostGameAnalysis()`; appends to `document.documentElement`
    - `startPostGameAnalysis()`: async; shows "Analysing…" status; boots engine if not ready; calls `getGameMoves()`, `reconstructPositions()`, `analyseGame()`, `renderGameReview()`; on `getGameMoves()` returning null shows nothing and returns silently
    - In `scan()`, add game-over branch after the existing `supportedAnalysisPath()` and tamper checks: if `isGameOver()` is true and `#ct-analyze-btn` is not in DOM, call `showAnalyzeButton()`; if `isGameOver()` is false, remove `#ct-analyze-btn` if present (game restarted)
    - _Bug_Condition: isBugCondition_PostGame(context) where gameEnded=true AND moveListAvailable=true_
    - _Expected_Behavior: #ct-analyze-btn appears within one scan cycle (≤1 400 ms); clicking triggers sequential per-move analysis at depth 12; #ct-game-review appears with classification dots_
    - _Preservation: when isGameOver()=false, scan() behavior is identical to original — no #ct-analyze-btn, no #ct-game-review (3.1, 3.2)_
    - _Requirements: 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 3.1, 3.2_

- [ ] 9. Add scripts/build-integrity.mjs — integrity hash generator

  - [ ] 9.1 Create scripts/build-integrity.mjs
    - New file using Node.js built-ins only (no external dependencies)
    - Imports `createHash` from `node:crypto` and `readFileSync`, `writeFileSync` from `node:fs`
    - Defines `files` object mapping keys to paths: `'board.js' → 'js/board.js'`, `'background.js' → 'js/background.js'`, `'popup.js' → 'js/popup.js'`, `'style.css' → 'css/style.css'`
    - For each entry: reads the file, computes SHA-256 hex digest, stores in output object
    - Writes `js/integrity.json` as formatted JSON with a trailing newline
    - Logs `'integrity.json written'` to console
    - _Requirements: 2.23, 2.24_

- [ ] 10. Generate js/integrity.json — run build-integrity.mjs after all source changes

  - [ ] 10.1 Run the build-integrity script and check in the output
    - After tasks 3–9 are complete and all source files are in their final state, run `node scripts/build-integrity.mjs` from the repository root
    - Verify `js/integrity.json` is created with four keys: `board.js`, `background.js`, `popup.js`, `style.css`
    - Verify each value is a 64-character lowercase hex string
    - Check `js/integrity.json` into source control as a release artifact
    - _Bug_Condition: isBugCondition_Tamper(files) — integrity.json must exist and match current source files for the clean-file preservation path to work_
    - _Preservation: checkIntegrity() leaves state.tampered=false when hashes match (2.21)_
    - _Requirements: 2.23, 2.24, 2.21_

- [ ] 11. Fix .gitattributes — Git LFS rules for large binaries

  - [ ] 11.1 Update .gitattributes to enable LFS for all large binaries
    - Remove the `engine/stockfish-19.wasm -filter -diff -merge -text` opt-out line (and any similar `-filter` override for wasm)
    - Ensure `*.wasm filter=lfs diff=lfs merge=lfs -text` is present and applies to all wasm files (including `engine/stockfish-19.wasm`)
    - Add `engine/*.js filter=lfs diff=lfs merge=lfs -text` to track large engine JS files via LFS
    - Add `engine/rodent/*.js filter=lfs diff=lfs merge=lfs -text` to cover the Rodent subdirectory
    - Verify with `git check-attr filter engine/stockfish-19.wasm` → result must be `lfs`
    - _Bug_Condition: isBugCondition_LFS(repo) where NOT wasm_tracked_by_lfs OR NOT large_js_tracked_by_lfs_
    - _Expected_Behavior: git check-attr filter engine/stockfish-19.wasm returns "lfs"; engine/*.js tracked as LFS objects_
    - _Requirements: 2.25, 2.26_

- [ ] 12. Fix .github/workflows/fetch-stockfish-assets.yml — LFS installation in CI

  - [ ] 12.1 Add git lfs install step before checkout
    - In `jobs.install-engine-assets.steps`, add a new step before the `actions/checkout@v4` step:
      ```yaml
      - name: Install git-lfs
        run: git lfs install
      ```
    - _Bug_Condition: isBugCondition_LFS(repo) where NOT workflow_installs_lfs_
    - _Requirements: 2.27_

  - [ ] 12.2 Add git lfs push before regular git push in commit step
    - In the "Commit engine assets" step's `run` block, add `git lfs push --all origin main` immediately before the `git push` line
    - _Requirements: 2.28, 2.30_

- [ ] 13. Verify bug condition exploration test now passes (post-fix)
  - **Property 1: Expected Behavior** - All Seven Bug Conditions Resolved
  - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
  - The tests from task 1 encode the expected behavior for all seven fixes
  - When these tests pass, it confirms the expected behavior is satisfied across all features
  - Re-run all seven exploration tests from task 1 against the fixed codebase
  - **EXPECTED OUTCOME**: All tests PASS (confirms all seven bugs are fixed)
  - Specific validations:
    - F1: `.ct-update-badge` appears in `.ct-card` when githubVersion > installedVersion
    - F2: `#ct-analyze-btn` appears within one scan cycle after `isGameOver()` returns true
    - F3: `.ct-eng-row` with ◀/▶ buttons is present in the panel HTML
    - F4: Tampered `board.js` triggers status "Integrity check failed", halts analysis, hides arrow
    - F5: `git check-attr filter engine/stockfish-19.wasm` returns `lfs`
    - F6: `git remote get-url origin` returns `https://github.com/official-knightly/Chess-topper.git`
    - F7: `manifest.json` `"version"` is `"0.5.0"`
  - _Requirements: 2.1, 2.2, 2.7, 2.14, 2.19, 2.25, 2.29, 2.31_

- [ ] 14. Verify preservation tests still pass (post-fix)
  - **Property 2: Preservation** - No Regressions in Existing Behaviors
  - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
  - Run all preservation property tests from task 2 against the fixed codebase
  - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions)
  - Key invariants to confirm:
    - `scan()` loop continues at 1 400 ms with identical dispatch logic for non-game-over states
    - `applySettings()` applies bar/arrow preferences without page reload
    - `analysisMode='wasm'` boots Stockfish 19 (index 0) when no engineIndex is stored
    - `validFen()` still returns `null` for invalid input without throwing
    - Background 6 000 ms abort timeout and `{ok, data/error}` response shape unchanged
    - Hide/Show toggle still works; arrow repositions on resize/scroll
    - Popup Apply button still saves to storage and sends `CHESS_TOPPER_SETTINGS`
  - Confirm all tests still pass after every fix (no regressions introduced)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_

- [ ] 15. Fix git remote URL and perform final push

  - [ ] 15.1 Update git remote origin to canonical repository
    - Run `git remote set-url origin https://github.com/official-knightly/Chess-topper.git`
    - Verify with `git remote get-url origin` — must return `https://github.com/official-knightly/Chess-topper.git`
    - _Bug_Condition: isBugCondition_RemoteURL(remote) where originUrl ≠ "https://github.com/official-knightly/Chess-topper.git"_
    - _Expected_Behavior: all subsequent pushes target the canonical repository_
    - _Requirements: 2.29_

  - [ ] 15.2 Stage all changed files and create release commit
    - Run `git lfs install` (if not already active in this shell)
    - Stage all modified and new files: `manifest.json`, `css/style.css`, `css/popup.css`, `html/popup.html`, `js/board.js`, `js/background.js`, `js/popup.js`, `js/integrity.json`, `scripts/build-integrity.mjs`, `.gitattributes`, `.github/workflows/fetch-stockfish-assets.yml`
    - Commit with message: `feat: v0.5.0 — engine switcher, post-game analysis, update notifications, integrity lock, Git LFS`
    - _Requirements: 2.29, 2.30, 2.31_

  - [ ] 15.3 Push LFS objects then push commits
    - Run `git lfs push --all origin main` to push all LFS-tracked binary objects first
    - Run `git push -u origin main` to push commits to the canonical repository
    - _Bug_Condition: isBugCondition_RemoteURL(remote) — push must target the corrected URL_
    - _Requirements: 2.29, 2.30_

- [ ] 16. Checkpoint — Ensure all tests pass and release is complete
  - Re-run all bug condition exploration tests (task 1 suite) — all must PASS
  - Re-run all preservation property tests (task 2 suite) — all must PASS
  - Verify `manifest.json` version reads `0.5.0`
  - Verify `js/integrity.json` exists and has four 64-character hex entries
  - Verify `git remote get-url origin` returns `https://github.com/official-knightly/Chess-topper.git`
  - Verify `git check-attr filter engine/stockfish-19.wasm` returns `lfs`
  - Load the unpacked extension in Chrome, navigate to a chess.com analysis page, and confirm: evaluation bar shows, best-move arrow draws, engine switcher row visible, no "Integrity check failed" in status
  - Ensure all tests pass; ask the user if any questions arise
