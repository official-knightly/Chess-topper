// Starts the full single-threaded Stockfish build in an isolated extension
// worker.  Keep this loader separate from board detection so every supported
// Chess.com, Lichess, and World Chess page uses the same engine path.
(() => {
  const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
  const browserApi = typeof browser !== 'undefined' ? browser : null;
  const runtime = chromeApi?.runtime?.id
    ? chromeApi.runtime
    : browserApi?.runtime?.id
      ? browserApi.runtime
      : null;

  async function startStockfish({ getURL } = {}) {
    const resolveURL = typeof getURL === 'function'
      ? getURL
      : runtime && typeof runtime.getURL === 'function'
        ? runtime.getURL.bind(runtime)
        : null;

    if (!resolveURL) {
      throw new Error('Stockfish must start from an extension context');
    }

    const jsUrl = await resolveURL('engine/stockfish-19.js');
    const wasmUrl = await resolveURL('engine/stockfish-19.wasm');

    // A normal GitHub source ZIP may contain Git LFS pointer text instead
    // of the large asset. If that happens, retrieve the exact same tracked
    // object through GitHub's public media endpoint; no engine bytes are
    // rewritten or substituted with a different build.
    const [localJsResponse, localWasmResponse] = await Promise.all([
      fetch(jsUrl),
      fetch(wasmUrl),
    ]);
    if (!localJsResponse.ok) throw new Error(`Stockfish JavaScript HTTP ${localJsResponse.status}`);
    if (!localWasmResponse.ok) throw new Error(`Stockfish WASM HTTP ${localWasmResponse.status}`);
    let jsSource = await localJsResponse.text();
    let wasmBuffer = await localWasmResponse.arrayBuffer();
    const isLfsPointerText = (value) =>
      /^version https:\/\/git-lfs\.github\.com\/spec\/v1/m.test(value);
    const wasmPrefix = () => new TextDecoder().decode(wasmBuffer.slice(0, 120));
    const mediaBase = 'https://media.githubusercontent.com/media/official-knightly/Chess-topper/main/';
    if (isLfsPointerText(jsSource)) {
      const response = await fetch(mediaBase + 'engine/stockfish-19.js');
      if (!response.ok) throw new Error(`Stockfish LFS JavaScript download failed (HTTP ${response.status})`);
      jsSource = await response.text();
    }
    if (isLfsPointerText(wasmPrefix())) {
      const response = await fetch(mediaBase + 'engine/stockfish-19.wasm');
      if (!response.ok) throw new Error(`Stockfish LFS WASM download failed (HTTP ${response.status})`);
      wasmBuffer = await response.arrayBuffer();
    }
    if (jsSource.length < 10000) {
      throw new Error('Stockfish JavaScript is incomplete. Re-download the extension or check GitHub LFS availability.');
    }
    if (wasmBuffer.byteLength < 80 * 1024 * 1024) {
      throw new Error('Stockfish WASM is incomplete or GitHub LFS did not return the full engine (expected the full ~94 MB file).');
    }
    const wasmMagic = new Uint8Array(wasmBuffer, 0, 4);
    if (wasmMagic[0] !== 0 || wasmMagic[1] !== 0x61 || wasmMagic[2] !== 0x73 || wasmMagic[3] !== 0x6d) {
      throw new Error('Stockfish WASM has an invalid header; expected the original WebAssembly binary.');
    }

    // Stockfish.js calls WebAssembly.instantiateStreaming with its import
    // object.  Preserve those imports while supplying the already-fetched
    // bytes, otherwise the engine fails during WASM initialization.
    const workerSource = [
      'let wasmBytes = null;',
      'let stockfishInitialized = false;',
      'self.addEventListener("message", event => {',
      '  if (event.data?.type !== "CHESS_TOPPER_INIT_WASM" || stockfishInitialized) return;',
      '  stockfishInitialized = true;',
      '  wasmBytes = new Uint8Array(event.data.buffer);',
      '  const nativeInstantiateStreaming = WebAssembly.instantiateStreaming;',
      '  WebAssembly.instantiateStreaming = (_response, imports) =>',
      '    WebAssembly.instantiate(wasmBytes, imports || {});',
      '  const nativeFetch = self.fetch.bind(self);',
      '  self.fetch = (input, init) => {',
      '    const url = typeof input === "string" ? input : input?.url || "";',
      '    if (/\\.wasm(?:$|[?#])/i.test(url)) {',
      '      return Promise.resolve(new Response(wasmBytes, {',
      '        status: 200,',
      '        headers: { "Content-Type": "application/wasm" },',
      '      }));',
      '    }',
      '    return nativeFetch(input, init);',
      '  };',
      '  try {',
      jsSource,
      '  } catch (error) {',
      '    self.postMessage("ChessTopper Stockfish boot error: " + (error?.message || error));',
      '    throw error;',
      '  } finally {',
      '    // The engine may call the patched method asynchronously during boot;',
      '    // keep both shims alive for the lifetime of this worker.',
      '    void nativeInstantiateStreaming;',
      '  }',
      '});',
    ].join('\n');

    const blobUrl = URL.createObjectURL(new Blob([workerSource], {
      type: 'application/javascript',
    }));
    try {
      const worker = new Worker(blobUrl, {
        type: 'classic',
        name: 'ChessTopper-Stockfish-19',
      });
      worker.postMessage({
        type: 'CHESS_TOPPER_INIT_WASM',
        buffer: wasmBuffer,
      }, [wasmBuffer]);
      // The initialization message is delivered before this queued UCI
      // message, so Stockfish receives UCI after its own onmessage handler is
      // installed.
      worker.postMessage('uci');
      return worker;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }


  // Bundles the generated wasm-bindgen bindings into a classic extension
  // worker. The UCI adapter below lets the existing board/arrow pipeline use
  // Berserk exactly like the other local engines.
  async function startBerserk({ getURL } = {}) {
    const resolveURL = typeof getURL === 'function'
      ? getURL
      : runtime && typeof runtime.getURL === 'function'
        ? runtime.getURL.bind(runtime)
        : null;
    if (!resolveURL) throw new Error('Berserk must start from an extension context');

    const jsUrl = await resolveURL('engine/berserk/berserk.js');
    const wasmUrl = await resolveURL('engine/berserk/berserk_bg.wasm');
    const [jsResponse, wasmResponse] = await Promise.all([fetch(jsUrl), fetch(wasmUrl)]);
    if (!jsResponse.ok) throw new Error('Berserk JavaScript HTTP ' + jsResponse.status);
    if (!wasmResponse.ok) throw new Error('Berserk WASM HTTP ' + wasmResponse.status);

    let jsSource = await jsResponse.text();
    let wasmBuffer = await wasmResponse.arrayBuffer();
    const isLfsPointer = value => /^version https:\/\/git-lfs\.github\.com\/spec\/v1/m.test(value);
    const mediaBase = 'https://media.githubusercontent.com/media/official-knightly/Chess-topper/main/';
    if (isLfsPointer(jsSource)) {
      const response = await fetch(mediaBase + 'engine/berserk/berserk.js');
      if (!response.ok) throw new Error('Berserk LFS JavaScript download failed (HTTP ' + response.status + ')');
      jsSource = await response.text();
    }
    if (isLfsPointer(new TextDecoder().decode(wasmBuffer.slice(0, 120)))) {
      const response = await fetch(mediaBase + 'engine/berserk/berserk_bg.wasm');
      if (!response.ok) throw new Error('Berserk LFS WASM download failed (HTTP ' + response.status + ')');
      wasmBuffer = await response.arrayBuffer();
    }

    if (jsSource.length < 8000) {
      throw new Error('Berserk JavaScript bindings are incomplete. Reload the extension ZIP or check GitHub.');
    }
    const wasmBytes = new Uint8Array(wasmBuffer);
    if (wasmBytes.byteLength < 1_000_000 ||
        wasmBytes[0] !== 0 || wasmBytes[1] !== 0x61 ||
        wasmBytes[2] !== 0x73 || wasmBytes[3] !== 0x6d) {
      throw new Error('Berserk WASM is missing, truncated, or not a WebAssembly binary (' + wasmBytes.byteLength + ' bytes).');
    }

    // Convert the generated ES module to classic-worker source. There are no
    // imports in this wasm-bindgen output; init receives the bytes directly.
    const bindingsSource = jsSource
      .replace(/^\s*export\s+class\s+Engine/m, 'class Engine')
      .replace(/^\s*export\s+function\s+run_helper_thread/m, 'function run_helper_thread')
      .replace(/^\s*export\s+\{\s*initSync\s*,\s*__wbg_init\s+as\s+default\s*\};?\s*$/m, '')
      .replace(/\bimport\.meta\.url\b/g, 'self.location.href');
    if (/\bexport\s+(?:class|function|const|let|var|\{)/.test(bindingsSource)) {
      throw new Error('Unsupported export in generated Berserk bindings. Refresh the matching loader from Berserk Web.');
    }

    const workerSource = [
      bindingsSource,
      'const __ctInit = __wbg_init;',
      'const __ctStartFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";',
      'let __ctWasmBuffer = null;',
      'let __ctEngine = null;',
      'let __ctInitPromise = null;',
      'let __ctQueue = Promise.resolve();',
      'async function __ctEnsureEngine() {',
      '  if (!__ctInitPromise) {',
      '    __ctInitPromise = (async function () {',
      '      if (!__ctWasmBuffer) throw new Error("Berserk WASM bytes were not supplied to the worker.");',
      '      await __ctInit(__ctWasmBuffer);',
      '      __ctEngine = new Engine();',
      '      __ctEngine.set_threads(1);',
      '      __ctEngine.set_position(__ctStartFen);',
      '      return __ctEngine;',
      '    })();',
      '  }',
      '  return __ctInitPromise;',
      '}',
      'function __ctEmitInfo(line, emitted) {',
      '  const value = String(line || "").trim();',
      '  if (value.startsWith("info ")) { emitted.add(value); self.postMessage(value); }',
      '}',
      'function __ctSetPosition(command, engine) {',
      '  const payload = command.slice("position ".length).trim();',
      '  const marker = payload.indexOf(" moves ");',
      '  const base = marker >= 0 ? payload.slice(0, marker).trim() : payload;',
      '  const moves = marker >= 0 ? payload.slice(marker + 7).trim().split(/\\s+/).filter(Boolean) : [];',
      '  if (base === "startpos") engine.set_position(__ctStartFen);',
      '  else if (base.startsWith("fen ")) engine.set_position(base.slice(4).trim());',
      '  else throw new Error("Unsupported UCI position command.");',
      '  for (const move of moves) engine.make_move(move);',
      '}',
      'async function __ctRun(command) {',
      '  const text = String(command || "").trim();',
      '  if (!text) return;',
      '  if (text === "uci") {',
      '    await __ctEnsureEngine();',
      '    self.postMessage("id name Berserk WASM");',
      '    self.postMessage("id author official-knightly");',
      '    self.postMessage("option name Threads type spin default 1 min 1 max 1");',
      '    self.postMessage("uciok");',
      '    return;',
      '  }',
      '  if (text === "isready") { await __ctEnsureEngine(); self.postMessage("readyok"); return; }',
      '  if (text === "quit") { self.close(); return; }',
      '  if (text === "stop") return;',
      '  const engine = await __ctEnsureEngine();',
      '  if (text === "ucinewgame") { engine.reset(); engine.set_position(__ctStartFen); return; }',
      '  if (text.startsWith("setoption ")) return;',
      '  if (text.startsWith("position ")) { __ctSetPosition(text, engine); return; }',
      '  if (!text.startsWith("go ")) return;',
      '  const depthMatch = text.match(/\\bdepth\\s+(\\d+)/i);',
      '  const timeMatch = text.match(/\\bmovetime\\s+(\\d+)/i);',
      '  const nodesMatch = text.match(/\\bnodes\\s+(\\d+)/i);',
      '  const pvMatch = text.match(/\\bmultipv\\s+(\\d+)/i);',
      '  const depth = depthMatch ? Math.max(1, Math.min(40, Number(depthMatch[1]))) : 0;',
      '  const milliseconds = timeMatch ? Math.max(100, Math.min(10000, Number(timeMatch[1]))) : 1000;',
      '  const nodes = nodesMatch ? Math.max(0, Number(nodesMatch[1])) : 0;',
      '  const multiPV = pvMatch ? Math.max(1, Math.min(8, Number(pvMatch[1]))) : 1;',
      '  const emitted = new Set();',
      '  const onInfo = line => __ctEmitInfo(line, emitted);',
      '  engine.take_output();',
      '  if (depth) engine.go_uci(depth, nodes, multiPV, onInfo);',
      '  else engine.go_movetime(milliseconds, multiPV, onInfo);',
      '  const buffered = String(engine.take_output() || "");',
      '  for (const line of buffered.split(/\\r?\\n/)) __ctEmitInfo(line, emitted);',
      '  const directBest = String(engine.last_bestmove() || "");',
      '  const bufferedBest = buffered.match(/\\bbestmove\\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);',
      '  const best = directBest.match(/[a-h][1-8][a-h][1-8][qrbn]?/i)?.[0] || (bufferedBest && bufferedBest[1]) || "0000";',
      '  self.postMessage("bestmove " + best);',
      '}',
      'self.addEventListener("message", event => {',
      '  const data = event.data;',
      '  if (data && data.type === "CHESS_TOPPER_INIT_BERSERK") { __ctWasmBuffer = data.buffer; return; }',
      '  __ctQueue = __ctQueue.then(() => __ctRun(data)).catch(error => {',
      '    self.postMessage({ type: "CHESS_TOPPER_ENGINE_ERROR", error: error && error.message ? error.message : String(error) });',
      '  });',
      '});'
    ].join('\n');

    const blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'application/javascript' }));
    try {
      const worker = new Worker(blobUrl, { type: 'classic', name: 'ChessTopper-Berserk-WASM' });
      worker.postMessage({ type: 'CHESS_TOPPER_INIT_BERSERK', buffer: wasmBuffer }, [wasmBuffer]);
      return worker;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  globalThis.__chessTopperStartStockfish = startStockfish;
  globalThis.__chessTopperStartBerserk = startBerserk;
})();
