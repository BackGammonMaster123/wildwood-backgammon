const E=require('../engine.js'); const fs=require('fs');
const rows=JSON.parse(fs.readFileSync('/tmp/cal-rows.json'));
const out=fs.readFileSync('/tmp/cal-out.txt','utf8').trim().split('\n').map(l=>l.split(' ').map(Number));
rows.forEach((r,i)=>{r.win=out[i][0]; r.gw=out[i][1]; r.gl=out[i][2]; r.contact=E.hasContact(r.b);});
const opp=p=>p==='w'?'b':'w';
// ---------- race z ----------
function raceZ(b,q,RP){ const o=opp(q); const qP=E.pipCount(b,q), oP=E.pipCount(b,o);
  const qC=15-E.bornOff(b,q), oC=15-E.bornOff(b,o);
  const nQ=Math.max((qP+RP.W)/RP.R, qC/RP.C), nO=Math.max((oP+RP.W)/RP.R, oC/RP.C);
  return (nO-nQ+RP.ON)/(RP.S*Math.sqrt(Math.max(nQ,1)+Math.max(nO,1))); }
const race=rows.filter(r=>!r.contact);
let best=null;
for(const S of [0.25,0.28,0.31,0.34,0.37,0.4]) for(const ON of [0.3,0.35,0.4,0.45,0.5]) for(const W of [6,8,10,12]) for(const C of [2.2,2.4,2.6,2.8,3.0,3.3]){
  const RP={R:8.167,S,ON,W,C}; let se=0; for(const r of race){const e=E.phi(raceZ(r.b,r.q,RP))-r.win; se+=e*e;}
  if(!best||se<best.se) best={RP,se}; }
const RP=best.RP; let ae=0; for(const r of race) ae+=Math.abs(E.phi(raceZ(r.b,r.q,RP))-r.win);
console.log('race model', JSON.stringify(RP), `MAE=${(ae/race.length*100).toFixed(2)}pp (n=${race.length})`);
// ---------- features ----------
function home(b,p){return E.homePointsMade(b,p);}
function anchors(b,p){ let n=0; if(p==='w'){for(let i=19;i<=24;i++) if(b.points[i]>=2) n++;} else {for(let i=1;i<=6;i++) if(b.points[i]<=-2) n++;} return n; }
function shots(b,victim){ let s=0; for(const bl of E.blots(b,victim)) s+=bl.shots; return Math.min(s,36)/36; }
function prime(b,p){ let best=0,run=0; for(let i=1;i<=24;i++){ const c=p==='w'?Math.max(0,b.points[i]):Math.max(0,-b.points[i]); if(c>=2){run++;best=Math.max(best,run);} else run=0;} return best; }
function feats(b,q){ const o=opp(q); const z=raceZ(b,q,RP); const c=E.hasContact(b)?1:0;
  const qBar=q==='w'?b.bar.w:b.bar.b, oBar=q==='w'?b.bar.b:b.bar.w;
  return [1, z, c, c*z, qBar, oBar, c*home(b,q), c*home(b,o), shots(b,q), shots(b,o), c*prime(b,q), c*prime(b,o),
    c*E.backCheckers(b,q), c*E.backCheckers(b,o), c*anchors(b,q), c*anchors(b,o), E.bornOff(b,q)/15, E.bornOff(b,o)/15,
    E.bornOff(b,o)===0?1:0, E.bornOff(b,q)===0?1:0, (E.pipCount(b,o)-E.pipCount(b,q))/100,
    qBar*home(b,o), oBar*home(b,q), c*E.featureScore(b,o,0), c*E.blots(b,q).length, c*E.blots(b,o).length]; }
const X=rows.map(r=>feats(r.b,r.q)); const D=X[0].length;
// standardize (not bias)
const mu=new Array(D).fill(0), sd=new Array(D).fill(1);
for(let j=1;j<D;j++){ let m=0; for(const x of X) m+=x[j]; m/=X.length; let v=0; for(const x of X) v+=(x[j]-m)**2; v=Math.sqrt(v/X.length)||1; mu[j]=m; sd[j]=v; }
const Z=X.map(x=>x.map((v,j)=>j===0?1:(v-mu[j])/sd[j]));
const idx=rows.map((_,i)=>i); let s2=99; idx.sort(()=>{s2=(s2*16807)%2147483647; return (s2/2147483647)-0.5;});
const nTr=Math.floor(rows.length*0.8), tr=idx.slice(0,nTr), va=idx.slice(nTr);
const sig=t=>1/(1+Math.exp(-t));
function fit(target){ let w=new Array(D).fill(0); const lr=0.5, l2=1e-4; let m=new Array(D).fill(0), v=new Array(D).fill(0);
  for(let it=1; it<=1500; it++){ const g=new Array(D).fill(0);
    for(const i of tr){ const zi=Z[i]; let t=0; for(let j=0;j<D;j++) t+=w[j]*zi[j]; const e=sig(t)-rows[i][target]; for(let j=0;j<D;j++) g[j]+=e*zi[j]; }
    for(let j=0;j<D;j++){ g[j]=g[j]/tr.length + l2*w[j]; m[j]=0.9*m[j]+0.1*g[j]; v[j]=0.999*v[j]+0.001*g[j]*g[j];
      const mh=m[j]/(1-0.9**it), vh=v[j]/(1-0.999**it); w[j]-=0.05*mh/(Math.sqrt(vh)+1e-8); } }
  const mae=(set,sel)=>{ let a=0,n=0; for(const i of set){ if(sel&&!sel(rows[i]))continue; let t=0; for(let j=0;j<D;j++) t+=w[j]*Z[i][j]; a+=Math.abs(sig(t)-rows[i][target]); n++;} return (a/n*100).toFixed(2)+'pp'; };
  console.log(`${target}: val MAE all=${mae(va)} contact=${mae(va,r=>r.contact)} race=${mae(va,r=>!r.contact)}`);
  // fold standardization into raw weights
  const raw=new Array(D).fill(0); raw[0]=w[0]; for(let j=1;j<D;j++){ raw[j]=w[j]/sd[j]; raw[0]-=w[j]*mu[j]/sd[j]; }
  return raw; }
const W={RP, win:fit('win'), gw:fit('gw'), gl:fit('gl')};
fs.writeFileSync('/tmp/cal-weights.json', JSON.stringify(W));
console.log('weights saved; features:', D);
