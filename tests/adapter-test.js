/* Validates the wildbg coordinate transform WITHOUT wasm, by self-consistency:
   moves generated in the rotated "mover frame" and mapped back must exactly
   equal the moves the rules engine produces directly for that player. If the
   reflection/sign mapping were wrong, the two move-sets would diverge. */
const E = require('../engine.js');
const A = require('../wildbg-kit/wildbg-adapter.js');

const keyOf = (b) => b.points.join(',') + '|' + b.bar.w + ',' + b.bar.b + '|' + b.off.w + ',' + b.off.b;
const setOf = (turns, board, player) => new Set(turns.map((t) => keyOf(E.replay(board, player, t))));

let checked = 0, mismatches = 0, sawBar = 0, sawOff = 0;

function transformMatches(board, player, dice) {
  const direct = E.generateLegalTurns(board, player, dice);
  const mover = A.toMoverBoard(board, player);
  const moverTurns = E.generateLegalTurns(mover, 'w', dice);
  const mappedTurns = moverTurns.map((t) => t.map((s) => A.stepToPlayer(s, player)));
  const dSet = setOf(direct, board, player);
  const mSet = setOf(mappedTurns, board, player);
  if (board.bar[player] > 0) sawBar++;
  if (board.off[player] > 0) sawOff++;
  checked++;
  if (dSet.size !== mSet.size || [...dSet].some((k) => !mSet.has(k))) {
    mismatches++;
    if (mismatches <= 3) console.log('  MISMATCH', player, dice, 'direct', dSet.size, 'mapped', mSet.size);
    return false;
  }
  return true;
}

// Play many random games from the start; test both players at every ply,
// covering opening, midgame contact, bar hits, and bear-off.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const die = () => 1 + Math.floor(rnd() * 6);

for (let game = 0; game < 40; game++) {
  let board = E.startingBoard();
  let turn = 'w';
  for (let ply = 0; ply < 60; ply++) {
    if (E.gameResult(board)) break;
    const dice = [die(), die()];
    for (const p of ['w', 'b']) transformMatches(board, p, dice);
    const turns = E.generateLegalTurns(board, turn, dice);
    if (turns.length) board = E.replay(board, turn, turns[Math.floor(rnd() * turns.length)]);
    turn = turn === 'w' ? 'b' : 'w';
  }
}

// pip-array spot check: starting position, black to move -> mover pips must be
// the same 15-checker shape as white's (backgammon is symmetric at the start).
{
  const b = E.startingBoard();
  const pw = A.boardToPips(b, 'w');
  const pb = A.boardToPips(b, 'b');
  const shape = (p) => p.slice(1, 25).filter((x) => x > 0).sort((a, c) => a - c).join(',');
  const sw = shape(pw), sb = shape(pb);
  console.log('  start mover-pips (white):', pw.slice(1, 25).join(' '));
  console.log('  start mover-pips (black):', pb.slice(1, 25).join(' '));
  if (sw !== sb) { mismatches++; console.log('  MISMATCH start shapes', sw, '!=', sb); }
}

console.log(`\n${checked} positions checked · saw ${sawBar} bar cases · ${sawOff} bear-off cases · ${mismatches} mismatches`);
process.exit(mismatches ? 1 : 0);
