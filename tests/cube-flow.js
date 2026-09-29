const fs=require('fs');const {JSDOM}=require('jsdom');
const P=JSON.parse(fs.readFileSync('tests/fixtures/cube-positions.json'));
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
const txt=id=>D.getElementById(id).textContent;
function setup(key,mode='vsai',turn){ const pos=P[key]; E(`
  state.gameId++; state.screen='match'; state.mode='${mode}'; state.board=cloneBoard(${JSON.stringify(pos.b)});
  state.turn='${turn||pos.q}'; state.phase='await'; state.cube={value:1,owner:null}; state.tally={w:0,b:0}; state.coach=true;
  state.cubeEnabled=true; state.rolled=null; state.pendingCubeNote=null;
  document.getElementById('menu').hidden=true; document.getElementById('app').hidden=false;
  document.getElementById('matchPanel').hidden=false; document.getElementById('learnPanel').hidden=true;
  document.getElementById('banner').classList.remove('show'); render();`); }
(async()=>{ await wait(300);
  console.log('A. You double in a double/take spot (vs bot)');
  setup('w|Double, take');
  ok(!D.getElementById('doubleBtn').hidden && txt('doubleBtn')==='Double → 2','Double button shown as "Double → 2"');
  D.getElementById('doubleBtn').click(); await wait(400);
  ok(E('state.cube.value')===2 && E('state.cube.owner')==='b','bot takes: cube 2, on Black\'s side');
  ok(E('state.phase')==='await' && E('state.turn')==='w','still your roll after the take');
  ok(/Good double/.test(txt('verdictWrap')),'coach: "Good double"');
  ok(D.getElementById('doubleBtn').hidden,'Double button hidden (you no longer own the cube)');
  ok(E("document.getElementById('cube').className").includes('own-b'),'cube moved to Black\'s side');

  console.log('B. You double in a double/pass spot');
  setup('w|Double, pass'); D.getElementById('doubleBtn').click(); await wait(400);
  ok(E('state.phase')==='over' && E('state.tally.w')===1,'bot passes: you win 1 point');
  ok(/Black passed the double/.test(txt('bannerText')) && txt('bannerTitle')==='You win!','banner explains the pass');

  console.log('C. Premature double');
  const m0=E('mistakes.length'); setup('w|No double, take'); D.getElementById('doubleBtn').click(); await wait(400);
  ok(/Premature double/.test(txt('verdictWrap')),'coach flags a premature double');
  ok(E('state.cube.value')===2,'bot still takes (correctly)');
  const errC=E("cubeError(cubeAnalysis(probsOnRoll(state.board,'w'),'center'),'doubler','double')");
  console.log(`     error ${errC.toFixed(3)} (threshold ${E('state.threshold')}) -> logged: ${E('mistakes.length')>m0}`);
  ok((errC>=E('state.threshold'))===(E('mistakes.length')>m0),'logged to mistakes iff error >= threshold');

  console.log('D. Missed double (you roll instead)');
  const m1=E('mistakes.length'); setup('w|Double, take'); D.getElementById('rollBtn').click(); await wait(50);
  ok(/Missed double/.test(txt('verdictWrap')),'coach flags the missed double');
  ok(/missed double/.test(txt('log')),'move log records it');
  ok(E('state.phase')==='moving' || E('state.phase')==='await' || E('state.phase')==='ai','game carries on to your move');
  console.log(`     logged: ${E('mistakes.length')>m1}`);

  console.log('E. Bot doubles you — you take');
  setup('b|Double, take','vsai','b'); E('aiTurn()'); await wait(700);
  ok(D.getElementById('cubeOverlay').classList.contains('show'),'take/pass prompt appears');
  ok(/Black doubles to 2/.test(txt('cubeOvTitle')),'prompt title "Black doubles to 2"');
  ok(D.getElementById('rollBtn').disabled,'Roll disabled while deciding');
  D.getElementById('takeBtn').click(); await wait(100);
  ok(E('state.cube.value')===2 && E('state.cube.owner')==='w','after take: cube 2 on your side');
  ok(/take/i.test(txt('verdictWrap')),'coach grades your take');
  await wait(2500);
  ok(E('state.turn')==='w' && (E('state.phase')==='await'||E('state.phase')==='over'),'bot finished its roll; your turn (or game over)');

  console.log('F. Bot doubles you — you pass');
  setup('b|Double, pass','vsai','b'); E('aiTurn()'); await wait(700);
  D.getElementById('passBtn').click(); await wait(150);
  ok(E('state.phase')==='over' && E('state.tally.b')===1 && txt('bannerTitle')==='Black wins','pass: Black wins 1 point');
  ok(/Correct pass/.test(txt('verdictWrap')),'coach: correct pass');

  console.log('G. Pass & play double with names');
  E("state.names={w:'Alice',b:'Bob'}"); setup('w|Double, take','hotseat');
  D.getElementById('doubleBtn').click(); await wait(100);
  ok(D.getElementById('cubeOverlay').classList.contains('show') && /Alice doubles to 2/.test(txt('cubeOvTitle')) && /Bob/.test(txt('cubeOvText')),'prompt: "Alice doubles to 2", addressed to Bob');
  D.getElementById('takeBtn').click(); await wait(100);
  ok(E('state.cube.owner')==='b' && E('state.turn')==='w' && E('state.phase')==='await','Bob owns the cube; Alice to roll');
  ok(/Alice:/.test(txt('verdictWrap')) && /Bob:/.test(txt('verdictWrap')),'both players graded in the coach panel');

  console.log('H. Gammon with the cube at 4');
  setup('w|Double, take'); E("state.cube={value:4,owner:'w'}; endGame({winner:'w',kind:'gammon'})");
  ok(E('state.tally.w')===8 && /8 points/.test(txt('bannerText')),'gammon × cube 4 = 8 points');

  console.log('I. Learn view shows cube mistakes');
  const cubeMs=E("mistakes.filter(m=>m.type==='cube').length");
  if(cubeMs){ E('openLearn()'); await wait(50);
    const items=[...D.querySelectorAll('#mlist .mitem')].map(x=>x.textContent);
    ok(items.some(t=>/Cube/.test(t)),'list shows a cube entry');
    const idx=E("mistakes.map(m=>m.type).lastIndexOf('cube')"); E(`selectMistake(${idx})`);
    ok(/Cube decision/.test(txt('learnDetail')) && /Best:/.test(txt('learnDetail')),'detail explains the cube decision');
  } else console.log('  (no cube mistake crossed the threshold in this run — skipping)');

  console.log('J. Leaving mid-offer is clean');
  E("state.screen='match'"); setup('b|Double, take','vsai','b'); E('aiTurn()'); await wait(700);
  ok(D.getElementById('cubeOverlay').classList.contains('show'),'offer pending');
  D.getElementById('menuBtn').hidden=false; D.getElementById('menuBtn').click(); await wait(50);
  ok(!D.getElementById('cubeOverlay').classList.contains('show'),'prompt closed on leaving');
  D.getElementById('playChoice').click(); await wait(1500);
  ok(E('state.cube.value')===1 && E('state.cube.owner')===null,'new match starts with a centred cube');

  console.log('\nerrors:', errs.length?('\n'+errs.join('\n')):'(none)');
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail||errs.length?1:0);
})();
