// Finds practice positions for the lessons (LESSON_POS in backgammon.html).
//   node tools/find-lesson-positions.js make <dir>     -> <dir>/lp.json + <dir>/lp.txt (candidates to label)
//   (label <dir>/lp.txt with wildbg-kit/label.rs into <dir>/lp.out)
//   node tools/find-lesson-positions.js pick <dir>     -> <dir>/lessons.json (only positions wildbg agrees on)
// Checker positions need a clear best play (next best >= 0.04 behind, by the net) and the same
// best play from wildbg. Cube positions need a clear decision (wrong action >= 0.05) that
// wildbg's probabilities give the same label.
const E = require('../engine.js');
const A = require('../wildbg-kit/wildbg-adapter.js');
const fs = require('fs');
const [mode, dir = '/tmp'] = process.argv.slice(2);
const opp = (p) => (p === 'w' ? 'b' : 'w');
let seed = 2024;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Mirror a board so that Black's position is shown from White's side (lessons are always White).
function asWhite(b, p) {
  if (p === 'w') return E.cloneBoard(b);
  const points = new Array(25).fill(0); for (let i = 1; i <= 24; i++) points[i] = -b.points[25 - i];
  return { points, bar: { w: b.bar.b, b: b.bar.w }, off: { w: b.off.b, b: b.off.w } };
}
const allHome = (b) => { if (b.bar.w) return false; for (let i = 7; i <= 24; i++) if (b.points[i] > 0) return false; return true; };
const blackInWhiteHome = (b) => b.bar.b > 0 || [1, 2, 3, 4, 5, 6].some((i) => b.points[i] < 0);
const shotsLeft = (b) => E.blots(b, 'w').reduce((a, x) => a + x.shots, 0);
function candidates(b, dice) {
  const seen = new Set(), c = [];
  for (const t of E.generateLegalTurns(b, 'w', dice)) { const nb = E.replay(b, 'w', t), k = E.boardKey(nb); if (!seen.has(k)) { seen.add(k); c.push({ steps: t, b: nb, eq: E.eqAfterMove(nb, 'w') }); } }
  return c.sort((x, y) => y.eq - x.eq);
}

if (mode === 'make') {
  const out = { prime: [], bearoff: [], double: [], take: [] }, lines = [];
  const lineOf = (b, q) => { lines.push(A.boardToPips(b, q).join(' ')); return lines.length - 1; };
  for (let g = 0; g < 3000 && (out.prime.length < 60 || out.bearoff.length < 60 || out.double.length < 80 || out.take.length < 80); g++) {
    let b = E.startingBoard(), p = rnd() < 0.5 ? 'w' : 'b';
    for (let ply = 0; ply < 200 && !E.gameResult(b); ply++) {
      const W = asWhite(b, p);
      // cube: White on roll deciding to double / Black deciding to take
      const pr = E.probsOnRoll(W, 'w'), an = E.cubeAnalysis(pr, 'center');
      if (pr.win > 0.55 && pr.win < 0.97 && rnd() < 0.3) {
        const wrongD = E.cubeError(an, 'doubler', an.shouldDouble ? 'nodouble' : 'double');
        if (wrongD >= 0.05 && out.double.length < 80) out.double.push({ b: W, label: an.label, line: lineOf(W, 'w') });
        if (an.shouldDouble || pr.win > 0.66) { const wrongT = E.cubeError(an, 'taker', an.takes ? 'pass' : 'take');
          if (wrongT >= 0.05 && out.take.length < 80) out.take.push({ b: W, takes: an.takes, line: lineOf(W, 'w') }); }
      }
      const dice = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
      const c = candidates(W, dice);
      if (c.length > 2 && c[0].eq - c[1].eq >= 0.04) {
        const primeGain = E.longestPrime(c[0].b, 'w') - E.longestPrime(W, 'w'), bestPrime = E.longestPrime(c[0].b, 'w');
        const isPrime = primeGain > 0 && bestPrime >= 4 && E.hasContact(W) && c.slice(1).every((x) => E.longestPrime(x.b, 'w') < bestPrime || x.eq < c[0].eq - 0.04);
        const isBear = allHome(W) && blackInWhiteHome(W) && shotsLeft(c[0].b) < Math.max(...c.map((x) => shotsLeft(x.b)));
        const kind = isPrime && out.prime.length < 60 ? 'prime' : isBear && out.bearoff.length < 60 ? 'bearoff' : null;
        if (kind) out[kind].push({ b: W, dice, gap: c[0].eq - c[1].eq, cands: c.map((x) => ({ steps: x.steps, key: E.boardKey(x.b), line: lineOf(x.b, 'b') })) });
      }
      // move on: medium-ish play keeps positions natural but varied
      const turns = E.generateLegalTurns(b, p, dice);
      if (turns.length) b = E.botChoose(E.analyze(b, p, dice).moves, 'medium', rnd).board;
      p = opp(p);
    }
  }
  fs.writeFileSync(dir + '/lp.json', JSON.stringify(out)); fs.writeFileSync(dir + '/lp.txt', lines.join('\n') + '\n');
  console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(' · '), `| ${lines.length} positions to label`);
} else if (mode === 'pick') {
  const out = JSON.parse(fs.readFileSync(dir + '/lp.json')), L = fs.readFileSync(dir + '/lp.out', 'utf8').trim().split('\n').map((l) => l.split(' ').map(Number));
  const eqMover = (i) => { const [w, gw, bw, gl, bl] = L[i]; return -((2 * w - 1) + gw - gl + bw - bl); };
  const res = {};
  for (const kind of ['prime', 'bearoff']) {
    res[kind] = out[kind].filter((d) => { const t = d.cands.map((c) => eqMover(c.line)); const best = t.indexOf(Math.max(...t)); const second = Math.max(...t.filter((_, i) => i !== best));
      return best === 0 && t[0] - second >= 0.03; }).map((d) => ({ b: d.b, dice: d.dice }));
  }
  const probs = (i) => { const [w, gw, bw, gl, bl] = L[i]; return { win: w, gw, gl }; };
  res.double = out.double.filter((d) => E.cubeAnalysis(probs(d.line), 'center').label === d.label).map((d) => ({ b: d.b, label: d.label }));
  res.take = out.take.filter((d) => E.cubeAnalysis(probs(d.line), 'center').takes === d.takes).map((d) => ({ b: d.b, takes: d.takes }));
  fs.writeFileSync(dir + '/lessons.json', JSON.stringify(res));
  console.log('wildbg agrees on:', Object.entries(res).map(([k, v]) => `${k} ${v.length}/${out[k].length}`).join(' · '));
  for (const k of ['double']) { const c = {}; res[k].forEach((d) => { c[d.label] = (c[d.label] || 0) + 1; }); console.log(' double labels:', JSON.stringify(c)); }
  console.log(' take: takes', res.take.filter((d) => d.takes).length, 'passes', res.take.filter((d) => !d.takes).length);
}
