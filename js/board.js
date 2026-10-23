(() => {
  if (window.__chessTopperLoaded) return; window.__chessTopperLoaded = true;
  const supportedAnalysisPath = () => /\/(analysis|study|review|game-review|puzzle)(\/|$)/i.test(location.pathname) || /analysis|study|review/i.test(location.search);
  const state = {bar:true, arrow:true, depth:12, engineName:'stockfish', score:0, bestmove:null, engine:null, ready:false, lastFen:'', board:null, pv:'', uciReady:false, remoteSeq:0, remoteBusy:false, remoteLastFen:'', remoteFailed:false};
  const files='abcdefgh';
  const panel=document.createElement('div'); panel.id='chess-topper-panel'; panel.innerHTML='<div class="ct-bar"><div class="ct-white"></div><div class="ct-score">0.0</div></div><div class="ct-card"><div class="ct-title">♞ Chess Topper</div><div class="ct-line ct-engine">Engine: Stockfish 19 Lite</div><div class="ct-line ct-move">Best move: —</div><div class="ct-line ct-eval">Evaluation: —</div><div class="ct-line ct-pv">Line: —</div><div class="ct-status">Looking for an analysis board…</div><button class="ct-toggle">Hide</button></div>';
  const arrowSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'); arrowSvg.id='chess-topper-arrow'; arrowSvg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`); arrowSvg.setAttribute('preserveAspectRatio','none'); arrowSvg.innerHTML='<defs><marker id="ct-head" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#12a66a"/></marker></defs><line id="ct-line" x1="0" y1="0" x2="0" y2="0" stroke="#12a66a" stroke-width="9" stroke-linecap="round" marker-end="url(#ct-head)" opacity=".88"/>';
  document.documentElement.append(panel,arrowSvg);
  const $=s=>panel.querySelector(s);
  $('.ct-toggle').onclick=()=>{const card=$('.ct-card');const hidden=card.style.display==='none';card.style.display=hidden?'':'none';$('.ct-toggle').textContent=hidden?'Hide':'Show';};
  chrome.storage?.local?.get({engine:'stockfish',bar:true,arrow:true,depth:12},v=>applySettings(v));
  chrome.runtime?.onMessage?.addListener(msg=>{if(msg.type==='CHESS_TOPPER_SETTINGS')applySettings(msg.settings)});
  function applySettings(v){const next=Object.assign({},state,v||{});const engineChanged=(next.engine||'stockfish')!==state.engineName;state.bar=next.bar!==false;state.arrow=next.arrow!==false;state.depth=Number(next.depth)||12;state.engineName=next.engine||'stockfish';$('.ct-bar').style.display=state.bar?'':'none';arrowSvg.style.display=state.arrow?'':'none';$('.ct-engine').textContent='Engine: '+(state.engineName==='andromeda'?'Andromeda':'Stockfish 19 Lite');if(engineChanged){if(state.engine){state.engine.terminate();state.engine=null;}state.ready=false;state.uciReady=false;state.bestmove=null;$('.ct-move').textContent='Best move: —';$('.ct-pv').textContent='Line: —';}if(state.lastFen){if(state.engineName==='stockfish'){remoteAnalyse(state.lastFen)}else{if(!state.engine)bootEngine();else analyse(state.lastFen)}}}
  function status(t){$('.ct-status').textContent=t}
  function findBoard(){return document.querySelector('cg-board')?.closest('cg-container')||document.querySelector('cg-board')||document.querySelector('chess-board')||document.querySelector('[data-board]')||document.querySelector('.board');}
  function squareFromTransform(el, board, lichess){const r=board.getBoundingClientRect(),pr=el.getBoundingClientRect();if(lichess){const t=el.style.transform||getComputedStyle(el).transform;const m=t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);if(m){const sq=Math.min(r.width,r.height)/8;return [Math.round(parseFloat(m[1])/sq),Math.round(parseFloat(m[2])/sq)]}}return [Math.floor((pr.left-r.left+r.width/16)/(r.width/8)),Math.floor((pr.top-r.top+r.height/16)/(r.height/8))]}
  function readPosition(){const b=findBoard();if(!b)return null;state.board=b;const r=b.getBoundingClientRect();if(r.width<100||r.height<100)return null;const grid=Array.from({length:8},()=>Array(8).fill(null));let pieces=Array.from(b.querySelectorAll('piece, .piece, [data-piece]'));const lichess=!!b.matches('cg-board')||!!b.querySelector('piece.white, piece.black');
    for(const p of pieces){let piece='',sqfile=-1,sqrank=-1;const cls=(p.className&&typeof p.className==='string'?p.className:'')+' '+(p.getAttribute('data-piece')||'');
      if(lichess){const c=cls.toLowerCase();const color=/\bwhite\b/.test(c)?'w':/\bblack\b/.test(c)?'b':'';const type=(c.match(/\b(king|queen|rook|bishop|knight|pawn)\b/i)||[])[1];if(color&&type){piece=color+({king:'k',queen:'q',rook:'r',bishop:'b',knight:'n',pawn:'p'}[type.toLowerCase()]);const [x,y]=squareFromTransform(p,b,true);sqfile=x;sqrank=7-y;}}
      else {const pc=cls.match(/\b([wb])([KQRBNP])\b/i);const sq=cls.match(/square-(\d{1,2})/);if(pc&&sq){piece=pc[1].toLowerCase()+pc[2].toLowerCase();const n=Number(sq[1]);sqfile=(n-1)%8;sqrank=7-Math.floor((n-1)/8);}}
      if(piece&&sqfile>=0&&sqfile<8&&sqrank>=0&&sqrank<8)grid[sqrank][sqfile]=piece;
    }
    if(!pieces.length||grid.flat().filter(Boolean).length<2)return null;
    const rows=grid.slice().reverse().map(row=>{let s='',empty=0;for(const p of row){if(!p)empty++;else{if(empty)s+=empty;s+=p;empty=0}}if(empty)s+=empty;return s}).join('/');
    const fen=rows+' w - - 0 1';return {fen,board:b,lichess};
  }
  function squareCenter(sq){if(!state.board)return null;const r=state.board.getBoundingClientRect();let f=files.indexOf(sq[0]),rank=Number(sq[1]);if(f<0||rank<1||rank>8)return null;const flipped=state.board.classList.contains('flipped')||state.board.closest('.flipped')||state.board.getAttribute('orientation')==='black';if(flipped){f=7-f;rank=9-rank}return {x:r.left+(f+.5)*r.width/8,y:r.top+(8-rank+.5)*r.height/8}}
  function drawArrow(move){const line=arrowSvg.querySelector('#ct-line');if(!move||move.length<4||!state.board){line.setAttribute('opacity','0');return}const a=squareCenter(move.slice(0,2)),b=squareCenter(move.slice(2,4));if(!a||!b)return;arrowSvg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('opacity',state.arrow?'0.88':'0')}
  function updateScore(cp){state.score=cp;const pawns=cp/100,clamped=Math.max(-10,Math.min(10,pawns));$('.ct-white').style.height=(50+clamped*4.5)+'%';const txt=(pawns>0?'+':'')+pawns.toFixed(1);$('.ct-score').textContent=txt;$('.ct-eval').textContent='Evaluation: '+txt}
  function bootEngine(){
    if(state.engine||!supportedAnalysisPath())return;
    const files=state.engineName==='andromeda'
      ? {js:'engine/andromeda.js',label:'Andromeda'}
      : {js:'engine/stockfish-19-lite.js',label:'Stockfish 19 Lite'};
    try {
      const worker=new Worker(chrome.runtime.getURL(files.js));
      state.engine=worker;
      worker.onmessage=e=>{
        const line=typeof e.data==='string'?e.data:'';
        if(line==='uciok'){state.uciReady=true;worker.postMessage('setoption name Threads value 2');worker.postMessage('isready');return;}
        if(line==='readyok'){state.ready=true;status(files.label+' ready');if(state.pendingFallbackFen||state.lastFen){const fen=state.pendingFallbackFen||state.lastFen;state.pendingFallbackFen='';analyse(fen);}return;}
        const depth=line.match(/\\bdepth (\\d+)/); if(depth)state.depthLive=Number(depth[1]);
        const cp=line.match(/\\bscore cp (-?\\d+)/);
        const mate=line.match(/\\bscore mate (-?\\d+)/);
        const pv=line.match(/\\bpv (.+)$/);
        if(cp)updateScore(Number(cp[1]));
        if(mate){$('.ct-eval').textContent='Evaluation: Mate in '+mate[1];$('.ct-score').textContent='M'+mate[1]}
        if(pv){state.pv=pv[1].trim();$('.ct-pv').textContent='Line: '+state.pv.split(/\\s+/).slice(0,7).join(' ')}
        const bm=line.match(/\\bbestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if(bm){state.bestmove=bm[1];$('.ct-move').textContent='Best move: '+bm[1];drawArrow(bm[1]);status(files.label+' analysis ready · depth '+(state.depthLive||state.depth))}
      };
      worker.onerror=()=>{status(files.label+' failed to load. Check engine JS/WASM/worker files.');state.ready=false;state.engine=null;};
      worker.postMessage('uci');
      setTimeout(()=>{if(!state.ready)status('Loading '+files.label+'…');},800);
    } catch(err) {status('Could not start '+files.label+'.');}
  }
  function analyse(fen){if(!state.engine||!fen)return;state.lastFen=fen;state.engine.postMessage('stop');state.engine.postMessage('position fen '+fen);state.engine.postMessage('go depth '+state.depth)}
    function readRemoteScore(data){
    let value = data?.eval ?? data?.evaluation ?? data?.score;
    if(value && typeof value==='object'){
      if(Number.isFinite(value.cp)) return {cp:value.cp, mate:null};
      if(Number.isFinite(value.mate)) return {cp:null, mate:value.mate};
      if(Number.isFinite(value.value)) value=value.value;
    }
    if(typeof value==='number' && Number.isFinite(value)) return {cp:Math.abs(value)>100 ? value : value*100, mate:null};
    if(Number.isFinite(data?.cp)) return {cp:data.cp, mate:null};
    if(Number.isFinite(data?.mate)) return {cp:null, mate:data.mate};
    return null;
  }
  function remotePv(data){
    const candidate=data?.pv ?? data?.bestline ?? data?.line ?? data?.principal_variation ?? data?.pvs?.[0]?.pv ?? data?.lines?.[0]?.pv;
    if(Array.isArray(candidate)) return candidate.join(' ');
    if(typeof candidate==='string') return candidate;
    if(Array.isArray(data?.pvs) && typeof data.pvs[0]==='string') return data.pvs[0];
    return '';
  }
  async function remoteAnalyse(fen){
    const seq=++state.remoteSeq;
    state.remoteLastFen=fen;
    state.remoteBusy=true;
    status('Requesting server Stockfish…');
    try {
      const result=await chrome.runtime.sendMessage({type:'CT_REMOTE_ANALYZE',fen,depth:Math.min(14,Math.max(1,state.depth)),multipv:2});
      if(seq!==state.remoteSeq || fen!==state.lastFen)return;
      if(!result?.ok) throw new Error(result?.error||'Server analysis failed');
      const data=result.data||{};
      const best=String(data.bestmove||data.best_move||data.move||'').trim().split(/\s+/)[0];
      if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(best)) throw new Error('API response did not include a valid best move');
      const score=readRemoteScore(data);
      if(score?.cp!==null && score?.cp!==undefined) updateScore(score.cp);
      else if(score?.mate!==null && score?.mate!==undefined){$('.ct-eval').textContent='Evaluation: Mate in '+score.mate;$('.ct-score').textContent='M'+score.mate}
      state.bestmove=best;
      const pv=remotePv(data)||best;
      state.pv=pv;
      $('.ct-move').textContent='Best move: '+best;
      $('.ct-pv').textContent='Line: '+pv.split(/\s+/).slice(0,7).join(' ');
      drawArrow(best);
      status('Server Stockfish ready · depth '+(data.depth||Math.min(14,state.depth)));
      state.remoteFailed=false;
    } catch(error) {
      if(seq!==state.remoteSeq || fen!==state.lastFen)return;
      state.remoteFailed=true;
      status('Server slow/unavailable; switching to local WASM…');
      if(!state.engine)bootEngine();
      if(state.engine){if(state.ready)analyse(fen);else state.pendingFallbackFen=fen;}
    } finally {
      if(seq===state.remoteSeq)state.remoteBusy=false;
    }
  }
function scan(){if(!supportedAnalysisPath()){status('Open analysis, study, or review mode to use Chess Topper.');return}const p=readPosition();if(!p){status('Waiting for a readable analysis board…');return}if(p.fen!==state.lastFen){state.lastFen=p.fen;state.bestmove=null;arrowSvg.querySelector('#ct-line').setAttribute('opacity','0');if(state.engineName==='stockfish'){remoteAnalyse(p.fen)}else{if(!state.engine)bootEngine();if(state.engine&&state.ready)analyse(p.fen)}}}
  setInterval(scan,1400);window.addEventListener('resize',()=>state.bestmove&&drawArrow(state.bestmove));
})();