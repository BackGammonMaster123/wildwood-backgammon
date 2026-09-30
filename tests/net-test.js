// The evaluation net against wildbg (strong nets) on held-out data (tests/fixtures/net-check.json,
// built by tools/make-net-fixture.js): probability error and checker-play equity loss.
const E = require('../engine.js');
const F = require('./fixtures/net-check.json');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
function toBoard(pips) { // wildbg mover frame = board with White on roll
  const points = new Array(25).fill(0); let w = pips[25], b = -pips[0];
  for (let i = 1; i <= 24; i++) { points[i] = pips[i]; if (pips[i] > 0) w += pips[i]; else b -= pips[i]; }
  return { points, bar: { w: pips[25], b: -pips[0] }, off: { w: 15 - w, b: 15 - b } };
}
console.log('A. Win and gammon probabilities vs wildbg');
const err = { contact: [0, 0, 0], race: [0, 0, 0] }, n = { contact: 0, race: 0 };
F.pos.forEach((line, i) => {
  const b = toBoard(line.split(' ').map(Number)), pr = E.probsOnRoll(b, 'w'), y = F.lab[i];
  const ph = E.hasContact(b) ? 'contact' : 'race'; n[ph]++;
  err[ph][0] += Math.abs(pr.win - y[0]); err[ph][1] += Math.abs(pr.gw - y[1]); err[ph][2] += Math.abs(pr.gl - y[3]);
});
const pp = (ph, k) => err[ph][k] / n[ph] * 100;
console.log(`     contact (n=${n.contact}): win ${pp('contact', 0).toFixed(2)}pp gammon ${pp('contact', 1).toFixed(2)}/${pp('contact', 2).toFixed(2)}pp`);
console.log(`     race    (n=${n.race}): win ${pp('race', 0).toFixed(2)}pp gammon ${pp('race', 1).toFixed(2)}/${pp('race', 2).toFixed(2)}pp`);
ok(pp('contact', 0) < 1.8, 'contact win error under 1.8pp (the old model was ~6.4pp)');
ok(pp('race', 0) < 1.2, 'race win error under 1.2pp (the old model was ~2pp)');
ok(pp('contact', 1) < 1.5 && pp('contact', 2) < 1.5, 'contact gammon errors under 1.5pp');

console.log('B. Checker play vs wildbg');
let loss = 0, agree = 0, bad = 0;
for (const d of F.dec) {
  const a = E.analyze(d.b, d.p, d.dice), best = Math.max(...d.eq);
  const keys = []; const seen = new Set();
  for (const t of E.generateLegalTurns(d.b, d.p, d.dice)) { const k = E.boardKey(E.replay(d.b, d.p, t)); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
  const l = best - d.eq[keys.indexOf(E.boardKey(a.moves[0].board))];
  loss += l; if (l < 1e-6) agree++; if (l >= 0.08) bad++;
}
console.log(`     ${F.dec.length} decisions: loss ${(loss / F.dec.length).toFixed(4)}/decision, picks wildbg's move ${(agree / F.dec.length * 100).toFixed(1)}%, ${bad} blunders (>=0.08)`);
ok(loss / F.dec.length < 0.012, 'average equity loss per decision under 0.012 (the old ranker lost ~0.07)');
ok(agree / F.dec.length > 0.65, "picks wildbg's move in over 65% of decisions");
console.log(`\n${pass} passed, ${fail} failed`);
