const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('backgammon.html','utf8');
const doc='<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'\n</body></html>';
const errs=[]; const MATCHES=+process.argv[2]||2;
const dom=new JSDOM(doc,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://ex.com',
  beforeParse(w){ w.matchMedia=(q)=>({matches:/reduce/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
    w.requestAnimationFrame=cb=>setTimeout(cb,0); w.confirm=()=>true;
    w.addEventListener('unhandledrejection',e=>errs.push('unhandled: '+(e.reason&&e.reason.stack||e.reason)));
    w.onerror=(m,s,l,c,e)=>errs.push('onerror: '+(e&&e.stack||m)); }});
const win=dom.window, D=win.document, E=s=>win.eval(s), wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{ await wait(300);
  const sel=D.getElementById('matchSel'); sel.value='3'; sel.dispatchEvent(new win.Event('change'));
  D.getElementById('playChoice').click(); await wait(300);
  const stats={games:0,doublesOffered:0,botDoubles:0,takes:0,passes:0,matches:0,crawfordGames:0,stuck:0};
  let lastSig='', same=0, t0=Date.now();
  while(stats.matches<MATCHES && Date.now()-t0<240000){
    await wait(20);
    const ph=E('state.phase'), turn=E('state.turn');
    if(D.getElementById('cubeOverlay').classList.contains('show')){ stats.botDoubles++;
      const take=Math.random()<0.6; take?stats.takes++:stats.passes++; D.getElementById(take?'takeBtn':'passBtn').click(); continue; }
    if(ph==='over'){ stats.games++; if(E('state.match.over')) stats.matches++; D.getElementById('bannerNew').click(); if(E('state.match.crawford')) stats.crawfordGames++; continue; }
    if(ph==='await'&&turn==='w'){
      if(!D.getElementById('doubleBtn').hidden && Math.random()<0.25){ stats.doublesOffered++; D.getElementById('doubleBtn').click(); await wait(250); continue; }
      D.getElementById('rollBtn').click(); continue; }
    if(ph==='moving'&&turn==='w'){ E("(function(){const a=analyze(state.turnStart,'w',state.rolled); if(!a.moves.length) return; const pick=Math.random()<0.7?a.moves[0]:a.moves[Math.floor(Math.random()*a.moves.length)]; playSteps(pick.steps.slice(state.played.length));})()"); continue; }
    const sig=ph+turn+E('boardKey(state.board)'); if(sig===lastSig){ if(++same>400){ stats.stuck++; console.log('STUCK at',ph,turn,D.getElementById('status').textContent); break; } } else { same=0; lastSig=sig; }
  }
  console.log(JSON.stringify(stats));
  console.log('final match score:', E('JSON.stringify(state.match.score)'));
  console.log('errors:', errs.length?('\n'+errs.join('\n')):'(none)');
  process.exit(errs.length||stats.stuck||stats.matches<MATCHES?1:0);
})();
