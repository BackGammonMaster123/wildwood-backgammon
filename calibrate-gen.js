// Generate diverse pre-roll positions from simulated games (store boards for feature iteration).
const E=require('../engine.js'); const A=require('../wildbg-kit/wildbg-adapter.js'); const fs=require('fs');
let seed=+process.argv[3]||7; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
const die=()=>1+Math.floor(rnd()*6);
const N=+process.argv[2]||200; const rows=[]; const seen=new Set();
outer: for(let g=0; rows.length<N && g<20000; g++){
  let b=E.startingBoard(); let turn=rnd()<0.5?'w':'b';
  const eps = [0.1,0.25,0.5][g%3];                      // mix of strong and sloppy play
  for(let ply=0; ply<140; ply++){
    if(E.gameResult(b)) break;
    const pips=A.boardToPips(b,turn); const key=pips.join(',');
    if(!seen.has(key) && ply>1){ seen.add(key); rows.push({b:E.cloneBoard(b), q:turn}); if(rows.length>=N) break outer; }
    const dice=[die(),die()]; const turns=E.generateLegalTurns(b,turn,dice);
    if(turns.length){ let pick;
      if(rnd()<eps) pick=E.replay(b,turn,turns[Math.floor(rnd()*turns.length)]);
      else { let bs=-1e9; const o=turn==='w'?'b':'w'; for(const t of turns){ const nb=E.replay(b,turn,t); const s=E.featureScore(nb,turn,(E.pipCount(nb,o)-E.pipCount(nb,turn))*0.01); if(s>bs){bs=s;pick=nb;} } }
      b=pick; }
    turn=turn==='w'?'b':'w';
  }
}
fs.writeFileSync('/tmp/cal-in.txt', rows.map(r=>A.boardToPips(r.b,r.q).join(' ')).join('\n')+'\n');
fs.writeFileSync('/tmp/cal-rows.json', JSON.stringify(rows));
console.log('positions:', rows.length, '| contact:', rows.filter(r=>E.hasContact(r.b)).length);
