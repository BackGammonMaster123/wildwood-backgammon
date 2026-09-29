const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('backgammon.html','utf8');
const doc='<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'\n</body></html>';
const errs=[];
const dom=new JSDOM(doc,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://ex.com',
  beforeParse(w){ w.matchMedia=(q)=>({matches:/reduce/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
    w.requestAnimationFrame=cb=>setTimeout(cb,0); w.confirm=()=>true;
    w.addEventListener('unhandledrejection',e=>errs.push('unhandled: '+(e.reason&&e.reason.stack||e.reason)));
    w.onerror=(m,s,l,c,e)=>errs.push('onerror: '+(e&&e.stack||m)); }});
const win=dom.window, D=win.document, E=s=>win.eval(s), wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);} else {fail++;console.log('  ✗ FAIL:',m);} };
const txt=id=>D.getElementById(id).textContent, click=id=>D.getElementById(id).click();
// drive games through the real UI; sloppiness = chance of a random (non-best) move
async function playGames(nGames, sloppy, both){
  let done=0, t0=Date.now();
  while(done<nGames && Date.now()-t0<200000){ await wait(15);
    if(D.getElementById('cubeOverlay').classList.contains('show')){ click(Math.random()<0.7?'takeBtn':'passBtn'); continue; }
    const ph=E('state.phase'), turn=E('state.turn'), human=E(`isHuman('${turn}')`);
    if(ph==='over'){ done++; if(done<nGames) click('bannerNew'); continue; }
    if(ph==='await'&&human){ if(!D.getElementById('doubleBtn').hidden&&Math.random()<0.15){ click('doubleBtn'); await wait(250); continue; } click('rollBtn'); continue; }
    if(ph==='moving'&&human){ E(`(function(){const a=analyze(state.turnStart,state.turn,state.rolled); if(!a.moves.length) return;
      const pick=Math.random()<${sloppy}?a.moves[Math.floor(Math.random()*a.moves.length)]:a.moves[0]; playSteps(pick.steps.slice(state.played.length));})()`); }
  } return done; }
(async()=>{ await wait(300);
  console.log('Empty state');
  ok(/no games tracked yet/.test(txt('progressTag')),'menu card: "no games tracked yet"');
  click('progressChoice'); await wait(30);
  ok(!D.getElementById('progress').hidden && D.getElementById('app').hidden,'progress screen shows (board hidden)');
  ok(/No finished games yet/.test(txt('pLeak')) && /appears after your first finished game/.test(txt('pChart')),'empty-state messages');

  console.log('Play 4 real games vs the bot (2 sloppy, 2 careful)');
  E('goMenu()'); click('playChoice'); await wait(200);
  let g=await playGames(2,0.7,false); E('nextGame()'); await wait(200); g+=await playGames(2,0.0,false);
  ok(g===4,'4 games completed through the UI');
  const H=E('JSON.stringify(hist.games)'); const games=JSON.parse(H);
  ok(games.length===4 && games.every(x=>x.name==='You'&&x.player==='w'&&x.n>0),'4 records, all "You", each with checker decisions');
  ok(games.every(x=>x.cont.n+x.race.n===x.n),'contact + race moves add up per game');
  const e=games.map(x=>x.loss/x.n*1000); console.log('     error per move by game:', e.map(v=>v.toFixed(0)).join(', '), '| cube decisions:', games.map(x=>x.cN).join(','));
  ok((e[0]+e[1])/2 > (e[2]+e[3])/2,'sloppy games show a higher error rate than careful ones');

  console.log('Progress screen with data');
  E('goMenu()'); ok(/4 games tracked/.test(txt('progressTag')),'menu card: "4 games tracked"'); click('progressChoice'); await wait(30);
  ok(/Games tracked\s*4/.test(txt('pTiles')),'tile: 4 games tracked');
  ok(/Checker error \(last 10\)/.test(txt('pTiles')) && /per move/.test(txt('pTiles')),'tile: checker error per move');
  ok(/Where you lose the most/.test(txt('pLeak')),'"Where you lose the most" callout');
  ok(D.querySelectorAll('#pChart circle').length===4 && D.querySelector('#pChart path'),'chart: 4 game dots + average line');
  ok(D.querySelectorAll('#pTable tbody tr').length===4,'table view: 4 rows');
  const hit=D.querySelector('#pChart rect'); hit.dispatchEvent(new win.PointerEvent('pointermove',{clientX:5,clientY:5,bubbles:true}));
  ok(!D.querySelector('#pChart .ctip').hidden && /Game \d/.test(D.querySelector('#pChart .ctip').textContent),'hover shows a tooltip');
  D.getElementById('pChart').dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  ok(/Game/.test(D.querySelector('#pChart .ctip').textContent),'arrow keys step through games');

  console.log('Trend delta (seeded history: 10 sloppy then 10 careful games)');
  E(`(function(){ const base=Date.now()-40*864e5; for(let i=0;i<20;i++){ const bad=i<10, n=25, L=n*(bad?0.09:0.04);
     hist.games.push({ts:base+i*864e5,mode:'vsai',matchTo:0,player:'w',name:'You',n,loss:L,cN:2,cLoss:0.05,cont:{n:18,loss:L*0.85},race:{n:7,loss:L*0.15},won:!bad,pts:1}); } saveHist(); })()`);
  E('renderProgress()');
  ok(/improving/.test(txt('pTiles')) && D.querySelector('#pTiles .td.good'),'delta shows "▼ … improving" in the good colour');
  ok(D.querySelectorAll('#pChart circle').length===20,'range "Last 20" limits the chart to 20 games');
  D.getElementById('pRange').value='0'; D.getElementById('pRange').dispatchEvent(new win.Event('change'));
  ok(D.querySelectorAll('#pChart circle').length===24,'range "All" shows all 24');
  ok(/contact positions/.test(txt('pLeak')),'callout names contact play as the biggest checker leak');

  console.log('Pass & play records both players by name');
  E("state.names={w:'Alice',b:'Bob'}; goMenu()"); click('hotseatChoice'); await wait(200);
  await playGames(1,0.3,true);
  const hp=JSON.parse(E('JSON.stringify(hist.games.filter(g=>g.mode==="hotseat").map(g=>g.name))'));
  ok(hp.includes('Alice')&&hp.includes('Bob'),'one hotseat game → records for Alice and Bob');
  E('goMenu()'); click('progressChoice'); await wait(30);
  const opts=[...D.querySelectorAll('#pPlayer option')].map(o=>o.value);
  ok(opts.includes('You')&&opts.includes('Alice')&&opts.includes('Bob'),'player filter lists You, Alice, Bob');
  D.getElementById('pPlayer').value='Bob'; D.getElementById('pPlayer').dispatchEvent(new win.Event('change'));
  ok(D.querySelectorAll('#pTable tbody tr').length===1,'filtering to Bob shows his 1 game');

  console.log('\nerrors:', errs.length?('\n'+errs.join('\n')):'(none)');
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail||errs.length?1:0);
})();
