const E=require('../engine.js'); const fs=require('fs');
const rows=JSON.parse(fs.readFileSync('tests/fixtures/cal-rows-b.json'));
const want={}; const labels=['Double, take','Double, pass','No double, take'];
for(const r of rows){ for(const q of ['w','b']){ const b=r.b; if(E.gameResult(b)) continue;
  const an=E.cubeAnalysis(E.probsOnRoll(b,q),'center');
  // also require: no checkers on bar, and the on-roll side has legal moves for most rolls (keeps tests simple)
  for(const L of labels){ const k=q+'|'+L; if(an.label===L && !want[k] && Math.abs(an.p-({'Double, take':0.75,'Double, pass':0.9,'No double, take':0.55})[L])<0.04){ want[k]={b, q, p:an.p, label:L, contact:E.hasContact(b)}; } } } }
for(const k of Object.keys(want)) console.log(k.padEnd(20), 'p='+(want[k].p*100).toFixed(1)+'%', want[k].contact?'contact':'race');
fs.writeFileSync('tests/fixtures/cube-positions.json', JSON.stringify(want));
