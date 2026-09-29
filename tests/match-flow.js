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
const finish=(winner,kind,cube)=>{ E(`state.cube={value:${cube||1},owner:null}; endGame({winner:'${winner}',kind:'${kind}'})`); };
const next=async()=>{ D.getElementById('bannerNew').click(); await wait(1500); };
// put the board in a quiet "await" state for the side on roll, to probe cube availability
const probe=(pl)=>{ E(`state.gameId++;state.board=cloneBoard(${JSON.stringify(P['w|Double, take'].b)});state.turn='${pl}';state.phase='await';render();`); return { canW:E("cubeAvailable('w')"), canB:E("cubeAvailable('b')"), dbl:!D.getElementById('doubleBtn').hidden }; };
(async()=>{ await wait(300);
  console.log('Start a match to 5 against the bot');
  const sel=D.getElementById('matchSel'); sel.value='5'; sel.dispatchEvent(new win.Event('change'));
  D.getElementById('playChoice').click(); await wait(1500);
  ok(!D.getElementById('matchBar').hidden && /Match to 5/.test(txt('matchBar')) && /You 0 – 0 Black/.test(txt('matchBar')),'match bar: "Match to 5 · You 0 – 0 Black"');
  ok(txt('ptsW')==='0/5','score card shows 0/5');

  console.log('Game 1: you win a single game');
  finish('w','single'); ok(E('state.match.score.w')===1 && /You win the game/.test(txt('bannerTitle')) && txt('bannerNew')==='Next game','1–0, banner offers "Next game"');
  await next(); ok(E('state.match.score.w')===1 && E('state.match.game')===2 && E('state.cube.value')===1,'next game keeps the score, resets the cube');

  console.log('Game 2: gammon with the cube on 1 → +2');
  finish('w','gammon'); ok(E('state.match.score.w')===3,'3–0'); await next();
  console.log('Game 3: Black wins');
  finish('b','single'); ok(E('state.match.score.b')===1,'3–1'); await next();
  console.log('Game 4: you reach 4 (1-away) → next is the Crawford game');
  finish('w','single'); ok(E('state.match.crawford')===true && /Crawford game/.test(txt('bannerText')),'banner announces the Crawford game');
  await next();
  ok(/Crawford game — no doubling/.test(txt('matchBar')),'match bar shows the Crawford chip');
  let pr=probe('w'); ok(!pr.canW && !pr.canB && !pr.dbl,'no doubling for either side in the Crawford game');

  console.log('Crawford game: Black wins → post-Crawford');
  finish('b','single'); ok(E('state.match.crawford')===false && E('state.match.post')===true,'4–2, now post-Crawford'); await next();
  ok(/post-Crawford/.test(txt('matchBar')),'match bar shows post-Crawford');
  pr=probe('b'); ok(pr.canB,'trailer (Black, the bot) may double post-Crawford');
  pr=probe('w'); ok(!pr.canW,'leader at 1-away cannot double (dead cube)');
  const an=E("(function(){const a=cubeFor('b'); return {m:a.match, dbl:a.shouldDouble};})()");
  ok(an.m===true,'cube advice uses match equities');

  console.log('Post-Crawford: Black wins a gammon → 4–4 (double match point)');
  finish('b','gammon'); ok(E('state.match.score.b')===4,'4–4'); await next();
  pr=probe('w'); ok(!pr.canW && !E("cubeAvailable('b')"),'at 1-away/1-away nobody doubles');

  console.log('Decider: you win');
  finish('w','single'); ok(E('state.match.over')===true && /You win the match!/.test(txt('bannerTitle')) && /5–4 in a match to 5/.test(txt('bannerText')),'"You win the match! 5–4"');
  ok(txt('bannerNew')==='New match','button offers "New match"');
  await next(); ok(E('state.match.score.w')===0 && E('state.match.score.b')===0 && !E('state.match.over') && E('state.match.game')===1,'new match starts at 0–0');

  console.log('Match cube mistakes carry the score');
  const m0=E('mistakes.length');
  E(`state.gameId++;state.board=cloneBoard(${JSON.stringify(P['w|No double, take'].b)});state.turn='w';state.phase='await';state.cube={value:1,owner:null};state.match.score={w:2,b:1};render();`);
  D.getElementById('doubleBtn').click(); await wait(500);
  const last=E('mistakes.length')>m0?E("JSON.stringify(mistakes[mistakes.length-1].match)"):null;
  console.log('     logged:', last);
  ok(!last || /"to":5/.test(last),'mistake record includes match context (if logged)');
  ok(/at 3-away vs 4-away/.test(txt('verdictWrap')),'coach note names the score (3-away vs 4-away)');

  console.log('Money mode unaffected');
  sel.value='0'; sel.dispatchEvent(new win.Event('change'));
  D.getElementById('menuBtn').hidden=false; D.getElementById('menuBtn').click(); await wait(50);
  D.getElementById('playChoice').click(); await wait(1500);
  ok(D.getElementById('matchBar').hidden && txt('ptsW')==='0','no match bar; points tally in money play');

  console.log('\nerrors:', errs.length?('\n'+errs.join('\n')):'(none)');
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail||errs.length?1:0);
})();
