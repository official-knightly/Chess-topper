(() => {
  if (window.__chessTopperLoaded) return;
  window.__chessTopperLoaded = true;

  const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
  const browserApi = typeof browser !== 'undefined' ? browser : null;
  const runtimeApi = chromeApi?.runtime || browserApi?.runtime || null;
  const storageApi = chromeApi?.storage?.local || browserApi?.storage?.local || null;
  const BRIDGE_SOURCE = 'ChessTopperRuntimeBridge';
  const bridgePending = new Map();
  const settingsListeners = new Set();
  let bridgeRequestId = 0;

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== BRIDGE_SOURCE || event.data.direction !== 'to-page') return;
    const data = event.data;
    if (data.type === 'settings') {
      settingsListeners.forEach(listener => listener(data.message));
      return;
    }
    const pending = bridgePending.get(data.requestId);
    if (!pending) return;
    bridgePending.delete(data.requestId);
    clearTimeout(pending.timer);
    if (data.ok) pending.resolve(data.result);
    else pending.reject(new Error(data.error || 'Extension runtime bridge failed'));
  });

  function callExtensionApi(start) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };
      try {
        const result = start(value => {
          const lastError = runtimeApi?.lastError;
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

  function callRuntimeBridge(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const requestId = 'ct-' + (++bridgeRequestId) + '-' + Date.now();
      const timer = setTimeout(() => {
        bridgePending.delete(requestId);
        reject(new Error('Extension runtime bridge timed out'));
      }, 5000);
      bridgePending.set(requestId, { resolve, reject, timer });
      window.postMessage({
        source: BRIDGE_SOURCE,
        direction: 'to-extension',
        requestId,
        action,
        payload,
      }, '*');
    });
  }

  const extension = {
    hasRuntime: typeof runtimeApi?.getURL === 'function',
    getURL(path) {
      return this.hasRuntime ? runtimeApi.getURL(path) : callRuntimeBridge('getURL', { path });
    },
    storageGet(defaults) {
      return this.hasRuntime && storageApi
        ? callExtensionApi(done => storageApi.get(defaults, done))
        : callRuntimeBridge('getStorage', { defaults });
    },
    storageSet(values) {
      return this.hasRuntime && storageApi
        ? callExtensionApi(done => storageApi.set(values, done))
        : callRuntimeBridge('setStorage', { values });
    },
    sendMessage(message) {
      return this.hasRuntime
        ? callExtensionApi(done => runtimeApi.sendMessage(message, done))
        : callRuntimeBridge('sendMessage', { message });
    },
    onSettings(listener) {
      if (this.hasRuntime && runtimeApi.onMessage?.addListener) runtimeApi.onMessage.addListener(listener);
      else settingsListeners.add(listener);
    },
  };

  // ─── Engine definitions (browser-safe UCI workers only) ───
  const ENGINES = [
    { id: 'sf19',   label: 'Stockfish 19', js: 'engine/stockfish-19.js', wasm: 'engine/stockfish-19.wasm' },
    { id: 'dragon', label: 'Dragon',       js: 'engine/dragon.js',       wasm: 'engine/dragon.wasm'       },
  ];

  const ENGINE_START_TIMEOUT_MS = 90000;

  const state = {
    bar: true, arrow: true, depth: 16, analysisMode: 'auto',
    engineIndex: 0,
    score: 0, bestmove: null, engine: null, ready: false,
    lastFen: '', board: null, pv: '',
    uciReady: false,
    remoteSeq: 0, remoteBusy: false, remoteLastFen: '',
    remoteFailed: false, localFallbackActive: false, localSearchFen: '',
    pendingFallbackFen: '', depthLive: 0,
    failedEngines: {}, engineStartTimer: null, engineStarting: false, engineBootId: 0,
  };

  const FILES = 'abcdefgh';

  // ─── Panel ───
  const panel = document.createElement('div');
  panel.id = 'chess-topper-panel';
  panel.innerHTML = `
    <div class="ct-bar"><div class="ct-white"></div><div class="ct-score">0.0</div></div>
    <div class="ct-card">
      <div class="ct-title">♞ Chess Topper</div>
      <div class="ct-line ct-engine">Mode: Auto (server → WASM)</div>
      <div class="ct-line ct-eng-row">
        <button class="ct-eng-prev" title="Previous engine">◀</button>
        <span class="ct-eng-name">Stockfish 19</span>
        <button class="ct-eng-next" title="Next engine">▶</button>
      </div>
      <div class="ct-line ct-move">Best move: —</div>
      <div class="ct-line ct-eval">Evaluation: —</div>
      <div class="ct-line ct-pv">Line: —</div>
      <div class="ct-line ct-position">Position: waiting…</div>
      <div class="ct-status">Looking for a board…</div>
      <button class="ct-toggle">Hide</button>
    </div>`;

  // ─── Arrow SVG overlay ───
  const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrowSvg.id = 'chess-topper-arrow';
  arrowSvg.setAttribute('viewBox', '0 0 1 1');
  arrowSvg.setAttribute('preserveAspectRatio', 'none');
  arrowSvg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;overflow:visible;';
  arrowSvg.innerHTML = `<line id="ct-line" x1="0" y1="0" x2="0" y2="0" stroke="#12a66a" stroke-width="6"
    stroke-linecap="round" opacity="0"/>
  <polygon id="ct-head" points="0,0 0,0 0,0" fill="#12a66a" opacity="0"/>`;

  document.documentElement.append(panel, arrowSvg);

  const $ = s => panel.querySelector(s);

  // ─── Hide/Show toggle ───
  $('.ct-toggle').onclick = () => {
    const card = $('.ct-card');
    const hidden = card.style.display === 'none';
    card.style.display = hidden ? '' : 'none';
    $('.ct-toggle').textContent = hidden ? 'Hide' : 'Show';
  };

  // ─── Engine switcher ───
  function switchEngine(delta) {
    state.engineBootId++;
    state.engineStarting = false;
    if (state.engine) {
      try { state.engine.terminate(); } catch (_) {}
      state.engine = null;
      state.ready = false;
      state.uciReady = false;
    }
    clearTimeout(state.engineStartTimer);
    state.engineStartTimer = null;
    state.engineIndex = ((state.engineIndex + delta) % ENGINES.length + ENGINES.length) % ENGINES.length;
    delete state.failedEngines[ENGINES[state.engineIndex].id];
    $('.ct-eng-name').textContent = ENGINES[state.engineIndex].label;
    status('Loading ' + ENGINES[state.engineIndex].label + '…');
    bootEngine();
    void extension.storageSet({ engineIndex: state.engineIndex }).catch(() => {});
  }

  $('.ct-eng-prev').onclick = () => switchEngine(-1);
  $('.ct-eng-next').onclick = () => switchEngine(1);

  // ─── Settings ───
  extension.storageGet({ analysisMode: 'auto', bar: true, arrow: true, depth: 16, engineIndex: 0 }).then(v => {
    state.engineIndex = Math.min(ENGINES.length - 1, Math.max(0, Number(v.engineIndex) || 0));
    $('.ct-eng-name').textContent = ENGINES[state.engineIndex].label;
    applySettings(v);
  }).catch(() => {
    applySettings({ analysisMode: 'auto', bar: true, arrow: true, depth: 16, engineIndex: 0 });
  });

  extension.onSettings(msg => {
    if (msg.type === 'CHESS_TOPPER_SETTINGS') applySettings(msg.settings);
  });

  function applySettings(v) {
    const next = Object.assign({}, state, v || {});
    const mode = ['auto', 'wasm', 'server'].includes(next.analysisMode) ? next.analysisMode : 'auto';
    const modeChanged = mode !== state.analysisMode;
    state.bar    = next.bar !== false;
    state.arrow  = next.arrow !== false;
    state.depth  = Math.min(20, Math.max(1, Number(next.depth) || 16));
    state.analysisMode = mode;
    $('.ct-bar').style.display   = state.bar   ? '' : 'none';
    arrowSvg.style.display       = state.arrow ? '' : 'none';
    $('.ct-engine').textContent  = 'Mode: ' + ({ auto: 'Auto (server → WASM)', wasm: 'Local WASM', server: 'Server only' }[mode]);
    if (modeChanged) {
      state.remoteSeq++; state.remoteBusy = false;
      state.bestmove = null; state.remoteFailed = false; state.pendingFallbackFen = '';
    }
    if (state.lastFen) {
      if (mode === 'wasm') {
        if (!state.engine) bootEngine();
        if (state.engine && state.ready) analyse(state.lastFen);
        else state.pendingFallbackFen = state.lastFen;
      } else {
        remoteAnalyse(state.lastFen);
      }
    }
  }

  function status(t) { $('.ct-status').textContent = t; }

  // ─── Board detection (chess.com, lichess, worldchess) ───
  function findBoard() {
    const selectors = 'cg-board, wc-chess-board, chess-board, .main-board .board, [data-board], .board';
    const candidates = Array.from(document.querySelectorAll(selectors));
    return candidates
      .map(board => {
        const rect = board.getBoundingClientRect();
        const pieces = board.querySelectorAll('piece, .piece, [data-piece]').length;
        return { board, rect, pieces, area: rect.width * rect.height };
      })
      .filter(item => item.rect.width >= 100 && item.rect.height >= 100 && item.pieces >= 2)
      .sort((a, b) => b.area - a.area || b.pieces - a.pieces)[0]?.board || null;
  }

  function squareFromTransform(el, board, blackOri) {
    const r = board.getBoundingClientRect();
    const t = el.style.transform || getComputedStyle(el).transform || '';
    const m = t.match(/translate\(\s*([-\d.]+)(?:px|%)?\s*,\s*([-\d.]+)(?:px|%)?\s*\)/i);
    let x = NaN, y = NaN;
    // A percentage translate is relative to the piece element, not the board;
    // use its rendered rectangle in that case. Pixel transforms can be mapped
    // directly when a site exposes them.
    if (m && !/%/.test(m[0])) {
      const sq = Math.min(r.width, r.height) / 8;
      x = parseFloat(m[1]) / sq;
      y = parseFloat(m[2]) / sq;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const pr = el.getBoundingClientRect();
      x = ((pr.left + pr.width / 2) - r.left) / (r.width / 8);
      y = ((pr.top + pr.height / 2) - r.top) / (r.height / 8);
    }
    x = Math.max(0, Math.min(7, Math.round(x)));
    y = Math.max(0, Math.min(7, Math.round(y)));
    return [blackOri ? 7 - x : x, blackOri ? y : 7 - y];
  }

  function validFen(value) {
    if (typeof value !== 'string') return null;
    const parts = value.trim().split(/\s+/);
    if (parts.length < 4 || parts.length > 6) return null;
    const ranks = parts[0].split('/');
    if (ranks.length !== 8 || !ranks.every(rank => {
      let n = 0;
      for (const c of rank) {
        if (/[1-8]/.test(c)) n += Number(c);
        else if (/[prnbqkPRNBQK]/.test(c)) n++;
        else return false;
      }
      return n === 8;
    })) return null;
    if (!/^[wb]$/.test(parts[1]) || !/^(-|K?Q?k?q?)$/.test(parts[2]) || !/^(-|[a-h][36])$/.test(parts[3])) return null;
    const half = parts[4] ?? '0', full = parts[5] ?? '1';
    if (!/^\d+$/.test(half) || !/^\d+$/.test(full) || Number(full) < 1) return null;
    return parts[0] + ' ' + parts[1] + ' ' + parts[2] + ' ' + parts[3] + ' ' + half + ' ' + full;
  }

  function readNativeFen(board) {
    const hosts = [board, board.closest('chess-board'), board.closest('[data-fen]')].filter(Boolean);
    for (const host of hosts) {
      for (const attr of ['data-fen', 'fen', 'data-position', 'position']) {
        const fen = validFen(host.getAttribute?.(attr));
        if (fen) return fen;
      }
      for (const getter of [
        () => host.fen, () => host.positionFen,
        () => host.game?.getFEN?.(), () => host.game?.getFen?.(),
        () => host.game?.fen, () => host.getFEN?.(), () => host.getFen?.(),
      ]) {
        try { const fen = validFen(getter()); if (fen) return fen; } catch (_) {}
      }
    }
    return null;
  }

  function readTurn(board) {
    for (const attr of ['data-turn', 'data-side-to-move', 'turn']) {
      const v = board.getAttribute(attr);
      if (/^b(lack)?$/i.test(v || '')) return 'b';
      if (/^w(hite)?$/i.test(v || '')) return 'w';
    }
    const contexts = [board, board.parentElement, board.closest('.game,.game-container,.board-layout')].filter(Boolean);
    for (const ctx of contexts) {
      const cls = (ctx.className && typeof ctx.className === 'string' ? ctx.className : '').toLowerCase();
      if (/turn-black|black-to-move|side-black/.test(cls)) return 'b';
      if (/turn-white|white-to-move|side-white/.test(cls)) return 'w';
    }

    const activeByColor = document.querySelector(
      '.clock-black.running,.clock-black.active,[data-clock="black"].active,[data-color="black"].active,' +
      '.clock-white.running,.clock-white.active,[data-clock="white"].active,[data-color="white"].active'
    );
    if (activeByColor) {
      const cls = `${activeByColor.className || ''} ${activeByColor.parentElement?.className || ''}`.toLowerCase();
      if (/black/.test(cls) || activeByColor.getAttribute('data-clock') === 'black' || activeByColor.getAttribute('data-color') === 'black') return 'b';
      if (/white/.test(cls) || activeByColor.getAttribute('data-clock') === 'white' || activeByColor.getAttribute('data-color') === 'white') return 'w';
    }

    // Chess.com live clocks mark the active clock with player-turn/clock-player-turn.
    // Their vertical order follows the board orientation, so map top/bottom to a side.
    const clocks = Array.from(document.querySelectorAll(
      '.clock-time-monospace, [role="timer"], .clock-component .clock-time, .rclock'
    )).filter(el => el.offsetParent !== null);
    const activeClock = clocks.find(el => /player-turn|clock-player-turn/.test(
      `${el.className || ''} ${el.closest('.clock-component')?.className || ''}`.toLowerCase()
    ));
    if (activeClock && clocks.length >= 2) {
      const ordered = clocks.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const isBottom = activeClock === ordered[ordered.length - 1];
      const blackOri = isBlackOrientation(board);
      return (isBottom !== blackOri) ? 'w' : 'b';
    }

    // Move-list fallback covers live boards whose clock classes are hidden or renamed.
    const plies = Array.from(document.querySelectorAll('.move-node, .move, [data-ply], .ply, [data-move-number]'))
      .filter(el => el.offsetParent !== null);
    if (plies.length) return plies.length % 2 ? 'b' : 'w';
    return null;
  }

  function isBlackOrientation(board) {
    let el = board;
    while (el && el.nodeType === 1) {
      const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
      const ori = el.getAttribute?.('data-orientation') || el.getAttribute?.('orientation') || '';
      const flipped = el.getAttribute?.('data-flipped') || el.getAttribute?.('flipped') || '';
      if (/\b(?:orientation-black|flipped|black-orientation)\b/i.test(cls) || /^black$/i.test(ori) || /^(?:true|1|black)$/i.test(flipped)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function isBoardAnimating(board) {
    if (!board) return false;
    const cls = typeof board.className === 'string' ? board.className : (board.className?.baseVal || '');
    if (/\b(?:animating|animation|transitioning|dragging|moving)\b/i.test(cls)) return true;
    return Array.from(board.querySelectorAll('piece, .piece')).some(piece => {
      const cls = typeof piece.className === 'string' ? piece.className : (piece.className?.baseVal || '');
      return /\b(?:animating|animation|transitioning|dragging|moving)\b/i.test(cls)
        || getComputedStyle(piece).animationName !== 'none';
    });
  }

  function readPosition() {
    const b = findBoard();
    if (!b) return null;
    state.board = b;
    const r = b.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) return null;
    const lichess = !!b.matches('cg-board') || !!b.querySelector('piece.white, piece.black');
    const nativeFen = readNativeFen(b);
    if (nativeFen) return { fen: nativeFen, board: b, lichess, fenComplete: true };

    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    const pieces = Array.from(b.querySelectorAll('piece, .piece, [data-piece]'));
    const blackOri = isBlackOrientation(b);
    for (const p of pieces) {
      let piece = '', sqfile = -1, sqrank = -1;
      const cls = (p.className && typeof p.className === 'string' ? p.className : '') + ' ' +
        (p.getAttribute('data-piece') || '') + ' ' + (p.getAttribute('data-piece-type') || '');
      if (lichess) {
        const c = cls.toLowerCase();
        const color = /\bwhite\b/.test(c) ? 'w' : /\bblack\b/.test(c) ? 'b' : '';
        const type = (c.match(/\b(king|queen|rook|bishop|knight|pawn)\b/i) || [])[1];
        if (color && type) {
          piece = color + ({ king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }[type.toLowerCase()]);
          [sqfile, sqrank] = squareFromTransform(p, b, blackOri);
        }
      } else {
        const pc = cls.match(/\b([wb])([KQRBNP])\b/i);
        const named = cls.match(/\b(white|black)\s*(king|queen|rook|bishop|knight|pawn)\b/i);
        const coord = cls.match(/\bsquare-([1-8])([1-8])\b/) || p.getAttribute('data-square')?.match(/^([1-8])([1-8])$/);
        const numeric = cls.match(/\bsquare-(\d{1,2})\b/);
        if (!pc && named) {
          const color = named[1].toLowerCase() === 'white' ? 'w' : 'b';
          const type = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }[named[2].toLowerCase()];
          piece = color + type;
        }
        if (pc) {
          piece = pc[1].toLowerCase() + pc[2].toLowerCase();
        }
        if (coord) { sqfile = Number(coord[1]) - 1; sqrank = Number(coord[2]) - 1; }
        else if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 64) {
          const n = Number(numeric[1]) - 1;
          sqfile = n % 8; sqrank = 7 - Math.floor(n / 8);
        } else if (piece) {
          [sqfile, sqrank] = squareFromTransform(p, b, blackOri);
        }
      }
      if (piece && sqfile >= 0 && sqfile < 8 && sqrank >= 0 && sqrank < 8) grid[sqrank][sqfile] = piece;
    }
    if (!pieces.length || grid.flat().filter(Boolean).length < 2) return null;

    const rows = grid.slice().reverse().map(row => {
      let out = '', empty = 0;
      for (const p of row) { if (!p) empty++; else { if (empty) out += empty; out += p; empty = 0; } }
      if (empty) out += empty;
      return out;
    }).join('/');
    const turn = readTurn(b);
    return { fen: rows + ' ' + (turn || 'w') + ' - - 0 1', board: b, lichess, fenComplete: false, turnKnown: !!turn };
  }

  function squareCenter(sq) {
    if (!state.board) return null;
    const r = state.board.getBoundingClientRect();
    let f = FILES.indexOf(sq[0]), rank = Number(sq[1]);
    if (f < 0 || rank < 1 || rank > 8) return null;
    if (isBlackOrientation(state.board)) { f = 7 - f; rank = 9 - rank; }
    return { x: r.left + (f + .5) * r.width / 8, y: r.top + (8 - rank + .5) * r.height / 8 };
  }

  function drawArrow(move) {
    const line = arrowSvg.querySelector('#ct-line');
    if (!move || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(move) || !state.board) {
      line.setAttribute('opacity', '0'); return;
    }
    const a = squareCenter(move.slice(0, 2)), b = squareCenter(move.slice(2, 4));
    if (!a || !b) { line.setAttribute('opacity', '0'); return; }
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (!len) { line.setAttribute('opacity', '0'); return; }
    const rect = state.board.getBoundingClientRect(), sq = Math.min(rect.width, rect.height) / 8;
    const s0 = Math.min(sq * .18, len * .16), s1 = Math.min(sq * .28, len * .24);
    const head = Math.min(sq * .28, len * .24);
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const tipX = b.x - ux * s1, tipY = b.y - uy * s1;
    const baseX = tipX - ux * head, baseY = tipY - uy * head;
    const wing = head * .55;
    arrowSvg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    line.setAttribute('x1', a.x + dx / len * s0);
    line.setAttribute('y1', a.y + dy / len * s0);
    line.setAttribute('x2', baseX);
    line.setAttribute('y2', baseY);
    line.setAttribute('stroke-width', Math.max(3, Math.min(7, sq * .075)));
    line.setAttribute('opacity', state.arrow ? '0.92' : '0');
    const headEl = arrowSvg.querySelector('#ct-head');
    headEl.setAttribute('points', `${tipX},${tipY} ${baseX + px * wing},${baseY + py * wing} ${baseX - px * wing},${baseY - py * wing}`);
    headEl.setAttribute('opacity', state.arrow ? '0.96' : '0');
  }

  function updateScore(cp) {
    state.score = cp;
    const pawns = cp / 100, clamped = Math.max(-10, Math.min(10, pawns));
    $('.ct-white').style.height = (50 + clamped * 4.5) + '%';
    const txt = (pawns > 0 ? '+' : '') + pawns.toFixed(1);
    $('.ct-score').textContent = txt;
    $('.ct-eval').textContent = 'Evaluation: ' + txt;
  }

  // ─── Boot engine ──────────────────────────────────────────────────────────
  function getExtensionUrl(path) {
    return extension.getURL(path);
  }

  // MV3 content scripts cannot reliably create a Worker directly from a
  // chrome-extension:// URL. Stockfish uses the shared loader so its runtime
  // check and WASM bootstrap are identical on every supported page.
  async function createEngineWorker(def) {
    if (def.id === 'sf19' && typeof globalThis.__chessTopperStartStockfish === 'function') {
      return globalThis.__chessTopperStartStockfish({
        getURL: path => extension.getURL(path),
      });
    }

    const [jsUrl, wasmUrl] = await Promise.all([getExtensionUrl(def.js), getExtensionUrl(def.wasm)]);

    const [jsResponse, wasmResponse] = await Promise.all([fetch(jsUrl), fetch(wasmUrl)]);
    if (!jsResponse.ok) throw new Error('Engine JavaScript HTTP ' + jsResponse.status);
    if (!wasmResponse.ok) throw new Error('Engine WASM HTTP ' + wasmResponse.status);
    const [jsCode, wasmBuffer] = await Promise.all([jsResponse.text(), wasmResponse.arrayBuffer()]);
    const executableCode = def.id === 'dragon'
      ? jsCode.replace(/Module = \{\s*onRuntimeInitialized:/,
          'Module = { wasmBinary: __chessTopperWasm, onRuntimeInitialized:')
      : jsCode;

    const source = `
let __chessTopperWasm = null;
const __chessTopperInit = event => {
  if (!event.data || event.data.type !== 'CHESS_TOPPER_INIT_WASM') return;
  self.removeEventListener('message', __chessTopperInit);
  __chessTopperWasm = new Uint8Array(event.data.buffer);
  const originalFetch = self.fetch.bind(self);
  WebAssembly.instantiateStreaming = (response, imports) => WebAssembly.instantiate(__chessTopperWasm, imports);
  self.fetch = (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input && input.url || '';
    if (/\\.wasm(?:$|[?#])/i.test(requestUrl)) {
      return Promise.resolve(new Response(__chessTopperWasm, {
        status: 200,
        headers: { 'Content-Type': 'application/wasm' }
      }));
    }
    return originalFetch(input, init);
  };
  try {
${executableCode}
  } catch (error) {
    postMessage('ChessTopper engine boot error: ' + (error && error.message || error));
    throw error;
  }
};
self.addEventListener('message', __chessTopperInit);
`;
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
    const workerUrl = blobUrl + '#' + encodeURIComponent(wasmUrl);
    try {
      const worker = new Worker(workerUrl, { type: 'classic', name: 'ChessTopper-' + def.id });
      worker.postMessage({ type: 'CHESS_TOPPER_INIT_WASM', buffer: wasmBuffer }, [wasmBuffer]);
      return worker;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  function markEngineFailed(def, reason) {
    state.engineStarting = false;
    state.failedEngines[def.id] = true;
    state.engine = null; state.ready = false; state.uciReady = false;
    console.error('[ChessTopper] Engine failed:', def.label, reason || 'startup timeout');

    const fallback = ENGINES.findIndex(engine => !state.failedEngines[engine.id]);
    if (fallback >= 0) {
      state.engineIndex = fallback;
      $('.ct-eng-name').textContent = ENGINES[fallback].label;
      void extension.storageSet({ engineIndex: fallback }).catch(() => {});
      status(def.label + ' failed — trying ' + ENGINES[fallback].label + '…');
      setTimeout(bootEngine, 250);
    } else {
      status('No local engine could start: ' + (reason || 'startup failed'));
    }
  }

  async function bootEngine() {
    if (state.engine || state.engineStarting) return;

    const def = ENGINES[state.engineIndex];
    const bootId = ++state.engineBootId;
    state.engineStarting = true;
    status('Loading ' + def.label + '…');

    try {
      const worker = await createEngineWorker(def);
      if (bootId !== state.engineBootId) {
        try { worker.terminate(); } catch (_) {}
        return;
      }
      state.engineStarting = false;

      state.engine = worker;

      const failEngine = reason => {
        if (state.engine !== worker) return;
        clearTimeout(state.engineStartTimer);
        state.engineStartTimer = null;
        try { worker.terminate(); } catch (_) {}
        markEngineFailed(def, reason);
      };

      state.engineStartTimer = setTimeout(() => failEngine('startup timeout'), ENGINE_START_TIMEOUT_MS);

      worker.onmessage = e => {
        const line = typeof e.data === 'string' ? e.data.trim() : '';
        if (!line) return;

        if (line === 'uciok') {
          state.uciReady = true;
          worker.postMessage('setoption name Threads value 1');
          worker.postMessage('isready');
          return;
        }
        if (line === 'readyok') {
          clearTimeout(state.engineStartTimer);
          state.engineStartTimer = null;
          delete state.failedEngines[def.id];
          state.ready = true;
          status(def.label + ' ready');
          const fen = state.pendingFallbackFen || state.lastFen;
          if (fen && (state.analysisMode === 'wasm' || state.localFallbackActive)) {
            state.pendingFallbackFen = '';
            analyse(fen);
          } else if (fen) {
            state.pendingFallbackFen = fen;
          }
          return;
        }

        // Only process engine output when we want local analysis
        if (state.analysisMode !== 'wasm' && !state.localFallbackActive) return;
        if (state.localSearchFen && state.localSearchFen !== state.lastFen) return;

        const depth = line.match(/\bdepth (\d+)/);
        if (depth) state.depthLive = Number(depth[1]);

        const cp   = line.match(/\bscore cp (-?\d+)/);
        const mate = line.match(/\bscore mate (-?\d+)/);
        const pv   = line.match(/\bpv (.+)$/);

        if (cp) updateScore(Number(cp[1]));
        if (mate) {
          $('.ct-eval').textContent  = 'Evaluation: Mate in ' + mate[1];
          $('.ct-score').textContent = 'M' + mate[1];
        }
        if (pv) {
          state.pv = pv[1].trim();
          $('.ct-pv').textContent = 'Line: ' + state.pv.split(/\s+/).slice(0, 7).join(' ');
        }

        const bm = line.match(/\bbestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (bm) {
          state.bestmove = bm[1];
          $('.ct-move').textContent = 'Best move: ' + bm[1];
          drawArrow(bm[1]);
          status(def.label + ' ✓ depth ' + (state.depthLive || state.depth));
        }
      };

      worker.onerror = err => {
        console.error('[ChessTopper] Worker error:', err?.message || err);
        failEngine(err?.message || 'worker error');
      };

      worker.onmessageerror = () => failEngine('message error');

      // Send UCI handshake
      worker.postMessage('uci');

    } catch (err) {
      console.error('[ChessTopper] Could not start worker:', err?.message || err);
      clearTimeout(state.engineStartTimer);
      state.engineStartTimer = null;
      if (bootId === state.engineBootId) markEngineFailed(def, err?.message || 'worker creation failed');
    }
  }

  function analyse(fen) {
    if (!state.engine || !fen) return;
    state.localSearchFen = fen;
    state.engine.postMessage('stop');
    state.engine.postMessage('position fen ' + fen);
    state.engine.postMessage('go depth ' + state.depth);
  }

  // ─── Remote analysis (server Stockfish) ──────────────────────────────────
  function readRemoteScore(data) {
    const value = data?.eval ?? data?.evaluation ?? data?.score ?? data?.pvs?.[0]?.eval;
    if (value && typeof value === 'object') {
      if (value.type === 'mate' && Number.isFinite(value.value)) return { cp: null, mate: value.value };
      if (value.type === 'cp'   && Number.isFinite(value.value)) return { cp: value.value, mate: null };
      if (Number.isFinite(value.cp))   return { cp: value.cp,    mate: null };
      if (Number.isFinite(value.mate)) return { cp: null,        mate: value.mate };
      if (Number.isFinite(value.value)) return { cp: value.value, mate: null };
    }
    if (typeof value === 'number' && Number.isFinite(value)) return { cp: Math.abs(value) > 100 ? value : value * 100, mate: null };
    if (Number.isFinite(data?.cp))   return { cp: data.cp,   mate: null };
    if (Number.isFinite(data?.mate)) return { cp: null,      mate: data.mate };
    return null;
  }

  function remotePv(data) {
    const c = data?.pv ?? data?.bestline ?? data?.line ?? data?.continuation
      ?? data?.principal_variation ?? data?.pvs?.[0]?.moves ?? data?.pvs?.[0]?.pv ?? data?.lines?.[0]?.pv;
    if (Array.isArray(c)) return c.join(' ');
    if (typeof c === 'string') return c;
    if (Array.isArray(data?.pvs) && typeof data.pvs[0] === 'string') return data.pvs[0];
    return '';
  }

  async function remoteAnalyse(fen) {
    const seq = ++state.remoteSeq;
    state.remoteLastFen = fen;
    state.remoteBusy = true;
    state.localFallbackActive = false;
    state.localSearchFen = '';
    if (state.engine && state.ready) try { state.engine.postMessage('stop'); } catch (_) {}
    status('Requesting server Stockfish…');
    try {
      const result = await extension.sendMessage({
        type: 'CT_REMOTE_ANALYZE', fen,
        depth: Math.min(14, Math.max(1, state.depth)), multipv: 2,
      });
      if (seq !== state.remoteSeq || fen !== state.lastFen) return;
      if (!result?.ok) throw new Error(result?.error || 'Server analysis failed');
      const data = result.data || {};
      const bestRaw = String(data.bestmove || data.best_move || data.move || '').trim().replace(/^bestmove\s+/i, '');
      const best = bestRaw.match(/^[a-h][1-8][a-h][1-8][qrbn]?/i)?.[0] || '';
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(best)) throw new Error('No valid best move in API response');
      const score = readRemoteScore(data);
      if (score?.cp != null) updateScore(score.cp);
      else if (score?.mate != null) {
        $('.ct-eval').textContent  = 'Evaluation: Mate in ' + score.mate;
        $('.ct-score').textContent = 'M' + score.mate;
      }
      state.bestmove = best;
      state.localFallbackActive = false;
      state.localSearchFen = '';
      if (state.engine && state.ready) try { state.engine.postMessage('stop'); } catch (_) {}
      const pv = remotePv(data) || best;
      state.pv = pv;
      $('.ct-move').textContent = 'Best move: ' + best;
      $('.ct-pv').textContent   = 'Line: ' + pv.split(/\s+/).slice(0, 7).join(' ');
      drawArrow(best);
      status('Server Stockfish ✓ depth ' + (data.depth || Math.min(14, state.depth)));
      state.remoteFailed = false;
    } catch (error) {
      if (seq !== state.remoteSeq || fen !== state.lastFen) return;
      state.remoteFailed = true;
      if (state.analysisMode === 'server') {
        status('Server failed: ' + (error?.message || 'request failed')); return;
      }
      state.localFallbackActive = true;
      status('Server unavailable — using local WASM…');
      if (!state.engine) bootEngine();
      if (state.engine) { if (state.ready) analyse(fen); else state.pendingFallbackFen = fen; }
    } finally {
      if (seq === state.remoteSeq) state.remoteBusy = false;
    }
  }

  // ─── Board resize observer ────────────────────────────────────────────────
  let observedBoard = null, boardResizeObs = null, boardMutationObs = null, scanTimer = null;

  function scheduleScan(delay = 140) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanTimer = null; scan(); }, delay);
  }

  function observeBoard(board) {
    if (!board || board === observedBoard) return;
    observedBoard = board;
    if (boardResizeObs) boardResizeObs.disconnect();
    if (boardMutationObs) boardMutationObs.disconnect();
    if (typeof ResizeObserver === 'function') {
      boardResizeObs = new ResizeObserver(() => {
        if (state.bestmove && state.board === observedBoard) drawArrow(state.bestmove);
      });
      boardResizeObs.observe(board);
    }
    if (typeof MutationObserver === 'function') {
      boardMutationObs = new MutationObserver(() => scheduleScan());
      boardMutationObs.observe(board, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-fen', 'data-position', 'data-turn', 'data-side-to-move', 'data-flipped'],
      });
    }
  }

  // ─── Main scan loop ───────────────────────────────────────────────────────
  function scan() {
    const p = readPosition();
    observeBoard(p?.board);
    if (!p) { status('Waiting for a chess board…'); return; }
    if (isBoardAnimating(p.board)) {
      status('Waiting for the move to finish…');
      scheduleScan(220);
      return;
    }

    $('.ct-position').textContent = p.fenComplete
      ? 'Position: site FEN'
      : 'Position: estimated' + (p.turnKnown ? ' (no castling/ep)' : ' (no turn/castling/ep)');

    if (p.fen !== state.lastFen) {
      state.lastFen = p.fen;
      state.bestmove = null; state.pv = '';
      arrowSvg.querySelector('#ct-line').setAttribute('opacity', '0');
      if (state.analysisMode === 'wasm') {
        if (!state.engine) bootEngine();
        if (state.engine && state.ready) analyse(p.fen);
        else state.pendingFallbackFen = p.fen;
      } else {
        // Auto mode starts the local engine in parallel. If the server is
        // unavailable, the already-started local worker can answer instantly.
        if (state.analysisMode === 'auto' && !state.engine) bootEngine();
        remoteAnalyse(p.fen);
      }
    } else if (state.bestmove) {
      drawArrow(state.bestmove);
    }
  }

  setInterval(scan, 700);
  scheduleScan(0);
  window.addEventListener('resize', () => state.bestmove && drawArrow(state.bestmove));
  window.addEventListener('scroll', () => state.bestmove && drawArrow(state.bestmove), true);
  window.visualViewport?.addEventListener('resize', () => state.bestmove && drawArrow(state.bestmove));
  window.visualViewport?.addEventListener('scroll',  () => state.bestmove && drawArrow(state.bestmove));
  window.addEventListener('orientationchange', () => state.bestmove && drawArrow(state.bestmove));
})();
