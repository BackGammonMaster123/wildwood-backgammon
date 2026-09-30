const E = require('../engine.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } }

// 1. Opening 3-1: making the 5-point (8/5 6/5) must be among legal turns.
{
  const b = E.startingBoard();
  const turns = E.generateLegalTurns(b, 'w', [3, 1]);
  const make5 = turns.some((t) => { const nb = E.replay(b, 'w', t); return nb.points[5] === 2; });
  ok(make5, 'opening 3-1 should allow making the 5-point');
  // coach dedupes to distinct positions: opening 3-1 has 16
  const a = E.analyze(b, 'w', [3, 1]);
  ok(a.moves.length === 16, `coach should rank 16 distinct 3-1 positions, got ${a.moves.length}`);
  const best = E.turnLabel('w', a.moves[0].steps);
  ok(a.moves[0].board.points[5] === 2, `coach best 3-1 should make 5pt, got "${best}"`);
  console.log('  opening 3-1 best:', best, '| eq', a.moves[0].equity.toFixed(3), '|', a.moves[0].explanation);
}

// 2. Doubles produce up to four moves.
{
  const b = E.startingBoard();
  const turns = E.generateLegalTurns(b, 'w', [6, 6]);
  const maxLen = turns.reduce((m, t) => Math.max(m, t.length), 0);
  ok(maxLen === 4 || turns.length === 0, `opening 6-6 should use 4 dice where possible, maxLen=${maxLen}`);
}

// 3. Bar re-entry is forced before any other move.
{
  const b = E.startingBoard();
  b.points[24] = 1; b.bar.w = 1; // put a white checker on the bar
  const turns = E.generateLegalTurns(b, 'w', [2, 4]);
  const allEnterFirst = turns.every((t) => t[0].from === 'bar');
  ok(allEnterFirst, 'with a checker on the bar, every legal turn must enter first');
  // entry points for white with die d = 25-d ; die 2 -> 23 (open), die 4 -> 21 (open)
  ok(turns.length > 0, 'should be able to enter from the bar on 2-4');
}

// 4. Closed board -> dancing (no legal moves).
{
  const b = { points: new Array(25).fill(0), bar: { w: 1, b: 0 }, off: { w: 0, b: 0 } };
  for (let i = 19; i <= 24; i++) b.points[i] = -2; // black owns all of white's entry points
  const turns = E.generateLegalTurns(b, 'w', [3, 5]);
  ok(turns.length === 0, `white on bar vs closed board should have no moves, got ${turns.length}`);
}

// 5. Bear-off: exact and overshoot.
{
  const b = { points: new Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 13, b: 0 } };
  b.points[6] = 1; b.points[3] = 1; // two white checkers left, all home
  // die 6 bears off the 6; die 3 bears off the 3 (exact)
  let turns = E.generateLegalTurns(b, 'w', [6, 3]);
  const bothOff = turns.some((t) => E.replay(b, 'w', t).off.w === 15);
  ok(bothOff, 'exact bear-off of 6 and 3 should finish the game');
  // overshoot: only a checker on the 3, die 6 -> allowed since nothing higher
  const b2 = { points: new Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 14, b: 0 } };
  b2.points[3] = 1;
  const t2 = E.generateLegalTurns(b2, 'w', [6, 1]);
  const won = t2.some((t) => E.replay(b2, 'w', t).off.w === 15);
  ok(won, 'overshoot bear-off (die 6 on the 3-point, nothing higher) should be legal');
  // overshoot NOT allowed when a higher checker exists
  const b3 = { points: new Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 13, b: 0 } };
  b3.points[6] = 1; b3.points[3] = 1;
  const t3 = E.generateLegalTurns(b3, 'w', [5, 1]); // die 5 cannot bear the 6 (needs 6); can move 6->1; die 1 ...
  const illegalOff3 = t3.some((t) => t.some((s) => s.from === 3 && s.to === 'off' && s.die === 5));
  ok(!illegalOff3, 'die 5 must NOT bear off the 3-point while a checker sits on the 6-point');
}

// 6. Forced higher die: only one die playable, must be the higher.
{
  // Construct: white must play only one die and both are individually playable but not together,
  // with the higher die forced. Simple contrived spot:
  const b = { points: new Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
  b.points[13] = 1;                    // one white checker to move
  for (let i = 1; i <= 12; i++) b.points[i] = 0;
  b.points[7] = -2; b.points[9] = -2;  // block 13->6? using die6 lands 7(blocked). die4 lands 9(blocked)
  // die 6: 13->7 blocked. die 2: 13->11 open. Only die 2 playable -> not a higher-die test; adjust:
  // Make higher die (6) the only playable one:
  b.points[9] = 0; b.points[11] = -2;  // die2 -> 11 blocked ; die6 -> 7 blocked too. redo cleanly below.
}
{
  const b = { points: new Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
  b.points[13] = 1;
  b.points[11] = -2; // die 2 (13->11) blocked
  // die 5 -> 13->8 open ; higher die 5 playable, lower die 2 blocked => must play 5
  const turns = E.generateLegalTurns(b, 'w', [5, 2]);
  ok(turns.length === 1 && turns[0][0].die === 5, `only the 5 is playable here (got ${turns.map(t=>E.turnLabel('w',t)).join(', ')})`);
}

// 7. Hitting sends opponent to the bar.
{
  const b = { points: new Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
  b.points[13] = 1; b.points[8] = -1; // white 13, black blot on 8
  const nb = E.applyStep(b, 'w', { from: 13, to: 8, die: 5 });
  ok(nb.points[8] === 1 && nb.bar.b === 1, 'white 13/8 must hit the black blot and put it on the bar');
}

// 8. Pip count sanity on the starting position (167 each).
{
  const b = E.startingBoard();
  ok(E.pipCount(b, 'w') === 167, `white opening pip should be 167, got ${E.pipCount(b, 'w')}`);
  ok(E.pipCount(b, 'b') === 167, `black opening pip should be 167, got ${E.pipCount(b, 'b')}`);
}

// 9. Compound (multi-die) destinations from a source.
{
  const b = E.startingBoard();
  const turns = E.generateLegalTurns(b, 'w', [5, 3]);
  const d = E.destinationsFrom(b, 'w', turns, [], 24); // white back checker on 24
  const keys = [...d.keys()].sort();
  // die3: 24->21 open; die5: 24->19 is blocked by 5 black checkers.
  // compound: 24->21->16 (3 then 5) reaches 16 as a single click.
  ok(d.has('21'), `should offer single 24/21 (got ${keys.join(',')})`);
  ok(d.has('16'), `should offer compound 24/16 as one move (got ${keys.join(',')})`);
  ok(!d.has('19'), `24/19 is blocked and must NOT be offered (got ${keys.join(',')})`);
  ok(d.get('16').steps.length === 2, 'compound 24/16 should be a 2-step sequence');
  console.log('  from 24 on 5-3:', keys.map(k=>`${k}[${d.get(k).dice.join('+')}]`).join('  '));
}

// 10. Better dice order chosen when one order hits and the other does not.
// A legal position (15 checkers each) where hitting is clearly right: White's home board has
// 1, 2, 3, 4 and 6 made, so a checker hit from Black's 8 point faces a nearly closed board.
{
  const b = { points: new Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
  b.points[13] = 1;          // white checker to move 5+3: 13->8(hit)->5 or 13->10->5
  b.points[6] = 3; b.points[4] = 3; b.points[3] = 3; b.points[2] = 3; b.points[1] = 2;
  b.points[8] = -1;          // black blot, hit only by the 5-first order
  b.points[24] = -3; b.points[23] = -3; b.points[22] = -4; b.points[21] = -4;
  const turns = E.generateLegalTurns(b, 'w', [5, 3]);
  const d = E.destinationsFrom(b, 'w', turns, [], 13);
  ok(d.has('5'), 'compound destination 5 offered');
  ok(d.has('5') && d.get('5').board.bar.b === 1, 'compound to 5 should choose the order that hits the blot on 8');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
