// Bot difficulty levels (BOT_LEVELS / botChoose / botCubeView), judged by wildbg's equities
// in tests/fixtures/net-check.json, plus the level picker in the page.
const E = require('../engine.js');
const F = require('./fixtures/net-check.json');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
let seed = 5;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

console.log('A. Move choice by level (wildbg equity loss per decision)');
const res = {};
for (const lv of ['easy', 'medium', 'strong']) res[lv] = { loss: 0, huge: 0, same: 0 };
for (const d of F.dec) {
  const a = E.analyze(d.b, d.p, d.dice), best = Math.max(...d.eq);
  const keys = []; const seen = new Set();
  for (const t of E.generateLegalTurns(d.b, d.p, d.dice)) { const k = E.boardKey(E.replay(d.b, d.p, t)); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
  const truth = (m) => d.eq[keys.indexOf(E.boardKey(m.board))];
  for (const lv of Object.keys(res)) for (let r = 0; r < 4; r++) {
    const m = E.botChoose(a.moves, lv, rnd), l = best - truth(m);
    res[lv].loss += l; if (l > 0.3) res[lv].huge++; if (m === a.moves[0]) res[lv].same++;
  }
}
const N = F.dec.length * 4, pr = (lv) => res[lv].loss / N * 500;
for (const lv of Object.keys(res)) console.log(`     ${lv.padEnd(7)} PR ${pr(lv).toFixed(1)} · plays the engine's top move ${(res[lv].same / N * 100).toFixed(0)}% · huge blunders (>0.3) ${(res[lv].huge / N * 100).toFixed(1)}%`);
ok(res.strong.same === N, 'Strong always plays the top move');
ok(pr('easy') > pr('medium') + 5 && pr('medium') > pr('strong') + 2, 'Easy errs more than Medium, Medium more than Strong');
ok(res.easy.huge / N < 0.08, 'even Easy rarely makes huge blunders (errors fall where moves are close)');
ok(E.botChoose([], 'easy') === null, 'no legal move -> null');

console.log('B. Cube view by level');
const p0 = { win: 0.7, gw: 0.2, gl: 0.05 };
ok(E.botCubeView(p0, 'strong') === p0, 'Strong sees the true probabilities');
let spread = 0; for (let i = 0; i < 400; i++) { const v = E.botCubeView(p0, 'easy', rnd); spread += Math.abs(v.win - 0.7); if (v.gw > v.win || v.gl > 1 - v.win) spread = NaN; }
ok(spread / 400 > 0.05 && spread / 400 < 0.15, `Easy misjudges the win chance by ~${(spread / 400 * 100).toFixed(0)}pp on average, gammons stay consistent`);

console.log('C. Page: level picker');
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync('backgammon.html', 'utf8');
const dom = new JSDOM('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://ex.com',
  beforeParse(w) { w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }); w.requestAnimationFrame = (f) => setTimeout(f, 0); w.confirm = () => true; } });
const win = dom.window, D = win.document;
setTimeout(() => {
  ok(win.eval('state.prefs.level') === 'medium' && D.getElementById('levelSel').value === 'medium', 'defaults to Medium');
  D.getElementById('levelSel').value = 'easy'; D.getElementById('levelSel').dispatchEvent(new win.Event('change'));
  ok(JSON.parse(win.localStorage.getItem('wwbg-prefs')).level === 'easy', 'choice is saved with the other preferences');
  win.eval("state.mode='vsai'; refreshNames();");
  ok(/Easy/.test(D.getElementById('whoB').textContent), 'scoreboard names the level: ' + D.getElementById('whoB').textContent);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 300);
