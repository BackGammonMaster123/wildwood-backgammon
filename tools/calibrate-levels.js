// Tunes BOT_LEVELS: plays cubeless games between two policies and reports each side's win
// rate and Performance Rating (equity lost per non-forced decision x 500, judged by the
// evaluation net). Policies:
//   beginner       the old hand-built ranker (featureScore): human-like misjudgements, PR ~30
//   noise:<sd>     the evaluation net with Gaussian noise on each candidate's equity
//   easy|medium|strong   the levels in engine.js
//   node tools/calibrate-levels.js <policyA> <policyB> [games] [seed]
const E = require('../engine.js');
const [pa, pb, nGames = 400, seed0 = 1] = process.argv.slice(2);
let seed = +seed0;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const opp = (p) => (p === 'w' ? 'b' : 'w');
function choose(policy, board, p, moves) {
  if (policy === 'beginner') {
    let best = moves[0], bs = -Infinity;
    for (const m of moves) { const s = E.featureScore(m.board, p, (E.pipCount(m.board, opp(p)) - E.pipCount(m.board, p)) * 0.01); if (s > bs) { bs = s; best = m; } }
    return best;
  }
  if (policy.startsWith('noise:')) {
    const sd = +policy.slice(6); let best = moves[0], bs = -Infinity;
    for (const m of moves) { let u = 0; while (!u) u = rnd(); const s = m.equity + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); if (s > bs) { bs = s; best = m; } }
    return best;
  }
  return E.botChoose(moves, policy, rnd);
}
const stat = { w: { loss: 0, n: 0, wins: 0, pts: 0 }, b: { loss: 0, n: 0, wins: 0, pts: 0 } };
for (let g = 0; g < nGames; g++) {
  const pol = g % 2 ? { w: pa, b: pb } : { w: pb, b: pa };   // alternate colours
  const side = (p) => (pol[p] === pa ? 'w' : 'b');           // stat slot: 'w' = policy A
  let b = E.startingBoard(), p = rnd() < 0.5 ? 'w' : 'b';
  for (let ply = 0; ply < 400; ply++) {
    const dice = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    const a = E.analyze(b, p, dice);
    if (a.moves.length) {
      const m = choose(pol[p], b, p, a.moves);
      if (a.moves.length > 1) { const s = stat[side(p)]; s.loss += a.moves[0].equity - m.equity; s.n++; }
      b = m.board;
      const r = E.gameResult(b);
      if (r) { const s = stat[side(r.winner)]; s.wins++; s.pts += r.kind === 'backgammon' ? 3 : r.kind === 'gammon' ? 2 : 1; break; }
    }
    p = opp(p);
  }
}
const f = (k, name) => { const s = stat[k]; return `${name.padEnd(12)} wins ${(s.wins / nGames * 100).toFixed(1)}%  pts/game ${(s.pts / nGames).toFixed(2)}  PR ${(s.loss / s.n * 500).toFixed(1)}`; };
console.log(f('w', pa)); console.log(f('b', pb));
const pw = stat.w.wins / nGames; console.log(`(${nGames} games; ±${(196 * Math.sqrt(pw * (1 - pw) / nGames)).toFixed(1)}pp at 95%)`);
