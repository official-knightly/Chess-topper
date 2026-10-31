// Keeps a small, allow-listed bridge available when a site or another
// injector evaluates board.js in the page world instead of the extension's
// isolated content-script world.
(() => {
  const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
  const browserApi = typeof browser !== 'undefined' ? browser : null;
  const runtime = chromeApi?.runtime || browserApi?.runtime;
  const storage = chromeApi?.storage?.local || browserApi?.storage?.local;
  if (typeof runtime?.getURL !== 'function') return;

  const SOURCE = 'ChessTopperRuntimeBridge';
  const allowedPaths = new Set([
    'engine/berserk/berserk.js', 'engine/berserk/berserk_bg.wasm',
    'engine/stockfish-19.js', 'engine/stockfish-19.wasm',
    'engine/dragon.js', 'engine/dragon.wasm',
  ]);

  function respond(requestId, ok, result, error) {
    window.postMessage({
      source: SOURCE,
      direction: 'to-page',
      requestId,
      ok,
      result,
      error: error?.message || String(error || ''),
    }, '*');
  }

  function callApi(start) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };
      try {
        const result = start(value => {
          const lastError = runtime.lastError;
          if (lastError) finish(reject, new Error(lastError.message));
          else finish(resolve, value);
        });
        if (result && typeof result.then === 'function') result.then(
          value => finish(resolve, value),
          error => finish(reject, error),
        );
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== SOURCE || event.data.direction !== 'to-extension') return;
    const { requestId, action, payload = {} } = event.data;
    if (!requestId) return;

    try {
      if (action === 'getURL') {
        if (!allowedPaths.has(payload.path)) throw new Error('Engine asset is not allow-listed');
        respond(requestId, true, runtime.getURL(payload.path));
        return;
      }
      if (action === 'getStorage') {
        if (!storage) throw new Error('Extension storage API is unavailable');
        callApi(done => storage.get(payload.defaults || {}, done))
          .then(value => respond(requestId, true, value))
          .catch(error => respond(requestId, false, null, error));
        return;
      }
      if (action === 'setStorage') {
        if (!storage) throw new Error('Extension storage API is unavailable');
        const values = { engineIndex: Number(payload.values?.engineIndex) || 0 };
        callApi(done => storage.set(values, done))
          .then(value => respond(requestId, true, value))
          .catch(error => respond(requestId, false, null, error));
        return;
      }
      if (action === 'sendMessage') {
        if (payload.message?.type !== 'CT_REMOTE_ANALYZE') throw new Error('Message type is not allow-listed');
        callApi(done => runtime.sendMessage(payload.message, done))
          .then(value => respond(requestId, true, value))
          .catch(error => respond(requestId, false, null, error));
        return;
      }
      throw new Error('Unknown bridge action');
    } catch (error) {
      respond(requestId, false, null, error);
    }
  });

  runtime.onMessage?.addListener(message => {
    window.postMessage({ source: SOURCE, direction: 'to-page', type: 'settings', message }, '*');
  });
})();
