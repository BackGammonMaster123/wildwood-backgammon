/* ============================================================================
   Backgammon rules engine  (pure logic, no DOM)
   Board model:
     points: array length 25, index 1..24 used.
             value > 0  => that many WHITE checkers
             value < 0  => that many BLACK checkers
     bar: { w, b }   off: { w, b }
   Directions:
     White ('w'): moves 24 -> 1, home = points 1..6, enters from bar on 24..19,
                  bears off past point 0.
     Black ('b'): moves 1 -> 24, home = points 19..24, enters from bar on 1..6,
                  bears off past point 25.
   A "step" = { from, to, die }  where from = 'bar' | 1..24 ,
                                        to   = 1..24 | 'off'
   A "turn" = ordered array of steps.
   ========================================================================== */

function startingBoard() {
  const points = new Array(25).fill(0);
  // White (+): 24:2, 13:5, 8:3, 6:5
  points[24] = 2; points[13] = 5; points[8] = 3; points[6] = 5;
  // Black (-): 1:2, 12:5, 17:3, 19:5
  points[1] = -2; points[12] = -5; points[17] = -3; points[19] = -5;
  return { points, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
}

function cloneBoard(b) {
  return { points: b.points.slice(), bar: { w: b.bar.w, b: b.bar.b }, off: { w: b.off.w, b: b.off.b } };
}

const sgn = (p) => (p === 'w' ? 1 : -1);
const opp = (p) => (p === 'w' ? 'b' : 'w');

function myCount(b, p, point) { const v = b.points[point]; return sgn(p) === 1 ? Math.max(0, v) : Math.max(0, -v); }
function oppCount(b, p, point) { const v = b.points[point]; return sgn(p) === 1 ? Math.max(0, -v) : Math.max(0, v); }

function canLand(b, p, dest) {
  if (dest < 1 || dest > 24) return false;
  return oppCount(b, p, dest) <= 1; // open, own, blot, or single opponent (hit) all landable
}

function allHome(b, p) {
  if (p === 'w') {
    if (b.bar.w > 0) return false;
    for (let i = 7; i <= 24; i++) if (b.points[i] > 0) return false;
    return true;
  } else {
    if (b.bar.b > 0) return false;
    for (let i = 1; i <= 18; i++) if (b.points[i] < 0) return false;
    return true;
  }
}

// pips from `point` to bear-off for player p
function bearPips(p, point) { return p === 'w' ? point : (25 - point); }

// is there a checker of p farther from home (needing more pips) than `point`?
function checkerFartherOut(b, p, point) {
  if (p === 'w') { for (let i = point + 1; i <= 6; i++) if (b.points[i] > 0) return true; }
  else { for (let i = point - 1; i >= 19; i--) if (b.points[i] < 0) return true; }
  return false;
}

// legal single moves for die d
function singleMoves(b, p, d) {
  const moves = [];
  const barCount = p === 'w' ? b.bar.w : b.bar.b;
  if (barCount > 0) {
    const entry = p === 'w' ? 25 - d : d;
    if (canLand(b, p, entry)) moves.push({ from: 'bar', to: entry, die: d });
    return moves; // must enter all checkers from the bar first
  }
  const dir = p === 'w' ? -1 : 1;
  for (let pt = 1; pt <= 24; pt++) {
    if (myCount(b, p, pt) <= 0) continue;
    const dest = pt + dir * d;
    if (dest >= 1 && dest <= 24) {
      if (canLand(b, p, dest)) moves.push({ from: pt, to: dest, die: d });
    } else {
      // heading off the board -> bear off (only if all home)
      if (!allHome(b, p)) continue;
      const need = bearPips(p, pt);
      if (d === need) moves.push({ from: pt, to: 'off', die: d });
      else if (d > need && !checkerFartherOut(b, p, pt)) moves.push({ from: pt, to: 'off', die: d });
    }
  }
  return moves;
}

function applyStep(b, p, step) {
  const nb = cloneBoard(b);
  const s = sgn(p);
  // remove from source
  if (step.from === 'bar') { if (p === 'w') nb.bar.w--; else nb.bar.b--; }
  else nb.points[step.from] -= s;
  // place at destination
  if (step.to === 'off') { if (p === 'w') nb.off.w++; else nb.off.b++; }
  else {
    // hit?
    if (sgn(p) === 1 ? nb.points[step.to] === -1 : nb.points[step.to] === 1) {
      nb.points[step.to] = 0;
      if (p === 'w') nb.bar.b++; else nb.bar.w++;
    }
    nb.points[step.to] += s;
  }
  return nb;
}

function replay(b, p, steps) { let cur = b; for (const st of steps) cur = applyStep(cur, p, st); return cur; }

// Generate all legal complete turns (each an ordered array of steps), enforcing:
//  - enter from bar first
//  - must play as many dice as possible
//  - if exactly one die is playable and dice differ, must play the higher one
function generateLegalTurns(board, p, dice) {
  const diceList = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
  const terminals = [];
  (function rec(b, remaining, steps) {
    let moved = false;
    const tried = new Set();
    for (let i = 0; i < remaining.length; i++) {
      const d = remaining[i];
      if (tried.has(d)) continue;
      tried.add(d);
      const rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
      const sm = singleMoves(b, p, d);
      for (const m of sm) { moved = true; rec(applyStep(b, p, m), rest, steps.concat([m])); }
    }
    if (!moved) terminals.push(steps);
  })(board, diceList, []);

  if (terminals.length === 0) return [];
  const maxUsed = terminals.reduce((m, t) => Math.max(m, t.length), 0);
  if (maxUsed === 0) return []; // no die playable at all -> a dance
  let best = terminals.filter((t) => t.length === maxUsed);

  if (dice[0] !== dice[1] && maxUsed === 1) {
    const hi = Math.max(dice[0], dice[1]);
    const hiPlays = best.filter((t) => t[0].die === hi);
    if (hiPlays.length > 0) best = hiPlays;
  }
  // dedupe identical step sequences
  const seen = new Set();
  const out = [];
  for (const t of best) {
    const key = t.map((s) => `${s.from}>${s.to}:${s.die}`).join('|');
    if (!seen.has(key)) { seen.add(key); out.push(t); }
  }
  return out;
}

// ---- metrics -------------------------------------------------------------
function pipCount(b, p) {
  let total = 0;
  if (p === 'w') { for (let i = 1; i <= 24; i++) if (b.points[i] > 0) total += b.points[i] * i; total += b.bar.w * 25; }
  else { for (let i = 1; i <= 24; i++) if (b.points[i] < 0) total += (-b.points[i]) * (25 - i); total += b.bar.b * 25; }
  return total;
}

function bornOff(b, p) { return p === 'w' ? b.off.w : b.off.b; }

function gameResult(b) {
  // returns null | { winner, kind } kind in 'single'|'gammon'|'backgammon'
  for (const p of ['w', 'b']) {
    if (bornOff(b, p) === 15) {
      const o = opp(p);
      if (bornOff(b, o) > 0) return { winner: p, kind: 'single' };
      // opponent borne off nothing -> gammon; backgammon if opp has checker in winner's home or on bar
      const oBar = o === 'w' ? b.bar.w : b.bar.b;
      let inWinnerHome = false;
      if (o === 'w') { for (let i = 19; i <= 24; i++) if (b.points[i] > 0) inWinnerHome = true; }
      else { for (let i = 1; i <= 6; i++) if (b.points[i] < 0) inWinnerHome = true; }
      return { winner: p, kind: (oBar > 0 || inWinnerHome) ? 'backgammon' : 'gammon' };
    }
  }
  return null;
}

// approximate number of rolls (out of 36) with which opponent can hit `point` (a blot of player p)
function hitRolls(b, victim, point) {
  const o = opp(victim);
  // distances from each opponent checker (incl bar) to the blot, in opp's direction of travel
  const dists = [];
  const oBar = o === 'w' ? b.bar.w : b.bar.b;
  if (oBar > 0) {
    const entry = o === 'w' ? 25 : 0; // conceptual bar origin
    const dd = o === 'w' ? (25 - point) : (point - 0);
    if (dd >= 1) dists.push(dd);
  }
  for (let q = 1; q <= 24; q++) {
    if (oppCount(b, victim, q) <= 0) continue; // only opponent checkers
    // opp 'w' moves 24->1 (decreasing); opp 'b' moves 1->24 (increasing)
    const dist = o === 'w' ? (q - point) : (point - q);
    if (dist >= 1) dists.push(dist);
  }
  const distSet = new Set(dists.filter((x) => x >= 1 && x <= 24));
  if (distSet.size === 0) return 0;
  const blocked = (pt) => pt >= 1 && pt <= 24 && oppCount(b, victim, pt) >= 2; // 2+ of victim blocks opp landing
  let hits = 0;
  for (let a = 1; a <= 6; a++) {
    for (let c = 1; c <= 6; c++) {
      let hit = false;
      // direct
      if (distSet.has(a) || distSet.has(c)) hit = true;
      // two-die combination (needs a landable intermediate)
      if (!hit) {
        for (const dist of distSet) {
          if (a + c === dist && dist <= 12) {
            // intermediate points from any opp checker at `point - dist` ... approximate: check the two landing spots
            const inter1 = o === 'b' ? point - c : point + c;
            const inter2 = o === 'b' ? point - a : point + a;
            if (!blocked(inter1) || !blocked(inter2)) { hit = true; break; }
          }
        }
      }
      // doubles multiples
      if (!hit && a === c) {
        for (const mult of [2, 3, 4]) {
          if (distSet.has(a * mult) && a * mult <= 24) { hit = true; break; }
        }
      }
      if (hit) hits++;
    }
  }
  return hits;
}

// blots of player p with their shot counts
function blots(b, p) {
  const out = [];
  for (let i = 1; i <= 24; i++) if (myCount(b, p, i) === 1) out.push({ point: i, shots: hitRolls(b, p, i) });
  return out;
}

// home-board points made (2+) for player p
function homePointsMade(b, p) {
  let n = 0;
  if (p === 'w') { for (let i = 1; i <= 6; i++) if (b.points[i] >= 2) n++; }
  else { for (let i = 19; i <= 24; i++) if (b.points[i] <= -2) n++; }
  return n;
}

// longest consecutive block ("prime") anywhere for player p
function longestPrime(b, p) {
  let best = 0, run = 0;
  for (let i = 1; i <= 24; i++) { if (myCount(b, p, i) >= 2) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
}

// checkers still deep in the back for p (far from home)
function backCheckers(b, p) {
  let n = 0;
  if (p === 'w') { for (let i = 19; i <= 24; i++) if (b.points[i] > 0) n += b.points[i]; }
  else { for (let i = 1; i <= 6; i++) if (b.points[i] < 0) n += -b.points[i]; }
  return n;
}

// ---- evaluator -----------------------------------------------------------
// Heuristic. Returns { score, winProb } from player p's perspective (higher = better for p).
// SEAM: this is the function to replace with wildbg-wasm's engine.evaluate()/analyze()
// for gold-standard neural-net equity. Its output shape (equity + win prob) matches.
function evaluate(b, p) {
  const o = opp(p);
  const res = gameResult(b);
  if (res) {
    const val = res.kind === 'backgammon' ? 3 : res.kind === 'gammon' ? 2 : 1;
    const s = res.winner === p ? val : -val;
    return { score: s, winProb: s > 0 ? 1 : 0 };
  }
  const myPip = pipCount(b, p), oPip = pipCount(b, o);
  const pipTerm = (oPip - myPip) * 0.010;          // race: pip difference is the backbone
  const score = featureScore(b, p, pipTerm);        // ranking score (unchanged arithmetic)
  // Win probability: after p's move the OPPONENT is on roll, so ask the race model for o.
  const winProb = 1 - probsOnRoll(b, o, score - pipTerm).win;
  return { score, winProb };
}

// Non-race positional terms, accumulated onto `init` in a fixed order (so evaluate()'s
// score is bit-for-bit what it always was). From p's perspective, p having just moved.
function featureScore(b, p, init) {
  const o = opp(p);
  let score = init;
  score += (bornOff(b, p) - bornOff(b, o)) * 0.06;
  score -= (p === 'w' ? b.bar.w : b.bar.b) * 0.28;
  score += (o === 'w' ? b.bar.w : b.bar.b) * 0.22;
  for (const bl of blots(b, p)) score -= (bl.shots / 36) * 0.55;
  for (const bl of blots(b, o)) score += (bl.shots / 36) * 0.30;
  score += (homePointsMade(b, p) - homePointsMade(b, o)) * 0.14;
  score += (longestPrime(b, p) - longestPrime(b, o)) * 0.06;
  score -= Math.max(0, backCheckers(b, p) - 2) * 0.10;
  score += Math.max(0, backCheckers(b, o) - 2) * 0.06;
  for (let i = 1; i <= 24; i++) { const c = myCount(b, p, i); if (c > 5) score -= (c - 5) * 0.05; }
  return score;
}

// ---- win & gammon probabilities (fitted to wildbg) -----------------------
// Race backbone: each side needs max(pip-based, checker-based) rolls; the roll-count
// difference is ~normal. A small logistic model on top adds contact features (bar,
// home boards, shots, primes, anchors, ...). All weights were fitted against the
// wildbg neural net on ~8.5k positions from simulated games (held-out error:
// win ~2.8pp in races, ~7.8pp in contact; gammon rates ~4pp).
const CAL = {"RP": {"R": 8.167, "S": 0.34, "ON": 0.35, "W": 6, "C": 2.6}};
// Small MLP (inputs = probFeatures minus bias, standardized) -> win, gammon-win, gammon-loss.
const NET = {"mu":[-0.05013,0.75845,-0.08702,0.18676,0.08166,2.26511,2.30409,0.24584,0.27662,1.86376,1.89523,1.00324,0.99896,0.38003,0.36514,0.07665,0.0837,0.78798,0.80229,-0.03911,0.62892,0.31737,-0.09485,1.01858,1.12691,0.90227,0.86316,0.92335,0.9163],"sd":[2.98766,0.42802,2.3734,0.47674,0.33266,1.60017,1.60541,0.36063,0.37656,1.45374,1.46301,1.15506,1.15945,0.50729,0.50395,0.19107,0.1995,0.40874,0.39827,0.37406,1.73392,1.34145,0.43132,1.24285,1.33485,0.47594,0.46832,0.19107,0.1995],"W1":[[0.2407,-0.4578,-0.2382,-0.1185,-0.0161,0.3209,-0.0257,-0.0652,-0.2935,-0.2733,0.086,-0.1744,-0.077,0.1,-0.0937,0.1556,-0.1023,-0.0851,-0.2952,0.3298,-0.0987,0.0493,-0.082,0.1607,-0.0509,-0.639,-0.3682,-0.1557,0.1231],[0.2628,0.242,0.0572,-0.0176,-0.0557,-0.011,0.3484,-0.0457,0.0541,-0.0841,0.2933,0.0411,0.0189,-0.0181,-0.0548,-0.0451,-0.2271,0.046,0.1195,0.1915,-0.1067,-0.1405,0.1096,-0.02,0.1296,-0.2335,-0.0798,0.045,0.2271],[-0.2504,0.2749,-0.0344,0.105,-0.3234,-0.0501,0.1282,0.0429,0.2551,0.0435,-0.0544,0.1057,0.0461,-0.2119,0.258,-0.1021,0.115,-0.0644,0.1951,-0.3165,0.049,-0.2614,-0.1035,-0.051,0.0514,0.4481,0.1921,0.1021,-0.1386],[-0.0011,-0.0044,-0.0001,0.0001,-0.003,0.0003,0.0015,-0.0013,-0.0012,-0.0017,0.0016,0.0018,-0.0012,-0.0008,0.0029,0.0002,-0.002,0.0002,0.0008,-0.0016,0.0015,-0.0031,0.0014,-0.0014,0.0057,-0.0043,-0.0057,-0.0002,0.002],[-0.2742,-0.3163,0.2703,-0.1885,-0.0572,0.0183,0.419,-0.0207,0.0276,0.0618,-0.368,0.0505,0.1627,-0.0321,-0.1521,-0.13,0.1217,-0.4616,0.0557,-0.2352,0.2256,-0.0066,0.1453,0.0484,-0.1052,-0.4091,-0.6344,0.0604,-0.1217],[-0.279,0.039,0.1978,0.2019,-0.125,0.0454,0.0962,-0.0067,0.0138,0.0311,-0.1796,-0.0891,0.2132,-0.093,-0.0232,0.0262,0.1965,0.0812,0.1665,-0.2832,0.4278,-0.1037,-0.0418,0.2586,0.0411,0.1934,-0.0397,-0.0262,-0.2191],[-0.145,0.4485,0.2676,0.0444,-0.0529,0.2197,0.2505,-0.0285,-0.1001,-0.1768,0.0616,-0.0627,-0.2218,0.1409,-0.1234,-0.1596,0.0546,-0.1556,0.3797,-0.1727,0.0909,-0.0826,0.0659,0.0462,0.0061,0.0735,-0.0519,0.1596,-0.0657],[0.4662,0.0443,-0.1089,0.0194,0.1114,0.2093,0.148,0.2276,0.3923,-0.006,0.0309,-0.175,-0.1667,0.1042,-0.1904,0.0052,-0.0709,0.0562,0.0216,0.3811,0.0702,0.093,-0.0566,0.0278,0.0936,-0.0407,0.2659,-0.0051,0.0717],[0.1829,-0.188,-0.1581,0.2526,-0.0013,0.0902,-0.1389,-0.0284,0.2582,-0.0876,-0.136,-0.022,-0.1018,0.1019,0.004,0.0033,-0.0249,-0.068,-0.0322,0.2118,0.0967,0.0298,-0.1124,0.2115,0.325,-0.2081,-0.0379,-0.0033,0.0257],[0.3051,0.0278,-0.1182,-0.1413,0.2929,-0.0507,0.0515,-0.0148,-0.0691,-0.0069,-0.0085,0.4549,0.1546,0.208,-0.083,0.1713,-0.0566,0.1427,0.1661,0.2378,-0.0663,0.1089,0.0804,0.0471,0.1486,-0.1301,0.0698,-0.1658,0.0566],[-0.2626,0.236,-0.1236,-0.1141,0.0393,0.0706,0.1442,-0.1068,-0.0288,-0.0878,-0.0416,0.1952,-0.0701,0.1615,-0.174,-0.068,0.0043,-0.0456,0.1502,-0.2725,-0.1884,-0.0378,0.0197,0.2911,-0.0957,0.1759,-0.0391,0.068,-0.0111],[-0.3547,0.007,0.1398,0.0824,-0.0495,0.1537,0.1541,0.0515,0.1498,-0.0486,-0.1122,0.3011,-0.227,-0.0647,0.2071,-0.0506,0.0396,-0.4093,0.0637,-0.4299,-0.0354,0.0046,-0.1618,-0.0073,-0.0394,0.2101,-0.1523,0.0378,-0.0396],[0.0774,0.0841,-0.5436,0.0726,0.2659,0.2417,-0.165,-0.0299,-0.1737,0.2073,-0.0043,-0.0438,0.1799,-0.2206,0.0312,0.1099,-0.1167,-0.082,-0.3252,0.1131,-0.0502,0.1065,-0.2384,0.1135,0.0475,-0.5391,-0.4602,-0.1098,0.0926],[-0.3837,0.1207,0.1708,-0.0494,0.163,0.1717,0.0531,0.0703,0.2626,0.0529,0.1256,-0.2367,0.3563,0.1052,0.2899,-0.1353,0.2867,-0.0799,0.0739,-0.128,0.0947,0.1228,-0.1305,0.0019,0.0648,0.2579,0.1652,0.1353,-0.2867],[-0.3221,-0.0411,-0.0579,-0.0654,0.0731,-0.0382,0.4002,-0.0712,-0.0792,0.0204,0.0971,-0.2983,-0.1677,-0.0291,0.0696,-0.1358,0.0344,-0.2058,-0.1694,-0.3603,0.0459,0.0375,0.1785,-0.0742,-0.1181,-0.0111,-0.3008,0.127,-0.0344],[-0.2198,-0.1994,0.2619,0.1485,-0.0563,-0.4738,-0.1758,0.2591,0.1206,-0.0827,0.0225,0.2313,0.1046,-0.0048,-0.0507,-0.0091,0.1902,-0.3126,-0.0278,-0.1381,0.0685,0.0492,0.1326,-0.0526,-0.1541,0.1627,0.0593,0.003,-0.1902],[0.2669,0.273,0.0148,0.0208,0.1584,0.1746,-0.1136,-0.0584,0.1052,-0.1132,-0.0671,0.1075,0.1472,-0.1029,0.096,0.1339,-0.0957,0.1055,0.1759,0.3557,0.0561,0.0568,-0.12,0.1,0.1004,0.2782,0.5673,-0.1321,0.0957],[0.1737,-0.1846,-0.1806,-0.4261,-0.0049,0.0723,-0.0527,0.3841,0.0083,0.073,-0.0307,0.3306,-0.0804,-0.2125,0.0838,0.1314,-0.1012,0.0687,-0.0065,0.1065,-0.3034,0.0369,0.0498,0.0098,-0.0281,-0.001,0.0832,-0.1314,0.1001],[-0.4751,0.012,-0.1551,-0.113,-0.0337,0.0119,-0.1745,-0.0255,-0.1008,0.1881,-0.1189,-0.2613,-0.3164,0.0361,-0.4352,-0.1462,-0.0598,0.1367,0.0427,-0.337,0.0077,-0.0723,0.1307,0.0467,-0.0461,-0.0487,-0.329,0.1462,0.0549],[-0.1241,-0.0265,0.5465,0.0247,0.006,-0.1164,0.2664,-0.0402,0.1875,-0.2398,0.3004,0.1996,0.1192,-0.0188,-0.193,-0.0857,0.1062,-0.3489,0.0992,0.0114,0.0849,0.0127,-0.0024,-0.0357,0.0071,-0.4444,-0.4346,0.0827,-0.1062],[-0.5156,-0.4123,0.0803,-0.1655,-0.1733,0.155,-0.0125,0.0738,-0.3096,0.079,-0.0753,-0.0903,0.2019,-0.206,-0.3527,-0.1529,0.0435,0.1468,-0.0045,-0.3025,0.0357,-0.1618,0.2066,-0.1349,0.0092,-0.2808,-0.5226,0.1531,-0.0437],[-0.1623,0.5427,0.3844,-0.0237,0.1013,-0.5955,0.0406,-0.0157,-0.2424,0.1416,-0.0409,0.0172,-0.1201,0.1381,-0.1541,-0.1567,0.0328,0.1698,0.5487,-0.2477,-0.0324,-0.188,0.1522,0.1467,-0.0348,0.485,0.2934,0.1566,-0.024],[0.1985,-0.0931,-0.0234,-0.1375,-0.036,0.2142,0.0825,-0.3126,-0.1548,-0.0024,0.1394,-0.303,-0.1669,0.1636,-0.018,0.0865,-0.0408,-0.0045,-0.199,0.2553,0.1106,0.0509,-0.0769,-0.0844,-0.1076,-0.1086,0.0908,-0.0865,0.0411],[-0.5142,0.2043,0.2666,0.0133,-0.1296,-0.1741,-0.056,0.0555,-0.1304,0.1762,-0.2173,0.2538,-0.0337,0.2504,0.1279,-0.1598,0.1688,0.0292,-0.023,-0.355,0.2463,0.0721,0.1166,-0.1273,-0.0137,0.4667,0.1855,0.1576,-0.1671],[0.0661,-0.0219,-0.5074,0.0147,0.1888,0.0816,-0.0316,0.0457,0.1585,0.2517,0.054,-0.0583,0.3724,-0.0454,0.3099,0.4742,-0.0628,-0.0039,0.4168,-0.4071,0.0176,0.1801,-0.0976,0.0119,-0.0058,0.0659,-0.2673,-0.4571,0.0637],[0.1545,0.3532,-0.2887,0.2886,-0.1769,0.1419,-0.3479,0.2507,0.0096,0.0173,-0.322,-0.0797,0.034,-0.3257,0.0109,0.0541,-0.1298,0.401,0.1021,0.1285,-0.0838,-0.0365,-0.1621,-0.0355,-0.0465,0.209,0.2997,-0.026,0.1298],[-0.3764,-0.1428,-0.0179,-0.0253,-0.1292,-0.2281,-0.1881,-0.0653,-0.1092,0.0285,-0.2477,0.0378,0.1843,-0.0919,-0.0032,-0.2337,0.0754,-0.3152,0.1239,-0.2877,-0.062,0.0518,0.0566,0.0721,-0.0813,-0.0204,-0.2357,0.2212,-0.0754],[-0.2689,-0.0709,0.4412,0.28,0.091,-0.1783,-0.0328,0.3079,0.0485,0.1124,0.2717,0.3365,-0.077,0.1648,-0.0636,-0.1556,0.2687,-0.0669,0.1396,0.1478,0.2562,0.0125,0.0527,-0.0071,-0.0174,-0.4,-0.2941,0.1521,-0.2631],[-0.2845,0.1487,0.0019,-0.1384,0.471,0.0613,-0.0164,0.0579,-0.1282,0.0488,-0.0457,-0.1166,-0.0162,-0.0629,-0.0453,-0.0577,0.1288,0.2055,0.1144,-0.3658,0.001,0.3615,-0.0394,-0.0015,0.0336,0.3372,0.039,0.0577,-0.1675],[-0.2305,-0.1685,-0.0239,-0.1177,-0.0129,-0.0923,-0.036,0.052,-0.0491,0.0796,0.0135,0.2476,-0.0472,0.0531,-0.2232,-0.046,0.0828,-0.1672,-0.0522,-0.2208,-0.0031,0.1062,0.0466,0.0054,0.1093,-0.0046,-0.1714,0.0492,-0.0828],[0.3702,0.1817,-0.0006,-0.098,0.0264,0.1625,0.1371,0.2207,0.026,-0.0434,0.4288,-0.1528,-0.0011,0.0152,-0.065,0.1098,0.1488,0.2908,0.0666,0.3009,-0.0443,0.0395,0.0272,-0.1169,0.1649,0.4275,0.7013,-0.1131,-0.1488],[-0.3871,0.2527,0.0739,0.1015,0.0468,0.0141,0.113,0.0712,0.1905,-0.2236,-0.0298,0.6532,0.1696,0.1967,-0.1035,0.0137,0.0698,-0.0754,-0.1912,-0.3353,0.2737,0.0895,-0.2631,0.082,0.0313,0.5103,0.2495,-0.0136,-0.0699]],"b1":[-0.612,-0.1877,-0.7115,-0.004,-0.0582,-1.8581,-0.0743,2.3958,0.2896,-1.3693,-0.0963,2.2702,0.5857,1.3424,1.4544,-0.2347,-0.1122,0.1009,-1.282,0.438,-1.4409,0.4124,0.7239,1.7096,-1.5805,0.3693,1.9264,-1.0784,-1.4866,0.8015,1.0835,1.6755],"W2":[[0.0536,-0.1149,0.2454,-0.0009,-0.1942,-0.2332,0.1045,0.7548,0.239,0.1129,-0.2096,-0.4858,0.4106,-0.834,-0.2094,-0.17,-0.2891,0.3082,-0.6345,-0.3503,-0.9005,-0.4274,0.2233,-0.9204,0.7035,0.3784,0.4518,-0.6203,0.1733,0.023,0.4662,-0.7506],[-0.1382,0.1956,0.3335,-0.0002,-0.8861,-0.0293,0.0322,-0.2229,0.0587,0.4589,0.1369,-0.8729,0.2483,-0.2041,-0.3738,-0.523,0.4755,0.0223,0.1015,-0.3834,-0.4803,-0.4314,-0.2171,-0.2167,0.5735,0.5998,-0.5612,-0.3501,0.1407,-0.2307,0.7768,-0.0857],[-1.041,0.4103,0.492,0.001,0.2576,0.6179,0.5599,-0.6958,-0.2962,0.2219,0.292,-0.0809,-0.422,0.0131,-0.0327,-0.0441,0.2968,-0.2351,0.1969,0.1106,-0.0366,0.8687,-0.2971,-0.0205,0.1167,-0.098,-0.2576,0.3253,0.4632,-0.2389,-0.4107,0.5629]],"b2":[0.1384,-1.4876,-1.4622]};

function hasContact(b) {
  let wRear = 0, bRear = 25;
  if (b.bar.w > 0) wRear = 25; else for (let i = 24; i >= 1; i--) if (b.points[i] > 0) { wRear = i; break; }
  if (b.bar.b > 0) bRear = 0; else for (let i = 1; i <= 24; i++) if (b.points[i] < 0) { bRear = i; break; }
  return wRear > bRear;
}

function phi(z) { // standard normal CDF (Abramowitz & Stegun 7.1.26)
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function raceZ(b, q) {
  const o = opp(q), R = CAL.RP;
  const qP = pipCount(b, q), oP = pipCount(b, o);
  const qC = 15 - bornOff(b, q), oC = 15 - bornOff(b, o);
  const nQ = Math.max((qP + R.W) / R.R, qC / R.C), nO = Math.max((oP + R.W) / R.R, oC / R.C);
  return (nO - nQ + R.ON) / (R.S * Math.sqrt(Math.max(nQ, 1) + Math.max(nO, 1)));
}

function anchorsOf(b, p) {
  let n = 0;
  if (p === 'w') { for (let i = 19; i <= 24; i++) if (b.points[i] >= 2) n++; }
  else { for (let i = 1; i <= 6; i++) if (b.points[i] <= -2) n++; }
  return n;
}
function shotsOf(list) { let s = 0; for (const bl of list) s += bl.shots; return Math.min(s, 36) / 36; }

// Features for q ON ROLL. featP (optional) = featureScore(b, opp(q), 0) if already known.
function probFeatures(b, q, featP) {
  const o = opp(q), c = hasContact(b) ? 1 : 0;
  const qBar = q === 'w' ? b.bar.w : b.bar.b, oBar = q === 'w' ? b.bar.b : b.bar.w;
  const bq = blots(b, q), bo = blots(b, o);
  const hq = homePointsMade(b, q), ho = homePointsMade(b, o);
  if (featP === undefined) featP = featureScore(b, o, 0);
  return [1, raceZ(b, q), c, c * raceZ(b, q), qBar, oBar, c * hq, c * ho, shotsOf(bq), shotsOf(bo),
    c * longestPrime(b, q), c * longestPrime(b, o), c * backCheckers(b, q), c * backCheckers(b, o),
    c * anchorsOf(b, q), c * anchorsOf(b, o), bornOff(b, q) / 15, bornOff(b, o) / 15,
    bornOff(b, o) === 0 ? 1 : 0, bornOff(b, q) === 0 ? 1 : 0, (pipCount(b, o) - pipCount(b, q)) / 100,
    qBar * ho, oBar * hq, c * featP, c * bq.length, c * bo.length,
    pipCount(b, q) / 100, pipCount(b, o) / 100, (15 - bornOff(b, q)) / 15, (15 - bornOff(b, o)) / 15];
}
const sigm = (t) => 1 / (1 + Math.exp(-t));

// { win, gw, gl } for player q ON ROLL (before rolling). gw/gl = P(win/lose a gammon or better).
function probsOnRoll(b, q, featP) {
  const res = gameResult(b);
  if (res) { const won = res.winner === q, g = res.kind !== 'single';
    return { win: won ? 1 : 0, gw: won && g ? 1 : 0, gl: !won && g ? 1 : 0 }; }
  const x = probFeatures(b, q, featP);
  const D = NET.mu.length, H = NET.b1.length;
  const z = new Array(D);
  for (let j = 0; j < D; j++) z[j] = (x[j + 1] - NET.mu[j]) / NET.sd[j];
  const h = new Array(H);
  for (let i = 0; i < H; i++) { let t = NET.b1[i]; const w = NET.W1[i]; for (let j = 0; j < D; j++) t += w[j] * z[j]; h[i] = Math.tanh(t); }
  const out = [0, 1, 2].map((k) => { let t = NET.b2[k]; const w = NET.W2[k]; for (let i = 0; i < H; i++) t += w[i] * h[i]; return sigm(t); });
  const win = Math.min(0.999, Math.max(0.001, out[0]));
  const gw = Math.min(win, out[1]);
  const gl = Math.min(1 - win, out[2]);
  return { win, gw, gl };
}
function winProbOnRoll(b, q) { return probsOnRoll(b, q).win; }

// ---- doubling cube (money play, Janowski cubeful equities) --------------
// Same model GNU Backgammon uses to turn cubeless probabilities into cubeful equity:
// a blend of dead-cube and fully-live-cube equity with cube efficiency x.
const CUBE_X = 0.68;

// Cubeful equity (per unit cube) for the player with win prob p, average win value W and
// average loss value L. pos: 'center' | 'own' (player owns cube) | 'opp' (opponent owns).
function cubefulEquity(p, W, L, pos) {
  const dead = p * (W + L) - L;
  const TP = (L - 0.5) / (W + L + 0.5), CP = (L + 1) / (W + L + 0.5);
  let live;
  if (pos === 'center') {
    if (p <= TP) live = -L + (L - 1) * p / TP;
    else if (p >= CP) live = 1 + (W - 1) * (p - CP) / (1 - CP);
    else live = -1 + 2 * (p - TP) / (CP - TP);
  } else if (pos === 'own') {
    if (p <= CP) live = -L + (1 + L) * p / CP;
    else live = 1 + (W - 1) * (p - CP) / (1 - CP);
  } else {
    if (p <= TP) live = -L + (L - 1) * p / TP;
    else live = -1 + (W + 1) * (p - TP) / (1 - TP);
  }
  return dead * (1 - CUBE_X) + live * CUBE_X;
}

// Cube decision for the player ON ROLL with probabilities pr = {win, gw, gl}.
// cubePos: 'center' or 'own'. Equities are per current cube value.
function cubeAnalysis(pr, cubePos) {
  const p = pr.win;
  const W = p > 1e-6 ? 1 + pr.gw / p : 1;
  const L = p < 1 - 1e-6 ? 1 + pr.gl / (1 - p) : 1;
  const ND = cubefulEquity(p, W, L, cubePos);
  const DT = 2 * cubefulEquity(p, W, L, 'opp');
  const DP = 1;
  const takes = DT <= DP;                       // taker keeps -DT rather than paying -1
  const dblEq = Math.min(DT, DP);               // opponent answers correctly
  const shouldDouble = dblEq > ND + 1e-9;
  const tooGood = !shouldDouble && !takes && ND > DP;
  let label;
  if (shouldDouble) label = takes ? 'Double, take' : 'Double, pass';
  else label = tooGood ? 'Too good to double — play on for the gammon' : (takes ? 'No double, take' : 'No double');
  // thresholds for explanations (holding W, L fixed): doubling point & opponent's take limit
  const f = (pp) => Math.min(2 * cubefulEquity(pp, W, L, 'opp'), 1) - cubefulEquity(pp, W, L, cubePos);
  let dp = null; for (let pp = 0.5; pp <= 0.99; pp += 0.005) if (f(pp) > 0) { dp = pp; break; }
  let tp = null; for (let pp = 0.5; pp <= 0.995; pp += 0.005) if (2 * cubefulEquity(pp, W, L, 'opp') > 1) { tp = pp; break; }
  return { p, gw: pr.gw, gl: pr.gl, W, L, ND, DT, DP, takes, dblEq, shouldDouble, tooGood, label,
           doublePoint: dp, passPoint: tp };
}

// ---- match play -----------------------------------------------------------
// Kazaross-XG2 match equity table (25 points), as distributed with GNU Backgammon
// (met/Kazaross-XG2.xml: "Copying and distribution of verbatim and modified versions of
// this file is permitted in any medium provided the copyright notice and this permission
// notice are preserved."). MET.pre[i][j] = P(win match) for a player (i+1)-away against
// (j+1)-away before/at the Crawford game; MET.post[n-1] = the n-away trailer's chance
// against a 1-away leader in post-Crawford games.
const MET = { pre: [[0.5,0.67736,0.75076,0.81436,0.84179,0.88731,0.90724,0.9325,0.94402,0.95927,0.96644,0.97553,0.97984,0.98527,0.98789,0.99114,0.99273,0.99467,0.99563,0.99679,0.99737,0.99807,0.99842,0.99884,0.99905],[0.32264,0.5,0.59947,0.6687,0.74359,0.7994,0.84225,0.87539,0.90197,0.92303,0.93931,0.95247,0.96249,0.9707,0.97689,0.98196,0.9858,0.98893,0.99129,0.99322,0.99466,0.99585,0.99675,0.99746,0.99802],[0.24924,0.40053,0.5,0.5715,0.64795,0.71123,0.76209,0.80468,0.84017,0.87064,0.89442,0.91483,0.9307,0.94443,0.95493,0.96399,0.97093,0.97687,0.98139,0.98522,0.98814,0.99062,0.99248,0.99407,0.99527],[0.18564,0.3313,0.4285,0.5,0.57732,0.64285,0.69924,0.74577,0.78799,0.82406,0.85396,0.87914,0.90023,0.91804,0.93266,0.94495,0.95499,0.96341,0.97021,0.97589,0.98044,0.98422,0.98726,0.98975,0.99174],[0.15821,0.25641,0.35205,0.42268,0.5,0.56635,0.62638,0.67786,0.7254,0.76706,0.80273,0.83365,0.85993,0.88287,0.90201,0.91847,0.93223,0.94397,0.95367,0.96189,0.96864,0.97432,0.97896,0.98283,0.986],[0.11269,0.2006,0.28877,0.35715,0.43365,0.5,0.56261,0.61636,0.66787,0.71306,0.75343,0.78863,0.81957,0.84665,0.87,0.89021,0.90756,0.92246,0.93508,0.94583,0.95488,0.96254,0.96894,0.97432,0.97879],[0.09276,0.15775,0.23791,0.30076,0.37362,0.43739,0.5,0.5548,0.60854,0.65628,0.70021,0.73905,0.77412,0.8052,0.83257,0.85659,0.87761,0.89591,0.91171,0.92535,0.93702,0.94703,0.95553,0.96276,0.96887],[0.0675,0.12461,0.19532,0.25423,0.32214,0.38364,0.4452,0.5,0.55442,0.60372,0.6499,0.69136,0.72945,0.76359,0.7944,0.82158,0.84578,0.86714,0.88589,0.9023,0.91658,0.92898,0.93968,0.94891,0.95682],[0.05598,0.09803,0.15983,0.21201,0.2746,0.33213,0.39146,0.44558,0.5,0.5502,0.59793,0.64148,0.68212,0.71893,0.75281,0.78301,0.81037,0.83483,0.85662,0.87591,0.89294,0.90791,0.92098,0.9324,0.9423],[0.04072,0.07697,0.12936,0.17594,0.23295,0.28694,0.34372,0.39628,0.4498,0.5,0.54855,0.59346,0.63588,0.67483,0.71111,0.74371,0.77375,0.80093,0.82543,0.84741,0.86703,0.88448,0.89991,0.91353,0.9255],[0.03356,0.06069,0.10558,0.14605,0.19727,0.24657,0.29979,0.3501,0.40207,0.45145,0.5,0.54555,0.58924,0.62974,0.66793,0.70303,0.7353,0.76494,0.79198,0.81648,0.83862,0.85849,0.87629,0.89214,0.90622],[0.02447,0.04753,0.08517,0.12086,0.16635,0.21137,0.26095,0.30864,0.35852,0.40654,0.45445,0.5,0.54407,0.5857,0.62526,0.66178,0.6961,0.72778,0.75703,0.78381,0.80826,0.83044,0.85051,0.86856,0.88476],[0.02015,0.0375,0.0693,0.09977,0.14007,0.18043,0.22588,0.27055,0.31788,0.36412,0.41076,0.45593,0.5,0.54194,0.58254,0.62036,0.65619,0.68966,0.72081,0.74963,0.77619,0.80054,0.82276,0.84295,0.86123],[0.01473,0.0293,0.05557,0.08196,0.11713,0.15335,0.1948,0.23641,0.28107,0.32517,0.37026,0.4143,0.45806,0.5,0.54075,0.57942,0.61634,0.65117,0.68391,0.71448,0.7429,0.76917,0.79339,0.81559,0.83586],[0.01211,0.02311,0.04507,0.06734,0.09799,0.13,0.16743,0.2056,0.24719,0.28889,0.33207,0.37474,0.41746,0.45925,0.5,0.53916,0.57679,0.61261,0.64659,0.67859,0.70862,0.73664,0.76265,0.78669,0.80883],[0.00886,0.01804,0.03601,0.05505,0.08153,0.10979,0.14341,0.17842,0.21699,0.25629,0.29697,0.33822,0.37964,0.42058,0.46084,0.5,0.53796,0.57441,0.60929,0.64241,0.67376,0.70323,0.73084,0.75657,0.78046],[0.00727,0.0142,0.02907,0.04501,0.06777,0.09244,0.12239,0.15422,0.18963,0.22625,0.2647,0.3039,0.34381,0.38366,0.42321,0.46204,0.5,0.53676,0.57222,0.60618,0.63856,0.66925,0.69822,0.72542,0.75087],[0.00533,0.01107,0.02313,0.03659,0.05603,0.07754,0.10409,0.13286,0.16517,0.19907,0.23506,0.27222,0.31034,0.34883,0.38739,0.42559,0.46324,0.5,0.53574,0.57023,0.60336,0.63501,0.6651,0.69356,0.72038],[0.00437,0.00871,0.01861,0.02979,0.04633,0.06492,0.08829,0.11411,0.14338,0.17457,0.20802,0.24297,0.27919,0.31609,0.35341,0.39071,0.42778,0.46426,0.5,0.53475,0.56838,0.60073,0.63171,0.66122,0.68921],[0.00321,0.00678,0.01478,0.02411,0.03811,0.05417,0.07465,0.0977,0.12409,0.15259,0.18352,0.21619,0.25037,0.28552,0.32141,0.35759,0.39382,0.42977,0.46525,0.5,0.53387,0.56667,0.5983,0.62864,0.6576],[0.00263,0.00534,0.01186,0.01956,0.03136,0.04512,0.06298,0.08342,0.10706,0.13297,0.16138,0.19174,0.22381,0.2571,0.29138,0.32624,0.36144,0.39664,0.43162,0.46613,0.5,0.53303,0.56508,0.59603,0.62576],[0.00193,0.00415,0.00938,0.01578,0.02568,0.03746,0.05297,0.07102,0.09209,0.11552,0.14151,0.16956,0.19946,0.23083,0.26336,0.29677,0.33075,0.36499,0.39927,0.43333,0.46697,0.5,0.53226,0.5636,0.59391],[0.00158,0.00325,0.00752,0.01274,0.02104,0.03106,0.04447,0.06032,0.07902,0.10009,0.12371,0.14949,0.17724,0.20661,0.23735,0.26916,0.30178,0.3349,0.36829,0.4017,0.43492,0.46774,0.5,0.53153,0.56221],[0.00116,0.00254,0.00593,0.01025,0.01717,0.02568,0.03724,0.05109,0.0676,0.08647,0.10786,0.13144,0.15705,0.18441,0.21331,0.24343,0.27458,0.30644,0.33878,0.37136,0.40397,0.4364,0.46847,0.5,0.53086],[0.00095,0.00198,0.00473,0.00826,0.014,0.02121,0.03113,0.04318,0.0577,0.0745,0.09378,0.11524,0.13877,0.16414,0.19117,0.21954,0.24913,0.27962,0.31079,0.3424,0.37424,0.40609,0.43779,0.46914,0.5]], post: [0.5,0.48803,0.32264,0.31002,0.19012,0.18072,0.11559,0.10906,0.06953,0.06516,0.04207,0.03906,0.02537,0.02343,0.0153,0.01405,0.00924,0.00842,0.00556,0.00505,0.00336,0.00303,0.00203,0.00182,0.00123] };

// P(player who needs a points beats one who needs b). post = next game is post-Crawford.
function metGet(a, b, post) {
  if (a <= 0) return 1;
  if (b <= 0) return 0;
  if (post && (a === 1 || b === 1)) {
    if (a === 1 && b === 1) return 0.5;
    return a === 1 ? 1 - MET.post[Math.min(b, 25) - 1] : MET.post[Math.min(a, 25) - 1];
  }
  return MET.pre[Math.min(a, 25) - 1][Math.min(b, 25) - 1];
}

// Cube decision for the player ON ROLL at a match score, same output shape as
// cubeAnalysis() but equities are match-winning chances (MWC). Janowski-style blend of a
// dead cube and a fully live cube, with cash points computed recursively up the cube levels.
// ctx: { a: my away, b: opponent away, v: cube value, own: I own the cube, post: next game post-Crawford }
function matchCubeAnalysis(pr, ctx) {
  const { a, b, v, own, post } = ctx;
  const p = pr.win;
  const gX = p > 1e-6 ? Math.min(1, pr.gw / p) : 0;          // my gammon rate when I win
  const gY = p < 1 - 1e-6 ? Math.min(1, pr.gl / (1 - p)) : 0; // opponent's gammon rate when they win
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const xw = (k) => metGet(a - k, b, post);                   // my MWC if I win k points
  const yw = (k) => metGet(a, b - k, post);                   // my MWC if they win k points
  const winX = (V) => (1 - gX) * xw(V) + gX * xw(2 * V);
  const loseX = (V) => (1 - gY) * yw(V) + gY * yw(2 * V);
  // Cash point (doubler's own winning chance) for a double from V to 2V. zx: I am the doubler.
  const cp = (zx, V) => {
    let rDP, rDTW, rDTL, rRDP, awayW;
    if (zx) { rDP = xw(V); rDTW = winX(2 * V); rDTL = loseX(2 * V); rRDP = yw(2 * V); awayW = b; }
    else { rDP = 1 - yw(V); rDTW = 1 - loseX(2 * V); rDTL = 1 - winX(2 * V); rRDP = 1 - xw(2 * V); awayW = a; }
    if (2 * V >= awayW || 2 * V >= 64) { const d = rDTW - rDTL; return d > 1e-9 ? clamp01((rDP - rDTL) / d) : 1; }
    const cpW = cp(!zx, 2 * V), d = rDTW - rRDP;
    return d > 1e-9 ? clamp01(1 - cpW * (rDTW - rDP) / d) : 1;
  };
  // Cubeful MWC at cube value V, pos: 'center' | 'own' | 'opp'
  const cubeful = (V, pos, pp) => {
    const dead = pp * winX(V) + (1 - pp) * loseX(V);
    const cash = xw(V), oppCash = yw(V);
    const xCan = pos !== 'opp' && V < a && V < 64, yCan = pos !== 'own' && V < b && V < 64;
    const cX = xCan ? cp(true, V) : 1, tY = yCan ? 1 - cp(false, V) : 0;
    let live;
    if (tY > 0 && pp <= tY) live = loseX(V) + (oppCash - loseX(V)) * pp / tY;
    else if (cX < 1 && pp >= cX) live = cash + (winX(V) - cash) * (pp - cX) / (1 - cX);
    else { const y0 = tY > 0 ? oppCash : loseX(V), y1 = cX < 1 ? cash : winX(V);
      live = cX > tY ? y0 + (y1 - y0) * (pp - tY) / (cX - tY) : dead; }
    return CUBE_X * live + (1 - CUBE_X) * dead;
  };
  const pos = own ? 'own' : 'center';
  const canDouble = v < a && v < 64;
  const decide = (pp) => {
    const ND = cubeful(v, pos, pp), DT = cubeful(2 * v, 'opp', pp), DP = xw(v);
    return { ND, DT, DP, takes: DT <= DP, dblEq: Math.min(DT, DP) };
  };
  const d0 = decide(p);
  const shouldDouble = canDouble && d0.dblEq > d0.ND + 1e-9;
  const tooGood = !shouldDouble && canDouble && !d0.takes && d0.ND > d0.DP;
  let label;
  if (shouldDouble) label = d0.takes ? 'Double, take' : 'Double, pass';
  else label = tooGood ? 'Too good to double — play on for the gammon' : (d0.takes ? 'No double, take' : 'No double');
  // thresholds at this score (holding gammon rates fixed)
  let dp = null, tp = null;
  if (canDouble) for (let pp = 0.3; pp <= 0.99; pp += 0.005) { const d = decide(pp); if (d.dblEq > d.ND) { dp = pp; break; } }
  for (let pp = 0.3; pp <= 0.995; pp += 0.005) { if (!decide(pp).takes) { tp = pp; break; } }
  const span = xw(v) - yw(v);
  return { p, gw: pr.gw, gl: pr.gl, ND: d0.ND, DT: d0.DT, DP: d0.DP, takes: d0.takes, dblEq: d0.dblEq,
    shouldDouble, tooGood, label, doublePoint: dp, passPoint: tp, match: true,
    scale: span > 1e-6 ? 2 / span : 0 };   // MWC -> money-equivalent equity per cube unit
}

// Equity lost (per current cube value) by an action. role 'doubler': 'double'|'nodouble';
// role 'taker': 'take'|'pass'.
function cubeError(an, role, action) {
  const k = an.scale || 1;                       // match play: MWC -> money-equivalent equity
  if (role === 'doubler') {
    const best = Math.max(an.ND, an.dblEq);
    return k * (action === 'double' ? best - an.dblEq : best - an.ND);
  }
  const DP = an.DP;                              // taker: take keeps -DT, pass gives -DP (doubler's view)
  return k * (action === 'take' ? Math.max(0, an.DT - DP) : Math.max(0, DP - an.DT));
}

// ---- coach / analysis ----------------------------------------------------
// Ranks every legal turn. Output shape mirrors wildbg-wasm analyze():
//   { phase, moves: [ { steps, board, equity, winProb, explanation } ] } best first.
function boardKey(b) { return b.points.join(',') + '|' + b.bar.w + ',' + b.bar.b + '|' + b.off.w + ',' + b.off.b; }

function analyze(board, p, dice) {
  const turns = generateLegalTurns(board, p, dice);
  const isRace = backCheckers(board, p) === 0 && backCheckers(board, opp(p)) === 0;
  // dedupe distinct resulting positions (different move orders -> same board)
  const byPos = new Map();
  for (const steps of turns) {
    const nb = replay(board, p, steps);
    const k = boardKey(nb);
    if (!byPos.has(k)) byPos.set(k, { steps, board: nb });
  }
  const scored = [...byPos.values()].map(({ steps, board: nb }) => {
    const ev = evaluate(nb, p);
    return { steps, board: nb, equity: ev.score, winProb: ev.winProb };
  });
  scored.sort((a, b2) => b2.equity - a.equity);
  for (const m of scored) m.explanation = describeTurn(board, m.steps, m.board, p, scored[0]);
  return { phase: isRace ? 'race' : 'contact', moves: scored };
}

function pointName(p, to) {
  if (to === 'off') return 'off';
  return String(to);
}

function describeTurn(before, steps, after, p, best) {
  const o = opp(p);
  const parts = [];
  // hits
  let hits = 0;
  let cur = before;
  for (const st of steps) {
    if (st.to !== 'off' && (sgn(p) === 1 ? cur.points[st.to] === -1 : cur.points[st.to] === 1)) hits++;
    cur = applyStep(cur, p, st);
  }
  // points newly made
  const madeBefore = new Set();
  for (let i = 1; i <= 24; i++) if (myCount(before, p, i) >= 2) madeBefore.add(i);
  const newPoints = [];
  for (let i = 1; i <= 24; i++) if (myCount(after, p, i) >= 2 && !madeBefore.has(i)) newPoints.push(i);
  const homeNew = newPoints.filter((i) => (p === 'w' ? i <= 6 : i >= 19));
  // bear offs
  const bears = steps.filter((s) => s.to === 'off').length;
  // escaped back checker?
  const escaped = backCheckers(before, p) > backCheckers(after, p);
  // blots after
  const bl = blots(after, p);
  const totalShots = bl.reduce((a, x) => a + x.shots, 0);

  if (bears > 0) parts.push(bears === 1 ? 'bears a checker off' : `bears off ${bears} checkers`);
  if (hits > 0) parts.push(hits === 1 ? 'hits a blot, sending it to the bar' : `hits ${hits} blots`);
  if (homeNew.length > 0) parts.push(`makes the ${homeNew.map((i) => (p === 'w' ? i : 25 - i)).join(' and ')} point${homeNew.length > 1 ? 's' : ''}`);
  else if (newPoints.length > 0) parts.push(`makes the ${newPoints.map((i) => (p === 'w' ? i : 25 - i)).join(' and ')} point${newPoints.length > 1 ? 's' : ''}`);
  if (escaped) parts.push('escapes a back checker');

  let safety;
  if (bl.length === 0) safety = 'leaves no blots';
  else if (totalShots === 0) safety = `leaves ${bl.length} blot${bl.length > 1 ? 's' : ''} but no direct shots`;
  else {
    const worst = bl.slice().sort((a, x) => x.shots - a.shots)[0];
    safety = `leaves a blot (${worst.shots}/36 shots)`;
  }

  let head = parts.length ? parts.join(', ') : 'a quiet developing play';
  head = head.charAt(0).toUpperCase() + head.slice(1);
  return `${head}; ${safety}.`;
}

// numeric label for a step from player p's perspective (point numbers as the player sees them)
function stepLabel(p, st) {
  const f = st.from === 'bar' ? 'bar' : (p === 'w' ? st.from : 25 - st.from);
  const t = st.to === 'off' ? 'off' : (p === 'w' ? st.to : 25 - st.to);
  return `${f}/${t}`;
}
function turnLabel(p, steps) {
  if (!steps.length) return '(no play)';
  return steps.map((s) => stepLabel(p, s)).join(' ');
}

// All destinations reachable from a selected source, given the legal turns for the
// whole roll and the sub-moves already played this turn. Includes COMPOUND landings
// (the same checker consuming 2+ dice, e.g. play both a 5 and a 3 as one 8-pip move),
// so the player can click the final square once. When a landing is reachable by more
// than one dice order, the higher-equity order is kept ("play the better one first").
// Returns Map: destKey ('off' | point number as string) -> { steps, board, equity, dice }.
function destinationsFrom(board, player, legalTurns, played, sel) {
  const idx = played.length;
  const matching = legalTurns.filter((t) =>
    played.every((s, i) => t[i] && t[i].from === s.from && t[i].to === s.to && t[i].die === s.die));
  const cur = replay(board, player, played);
  const best = new Map();
  for (const t of matching) {
    if (t.length <= idx || t[idx].from !== sel) continue;
    let pos = sel, j = idx;
    const chain = [];
    while (j < t.length && t[j].from === pos) {
      chain.push(t[j]);
      pos = t[j].to;
      const seq = chain.slice();
      const rb = replay(cur, player, seq);
      const key = String(pos);
      const equity = evaluate(rb, player).score;
      const prev = best.get(key);
      if (!prev || equity > prev.equity) best.set(key, { steps: seq, board: rb, equity, dice: seq.map((s) => s.die) });
      if (pos === 'off') break;
      j++;
    }
  }
  return best;
}

// ---- game review helpers (luck, win chances) -------------------------------
// Cubeless equity for the player ON ROLL (gammons count double, backgammons ignored).
function cubelessEq(pr) { return (2 * pr.win - 1) + pr.gw - pr.gl; }

// Best resulting board for p with these dice, ranked exactly like analyze() but without
// building explanations. null = no legal move (a dance).
function quickBest(board, p, dice) {
  const turns = generateLegalTurns(board, p, dice);
  if (!turns.length) return null;
  const o = opp(p); let best = null, bs = -Infinity; const seen = new Set();
  for (const t of turns) {
    const nb = replay(board, p, t), k = boardKey(nb);
    if (seen.has(k)) continue; seen.add(k);
    const s = featureScore(nb, p, (pipCount(nb, o) - pipCount(nb, p)) * 0.010);
    if (s > bs) { bs = s; best = nb; }
  }
  return best;
}

// p's equity right after p has moved to `after` (opponent now on roll).
function eqAfterMove(after, p) {
  const res = gameResult(after);
  if (res) { const v = res.kind === 'backgammon' ? 3 : res.kind === 'gammon' ? 2 : 1; return res.winner === p ? v : -v; }
  return -cubelessEq(probsOnRoll(after, opp(p)));
}

// Luck of a roll: equity after the best play of the roll actually thrown, minus the
// average over all 36 rolls (each played its best way). In cubeless points per game.
const ALL_ROLLS = (() => { const r = []; for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) r.push({ d: [a, b], w: a === b ? 1 : 2 }); return r; })();
function rollLuck(board, p, dice) {
  const danceEq = eqAfterMove(board, p);
  let sum = 0, actual = null;
  for (const { d, w } of ALL_ROLLS) {
    const nb = quickBest(board, p, d);
    const e = nb ? eqAfterMove(nb, p) : danceEq;
    sum += w * e;
    if ((d[0] === dice[0] && d[1] === dice[1]) || (d[0] === dice[1] && d[1] === dice[0])) actual = e;
  }
  const avg = sum / 36;
  return { luck: actual - avg, actual, avg };
}

// White's chance of winning the game, with p on roll.
function whiteWinChance(board, p) {
  const res = gameResult(board);
  if (res) return res.winner === 'w' ? 1 : 0;
  const w = probsOnRoll(board, p).win;
  return p === 'w' ? w : 1 - w;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    startingBoard, cloneBoard, singleMoves, applyStep, replay, generateLegalTurns,
    pipCount, bornOff, gameResult, evaluate, analyze, blots, hitRolls, turnLabel, stepLabel,
    homePointsMade, backCheckers, destinationsFrom, featureScore, winProbOnRoll, probsOnRoll, probFeatures, hasContact, phi, cubefulEquity, cubeAnalysis, cubeError, CAL, MET, metGet, matchCubeAnalysis, cubelessEq, quickBest, eqAfterMove, rollLuck, whiteWinChance, boardKey,
  };
}
