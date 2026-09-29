const E=require('../engine.js');
let pass=0,fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);} else {fail++;console.log('  ✗ FAIL:',m);} };
const noG=p=>({win:p,gw:0,gl:0}), pc=x=>x==null?'—':(x*100).toFixed(1)+'%';
// MET sanity
ok(Math.abs(E.metGet(1,2,false)-0.67736)<1e-6,'Crawford game 1-away vs 2-away = 67.7%');
ok(Math.abs(E.metGet(3,3,false)-0.5)<1e-9 && Math.abs(E.metGet(2,4,false)+E.metGet(4,2,false)-1)<1e-6,'table symmetric');
ok(E.metGet(0,5,false)===1 && E.metGet(5,0,false)===0,'match won/lost');
ok(Math.abs(E.metGet(3,1,true)-0.32264)<1e-6,'post-Crawford: 3-away trailer = 32.3%');

// 1. 2-away/2-away: taker needs exactly what passing leaves them (32.3%) - cube is dead after the take
const m22=E.matchCubeAnalysis(noG(0.6),{a:2,b:2,v:1,own:false,post:false});
console.log(`  2a/2a: double from ${pc(m22.doublePoint)}, opponent passes above ${pc(m22.passPoint)}`);
ok(m22.passPoint>0.66&&m22.passPoint<0.69,'2a/2a take point ≈ 32% (pass above ≈ 68%)');

// 2. Long match ≈ money play
const m25=E.matchCubeAnalysis(noG(0.6),{a:25,b:25,v:1,own:false,post:false});
console.log(`  25a/25a: double from ${pc(m25.doublePoint)}, pass above ${pc(m25.passPoint)} (money: 69.2% / 78.7%)`);
ok(Math.abs(m25.doublePoint-0.692)<0.04 && Math.abs(m25.passPoint-0.787)<0.04,'long match ≈ money thresholds');

// 3. Post-Crawford, trailer 2-away vs 1-away leader: trailer should double even at ~50%
const pc2=E.matchCubeAnalysis(noG(0.5),{a:2,b:1,v:1,own:false,post:true});
console.log(`  post-Crawford 2-away trailer at 50%: ${pc2.label}`);
ok(pc2.shouldDouble,'post-Crawford trailer doubles immediately');

// 4. Leader at 1-away can never usefully double (cube dead for them)
const lead=E.matchCubeAnalysis(noG(0.8),{a:1,b:4,v:1,own:false,post:true});
ok(!lead.shouldDouble,'1-away leader never doubles');

// 5. Gammonish at 2a/4a: leader's gammons are worth little/nothing extra -> harder for leader to double?
const t1=E.matchCubeAnalysis({win:0.7,gw:0.2,gl:0.05},{a:4,b:2,v:1,own:false,post:false});
const t2=E.matchCubeAnalysis({win:0.7,gw:0.2,gl:0.05},{a:2,b:4,v:1,own:false,post:false});
console.log(`  70% w/ gammons: trailer 4a vs 2a -> ${t1.label}; leader 2a vs 4a -> ${t2.label}`);
ok(t1.shouldDouble,'4-away trailer doubles at 70% vs 2-away leader');

// 6. Error scale: match errors expressed in money-equivalent units, comparable to money play
const anM=E.matchCubeAnalysis(noG(0.74),{a:25,b:25,v:1,own:false,post:false}), anMo=E.cubeAnalysis(noG(0.74),'center');
const eM=E.cubeError(anM,'taker','pass'), eMo=E.cubeError(anMo,'taker','pass');
console.log(`  wrong pass at 74%: match-25 error ${eM.toFixed(3)} vs money ${eMo.toFixed(3)}`);
ok(Math.abs(eM-eMo)<0.15,'long-match errors on the same scale as money errors');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
