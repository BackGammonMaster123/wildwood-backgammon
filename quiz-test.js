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
const txt=id=>D.getElementById(id).textContent, click=id=>D.getElementById(id).click();
// seed a move mistake (White, vs bot) and a cube mistake (premature double)
function seedMove(by,mode){ E(`(function(){ const s=startingBoard(), dc=[6,1], a=analyze(s,'${by}',dc);
  const worst=a.moves[a.moves.length-1]; state.screen='match'; state.mode='${mode}'; state.turn='${by}'; state.coach=true; state.threshold=0.15;
  state.turnStart=cloneBoard(s); state.rolled=dc.slice(); state.board=worst.board; state.played=worst.steps; state.gameId++; state.phase='moving';finishHumanTurn(); state.gameId++; })()`); }
(async()=>{ await wait(300);
  seedMove('w','vsai');
  E(`state.gameId++;state.screen='match';state.mode='vsai';state.board=cloneBoard(${JSON.stringify(P['w|No double, take'].b)});state.turn='w';state.phase='await';state.cube={value:1,owner:null};render();`);
  click('doubleBtn'); await wait(400); E('state.gameId++');
  const n=E('mistakes.length'), types=E("mistakes.map(m=>m.type||'move').join(',')");
  console.log('seeded mistakes:', n, types);
  ok(n===2,'two mistakes logged (a move and a cube decision)');

  console.log('Open Learn: quiz card');
  E('goMenu()'); click('learnChoice'); await wait(50);
  ok(/2 due now/.test(txt('quizBody')) && D.getElementById('quizStart'),'quiz card: "2 due now" + Start quiz');
  ok(/new/.test(txt('mlist')),'log items show a "new" badge');
  ok(/2 due for review/.test(txt('learnTag')),'menu card mentions due reviews');

  console.log('Question 1');
  click('quizStart'); await wait(30);
  ok(D.getElementById('reviewCard').hidden,'review card hidden during the quiz');
  let kind=E('state.quiz.kind'); console.log('     kind:',kind);
  async function answerMoveRight(){ ok(/Find the best move/.test(txt('quizBody')) && D.querySelectorAll('#quizDice .die').length>=2,'move prompt with dice');
    ok(E('state.phase')==='moving' && E('isHuman(state.turn)'),'board is interactive for the quiz player');
    E("(function(){const a=analyze(state.turnStart,state.quiz.player,state.rolled); playSteps(a.moves[0].steps.slice());})()"); await wait(20);
    ok(/✓ Right/.test(txt('quizBody')),'playing the best move → "✓ Right"');
    ok(/Next review in 10 min/.test(txt('quizBody')),'scheduled: next review in 10 min (box 1)'); }
  async function answerCubeWrong(){ ok(/Double\?/.test(txt('quizBody')),'cube prompt: "Double?"');
    const m=E("mistakes.find(x=>x.id===state.quiz.id)"); // best is 'nodouble' for a premature double
    click(m.best==='double'?'quizA2':'quizA1'); await wait(20);
    ok(/Not quite/.test(txt('quizBody')) && /come back again shortly/.test(txt('quizBody')),'wrong cube answer → "Not quite", comes back shortly');
    ok(E("mistakes.find(x=>x.id===state.quiz.id).sr.box")===0,'cube item back to box 0'); }
  if(kind==='move'){ await answerMoveRight(); click('quizNext'); await wait(30); await answerCubeWrong(); }
  else { await answerCubeWrong(); click('quizNext'); await wait(30); await answerMoveRight(); }
  ok(txt('quizStats')==='1/2 right this session','session score "1/2 right this session"');
  click('quizNext'); await wait(30);
  ok(!D.getElementById('reviewCard').hidden && /Nothing due/.test(txt('quizBody')) && D.getElementById('quizPractice'),'nothing due → "Practice anyway" offered');
  ok(/1\/5/.test(txt('mlist')) && /0\/5/.test(txt('mlist')),'badges show box progress');

  console.log('Practice anyway + Show answer');
  click('quizPractice'); await wait(30);
  ok(E('state.quiz.active'),'practice question starts');
  if(E('state.quiz.kind')==='move'){ click('quizReveal'); await wait(20); ok(/Answer:/.test(txt('quizBody')) && E("mistakes.find(x=>x.id===state.quiz.id).sr.box")===0,'"Show answer" reveals and counts as a miss'); }
  else { click('quizA1'); await wait(20); ok(E('state.quiz.answered'),'practice cube question answered'); }
  click('quizStop'); await wait(20);
  ok(!E('state.quiz.active') && !D.getElementById('reviewCard').hidden,'Stop returns to the review view');

  console.log('Mastery');
  E("(function(){const m=mistakes[0]; for(let i=0;i<6;i++) srUpdate(m,true); saveMistakes(mistakes);})()");
  ok(E('mistakes[0].sr.mastered')===true,'six right answers → mastered');
  E('renderMistakeList(); renderQuizIdle();');
  ok(/mastered/.test(txt('mlist')) && /1 mastered/.test(txt('quizBody')),'"mastered" badge and count');
  ok(!E('quizPool().open.some(m=>m.id===mistakes[0].id)'),'mastered item leaves the rotation');

  console.log('Quiz a Black move from pass & play');
  E("state.names={w:'Alice',b:'Bob'}"); seedMove('b','hotseat');
  E('goMenu()'); click('learnChoice'); await wait(30);
  const bi=E("mistakes.map(m=>m.by).lastIndexOf('b')"); E(`selectMistake(${bi})`); click('quizThis'); await wait(30);
  ok(E('state.quiz.player')==='b' && /Bob \(Black\) to play/.test(txt('quizBody')),'"Quiz me on this one" → Bob (Black) to play');
  E("(function(){const a=analyze(state.turnStart,'b',state.rolled); playSteps(a.moves[0].steps.slice());})()"); await wait(20);
  ok(/✓ Right/.test(txt('quizBody')),'Black move graded correctly');

  console.log('Leaving mid-quiz does not affect games');
  click('quizNext'); await wait(20); if(D.getElementById('quizStart')) click('quizStart'); await wait(20);
  E('goMenu()'); ok(!E('state.quiz.active'),'quiz stops when leaving');
  click('playChoice'); await wait(1500);
  ok(E("isHuman('w')") && !E("isHuman('b')"),'vs-bot game: only White is human again');
  ok(E('hist.quiz.length')===4,'quiz answers recorded for progress tracking ('+E('hist.quiz.length')+')');

  console.log('\nerrors:', errs.length?('\n'+errs.join('\n')):'(none)');
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail||errs.length?1:0);
})();
