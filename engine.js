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
function hitRolls(b, victim, point) { return hitMask(b, victim, point).filter(Boolean).length; }
// Rolls (36, as a*6+c for dice a,c in 1..6) that hit victim's blot on `point`.
function hitMask(b, victim, point) {
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
  const mask = new Array(36).fill(false);
  if (distSet.size === 0) return mask;
  const blocked = (pt) => pt >= 1 && pt <= 24 && oppCount(b, victim, pt) >= 2; // 2+ of victim blocks opp landing
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
      if (hit) mask[(a - 1) * 6 + (c - 1)] = true;
    }
  }
  return mask;
}
// Rolls out of 36 that hit at least one of p's blots (a roll hitting two blots counts once).
function shotRolls(b, p) {
  const any = new Array(36).fill(false);
  for (const bl of blots(b, p)) hitMask(b, p, bl.point).forEach((h, i) => { if (h) any[i] = true; });
  return any.filter(Boolean).length;
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
// Returns { score, winProb } for p right after p has moved: score is p's cubeless equity
// (gammons x2, backgammons x3) from the evaluation net. Moves are ranked by it.
function evaluate(b, p) {
  const res = gameResult(b);
  if (res) {
    const val = res.kind === 'backgammon' ? 3 : res.kind === 'gammon' ? 2 : 1;
    const s = res.winner === p ? val : -val;
    return { score: s, winProb: s > 0 ? 1 : 0 };
  }
  // After p's move the OPPONENT is on roll: ask the net from their side and flip it.
  const pr = probsOnRoll(b, opp(p));
  return { score: -cubelessEq(pr), winProb: 1 - pr.win };
}

// Hand-built positional terms (blots, points, primes, ...) from p's perspective, p having
// just moved. Once the move ranker; now one of the evaluation net's inputs.
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
// Evaluation net: raw board + hand-built features -> win/gammon/backgammon probabilities for
// the player on roll. Trained on ~800k positions labelled by wildbg's strong nets
// (tools/net-gen.js, net-features.js, train-net.py; packed by tools/pack-net.js).
const EVAL_NET = decodeNet(/* EVAL_NET:begin */{"mu":[0.49256,0.41787,0.26498,0.20262,0.30014,0.18276,0.02227,0.00372,0.64755,0.56968,0.35464,0.2084,0.09335,0.03508,0.00946,0.00207,0.57158,0.49477,0.24035,0.08288,0.0979,0.03636,0.00881,0.00168,0.47573,0.40024,0.15392,0.03299,0.11495,0.04356,0.0117,0.00237,0.40692,0.33716,0.12169,0.01938,0.12851,0.05081,0.01338,0.00278,0.66679,0.622,0.4153,0.2065,0.05995,0.01715,0.00552,0.00126,0.18732,0.12015,0.03177,0.00378,0.1198,0.03495,0.00566,0.00055,0.3793,0.2958,0.14651,0.02486,0.06086,0.01316,0.00294,0.00057,0.10138,0.03869,0.00739,0.00069,0.0797,0.01659,0.00273,0.0004,0.09384,0.0306,0.00615,0.00068,0.08051,0.01618,0.0035,0.0005,0.09297,0.02941,0.0056,0.00086,0.07092,0.01155,0.00198,0.00029,0.04067,0.01117,0.00235,0.00026,0.43142,0.32943,0.20555,0.07754,0.42593,0.36578,0.23435,0.09478,0.05825,0.01165,0.00231,0.00028,0.05204,0.01191,0.00204,0.00032,0.11749,0.02755,0.0054,0.00076,0.06041,0.01657,0.00363,0.00054,0.12329,0.0294,0.0059,0.00063,0.0592,0.01706,0.0025,0.00033,0.13417,0.036,0.00707,0.00065,0.04529,0.01301,0.00275,0.00058,0.39008,0.25921,0.12212,0.02201,0.0898,0.03885,0.00588,0.00054,0.2334,0.10868,0.03049,0.00366,0.0485,0.01661,0.00549,0.00131,0.6957,0.59918,0.39173,0.18778,0.10534,0.05478,0.01409,0.00298,0.47045,0.3335,0.12746,0.0211,0.09527,0.04698,0.01237,0.0026,0.54056,0.40236,0.16616,0.03525,0.08147,0.03956,0.0094,0.00183,0.63111,0.50022,0.25653,0.08454,0.07906,0.03678,0.00988,0.00226,0.70044,0.58426,0.3761,0.21274,0.2948,0.21616,0.02406,0.00404,0.54075,0.43704,0.28735,0.20679,0.14902,0.0295,0.06651,0.04924,0.06996,0.82132,-0.13492,0.29804,0.05901,2.34592,2.33468,0.33117,0.49246,1.93362,1.88267,1.20403,1.23278,0.40781,0.36112,0.06651,0.04924,0.8595,0.83345,-0.03178,0.95544,0.23704,-0.25251,1.16306,1.88271,1.03218,1.00047,0.93342,0.95062],"sd":[0.49986,0.49611,0.43784,0.54894,0.46075,0.38487,0.14709,0.05679,0.4771,0.49465,0.47768,0.47836,0.28987,0.18337,0.09659,0.04438,0.49401,0.50018,0.42934,0.28301,0.29597,0.18639,0.09329,0.03829,0.49865,0.49066,0.36439,0.16423,0.3198,0.20258,0.10731,0.04693,0.49041,0.47341,0.32771,0.12,0.33381,0.21968,0.11457,0.05078,0.4719,0.48648,0.49598,0.39781,0.23622,0.12946,0.07394,0.03281,0.38717,0.32651,0.17534,0.05026,0.32614,0.18299,0.07488,0.01987,0.48559,0.45924,0.35211,0.12998,0.23791,0.11361,0.05412,0.02681,0.30152,0.1922,0.08537,0.02175,0.27211,0.12738,0.05214,0.01735,0.29098,0.17105,0.078,0.0224,0.27313,0.12591,0.05896,0.01851,0.28941,0.16789,0.07452,0.02363,0.25771,0.10648,0.04446,0.01355,0.19616,0.10476,0.04837,0.01382,0.49489,0.4673,0.40487,0.23959,0.49825,0.48214,0.42812,0.26166,0.23318,0.10691,0.04793,0.01499,0.22177,0.10807,0.04503,0.01383,0.3241,0.16289,0.07309,0.02244,0.23691,0.12731,0.06002,0.01897,0.32899,0.16784,0.07639,0.0212,0.23501,0.12906,0.04987,0.01548,0.33955,0.18549,0.08354,0.02074,0.20899,0.11296,0.05232,0.02711,0.48987,0.43689,0.3282,0.12413,0.28549,0.19209,0.07628,0.01909,0.42145,0.31417,0.17033,0.0492,0.2152,0.12744,0.07376,0.03305,0.45989,0.48675,0.4907,0.38396,0.3061,0.22742,0.11753,0.05202,0.49842,0.47142,0.33277,0.12414,0.29322,0.21227,0.1103,0.04973,0.49988,0.4869,0.37429,0.16712,0.27434,0.19398,0.09627,0.04034,0.48115,0.5,0.43428,0.28026,0.271,0.18747,0.09866,0.04688,0.45862,0.49535,0.4873,0.47474,0.46011,0.41052,0.15244,0.05965,0.49726,0.49331,0.45395,0.5385,0.30855,0.15289,0.1807,0.15073,3.38193,0.38199,2.79555,0.6171,0.30578,1.51635,1.50401,0.40864,0.43301,1.39512,1.35415,1.37123,1.352,0.54644,0.53169,0.1807,0.15073,0.347,0.3747,0.45639,2.26005,1.31706,0.48205,1.28838,1.63742,0.50794,0.46613,0.18067,0.15071],"layers":[{"rows":128,"cols":225,"w":{"s":[0.00701127,0.0034116,0.0112422,0.00717019,0.00530527,0.00622807,0.0031149,0.00660948,0.00428451,0.00214361,0.00266806,0.00296788,0.00550307,0.00814963,0.0042973,0.00252139,0.00517351,0.00587486,0.00230867,0.00932161,0.00701327,0.00547732,0.00467167,0.0027489,0.00479274,0.00432738,0.0050578,0.00637219,0.00451857,0.00357163,0.00554306,0.00289427,0.0124747,0.00506853,0.00347864,0.00504533,0.0031913,0.00281313,0.00700991,0.00553539,0.00323894,0.0119726,0.0087613,0.0037744,0.00321451,0.00438236,0.00421991,0.00372924,0.0025353,0.00499214,0.00655455,0.0032405,0.00357454,0.00677736,0.00371891,0.00299958,0.00370849,0.00390838,0.00332982,0.0022957,0.00525886,0.00661977,0.00548287,0.00998895,0.00735201,0.00756872,0.00833601,0.00349044,0.00562712,0.00332551,0.00441935,0.00791781,0.00628909,0.00525568,0.00460333,0.0047693,0.00410211,0.00729927,0.0108484,0.00471766,0.00474978,0.00342744,0.00432136,0.00318424,0.00449263,0.0033034,0.00470249,0.0070784,0.0056866,0.00729434,0.00580441,0.00386554,0.00368296,0.00273789,0.00414973,0.00770347,0.00511474,0.00329203,0.00343413,0.00300428,0.00472811,0.00427174,0.00306443,0.00451517,0.00753552,0.00272955,0.00519358,0.00635646,0.00362847,0.00390632,0.00460496,0.00900377,0.00224768,0.00555154,0.00375666,0.00275521,0.0028616,0.00353391,0.00406172,0.0050272,0.0023491,0.00415601,0.00338214,0.00434092,0.00751665,0.00292629,0.00225531,0.00525023],"d":"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"},"b":{"s":0.00013078342,"d":"Kcmt4gzpNukvG2WvMBEjETXiExKNCUIw6R14OUXo8xxBDSbnRvi6KCjZBwmlLv4P1gNFuqL/EvH3K3LxNBotFRgiQgXkJLESnRzBB4AhDcE7/yhCHOuVMqXm9es0Mc0DhQnm74Ic/+h4LhA/x+WLCynPJwnS3UrrrTSgE0oPxyoV0KoAeUlp70IGEd+kGjzOv85nEtffVvS5NHcB/3/k8ZrHaO8r+zMXu59l2zsAX/ypOWTxMyWZEeUXUt605sW5JA4JG5DjKEsaAKL4ldA5+rfkRN8/CyC3JCsuHuAG++K9H1UhSSW2FzwyPu+x6Fn4FhHOyyMHixz3iPbsEdMH6Q=="}},{"rows":64,"cols":128,"w":{"s":[0.00337492,0.00432092,0.005108,0.00511909,0.00527835,0.00953156,0.00493554,0.00412012,0.00443849,0.0100887,0.00342125,0.00308218,0.00490068,0.00354532,0.00449858,0.00396224,0.00404588,0.00319297,0.00635661,0.00576375,0.0081763,0.00217334,0.00414359,0.00260186,0.00248863,0.00763469,0.00530367,0.00377276,0.00300848,0.00343214,0.00413387,0.00382698,0.0041181,0.00332667,0.00645651,0.00576706,0.0051136,0.00414925,0.00229157,0.00313462,0.00350542,0.00613138,0.00288171,0.00282769,0.00497432,0.00667669,0.00235938,0.00457368,0.00246204,0.00818593,0.00309053,0.00308131,0.00268077,0.00284255,0.00283988,0.00929823,0.00555763,0.00496202,0.0032413,0.00250779,0.00571578,0.00293484,0.00578792,0.00296477],"d":"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"},"b":{"s":0.000068021336,"d":"7SobBN/NN8oaKpXUlBwjf58rG9SDKn4aRPz3F1g4DRXNKR+x0+rbwwe+E4llVK/XNCyB2ps93Aa6EArJyiZPvLLTV2eRUkRMrzXJyP9/yCGdRwvkF78n6bA3xia7yAVFa7AfE4nJmGKmFFwJkwC5165NBb+XGSa+3/94yTTosRc="}},{"rows":5,"cols":64,"w":{"s":[0.0103654,0.0128532,0.0165353,0.0114722,0.0112737],"d":"CwDzCwQPJRD3D+UJ7umz3jHu/7MgAxMS3vRKCfEOCMUK/iSYBn8FUNQHGQM36AAR0f8T2PMKJRZ4Vgrg/N8LGhS09BMibzLoyAfl/vsk3/4E+AvYaSYCD/b8NhPvMQ7jIM0f/Ab49QPxAQr7/NkI4vZ/JObtCglP8Sgt5vf4rPcM5hM0PPQrwAh/3cQGGwAH9fkGFPA8BAv8+wQN+fkH+gr4AjcFDtLo9AAQ/uXqRs0JHiL0z/8F+NUAHef9D/b18f1CEBz2/+kAIP7+NRMIPf8iNA4eFtzkGoH0Ig7v4B4D8sEy0A/V+BqQH/+0nP3rJAHwGQgS8Rj4C/cXpib/4r386SwkKwq+9EXz/kAUDjX3pEj/Gy2kzwXL+hsT/+UEGNX49MkVp9XzzBBK/gH/gRv97RQH+e0uAR8AEcg/BNg="},"b":{"s":0.000036222718,"d":"mQcf4QGAQNyEsw=="}}]}/* EVAL_NET:end */);
function decodeNet(n) {
  // int16 with one scale, or int8 with one scale per row (s is then an array).
  const unpack = (p) => {
    const bin = typeof atob === 'function' ? atob(p.d) : Buffer.from(p.d, 'base64').toString('binary');
    if (Array.isArray(p.s)) {
      const out = new Float64Array(bin.length), cols = bin.length / p.s.length;
      for (let i = 0; i < out.length; i++) { let v = bin.charCodeAt(i); if (v > 127) v -= 256; out[i] = v * p.s[Math.floor(i / cols)]; }
      return out;
    }
    const out = new Float64Array(bin.length / 2);
    for (let i = 0; i < out.length; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; out[i] = v * p.s; }
    return out;
  };
  return { mu: n.mu, sd: n.sd, layers: n.layers.map((l) => ({ rows: l.rows, cols: l.cols, w: unpack(l.w), b: unpack(l.b) })) };
}

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

// Inputs of the evaluation net (EVAL_NET) for q ON ROLL. Raw board in q's frame (q moves
// 24->1): per point and side, [>=1, >=2, >=3, (n-3)/2] checkers; then bar and borne-off
// counts; then the hand-built features of probFeatures (without its bias term).
const NET_IN = 24 * 8 + 4 + 29;
function netInputs(b, q) {
  const x = new Array(NET_IN); let k = 0;
  for (let m = 1; m <= 24; m++) {
    const i = q === 'w' ? m : 25 - m;
    for (const c of [myCount(b, q, i), oppCount(b, q, i)]) {
      x[k++] = c >= 1 ? 1 : 0; x[k++] = c >= 2 ? 1 : 0; x[k++] = c >= 3 ? 1 : 0; x[k++] = c > 3 ? (c - 3) / 2 : 0;
    }
  }
  const o = opp(q);
  x[k++] = (q === 'w' ? b.bar.w : b.bar.b) / 2; x[k++] = (o === 'w' ? b.bar.w : b.bar.b) / 2;
  x[k++] = bornOff(b, q) / 15; x[k++] = bornOff(b, o) / 15;
  const f = probFeatures(b, q);
  for (let j = 1; j < f.length; j++) x[k++] = f[j];
  return x;
}

// { win, gw, gl } for player q ON ROLL (before rolling). gw/gl = P(win/lose a gammon or better).
function probsOnRoll(b, q) {
  const res = gameResult(b);
  if (res) { const won = res.winner === q, g = res.kind !== 'single', bg = res.kind === 'backgammon';
    return { win: won ? 1 : 0, gw: won && g ? 1 : 0, gl: !won && g ? 1 : 0, bw: won && bg ? 1 : 0, bl: !won && bg ? 1 : 0 }; }
  const x = netInputs(b, q), N = EVAL_NET;
  let h = new Float64Array(x.length);
  for (let j = 0; j < x.length; j++) h[j] = (x[j] - N.mu[j]) / N.sd[j];
  for (let L = 0; L < N.layers.length; L++) {
    const { rows, cols, w, b: bias } = N.layers[L], last = L === N.layers.length - 1, o = new Float64Array(rows);
    for (let r = 0; r < rows; r++) { let t = bias[r]; const off = r * cols; for (let c = 0; c < cols; c++) t += w[off + c] * h[c]; o[r] = last ? sigm(t) : Math.tanh(t); }
    h = o;
  }
  const win = Math.min(0.999, Math.max(0.001, h[0]));
  const gw = Math.min(win, h[1]), gl = Math.min(1 - win, h[3]);
  return { win, gw, gl, bw: Math.min(gw, h[2]), bl: Math.min(gl, h[4]) };
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
// Cubeless equity for the player ON ROLL (gammons count double, backgammons triple).
function cubelessEq(pr) { return (2 * pr.win - 1) + pr.gw - pr.gl + (pr.bw || 0) - (pr.bl || 0); }

// Best resulting board for p with these dice, ranked exactly like analyze() but without
// building explanations. null = no legal move (a dance).
function quickBest(board, p, dice) {
  const turns = generateLegalTurns(board, p, dice);
  if (!turns.length) return null;
  let best = null, bs = -Infinity; const seen = new Set();
  for (const t of turns) {
    const nb = replay(board, p, t), k = boardKey(nb);
    if (seen.has(k)) continue; seen.add(k);
    const s = eqAfterMove(nb, p);
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
// For speed each roll's best play is taken from the 8 plays the hand-built score likes most
// (the net only scores those); measured against scoring every play, luck moves by ~0.003.
const ALL_ROLLS = (() => { const r = []; for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) r.push({ d: [a, b], w: a === b ? 1 : 2 }); return r; })();
const LUCK_K = 8;
function bestEqForRoll(board, p, dice) {
  const turns = generateLegalTurns(board, p, dice);
  if (!turns.length) return eqAfterMove(board, p);          // a dance
  const o = opp(p), seen = new Set(), c = [];
  for (const t of turns) {
    const nb = replay(board, p, t), k = boardKey(nb);
    if (seen.has(k)) continue; seen.add(k);
    c.push({ nb, h: featureScore(nb, p, (pipCount(nb, o) - pipCount(nb, p)) * 0.010) });
  }
  if (c.length > LUCK_K) c.sort((x, y) => y.h - x.h);
  let best = -Infinity;
  for (let i = 0; i < Math.min(LUCK_K, c.length); i++) best = Math.max(best, eqAfterMove(c[i].nb, p));
  return best;
}
function rollLuck(board, p, dice) {
  let sum = 0, actual = null;
  for (const { d, w } of ALL_ROLLS) {
    const e = bestEqForRoll(board, p, d);
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

// ---- bot difficulty ----------------------------------------------------------
// Weaker levels misjudge: each candidate's equity gets Gaussian noise (sd `noise`) before the
// bot picks the best-looking one, like GNU Backgammon's "noisy" levels. Errors therefore land
// mostly where moves are close, the way a club player's do; an obvious move stays obvious.
// Cube decisions see the win chance with noise `cubeNoise`. Tuned by tools/calibrate-levels.js
// (1500 cubeless games per pairing): Easy wins ~50% against a simulated beginner (the old
// hand-built ranker, PR ~24); Medium plays at PR ~14 (club level); Strong is the plain net
// (PR ~4 judged by wildbg). `rating` is on the FIBS scale: gaps fitted with the FIBS formula
// to the head-to-head results (Medium beats Easy 80%, Strong beats Medium 65% and Easy 88%),
// anchored at Medium = 1700, which XG's PR table gives a PR-14 player.
const BOT_LEVELS = {
  easy: { label: 'Easy', noise: 0.23, cubeNoise: 0.12, pr: 38, rating: 500 },
  medium: { label: 'Medium', noise: 0.09, cubeNoise: 0.05, pr: 14, rating: 1700 },
  strong: { label: 'Strong', noise: 0, cubeNoise: 0, pr: 4, rating: 2200 },
};
function gauss(rnd) { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }
// Picks a move from analyze(...).moves (best first) at this level. null if there are none.
function botChoose(moves, level, rnd = Math.random) {
  if (!moves.length) return null;
  const L = BOT_LEVELS[level] || BOT_LEVELS.strong;
  if (!L.noise || moves.length === 1) return moves[0];
  let best = moves[0], bs = -Infinity;
  for (const m of moves) { const s = m.equity + L.noise * gauss(rnd); if (s > bs) { bs = s; best = m; } }
  return best;
}
// The bot's (possibly misjudged) view of { win, gw, gl } for a cube decision at this level.
function botCubeView(pr, level, rnd = Math.random) {
  const L = BOT_LEVELS[level] || BOT_LEVELS.strong;
  if (!L.cubeNoise) return pr;
  const win = Math.min(0.99, Math.max(0.01, pr.win + L.cubeNoise * gauss(rnd)));
  const k = win / pr.win, k2 = (1 - win) / (1 - pr.win);
  return { win, gw: Math.min(win, pr.gw * k), gl: Math.min(1 - win, pr.gl * k2) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    startingBoard, cloneBoard, singleMoves, applyStep, replay, generateLegalTurns,
    pipCount, bornOff, gameResult, evaluate, analyze, blots, hitRolls, turnLabel, stepLabel,
    BOT_LEVELS, botChoose, botCubeView, shotRolls,
    homePointsMade, backCheckers, longestPrime, destinationsFrom, featureScore, winProbOnRoll, probsOnRoll, probFeatures, netInputs, NET_IN, hasContact, phi, cubefulEquity, cubeAnalysis, cubeError, CAL, MET, metGet, matchCubeAnalysis, cubelessEq, quickBest, eqAfterMove, rollLuck, whiteWinChance, boardKey,
  };
}
