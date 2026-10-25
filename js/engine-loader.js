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

    const [jsResponse, wasmResponse] = await Promise.all([
      fetch(jsUrl),
      fetch(wasmUrl),
    ]);
    if (!jsResponse.ok) throw new Error(`Stockfish JavaScript HTTP ${jsResponse.status}`);
    if (!wasmResponse.ok) throw new Error(`Stockfish WASM HTTP ${wasmResponse.status}`);

    const [jsSource, wasmBuffer] = await Promise.all([
      jsResponse.text(),
      wasmResponse.arrayBuffer(),
    ]);
    if (wasmBuffer.byteLength < 8) throw new Error('Stockfish WASM is empty or incomplete');

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

  globalThis.__chessTopperStartStockfish = startStockfish;
})();
