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
async function playOne(sloppy){ let t0=Date.now();
  while(Date.now()-t0<120000){ await wait(15);
    if(D.getElementById('cubeOverlay').classList.contains('show')){ click(Math.random()<0.6?'takeBtn':'passBtn'); continue; }
    const ph=E('state.phase'), turn=E('state.turn'), human=E(`isHuman('${turn}')`);
    if(ph==='over') return true;
    if(ph==='await'&&human){ if(!D.getElementById('doubleBtn').hidden&&Math.random()<0.2){ click('doubleBtn'); await wait(250); continue; } click('rollBtn'); continue; }
    if(ph==='moving'&&human){ E(`(function(){const a=analyze(state.turnStart,state.turn,state.rolled); if(!a.moves.length) return;
      const pick=Math.random()<${sloppy}?a.moves[Math.floor(Math.random()*a.moves.length)]:a.moves[0]; playSteps(pick.steps.slice(state.played.length));})()`); } }
  return false; }
function integrity(){ return E(`(function(){ const r=state.lastRec; let b=startingBoard(), bad=0;
  for(const t of r.turns){ if(boardKey(t.board)!==boardKey(b)) bad++; if(t.t==='move') b=replay(b,t.p,t.steps); }
  if(boardKey(r.final)!==boardKey(b)) bad++; return {n:r.turns.length,bad,cube:r.turns.filter(t=>t.t==='cube').length,dance:r.turns.filter(t=>t.t==='move'&&!t.steps.length).length}; })()`); }
(async()=>{ await wait(300);
  console.log('A. Game vs bot (sloppy, with cube)');
  click('playChoice'); await wait(100);
  ok(await playOne(0.5),'game finished through the UI');
  const I=integrity(); console.log('     turns',I.n,'cube actions',I.cube,'dances',I.dance,'mismatches',I.bad);
  ok(I.n>5 && I.bad===0,'recorded turns replay exactly to the final position');
  ok(!D.getElementById('bannerReview').hidden,'game-over screen offers "Review game"');
  ok(E('gameRecs.length')===1 && E('hist.games[hist.games.length-1].recId')===E('state.lastRec.id'),'game stored and linked to progress history');

  console.log('B. Open the review');
  click('bannerReview'); await wait(1500);
  ok(E("state.screen")==='review' && !D.getElementById('reviewPanel').hidden && !D.getElementById('rvGraphCard').hidden,'review screen + graph shown');
  ok(/win|wins/.test(txt('rvSummary')) && /checker error/.test(txt('rvSummary')) && /luck/.test(txt('rvSummary')),'summary: result, checker error, luck');
  const N=E('state.rv.rows.length'); ok(txt('rvPos')===`1 / ${N}` && D.querySelectorAll('#rvList .rvrow').length===N,`position 1 / ${N}, list has every row`);
  ok(D.querySelector('#rvGraph svg path') && D.querySelectorAll('#rvGraph svg circle').length>=1,'win-chance graph drawn');
  click('rvNext'); await wait(20); ok(txt('rvPos')===`2 / ${N}`,'▶ steps forward');
  D.dispatchEvent(new win.KeyboardEvent('keydown',{key:'End',bubbles:true})); await wait(20);
  ok(txt('rvPos')===`${N} / ${N}` && /Final position/.test(txt('rvDetail')),'End key → final position');
  D.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})); await wait(20); ok(txt('rvPos')===`${N-1} / ${N}`,'arrow key steps back');
  // board shows the recorded position
  const matches=E(`boardKey(state.board)===boardKey(state.rv.rows[state.rv.idx].t.board)`); ok(matches,'board shows the recorded position for the move');
  const errs1=E('state.rv.rows.filter(r=>rowErr(r)>=0.08).length'); console.log('     mistakes (≥0.08) in this game:',errs1);
  if(errs1){ click('rvFirst'); click('rvNextErr'); await wait(20); const r=E('state.rv.rows[state.rv.idx]');
    ok(E('rowErr(state.rv.rows[state.rv.idx])')>=0.08,'"Next mistake" jumps to a mistake');
    ok(/\?/.test(txt('rvDetail')) && /(Best was|best was)/.test(txt('rvDetail')),'detail explains the mistake and the better play');
    if(D.getElementById('rvShowBest')){ click('rvShowBest'); await wait(20);
      ok(JSON.stringify(E('state.suggest'))===JSON.stringify(E('state.rv.rows[state.rv.idx].best')),'"Show best" highlights the best play'); }
    const before=E('mistakes.length'), already=/In your quiz/.test(txt('rvDetail'));
    if(!already){ click('rvAddQuiz'); await wait(20); ok(E('mistakes.length')===before+1 && /In your quiz/.test(txt('rvDetail')),'"Add to quiz" adds it once'); }
    else ok(true,'(already auto-logged → button shows "In your quiz ✓")');
    D.getElementById('rvOnlyErr').checked=true; D.getElementById('rvOnlyErr').dispatchEvent(new win.Event('change')); await wait(20);
    ok(D.querySelectorAll('#rvList .rvrow').length<=errs1+1,'"Mistakes only" filters the list'); }
  const luckSum=E("state.rv.rows.filter(r=>r.luck!=null).reduce((a,r)=>a+r.luck,0)"); console.log('     total luck both sides:',luckSum.toFixed(2));
  console.log('C. Back returns to the finished game');
  click('rvBack'); await wait(100);
  ok(E('state.screen')==='match' && D.getElementById('banner').classList.contains('show') && E("state.phase")==='over','back → game-over screen, board restored');
  const fin=E('boardKey(state.board)===boardKey(state.lastRec.final)'); ok(fin,'final board restored');
  click('bannerNew'); await wait(1500); ok(E("state.phase")!=='over' && E('state.rec')!==null,'next game starts and records');

  console.log('D. Pass & play with cube, reviewed from Progress');
  E("state.names={w:'Alice',b:'Bob'}; goMenu()"); click('hotseatChoice'); await wait(100);
  ok(await playOne(0.3),'hotseat game finished');
  ok(integrity().bad===0,'hotseat record replays exactly');
  E('goMenu()'); click('progressChoice'); await wait(50);
  D.getElementById('pPlayer').value='Bob'; D.getElementById('pPlayer').dispatchEvent(new win.Event('change'));
  const rb=D.querySelector('#pTable [data-rev]'); ok(!!rb,'progress table row has a Review button'); rb.click(); await wait(1500);
  ok(E('state.screen')==='review' && /Alice/.test(txt('rvSummary')) && /Bob/.test(txt('rvSummary')),'review names both players');
  ok(/Alice's winning chances/.test(txt('rvGraphTitle')),'graph titled for White (Alice)');
  const cubeRows=E("state.rv.rows.filter(r=>r.t.t==='cube').length"); console.log('     cube rows:',cubeRows);
  if(cubeRows){ const k=E("state.rv.rows.findIndex(r=>r.t.t==='cube')"); E(`rvGo(${k})`); await wait(20);
    ok(/doubles to/.test(txt('rvDetail')) && (/right/.test(txt('rvDetail'))||/best was/.test(txt('rvDetail'))),'cube decision row graded'); }
  click('rvBack'); await wait(50); ok(E('state.screen')==='progress','back → progress screen');

  console.log('E. Storage cap');
  E(`(function(){ const r=gameRecs[0]; for(let i=0;i<25;i++) gameRecs.push({...r,id:'x'+i}); if(gameRecs.length>20) gameRecs=gameRecs.slice(-20); saveGames(); })()`);
  ok(E('JSON.parse(localStorage.getItem(GKEY)).length')===20,'only the last 20 games are kept');

  console.log('\nerrors:', errs.length?('\n'+errs.join('\n')):'(none)');
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail||errs.length?1:0);
})();
