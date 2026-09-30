// Writes LESSON_POS (the lessons' practice positions) into backgammon.html between the
// LESSON_POS markers, from tools/find-lesson-positions.js's wildbg-checked output.
//   node tools/build-lessons.js <dir-with-lessons.json>
// Positions are always shown with the learner as White. Picks a spread of dice and
// decisions so each lesson has 5-6 different situations.
const E = require('../engine.js');
const fs = require('fs');
const dir = process.argv[2] || '/tmp';
const L = JSON.parse(fs.readFileSync(dir + '/lessons.json'));
const b0 = (b) => ({ p: b.points.slice(1), bar: [b.bar.w, b.bar.b], off: [b.off.w, b.off.b] }); // compact board
const mirror = (b) => { const points = new Array(25).fill(0); for (let i = 1; i <= 24; i++) points[i] = -b.points[25 - i];
  return { points, bar: { w: b.bar.b, b: b.bar.w }, off: { w: b.off.b, b: b.off.w } }; };
function spread(list, n, keyOf) { // prefer different dice / labels
  const out = [], used = new Set();
  for (const x of list) { const k = keyOf(x); if (!used.has(k)) { used.add(k); out.push(x); } if (out.length === n) return out; }
  for (const x of list) { if (!out.includes(x)) out.push(x); if (out.length === n) break; }
  return out;
}
const pos = {
  opening: [[3, 1], [4, 2], [6, 1], [5, 3], [6, 5], [4, 1]].map((d) => ({ b: b0(E.startingBoard()), d })),
  primes: spread(L.prime, 5, (x) => x.dice.slice().sort().join()).map((x) => ({ b: b0(x.b), d: x.dice })),
  bearoff: spread(L.bearoff, 5, (x) => x.dice.slice().sort().join()).map((x) => ({ b: b0(x.b), d: x.dice })),
  doubling: [...L.double.filter((x) => x.label === 'Double, take').slice(0, 2), ...L.double.filter((x) => x.label === 'Double, pass').slice(0, 1),
    ...L.double.filter((x) => x.label === 'No double, take').slice(0, 1), ...L.double.filter((x) => /Too good/.test(x.label)).slice(0, 1)]
    .map((x) => ({ b: b0(x.b) })),
  // the learner (White) faces Black's double: mirror so Black is the one on roll
  taking: [...L.take.filter((x) => x.takes).slice(0, 3), ...L.take.filter((x) => !x.takes).slice(0, 2)].map((x) => ({ b: b0(mirror(x.b)) })),
};
// Record each position's answer (engine and wildbg agreed on it when it was picked) so
// tests/lesson-test.js can check a retrained net still gives the same one.
const unb = (c) => ({ points: [0, ...c.p], bar: { w: c.bar[0], b: c.bar[1] }, off: { w: c.off[0], b: c.off[1] } });
for (const k of ['opening', 'primes', 'bearoff']) for (const x of pos[k]) x.a = E.boardKey(E.analyze(unb(x.b), 'w', x.d).moves[0].board);
for (const x of pos.doubling) { const an = E.cubeAnalysis(E.probsOnRoll(unb(x.b), 'w'), 'center'); x.a = an.shouldDouble ? 'double' : 'nodouble'; }
for (const x of pos.taking) { const an = E.cubeAnalysis(E.probsOnRoll(unb(x.b), 'b'), 'center'); x.a = an.takes ? 'take' : 'pass'; }
const lit = JSON.stringify(pos);
const src = fs.readFileSync('backgammon.html', 'utf8');
const A = '/* LESSON_POS:begin */', B = '/* LESSON_POS:end */';
const i = src.indexOf(A), j = src.indexOf(B);
if (i < 0 || j < 0) throw new Error('LESSON_POS markers not found in backgammon.html');
fs.writeFileSync('backgammon.html', src.slice(0, i + A.length) + lit + src.slice(j));
console.log(Object.entries(pos).map(([k, v]) => `${k} ${v.length}`).join(' · '), `(${lit.length} chars)`);
