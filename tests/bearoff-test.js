// One-tap bear-off: tapping the home tray bears off with the whole roll when it can.
const fs = require('fs'); const { JSDOM } = require('jsdom');
const html = fs.readFileSync('backgammon.html', 'utf8');
const doc = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '\n</body></html>';
const errs = [];
const dom = new JSDOM(doc, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://ex.com',
  beforeParse(w) { w.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.requestAnimationFrame = (cb) => setTimeout(cb, 0); w.confirm = () => true;
    w.onerror = (m, s, l, c, e) => errs.push('onerror: ' + (e && e.stack || m)); } });
const win = dom.window, D = win.document, E = (s) => win.eval(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const tray = () => D.getElementById('offW_tray');
// White on roll with the given points (White's checkers only; Black parked on 20), rest borne off.
const setup = (pts, dice, blackAt = 20) => E(`(function(){ const b={points:new Array(25).fill(0),bar:{w:0,b:0},off:{w:0,b:0}};
  const pts=${JSON.stringify(pts)}; let n=0; for(const k in pts){ b.points[k]=pts[k]; n+=pts[k]; } b.off.w=15-n; b.points[${blackAt}]=-15;
  state.gameId++; state.prefs.autoForced=false; state.mode='hotseat'; state.screen='match'; state.cube={value:1,owner:null}; state.rolled=null; state.coach=false;
  document.getElementById('menu').hidden=true; document.getElementById('app').hidden=false; state.board=b; state.turn='w'; state.phase='await'; state.busy=false; render(); beginHumanTurn(${JSON.stringify(dice)}); })()`);
(async () => { await wait(300);
  console.log('A. 6-4 with checkers on the 6- and 4-points');
  setup({ 6: 2, 4: 2, 2: 3 }, [6, 4]);
  ok(tray().classList.contains('home') && /tap your home tray/.test(D.getElementById('status').textContent), 'tray highlighted; status mentions it');
  tray().click(); await wait(20);
  ok(E('state.board.off.w') === 10 && E('state.board.points[6]') === 1 && E('state.board.points[4]') === 1, 'one tap: one off the 6-point, one off the 4-point');
  ok(E("state.turn") === 'b' || E("state.phase") !== 'moving', 'the turn ends');

  console.log('B. After playing one die by hand, the tray plays the other');
  setup({ 6: 2, 4: 2, 2: 3 }, [6, 4]);
  E("playSteps([{from:6,to:'off',die:6}])"); await wait(10);
  tray().click(); await wait(20);
  ok(E('state.board.off.w') === 10 && E('state.board.points[4]') === 1, 'the 4 bears off from the 4-point');

  console.log('C. Doubles and a checker still outside');
  setup({ 5: 4, 3: 3 }, [5, 5]); tray().click(); await wait(20);
  ok(E('state.board.off.w') === 12, '5-5: four off the 5-point in one tap');
  setup({ 9: 1, 6: 3, 2: 3 }, [6, 3]);
  ok(!tray().classList.contains('home'), 'not everything home yet: tray not offered first');
  E("playSteps([{from:9,to:3,die:6}])"); await wait(10);
  ok(tray().classList.contains('home'), 'once home, the tray lights up for the 3');
  tray().click(); await wait(20);
  ok(E('state.board.off.w') === 9 && E('state.board.points[3]') === 0, 'the 3 bears off the checker that just came in');

  console.log('D. A roll that bears nothing off: tray does nothing');
  setup({ 6: 5, 5: 5, 4: 5 }, [1, 2]);
  ok(!tray().classList.contains('home'), 'tray not highlighted');
  tray().click(); await wait(20);
  ok(E("state.phase") === 'moving' && E('state.played.length') === 0, 'nothing played');

  console.log('E. Several ways to do it: the coach picks in a game, you pick in a lesson');
  setup({ 6: 2, 5: 2, 4: 2 }, [4, 1]);   // the 4 bears off; the 1 could be 6/5, 5/4 or 4/3
  const plan = JSON.parse(E("JSON.stringify(bearOffPlan())"));
  const want = E("(function(){ const a=analyze(state.turnStart,'w',[4,1]); return boardKey(replay(state.turnStart,'w',a.moves[0].steps)); })()");
  tray().click(); await wait(20);
  ok(plan.steps && plan.steps.length === 2 && E('state.board.off.w') === 10, 'game: one tap plays a whole move bearing one off');
  ok(E("boardKey(replay(state.turnStart,'w',state.played))") === want, 'and it is the coach\'s best of those');
  setup({ 6: 2, 5: 2, 4: 2 }, [4, 1]); E("state.quiz.active=true; state.screen='learn'");
  ok(JSON.parse(E("JSON.stringify(bearOffPlan())")).ambiguous === true, 'lesson/quiz: no pick made for you');
  E("state.quiz.active=false; state.screen='match'");
  console.log('errors:', errs.length ? errs.join('\n') : '(none)');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail || errs.length ? 1 : 0);
})();
