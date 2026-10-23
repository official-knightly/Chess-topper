(() => {
  if (window.__chessTopperLoaded) return; window.__chessTopperLoaded = true;
  const supportedAnalysisPath = () => /\/(analysis|study|review|game-review|puzzle)(\/|$)/i.test(location.pathname) || /analysis|study|review/i.test(location.search);
  const state = {bar:true, arrow:true, depth:12, analysisMode:'auto', score:0, bestmove:null, engine:null, ready:false, lastFen:'', board:null, pv:'', uciReady:false, remoteSeq:0, remoteBusy:false, remoteLastFen:'', remoteFailed:false, localFallbackActive:false, localSearchFen:''};
  const files='abcdefgh';
  const panel=document.createElement('div'); panel.id='chess-topper-panel'; panel.innerHTML='<div class="ct-bar"><div class="ct-white"></div><div class="ct-score">0.0</div></div><div class="ct-card"><div class="ct-title">♞ Chess Topper</div><div class="ct-line ct-engine">Mode: Auto (server → WASM)</div><div class="ct-line ct-move">Best move: —</div><div class="ct-line ct-eval">Evaluation: —</div><div class="ct-line ct-pv">Line: —</div><div class="ct-line ct-position">Position: waiting…</div><div class="ct-status">Looking for an analysis board…</div><button class="ct-toggle">Hide</button></div>';
  const arrowSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'); arrowSvg.id='chess-topper-arrow'; arrowSvg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`); arrowSvg.setAttribute('preserveAspectRatio','none'); arrowSvg.innerHTML='<defs><marker id="ct-head" markerUnits="strokeWidth" markerWidth="4" markerHeight="4" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#12a66a"/></marker></defs><line id="ct-line" x1="0" y1="0" x2="0" y2="0" stroke="#12a66a" stroke-width="6" stroke-linecap="round" marker-end="url(#ct-head)" opacity="0"/>';
  document.documentElement.append(panel,arrowSvg);
  const $=s=>panel.querySelector(s);
  $('.ct-toggle').onclick=()=>{const card=$('.ct-card');const hidden=card.style.display==='none';card.style.display=hidden?'':'none';$('.ct-toggle').textContent=hidden?'Hide':'Show';};
  chrome.storage?.local?.get({analysisMode:'auto',bar:true,arrow:true,depth:12},v=>applySettings(v));
  chrome.runtime?.onMessage?.addListener(msg=>{if(msg.type==='CHESS_TOPPER_SETTINGS')applySettings(msg.settings)});
  function applySettings(v){const next=Object.assign({},state,v||{});const mode=['auto','wasm','server'].includes(next.analysisMode)?next.analysisMode:'auto';const modeChanged=mode!==state.analysisMode;state.bar=next.bar!==false;state.arrow=next.arrow!==false;state.depth=Math.min(20,Math.max(1,Number(next.depth)||12));state.analysisMode=mode;$('.ct-bar').style.display=state.bar?'':'none';arrowSvg.style.display=state.arrow?'':'none';$('.ct-engine').textContent='Mode: '+({auto:'Auto (server → WASM)',wasm:'Local WASM',server:'Server only'}[mode]);if(modeChanged){state.remoteSeq++;state.remoteBusy=false;state.bestmove=null;state.remoteFailed=false;state.pendingFallbackFen='';}if(state.lastFen){if(mode==='wasm'){if(!state.engine)bootEngine();if(state.engine&&state.ready)analyse(state.lastFen);else state.pendingFallbackFen=state.lastFen;}else{remoteAnalyse(state.lastFen)}}}
  function status(t){$('.ct-status').textContent=t}
  function findBoard(){return document.querySelector('cg-board')||document.querySelector('wc-chess-board')||document.querySelector('chess-board')||document.querySelector('[data-board]')||document.querySelector('.board');}
  function squareFromTransform(el, board, lichess){const r=board.getBoundingClientRect(),pr=el.getBoundingClientRect();if(lichess){const t=el.style.transform||getComputedStyle(el).transform;const m=t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);if(m){const sq=Math.min(r.width,r.height)/8;return [Math.round(parseFloat(m[1])/sq),Math.round(parseFloat(m[2])/sq)]}}return [Math.floor((pr.left-r.left+r.width/16)/(r.width/8)),Math.floor((pr.top-r.top+r.height/16)/(r.height/8))]}
  function validFen(value){
    if(typeof value!=='string')return null;
    const parts=value.trim().split(/\s+/);
    if(parts.length<4||parts.length>6)return null;
    const ranks=parts[0].split('/');
    if(ranks.length!==8||!ranks.every(rank=>{let n=0;for(const c of rank){if(/[1-8]/.test(c))n+=Number(c);else if(/[prnbqkPRNBQK]/.test(c))n++;else return false;}return n===8;}))return null;
    if(!/^[wb]$/.test(parts[1])||!/^(-|K?Q?k?q?)$/.test(parts[2])||!/^(-|[a-h][36])$/.test(parts[3]))return null;
    const half=parts[4]??'0',full=parts[5]??'1';
    if(!/^\d+$/.test(half)||!/^\d+$/.test(full)||Number(full)<1)return null;
    return parts[0]+' '+parts[1]+' '+parts[2]+' '+parts[3]+' '+half+' '+full;
  }
  function readNativeFen(board){
    const hosts=[board,board.closest('chess-board'),board.closest('[data-fen]')].filter(Boolean);
    for(const host of hosts){
      for(const attr of ['data-fen','fen','data-position','position']){
        const fen=validFen(host.getAttribute?.(attr));
        if(fen)return fen;
      }
      for(const getter of [()=>host.fen,()=>host.positionFen,()=>host.game?.getFEN?.(),()=>host.game?.getFen?.(),()=>host.game?.fen,()=>host.getFEN?.(),()=>host.getFen?.()]){
        try{const fen=validFen(getter());if(fen)return fen;}catch(_){}
      }
    }
    return null;
  }
  function readTurn(board){
    const values=[board.getAttribute('data-turn'),board.getAttribute('data-side-to-move'),board.getAttribute('turn')];
    for(const value of values){if(/^b(lack)?$/i.test(value||''))return 'b';if(/^w(hite)?$/i.test(value||''))return 'w';}
    const context=board.closest('.orientation-white,.orientation-black,.turn-white,.turn-black,[data-turn]')||board.parentElement;
    const cls=(context?.className&&typeof context.className==='string'?context.className:'').toLowerCase();
    if(/turn-black|black-to-move|side-black/.test(cls))return 'b';
    if(/turn-white|white-to-move|side-white/.test(cls))return 'w';
    if(document.querySelector('.clock-black.running,.clock-black.active,[data-clock="black"].active'))return 'b';
    if(document.querySelector('.clock-white.running,.clock-white.active,[data-clock="white"].active'))return 'w';
    return null;
  }
  function readPosition(){
    const b=findBoard();if(!b)return null;state.board=b;
    const r=b.getBoundingClientRect();if(r.width<100||r.height<100)return null;
    const lichess=!!b.matches('cg-board')||!!b.querySelector('piece.white, piece.black');
    const nativeFen=readNativeFen(b);
    if(nativeFen)return {fen:nativeFen,board:b,lichess,fenComplete:true};
    const grid=Array.from({length:8},()=>Array(8).fill(null));
    const pieces=Array.from(b.querySelectorAll('piece, .piece, [data-piece]'));
    const blackOrientation=isBlackOrientation(b);
    for(const p of pieces){
      let piece='',sqfile=-1,sqrank=-1;
      const cls=(p.className&&typeof p.className==='string'?p.className:'')+' '+(p.getAttribute('data-piece')||'');
      if(lichess){
        const c=cls.toLowerCase();
        const color=/\bwhite\b/.test(c)?'w':/\bblack\b/.test(c)?'b':'';
        const type=(c.match(/\b(king|queen|rook|bishop|knight|pawn)\b/i)||[])[1];
        if(color&&type){
          piece=color+({king:'k',queen:'q',rook:'r',bishop:'b',knight:'n',pawn:'p'}[type.toLowerCase()]);
          const [x,y]=squareFromTransform(p,b,true);
          sqfile=blackOrientation?7-x:x;
          sqrank=blackOrientation?y:7-y;
        }
      }else{
        const pc=cls.match(/\b([wb])([KQRBNP])\b/i);
        const coord=cls.match(/\bsquare-([1-8])([1-8])\b/);
        const numeric=cls.match(/\bsquare-(\d{1,2})\b/);
        if(pc){
          piece=pc[1].toLowerCase()+pc[2].toLowerCase();
          if(coord){sqfile=Number(coord[1])-1;sqrank=Number(coord[2])-1;}
          else if(numeric&&Number(numeric[1])>=1&&Number(numeric[1])<=64){
            const n=Number(numeric[1])-1;sqfile=n%8;sqrank=7-Math.floor(n/8);
          }
        }
      }
      if(piece&&sqfile>=0&&sqfile<8&&sqrank>=0&&sqrank<8)grid[sqrank][sqfile]=piece;
    }
    if(!pieces.length||grid.flat().filter(Boolean).length<2)return null;
    const rows=grid.slice().reverse().map(row=>{let out='',empty=0;for(const p of row){if(!p)empty++;else{if(empty)out+=empty;out+=p;empty=0;}}if(empty)out+=empty;return out;}).join('/');
    const turn=readTurn(b);
    return {fen:rows+' '+(turn||'w')+' - - 0 1',board:b,lichess,fenComplete:false,turnKnown:!!turn};
  }
  function isBlackOrientation(board){let el=board;while(el&&el.nodeType===1){const cls=typeof el.className==='string'?el.className:(el.className?.baseVal||'');const orientation=el.getAttribute?.('data-orientation')||el.getAttribute?.('orientation')||'';if(/\b(?:orientation-black|flipped|black-orientation)\b/i.test(cls)||/^black$/i.test(orientation))return true;el=el.parentElement;}return false;}
  function squareCenter(sq){if(!state.board)return null;const r=state.board.getBoundingClientRect();let f=files.indexOf(sq[0]),rank=Number(sq[1]);if(f<0||rank<1||rank>8)return null;if(isBlackOrientation(state.board)){f=7-f;rank=9-rank;}return {x:r.left+(f+.5)*r.width/8,y:r.top+(8-rank+.5)*r.height/8};}
  function drawArrow(move){const line=arrowSvg.querySelector('#ct-line');if(!move||!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(move)||!state.board){line.setAttribute('opacity','0');return}const a=squareCenter(move.slice(0,2)),b=squareCenter(move.slice(2,4));if(!a||!b){line.setAttribute('opacity','0');return}const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length){line.setAttribute('opacity','0');return}const rect=state.board.getBoundingClientRect(),square=Math.min(rect.width,rect.height)/8;const startGap=Math.min(square*.18,length*.16),endGap=Math.min(square*.28,length*.24);arrowSvg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);line.setAttribute('x1',a.x+dx/length*startGap);line.setAttribute('y1',a.y+dy/length*startGap);line.setAttribute('x2',b.x-dx/length*endGap);line.setAttribute('y2',b.y-dy/length*endGap);line.setAttribute('stroke-width',Math.max(3,Math.min(7,square*.075)));line.setAttribute('opacity',state.arrow?'0.92':'0')}
  function updateScore(cp){state.score=cp;const pawns=cp/100,clamped=Math.max(-10,Math.min(10,pawns));$('.ct-white').style.height=(50+clamped*4.5)+'%';const txt=(pawns>0?'+':'')+pawns.toFixed(1);$('.ct-score').textContent=txt;$('.ct-eval').textContent='Evaluation: '+txt}
  function bootEngine(){
    if(state.engine||!supportedAnalysisPath())return;
    const files={js:'engine/stockfish-19-lite-single.js',label:'Stockfish 19 Lite'};
    try {
      const worker=new Worker(chrome.runtime.getURL(files.js));
      state.engine=worker;
      worker.onmessage=e=>{
        const line=typeof e.data==='string'?e.data:'';
        if(line==='uciok'){state.uciReady=true;worker.postMessage('setoption name Threads value 1');worker.postMessage('isready');return;}
        if(line==='readyok'){state.ready=true;status(files.label+' ready');if(state.pendingFallbackFen||state.lastFen){const fen=state.pendingFallbackFen||state.lastFen;state.pendingFallbackFen='';analyse(fen);}return;}
        if(state.analysisMode!=='wasm'&&!state.localFallbackActive)return;
        if(state.localSearchFen&&state.localSearchFen!==state.lastFen)return;
        const depth=line.match(/\bdepth (\d+)/); if(depth)state.depthLive=Number(depth[1]);
        const cp=line.match(/\bscore cp (-?\d+)/);
        const mate=line.match(/\bscore mate (-?\d+)/);
        const pv=line.match(/\bpv (.+)$/);
        if(cp)updateScore(Number(cp[1]));
        if(mate){$('.ct-eval').textContent='Evaluation: Mate in '+mate[1];$('.ct-score').textContent='M'+mate[1]}
        if(pv){state.pv=pv[1].trim();$('.ct-pv').textContent='Line: '+state.pv.split(/\s+/).slice(0,7).join(' ')}
        const bm=line.match(/\bbestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if(bm){state.bestmove=bm[1];$('.ct-move').textContent='Best move: '+bm[1];drawArrow(bm[1]);status(files.label+' analysis ready · depth '+(state.depthLive||state.depth))}
      };
      worker.onerror=()=>{status(files.label+' failed to load. Check engine JS/WASM/worker files.');state.ready=false;state.engine=null;};
      worker.postMessage('uci');
      setTimeout(()=>{if(!state.ready)status('Loading '+files.label+'…');},800);
    } catch(err) {status('Could not start '+files.label+'.');}
  }
  function analyse(fen){if(!state.engine||!fen)return;state.localSearchFen=fen;state.engine.postMessage('stop');state.engine.postMessage('position fen '+fen);state.engine.postMessage('go depth '+state.depth)}
    function readRemoteScore(data){
    const value=data?.eval??data?.evaluation??data?.score??data?.pvs?.[0]?.eval;
    if(value&&typeof value==='object'){
      if(value.type==='mate'&&Number.isFinite(value.value))return {cp:null,mate:value.value};
      if(value.type==='cp'&&Number.isFinite(value.value))return {cp:value.value,mate:null};
      if(Number.isFinite(value.cp))return {cp:value.cp,mate:null};
      if(Number.isFinite(value.mate))return {cp:null,mate:value.mate};
      if(Number.isFinite(value.value))return {cp:value.value,mate:null};
    }
    if(typeof value==='number'&&Number.isFinite(value))return {cp:Math.abs(value)>100?value:value*100,mate:null};
    if(Number.isFinite(data?.cp))return {cp:data.cp,mate:null};
    if(Number.isFinite(data?.mate))return {cp:null,mate:data.mate};
    return null;
  }
  function remotePv(data){
    const candidate=data?.pv ?? data?.bestline ?? data?.line ?? data?.continuation ?? data?.principal_variation ?? data?.pvs?.[0]?.moves ?? data?.pvs?.[0]?.pv ?? data?.lines?.[0]?.pv;
    if(Array.isArray(candidate)) return candidate.join(' ');
    if(typeof candidate==='string') return candidate;
    if(Array.isArray(data?.pvs) && typeof data.pvs[0]==='string') return data.pvs[0];
    return '';
  }
  async function remoteAnalyse(fen){
    const seq=++state.remoteSeq;
    state.remoteLastFen=fen;
    state.remoteBusy=true;
    state.localFallbackActive=false;
    state.localSearchFen='';
    if(state.engine&&state.ready){try{state.engine.postMessage('stop')}catch(_){}}
    status('Requesting server Stockfish…');
    try {
      const result=await chrome.runtime.sendMessage({type:'CT_REMOTE_ANALYZE',fen,depth:Math.min(14,Math.max(1,state.depth)),multipv:2});
      if(seq!==state.remoteSeq || fen!==state.lastFen)return;
      if(!result?.ok) throw new Error(result?.error||'Server analysis failed');
      const data=result.data||{};
      const bestRaw=String(data.bestmove||data.best_move||data.move||'').trim().replace(/^bestmove\s+/i,'');
      const best=bestRaw.match(/^[a-h][1-8][a-h][1-8][qrbn]?/i)?.[0]||'';
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
      if(state.analysisMode==='server'){status('Server analysis failed: '+(error?.message||'request failed'));return;}
      state.localFallbackActive=true;
      status('Server slow/unavailable; switching to local WASM…');
      if(!state.engine)bootEngine();
      if(state.engine){if(state.ready)analyse(fen);else state.pendingFallbackFen=fen;}
    } finally {
      if(seq===state.remoteSeq)state.remoteBusy=false;
    }
  }
function scan(){if(!supportedAnalysisPath()){status('Open analysis, study, or review mode to use Chess Topper.');return}const p=readPosition();if(!p){status('Waiting for a readable analysis board…');return}$('.ct-position').textContent=p.fenComplete?'Position: site FEN':'Position: estimated'+(p.turnKnown?' (castling/en-passant unknown)':' (turn/castling/en-passant unknown)');if(p.fen!==state.lastFen){state.lastFen=p.fen;state.bestmove=null;state.pv='';arrowSvg.querySelector('#ct-line').setAttribute('opacity','0');if(state.analysisMode==='wasm'){if(!state.engine)bootEngine();if(state.engine&&state.ready)analyse(p.fen);else state.pendingFallbackFen=p.fen;}else{remoteAnalyse(p.fen)}}else if(state.bestmove){drawArrow(state.bestmove);}}
  setInterval(scan,1400);window.addEventListener('resize',()=>state.bestmove&&drawArrow(state.bestmove));window.addEventListener('scroll',()=>state.bestmove&&drawArrow(state.bestmove),true);window.visualViewport?.addEventListener('resize',()=>state.bestmove&&drawArrow(state.bestmove));
})();