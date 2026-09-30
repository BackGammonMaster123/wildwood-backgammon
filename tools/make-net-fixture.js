// Builds tests/fixtures/net-check.json for tests/net-test.js from held-out data that the
// evaluation net was not trained on:
//   - positions + wildbg probabilities (tools/net-gen.js output + wildbg-kit/label.rs labels)
//   - checker-play decisions + wildbg equity of every candidate (tools/net-bench.js make/label)
//   node tools/make-net-fixture.js <val.txt> <val.out> <bench-dir> [positions] [decisions]
const E = require('../engine.js');
const fs = require('fs');
const [pf, lf, bdir, nPos = 1200, nDec = 150] = process.argv.slice(2);
const P = fs.readFileSync(pf, 'utf8').trim().split('\n'), L = fs.readFileSync(lf, 'utf8').trim().split('\n');
const step = Math.floor(P.length / nPos), pos = [], lab = [];
for (let i = 0; pos.length < nPos; i += step) { pos.push(P[i]); lab.push(L[i].split(' ').map((v) => +(+v).toFixed(4))); }
const D = JSON.parse(fs.readFileSync(bdir + '/bench.json')), BL = fs.readFileSync(bdir + '/bench.out', 'utf8').trim().split('\n');
const eqFromLabel = (l) => { const [w, gw, bw, gl, bl] = l.split(' ').map(Number); return -((2 * w - 1) + gw - gl + bw - bl); };
const dec = [];
for (let i = 0; dec.length < nDec; i += Math.floor(D.length / nDec)) {
  const d = D[i];
  // truth per candidate, keyed by the order analyze() will enumerate them in (deduped boards)
  const truth = new Map(d.cands.map((c) => [E.boardKey(c.b), c.eq !== undefined ? c.eq : eqFromLabel(BL[c.line])]));
  const keys = []; const seen = new Set();
  for (const t of E.generateLegalTurns(d.b, d.p, d.dice)) { const k = E.boardKey(E.replay(d.b, d.p, t)); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
  dec.push({ b: d.b, p: d.p, dice: d.dice, eq: keys.map((k) => +truth.get(k).toFixed(4)) });
}
fs.writeFileSync('tests/fixtures/net-check.json', JSON.stringify({ pos, lab, dec }));
console.log(`${pos.length} positions, ${dec.length} decisions -> tests/fixtures/net-check.json`);
