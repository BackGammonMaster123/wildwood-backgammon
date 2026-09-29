const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('backgammon.html','utf8');
const doc='<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'\n</body></html>';
const errs=[];
const dom=new JSDOM(doc,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://ex.com',
  beforeParse(w){
    w.matchMedia=(q)=>({matches:/reduce/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
    w.requestAnimationFrame=cb=>setTimeout(cb,0); w.confirm=()=>true;
    w.addEventListener('unhandledrejection',e=>errs.push('unhandledrejection: '+(e.reason&&e.reason.stack||e.reason)));
    w.onerror=(m,s,l,c,e)=>errs.push('onerror: '+(e&&e.stack||m));
  }});
const win=dom.window;
setTimeout(async()=>{
  const E=s=>win.eval(s); const D=win.document;
  // set up match state directly (no newGame/opening)
  E(`
    state.screen='match'; state.mode='vsai'; state.coach=true;
    document.getElementById('menu').hidden=true; document.getElementById('app').hidden=false;
    const b={points:new Array(25).fill(0),bar:{w:0,b:1},off:{w:0,b:0}};
    for(let i=1;i<=6;i++) b.points[i]=2;
    b.points[13]=3; b.points[24]=-14;
    state.board=cloneBoard(b);
  `);
  console.log('black dances vs closed board:', E("analyze(state.board,'b',[3,5]).moves.length"));
  E('aiTurn();');
  await new Promise(r=>setTimeout(r,2500));
  console.log('--- after black dance via aiTurn ---');
  console.log('phase:', E('state.phase'), '| turn:', E('state.turn'));
  console.log('rollBtn disabled?', D.getElementById('rollBtn').disabled, '| label:', D.getElementById('rollBtn').textContent);
  console.log('status:', D.getElementById('status').textContent);
  console.log('errors:', errs.length?('\n'+errs.join('\n')):'(none)');
  process.exit(0);
},400);
