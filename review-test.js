const E=require('../engine.js');
let pass=0,fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);} else {fail++;console.log('  ✗ FAIL:',m);} };
const s=E.startingBoard();
// 1. quickBest agrees with analyze's top choice
let agree=0,n=0; for(let a=1;a<=6;a++) for(let b=a;b<=6;b++){ n++; const q=E.quickBest(s,'w',[a,b]), an=E.analyze(s,'w',[a,b]); if(E.boardKey(q)===E.boardKey(an.moves[0].board)) agree++; }
ok(agree===n,`quickBest = analyze's best on all 21 opening rolls (${agree}/${n})`);
// 2. Luck is zero-sum over all 36 rolls by construction
let tot=0; for(let a=1;a<=6;a++) for(let b=1;b<=6;b++) tot+=E.rollLuck(s,'w',[a,b]).luck; ok(Math.abs(tot/36)<1e-9,'average luck over the 36 rolls is exactly 0');
// 3. Sensible ordering at the start: 3-1 (makes 5pt) luckier than 6-5? (6-5 runs) both good; 6-6 luckier than 2-1
const L=(d)=>E.rollLuck(s,'w',d).luck;
console.log('  opening luck: 6-6', L([6,6]).toFixed(3), '| 3-1', L([3,1]).toFixed(3), '| 2-1', L([2,1]).toFixed(3), '| 6-4', L([6,4]).toFixed(3));
ok(L([6,6])>L([2,1]),'6-6 is luckier than 2-1 at the start');
// 4. Dancing against a closed board is very unlucky, rolling the one entering number lucky
const b={points:new Array(25).fill(0),bar:{w:1,b:0},off:{w:0,b:0}};
for(let i=20;i<=24;i++) b.points[i]=-2; b.points[13]=5; b.points[6]=5; b.points[8]=4; // white can enter only on 19 (die 6)
b.points[1]=-3; b.points[12]=-2; // rest of black
const dance=E.rollLuck(b,'w',[2,3]).luck, enter=E.rollLuck(b,'w',[6,6]).luck;
console.log('  vs 5-point board: dance', dance.toFixed(3), '| 6-6', enter.toFixed(3));
ok(dance<0 && enter>0 && enter>-dance,'dancing is unlucky, entering with 6-6 is very lucky');
// 5. Win chance: start ~50% ± on-roll edge; game over -> 1/0
const w0=E.whiteWinChance(s,'w'); console.log('  White on roll at start:', (w0*100).toFixed(1)+'%');
ok(w0>0.45&&w0<0.6,'start position ≈ 50% (on-roll edge)');
const won={points:new Array(25).fill(0),bar:{w:0,b:0},off:{w:15,b:3}}; won.points[20]=-12;
ok(E.whiteWinChance(won,'b')===1,'finished game: White 100%');
// 6. Speed: luck for one turn
const t0=Date.now(); for(let i=0;i<10;i++) E.rollLuck(s,'w',[3,1]); const ms=(Date.now()-t0)/10;
console.log('  rollLuck per turn:', ms.toFixed(1),'ms'); ok(ms<400,'fast enough for chunked analysis');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
