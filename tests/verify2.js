const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('backgammon.html','utf8');
const doc='<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'\n</body></html>';
const dom=new JSDOM(doc,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://ex.com',
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});w.requestAnimationFrame=cb=>setTimeout(cb,0);w.confirm=()=>true;}});
const win=dom.window;
setTimeout(()=>{
  const E=s=>win.eval(s); const D=win.document;
  // start hotseat, set names
  D.getElementById('hotseatChoice').click();
  D.getElementById('nameW').value='Alice'; D.getElementById('nameW').dispatchEvent(new win.Event('input'));
  D.getElementById('nameB').value='Bob'; D.getElementById('nameB').dispatchEvent(new win.Event('input'));
  console.log('labels:', D.getElementById('whoW').textContent, '/', D.getElementById('whoB').textContent);
  console.log('roll btn:', D.getElementById('rollBtn').textContent, '| eyebrow:', D.getElementById('turnEyebrow').textContent);
  // force a BLACK mistake in hotseat
  E(`(function(){
     const s=startingBoard(); const dc=[6,1]; const a=analyze(s,'b',dc);
     let pick=a.moves[0],g=1e9; for(const m of a.moves){const l=a.moves[0].equity-m.equity; if(l>=0.15&&Math.abs(l-0.2)<g){g=Math.abs(l-0.2);pick=m;}}
     state.mode='hotseat';state.screen='match';state.turn='b';state.coach=true;state.threshold=0.15;
     state.turnStart=cloneBoard(s);state.rolled=dc.slice();state.board=pick.board;state.played=pick.steps;
     window.__loss=a.moves[0].equity-pick.equity; state.phase='moving';finishHumanTurn();
   })();`);
  console.log('black mistake loss', E('window.__loss').toFixed(3), '-> logged total:', E('mistakes.length'),
     '| by:', E('mistakes[mistakes.length-1].by'), '| byName:', E('mistakes[mistakes.length-1].byName'));
  // now a WHITE (Alice) mistake too
  E(`(function(){
     const s=startingBoard(); const dc=[6,1]; const a=analyze(s,'w',dc);
     let pick=a.moves[0],g=1e9; for(const m of a.moves){const l=a.moves[0].equity-m.equity; if(l>=0.15&&Math.abs(l-0.2)<g){g=Math.abs(l-0.2);pick=m;}}
     state.turn='w';state.turnStart=cloneBoard(s);state.rolled=dc.slice();state.board=pick.board;state.played=pick.steps;
     state.phase='moving';finishHumanTurn();
   })();`);
  // open learn, check filter + items
  E('openLearn();');
  const items=[...D.querySelectorAll('#mlist .mitem')].map(x=>x.textContent.replace(/\s+/g,' ').trim().slice(0,42));
  console.log('learn items:', JSON.stringify(items,null,0));
  const fsel=D.getElementById('filterSel');
  console.log('filter hidden?', fsel.hidden, '| options:', [...fsel.options].map(o=>o.value).join(','));
  // filter to Bob
  fsel.value='Bob'; fsel.dispatchEvent(new win.Event('change'));
  console.log('after filter=Bob, items:', D.querySelectorAll('#mlist .mitem').length);
  // click a mistake -> detail names present
  D.querySelector('#mlist .mitem').click();
  console.log('detail eyebrow:', D.getElementById('learnDetail').querySelector('.eyebrow').textContent.slice(0,40));
  process.exit(0);
},400);
