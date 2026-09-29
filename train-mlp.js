// Train a small MLP: engine features -> (win, gammon-win, gammon-loss) matching wildbg.
const E=require('../engine.js'); const fs=require('fs');
function load(rf,of){ const rows=JSON.parse(fs.readFileSync(rf)); const out=fs.readFileSync(of,'utf8').trim().split('\n').map(l=>l.split(' ').map(Number));
  return rows.map((r,i)=>({b:r.b,q:r.q,y:[out[i][0],out[i][1],out[i][2]]})); }
let data=load('/tmp/cal-rows-a.json','/tmp/cal-out-a.txt');
if(fs.existsSync('tests/fixtures/cal-out-b.txt')){ const B=load('tests/fixtures/cal-rows-b.json','tests/fixtures/cal-out-b.txt'); const seen=new Set(data.map(d=>JSON.stringify(d.b)+d.q)); for(const d of B){const k=JSON.stringify(d.b)+d.q; if(!seen.has(k)){seen.add(k);data.push(d);}} }
data.forEach(d=>{ d.x=E.probFeatures(d.b,d.q).slice(1); d.contact=E.hasContact(d.b); }); // drop bias
const D=data[0].x.length, H=+process.argv[2]||24, O=3;
const mu=new Array(D).fill(0), sd=new Array(D).fill(1);
for(let j=0;j<D;j++){ let m=0; for(const d of data) m+=d.x[j]; m/=data.length; let v=0; for(const d of data) v+=(d.x[j]-m)**2; mu[j]=m; sd[j]=Math.sqrt(v/data.length)||1; }
data.forEach(d=>d.z=d.x.map((v,j)=>(v-mu[j])/sd[j]));
let s=42; const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647;};
data.sort(()=>rnd()-0.5); const nTr=Math.floor(data.length*0.85), tr=data.slice(0,nTr), va=data.slice(nTr);
const gauss=()=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
let W1=[...Array(H)].map(()=>[...Array(D)].map(()=>gauss()*Math.sqrt(1/D))), b1=new Array(H).fill(0);
let W2=[...Array(O)].map(()=>[...Array(H)].map(()=>gauss()*Math.sqrt(1/H))), b2=new Array(O).fill(0);
const sig=t=>1/(1+Math.exp(-t));
function fwd(z){ const h=new Array(H); for(let i=0;i<H;i++){ let t=b1[i]; const w=W1[i]; for(let j=0;j<D;j++) t+=w[j]*z[j]; h[i]=Math.tanh(t);} const o=new Array(O); for(let k=0;k<O;k++){ let t=b2[k]; const w=W2[k]; for(let i=0;i<H;i++) t+=w[i]*h[i]; o[k]=sig(t);} return {h,o}; }
// Adam state
const mk=(a)=>JSON.parse(JSON.stringify(a)).map?JSON.parse(JSON.stringify(a)):a;
const zeroLike=a=>Array.isArray(a[0])?a.map(r=>r.map(()=>0)):a.map(()=>0);
let mW1=zeroLike(W1),vW1=zeroLike(W1),mb1=zeroLike(b1),vb1=zeroLike(b1),mW2=zeroLike(W2),vW2=zeroLike(W2),mb2=zeroLike(b2),vb2=zeroLike(b2);
const lr=0.003, l2=2e-4, B1=0.9, B2=0.999; let step=0;
function evalSet(set){ const ae=[0,0,0]; for(const d of set){ const {o}=fwd(d.z); for(let k=0;k<O;k++) ae[k]+=Math.abs(o[k]-d.y[k]); } return ae.map(a=>a/set.length); }
let best={loss:1e9}; const BS=64;
for(let ep=0; ep<120; ep++){
  tr.sort(()=>rnd()-0.5);
  for(let bs=0; bs<tr.length; bs+=BS){
    const gW1=zeroLike(W1), gb1=zeroLike(b1), gW2=zeroLike(W2), gb2=zeroLike(b2); const batch=tr.slice(bs,bs+BS);
    for(const d of batch){ const {h,o}=fwd(d.z); const dout=o.map((v,k)=>v-d.y[k]);
      const dh=new Array(H).fill(0);
      for(let k=0;k<O;k++){ gb2[k]+=dout[k]; for(let i=0;i<H;i++){ gW2[k][i]+=dout[k]*h[i]; dh[i]+=dout[k]*W2[k][i]; } }
      for(let i=0;i<H;i++){ const g=dh[i]*(1-h[i]*h[i]); gb1[i]+=g; const row=gW1[i]; for(let j=0;j<D;j++) row[j]+=g*d.z[j]; } }
    step++; const n=batch.length;
    const upd=(P,G,M,V,decay)=>{ for(let i=0;i<P.length;i++){ if(Array.isArray(P[i])){ for(let j=0;j<P[i].length;j++){ const g=G[i][j]/n+decay*P[i][j]; M[i][j]=B1*M[i][j]+(1-B1)*g; V[i][j]=B2*V[i][j]+(1-B2)*g*g; P[i][j]-=lr*(M[i][j]/(1-B1**step))/(Math.sqrt(V[i][j]/(1-B2**step))+1e-8);} } else { const g=G[i]/n; M[i]=B1*M[i]+(1-B1)*g; V[i]=B2*V[i]+(1-B2)*g*g; P[i]-=lr*(M[i]/(1-B1**step))/(Math.sqrt(V[i]/(1-B2**step))+1e-8);} } };
    upd(W1,gW1,mW1,vW1,l2); upd(b1,gb1,mb1,vb1,0); upd(W2,gW2,mW2,vW2,l2); upd(b2,gb2,mb2,vb2,0);
  }
  const ve=evalSet(va); const loss=ve[0]*2+ve[1]+ve[2];
  if(loss<best.loss){ best={loss,ep,ve,W1:JSON.parse(JSON.stringify(W1)),b1:[...b1],W2:JSON.parse(JSON.stringify(W2)),b2:[...b2]}; }
}
const r4=a=>a.map(x=>Array.isArray(x)?x.map(v=>+v.toFixed(4)):+x.toFixed(4));
W1=best.W1;b1=best.b1;W2=best.W2;b2=best.b2;
const cv=(sel)=>{const s=va.filter(sel); return evalSet(s).map(v=>(v*100).toFixed(2)+'pp').join(' / ');};
console.log(`n=${data.length} H=${H} best epoch ${best.ep}`);
console.log(`val MAE win/gw/gl  all: ${cv(()=>true)}  contact: ${cv(d=>d.contact)}  race: ${cv(d=>!d.contact)}`);
fs.writeFileSync('/tmp/mlp.json', JSON.stringify({mu:mu.map(v=>+v.toFixed(5)),sd:sd.map(v=>+v.toFixed(5)),W1:r4(W1),b1:r4(b1),W2:r4(W2),b2:r4(b2)}));
// cube agreement on validation (wildbg probs vs MLP probs)
let n=0,ag=0,agT=0,nT=0,big=0,cost=0;
for(const d of va){ if(d.y[0]<0.6||d.y[0]>0.97) continue; n++; const {o}=fwd(d.z);
  const A=E.cubeAnalysis({win:d.y[0],gw:d.y[1],gl:d.y[2]},'center'), Bn=E.cubeAnalysis({win:o[0],gw:Math.min(o[0],o[1]),gl:Math.min(1-o[0],o[2])},'center');
  if(A.shouldDouble===Bn.shouldDouble) ag++; if(A.shouldDouble||Bn.shouldDouble){nT++; if(A.takes===Bn.takes) agT++;}
  const e=E.cubeError(A,'doubler',Bn.shouldDouble?'double':'nodouble'); cost+=e; if(e>0.1) big++; }
console.log(`cube vs wildbg (val, 60-97%): double ${(ag/n*100).toFixed(1)}% · take ${(agT/nT*100).toFixed(1)}% · costly>0.10: ${(big/n*100).toFixed(1)}% · mean cost ${(cost/n).toFixed(3)} (n=${n})`);
