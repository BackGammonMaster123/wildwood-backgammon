// Generates training positions for the evaluation net (see tools/train-net.py).
// Plays games with a mix of sloppy and greedy play and records, for each turn:
//  - the position before the roll (player on roll), and
//  - a few random candidate positions after the roll (the opponent is then on roll),
//    so the net also learns to score bad moves, which the coach has to rank.
// Every position is written in wildbg's mover frame (player on roll positive, moving
// 24->1, [25] = own bar, [0] = opponent's bar), one line of 26 ints, ready for the
// wildbg labeller (wildbg-kit/label.rs).
//   node tools/net-gen.js <positions> <seed> <out.txt> [policy: heur|net]
const E = require('../engine.js');
const A = require('../wildbg-kit/wildbg-adapter.js');
const fs = require('fs');
const N = +process.argv[2] || 1000;
let seed = +process.argv[3] || 1;
const outFile = process.argv[4] || '/tmp/net-pos.txt';
const policy = process.argv[5] || 'heur';
const rnd = () => { // mulberry32 (an LCG in plain JS doubles loses precision and cycles)
  seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const die = () => 1 + Math.floor(rnd() * 6);
const opp = (p) => (p === 'w' ? 'b' : 'w');
const seen = new Set(); const lines = [];
function add(b, q) {
  if (E.gameResult(b)) return;
  const pips = A.boardToPips(b, q), k = pips.join(' ');
  if (seen.has(k)) return; seen.add(k); lines.push(k);
}
function greedy(b, p, turns) {
  let best = null, bs = -Infinity;
  for (const t of turns) {
    const nb = E.replay(b, p, t);
    const s = policy === 'net' ? E.eqAfterMove(nb, p) : E.featureScore(nb, p, (E.pipCount(nb, opp(p)) - E.pipCount(nb, p)) * 0.01);
    if (s > bs) { bs = s; best = nb; }
  }
  return best;
}
for (let g = 0; lines.length < N; g++) {
  let b = E.startingBoard(), turn = rnd() < 0.5 ? 'w' : 'b';
  const eps = [0.03, 0.1, 0.25, 0.5][g % 4];
  for (let ply = 0; ply < 200 && lines.length < N; ply++) {
    if (E.gameResult(b)) break;
    if (ply > 0) add(b, turn);
    const dice = [die(), die()], turns = E.generateLegalTurns(b, turn, dice);
    if (turns.length) {
      for (let k = 0; k < 2; k++) add(E.replay(b, turn, turns[Math.floor(rnd() * turns.length)]), opp(turn));
      b = rnd() < eps ? E.replay(b, turn, turns[Math.floor(rnd() * turns.length)]) : greedy(b, turn, turns);
    }
    turn = opp(turn);
  }
}
fs.writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`${lines.length} positions -> ${outFile}`);
