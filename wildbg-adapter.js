/* ============================================================================
   wildbg-wasm adapter
   ----------------------------------------------------------------------------
   Bridges the Wildwood board model to the wildbg-wasm neural engine so you can
   replace the heuristic analyze() with gold-standard neural equity WITHOUT
   touching the board, rules, or UI.

   Wildwood board model (see engine.js):
     points[1..24]  >0 white checkers, <0 black checkers
     bar:{w,b}  off:{w,b}
     White moves 24->1 (home 1..6); Black moves 1->24 (home 19..24).

   wildbg "pips" convention (26 ints, ACTIVE player's perspective):
     index 1..24  board points, >0 = active player, <0 = opponent
     index 25     active player's bar        index 0  opponent's bar
     active player always moves 24 -> 1, enters on 25, bears off past 0.
     A returned move { from, to } uses the same frame: from=25 is the bar,
     to=0 is borne off.

   The mapping for White is the identity (White already moves 24->1 with White
   positive). For Black we reflect the board (point i <-> 25-i) and negate signs
   so Black becomes the positive, high->low mover.
   ==========================================================================*/

// Board rotated so that `player` is the positive, 24->1 mover ("wildbg frame").
function toMoverBoard(board, player) {
  if (player === 'w') {
    return { points: board.points.slice(),
             bar: { w: board.bar.w, b: board.bar.b },
             off: { w: board.off.w, b: board.off.b } };
  }
  const points = new Array(25).fill(0);
  for (let i = 1; i <= 24; i++) points[i] = -board.points[25 - i];
  return { points, bar: { w: board.bar.b, b: board.bar.w }, off: { w: board.off.b, b: board.off.w } };
}

// Wildwood board -> wildbg 26-int pips array for `player` to move.
function boardToPips(board, player) {
  const mb = toMoverBoard(board, player);
  const pips = new Array(26).fill(0);
  for (let i = 1; i <= 24; i++) pips[i] = mb.points[i];
  pips[25] = mb.bar.w;   // active player's bar (positive)
  pips[0] = -mb.bar.b;   // opponent's bar (negative)
  return pips;
}

// A single mover-frame step { from, to, die } -> Wildwood step for `player`.
// from: 'bar' | 1..24 ; to: 'off' | 1..24
function stepToPlayer(step, player) {
  const from = step.from === 'bar' ? 'bar' : (player === 'w' ? step.from : 25 - step.from);
  const to   = step.to   === 'off' ? 'off' : (player === 'w' ? step.to   : 25 - step.to);
  return { from, to, die: step.die };
}

// A wildbg move part { from, to } (25=bar, 0=off) -> Wildwood step for `player`.
function wildbgPlayToStep(play, player) {
  const fRaw = play.from, tRaw = play.to;          // 25=bar, 0=off, else point
  const die = fRaw - tRaw;                          // mover goes high->low, so >0
  const from = fRaw === 25 ? 'bar' : (player === 'w' ? fRaw : 25 - fRaw);
  const to   = tRaw === 0  ? 'off' : (player === 'w' ? tRaw : 25 - tRaw);
  return { from, to, die };
}

// Build an analyze()-compatible engine backed by a constructed `Wildbg` wasm
// instance. `describe` is optional (e.g. the game's describeTurn) to keep the
// plain-language coaching text; swap it for an LLM call to narrate instead.
//
//   import init, { Wildbg } from './pkg/wildbg_wasm.js';
//   await init();
//   const engine = makeWildbgEngine(new Wildbg(), { replay, describeTurn });
//   const a = engine.analyze(board, 'w', [3, 1]);   // same shape as heuristic analyze()
//
function makeWildbgEngine(wb, helpers = {}) {
  const { replay, describeTurn } = helpers;
  return {
    analyze(board, player, dice) {
      const pips = boardToPips(board, player);
      const res = wb.analyze(Int8Array.from(pips), dice[0], dice[1], false);
      const moves = res.moves.map((m) => {
        const steps = m.play.map((pl) => wildbgPlayToStep(pl, player));
        const after = replay ? replay(board, player, steps) : null;
        const p = m.probabilities || {};
        return {
          steps,
          board: after,
          equity: m.equity,
          winProb: p.win != null ? p.win : undefined,
          explanation: (describeTurn && after) ? describeTurn(board, steps, after, player) : '',
        };
      });
      // wildbg already returns best-first; keep, but sort defensively by equity.
      moves.sort((a, b) => b.equity - a.equity);
      return { phase: res.phase, moves };
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toMoverBoard, boardToPips, stepToPlayer, wildbgPlayToStep, makeWildbgEngine };
}
