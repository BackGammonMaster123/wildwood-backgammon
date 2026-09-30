// Checker-play benchmark against wildbg: how much equity each ranking method gives up per
// decision, compared with wildbg's own best move (0-ply, strong nets).
//   node tools/net-bench.js make <decisions> <seed> <dir>   -> <dir>/bench.json, <dir>/bench.txt
//   (label <dir>/bench.txt with wildbg-kit/label.rs into <dir>/bench.out)
//   node tools/net-bench.js score <dir>
const E = require('../engine.js');
const A = require('../wildbg-kit/wildbg-adapter.js');
const fs = require('fs');
const [mode, a1, a2, a3] = process.argv.slice(2);
const opp = (p) => (p === 'w' ? 'b' : 'w');
const resultEq = (b, p) => { const r = E.gameResult(b); if (!r) return null; const v = r.kind === 'backgammon' ? 3 : r.kind === 'gammon' ? 2 : 1; return r.winner === p ? v : -v; };
// Mover's cubeless equity (backgammons counted) from wildbg's line for the opponent on roll.
const eqFromLabel = (l) => { const [w, gw, bw, gl, bl] = l.split(' ').map(Number); return -((2 * w - 1) + gw - gl + bw - bl); };

if (mode === 'make') {
  const N = +a1 || 2000; let seed = +a2 || 7; const dir = a3 || '/tmp';
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const die = () => 1 + Math.floor(rnd() * 6);
  const decisions = [], lines = [];
  while (decisions.length < N) {
    let b = E.startingBoard(), p = rnd() < 0.5 ? 'w' : 'b';
    for (let ply = 0; ply < 200 && !E.gameResult(b) && decisions.length < N; ply++) {
      const dice = [die(), die()], turns = E.generateLegalTurns(b, p, dice);
      const seen = new Set(), cands = [];
      for (const t of turns) { const nb = E.replay(b, p, t), k = E.boardKey(nb); if (!seen.has(k)) { seen.add(k); cands.push(nb); } }
      if (cands.length > 1 && rnd() < 0.35) {
        const d = { b, p, dice, cands: [] };
        for (const nb of cands) { const r = resultEq(nb, p); if (r !== null) d.cands.push({ b: nb, eq: r }); else { d.cands.push({ b: nb, line: lines.length }); lines.push(A.boardToPips(nb, opp(p)).join(' ')); } }
        decisions.push(d);
      }
      if (cands.length) b = rnd() < 0.15 ? cands[Math.floor(rnd() * cands.length)] : E.quickBest(b, p, dice);
      p = opp(p);
    }
  }
  fs.writeFileSync(dir + '/bench.json', JSON.stringify(decisions));
  fs.writeFileSync(dir + '/bench.txt', lines.join('\n') + '\n');
  console.log(`${decisions.length} decisions, ${lines.length} candidate positions`);
} else if (mode === 'score') {
  const dir = a1 || '/tmp';
  const D = JSON.parse(fs.readFileSync(dir + '/bench.json')), L = fs.readFileSync(dir + '/bench.out', 'utf8').trim().split('\n');
  const methods = {
    heuristic: (b, p, nb) => E.featureScore(nb, p, (E.pipCount(nb, opp(p)) - E.pipCount(nb, p)) * 0.01), // the old ranker
    analyze: null, // whatever analyze() ranks first today
  };
  const tot = {}, cnt = { all: 0, contact: 0, race: 0 }, agree = {};
  for (const d of D) {
    for (const c of d.cands) c.truth = c.eq !== undefined ? c.eq : eqFromLabel(L[c.line]);
    const bestT = Math.max(...d.cands.map((c) => c.truth));
    const ph = E.hasContact(d.b) ? 'contact' : 'race'; cnt.all++; cnt[ph]++;
    for (const [name, f] of Object.entries(methods)) {
      let pick;
      if (f) { let bs = -Infinity; for (const c of d.cands) { const s = f(d.b, d.p, c.b); if (s > bs) { bs = s; pick = c; } } }
      else { const top = E.analyze(d.b, d.p, d.dice).moves[0]; const k = E.boardKey(top.board); pick = d.cands.find((c) => E.boardKey(c.b) === k); }
      const loss = bestT - pick.truth;
      for (const g of ['all', ph]) { tot[name + ':' + g] = (tot[name + ':' + g] || 0) + loss; }
      if (loss < 1e-6) agree[name] = (agree[name] || 0) + 1;
    }
  }
  for (const name of Object.keys(methods)) {
    const f = (g) => (tot[name + ':' + g] / cnt[g]).toFixed(4);
    console.log(`${name.padEnd(10)} loss/decision  all ${f('all')}  contact ${f('contact')}  race ${f('race')}  | picks wildbg's move ${(agree[name] / cnt.all * 100).toFixed(1)}%`);
  }
  console.log(`(${cnt.all} decisions: ${cnt.contact} contact, ${cnt.race} race)`);
}
