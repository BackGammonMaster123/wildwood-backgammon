const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('backgammon.html','utf8');
const doc='<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'\n</body></html>';
const dom=new JSDOM(doc,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://ex.com',
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});w.requestAnimationFrame=cb=>setTimeout(cb,0);w.confirm=()=>true;}});
const win=dom.window;
setTimeout(()=>{
  const E=s=>win.eval(s); const D=win.document;
  console.log('storageOK:',E('storageOK'),'| threshold:',E('state.threshold'),'| sensSel:',D.getElementById('sensSel').value);
  D.getElementById('playChoice').click();
  console.log('play -> app shown:', !D.getElementById('app').hidden, '| logged label:', D.getElementById('loggedCount').textContent);
  E(`const s=startingBoard(); const dc=[6,1]; const a=analyze(s,'w',dc);
    let pick=a.moves[0],bestGap=1e9; for(const m of a.moves){const l=a.moves[0].equity-m.equity; if(l>=0.15&&Math.abs(l-0.20)<bestGap){bestGap=Math.abs(l-0.20);pick=m;}}
    state.screen='match';state.mode='vsai';state.turn='w';state.coach=true;
    state.turnStart=cloneBoard(s);state.rolled=dc.slice();state.board=pick.board;state.played=pick.steps;window.__loss=a.moves[0].equity-pick.equity;`);
  console.log('forced moderate loss:', E('window.__loss').toFixed(3));
  E("state.phase='moving';finishHumanTurn();");
  console.log('after finish -> mistakes:', E('mistakes.length'), '| loggedCount:', D.getElementById('loggedCount').textContent);
  console.log('verdict:', D.getElementById('verdictWrap').textContent.slice(0,80));
  D.getElementById('sensSel').value='0.2'; D.getElementById('sensSel').dispatchEvent(new win.Event('change'));
  E(`state.turnStart=cloneBoard(startingBoard());state.rolled=[6,1];
     const a=analyze(state.turnStart,'w',[6,1]);let pick=a.moves[0],bestGap=1e9;
     for(const m of a.moves){const l=a.moves[0].equity-m.equity; if(l>=0.08&&l<0.20&&Math.abs(l-0.12)<bestGap){bestGap=Math.abs(l-0.12);pick=m;}}
     state.board=pick.board;state.played=pick.steps;window.__loss2=a.moves[0].equity-pick.equity;`);
  const before=E('mistakes.length'); E("state.phase='moving';finishHumanTurn();");
  const wrong=E('mistakes.length')>before||E('state.threshold')!==0.2;
  console.log('threshold 0.20, loss',E('window.__loss2').toFixed(3),'-> logged?', wrong ? 'YES (should be no)':'no (correct)');
  if(wrong) process.exit(1);
  console.log('final localStorage bytes:', E(`(localStorage.getItem('wwbg-mistakes-v1')||'').length`));
  process.exit(0);
},400);
