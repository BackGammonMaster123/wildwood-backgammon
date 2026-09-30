// Lessons: content, answers still agreeing with the ones checked against wildbg, and the flow
// through the quiz (list -> intro -> practice -> finish) without touching the mistakes log.
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
const txt = (id) => D.getElementById(id).textContent, click = (id) => D.getElementById(id).click();
(async () => { await wait(300);
  console.log('A. Content');
  const ids = E('LESSONS.map(L=>L.id)');
  ok(JSON.stringify(ids) === JSON.stringify(['opening', 'primes', 'bearoff', 'doubling', 'taking']), 'five lessons: ' + ids.join(', '));
  for (const id of ids) {
    const n = E(`LESSON_POS['${id}'].length`), items = E(`lessonItems(LESSONS.find(L=>L.id==='${id}')).map(it=>({type:it.type,tip:it.tip,best:it.best,key:it.bestSteps?boardKey(replay(it.board,'w',it.bestSteps)):null}))`);
    const want = E(`LESSON_POS['${id}'].map(x=>x.a)`);
    ok(n >= 5 && items.every((it) => it.tip && it.tip.length > 20), `${id}: ${n} positions, each with a tip`);
    ok(items.every((it, i) => (it.type === 'move' ? it.key : it.best) === want[i]), `${id}: the coach's answers match the wildbg-checked ones`);
  }
  const dbl = E("LESSON_POS.doubling.map(x=>x.a)"), tk = E("LESSON_POS.taking.map(x=>x.a)");
  ok(dbl.includes('double') && dbl.includes('nodouble') && tk.includes('take') && tk.includes('pass'), 'cube lessons mix both answers');

  console.log('B. Flow');
  ok(/5 lessons/.test(txt('lessonsTag')), 'menu card: "5 lessons"');
  const m0 = E('mistakes.length'), q0 = E('hist.quiz.length');
  click('lessonsChoice'); await wait(30);
  ok(E("state.screen") === 'learn' && !D.getElementById('lessonCard').hidden && D.getElementById('mlistCard').hidden && D.getElementById('reviewCard').hidden, 'lessons screen: lesson card shown, mistakes cards hidden');
  ok(D.querySelectorAll('#lessonBody [data-lesson]').length === 5, 'list shows 5 lessons');
  D.querySelector('[data-lesson="opening"]').click(); await wait(20);
  ok(/5-point/.test(txt('lessonBody')) && D.getElementById('lessonGo'), 'intro text + Practise button');
  click('lessonGo'); await wait(30);
  ok(/position 1 of 6/.test(txt('lessonBody')) && /to play 3-1/.test(txt('quizBody')), 'practice starts: position 1 of 6, "to play 3-1"');
  for (let i = 0; i < 6; i++) {
    E('(function(){const a=analyze(state.turnStart,state.quiz.player,state.rolled); playSteps(a.moves[0].steps.slice());})()'); await wait(20);
    if (i === 0) ok(/✓ Right/.test(txt('quizBody')) && /Lesson tip:/.test(txt('quizBody')), 'best move → "✓ Right" + lesson tip');
    click('quizNext'); await wait(30);
  }
  ok(/done/.test(txt('lessonBody')) && /6 of 6/.test(txt('lessonBody')), 'finish screen: "6 of 6"');
  ok(E("JSON.parse(localStorage.getItem('wwbg-lessons-v1')).opening.best") === 6 && /1 of 5 completed/.test(txt('lessonsTag')), 'progress saved; menu shows "1 of 5 completed"');
  ok(E('mistakes.length') === m0 && E('hist.quiz.length') === q0, 'lesson answers stay out of the mistakes log and quiz stats');

  console.log('C. A cube lesson, answered wrong');
  click('lessonBack'); await wait(20); D.querySelector('[data-lesson="taking"]').click(); await wait(20); click('lessonGo'); await wait(30);
  ok(/facing a double/.test(txt('quizBody')), 'prompt: "facing a double … Take or pass?"');
  const best = E('quizItem(state.quiz.id).best');
  click(best === 'take' ? 'quizA2' : 'quizA1'); await wait(20);
  ok(/Not quite/.test(txt('quizBody')) && /Lesson tip:/.test(txt('quizBody')) && /position 1 of 5 · 0 right/.test(txt('lessonBody')), 'wrong answer → "Not quite", tip, score 0 right');
  click('quizStop'); await wait(20);
  ok(!D.getElementById('lessonCard').hidden && D.querySelectorAll('#lessonBody [data-lesson]').length === 5 && !E('state.lesson'), 'Stop returns to the lesson list');
  E('goMenu()'); click('learnChoice'); await wait(20);
  ok(D.getElementById('lessonCard').hidden && !D.getElementById('mlistCard').hidden, '"Learn from mistakes" still shows the mistakes view');
  console.log('errors:', errs.length ? errs.join('\n') : '(none)');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail || errs.length ? 1 : 0);
})();
