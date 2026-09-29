const E=require('../engine.js'); const fs=require('fs');
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};
// 1. Theory checks without gammons (W=L=1): initial double ~69%, redouble ~72%, pass beyond ~78.6%
const noG=p=>({win:p,gw:0,gl:0});
const firstDbl=pos=>{for(let p=0.5;p<1;p+=0.001) if(E.cubeAnalysis(noG(p),pos).shouldDouble) return p; };
const passAt=()=>{for(let p=0.5;p<1;p+=0.001) if(!E.cubeAnalysis(noG(p),'center').takes) return p; };
const d0=firstDbl('center'), d1=firstDbl('own'), tp=passAt();
console.log(`no-gammon theory: double from ${(d0*100).toFixed(1)}%, redouble from ${(d1*100).toFixed(1)}%, opponent passes above ${(tp*100).toFixed(1)}%`);
ok(d0>0.67&&d0<0.71,'initial doubling point ~69%'); ok(d1>0.70&&d1<0.74,'redouble point ~72%'); ok(tp>0.77&&tp<0.80,'take point ~21.4%');
ok(!E.cubeAnalysis(noG(0.55),'center').shouldDouble,'no double at 55%');
ok(E.cubeAnalysis(noG(0.74),'center').label==='Double, take','74% -> double/take');
ok(E.cubeAnalysis(noG(0.85),'center').label==='Double, pass','85% -> double/pass');
// 2. Gammons: big gammon chances make it "too good"
const tg=E.cubeAnalysis({win:0.9,gw:0.6,gl:0.01},'center');
console.log('90% win, 60% gammons ->', tg.label); ok(tg.tooGood,'high-gammon position is too good');
// 3. Errors are zero for the correct action and positive for the wrong one
const an=E.cubeAnalysis(noG(0.74),'center');
ok(E.cubeError(an,'doubler','double')<1e-9 && E.cubeError(an,'doubler','nodouble')>0,'doubler error sign');
ok(E.cubeError(an,'taker','take')===0 && E.cubeError(an,'taker','pass')>0,'taker error sign');
// 4. Decision agreement with wildbg probabilities on the calibration positions
const rows=JSON.parse(fs.readFileSync('tests/fixtures/cal-rows-b.json'));
const out=fs.readFileSync('tests/fixtures/cal-out-b.txt','utf8').trim().split('\n').map(l=>l.split(' ').map(Number));
let n=0,agreeD=0,agreeT=0,nT=0,bigMiss=0;
rows.forEach((r,i)=>{ const wb={win:out[i][0],gw:out[i][1],gl:out[i][2]}; if(wb.win<0.6||wb.win>0.97) return; n++;
  const A=E.cubeAnalysis(wb,'center'), B=E.cubeAnalysis(E.probsOnRoll(r.b,r.q),'center');
  if(A.shouldDouble===B.shouldDouble) agreeD++;
  if(A.shouldDouble||B.shouldDouble){ nT++; if(A.takes===B.takes) agreeT++; }
  // how costly is following my advice, measured with wildbg's probabilities?
  const my=B.shouldDouble?'double':'nodouble'; if(E.cubeError(A,'doubler',my)>0.1) bigMiss++; });
console.log(`agreement vs wildbg (positions with 60-97% win): double/no-double ${(agreeD/n*100).toFixed(1)}% · take/pass ${(agreeT/nT*100).toFixed(1)}% · costly (>0.10) doubling errors ${(bigMiss/n*100).toFixed(1)}%  (n=${n})`);
ok(agreeD/n>0.70,'double decision agreement > 70% (regression guard)');
// 5. Performance: analyze on doubles midgame
const b=E.startingBoard(); let t0=Date.now(); for(let i=0;i<20;i++) E.analyze(b,'w',[3,3]); const ms=(Date.now()-t0)/20;
console.log(`analyze 3-3 from start: ${ms.toFixed(1)} ms`); ok(ms<150,'analyze fast enough');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
