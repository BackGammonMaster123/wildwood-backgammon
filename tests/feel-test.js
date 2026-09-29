const {chromium}=require('playwright'); const fs=require('fs'); const SP=process.argv[2]||require('os').tmpdir();
let pass=0,fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);} else {fail++;console.log('  ✗ FAIL:',m);} };
(async()=>{
  const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>'+fs.readFileSync('backgammon.html','utf8')+'</body></html>';
  fs.writeFileSync(require('os').tmpdir()+'/page.html',html);
  const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1200,height:900}});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const E=s=>page.evaluate(x=>window.eval(x),s), W=ms=>page.waitForTimeout(ms);
  const waitFor=async(expr,ms=15000)=>{ const t0=Date.now(); while(Date.now()-t0<ms){ if(await E(expr)) return true; await W(40);} return false; };
  await page.goto('file://'+require('os').tmpdir()+'/page.html'); await W(300);
  console.log('Settings');
  ok(await E("state.prefs.speed")==='normal' && await page.$eval('#speedSel',e=>e.value)==='normal','animations on (Normal) by default');
  ok(await E("state.prefs.sound")===false && await E("state.prefs.autoForced")===true,'sound off, auto-play forced moves on by default');
  await page.click('#playChoice');
  // make sure White is on roll in a normal (non-forced) spot
  await waitFor("state.turn==='w'&&(state.phase==='await'||state.phase==='moving')");
  if(await E("state.phase")==='await'){ await page.click('#rollBtn'); await waitFor("state.phase==='moving'||state.phase==='ai'"); }
  if(await E("state.phase")==='moving'){ // White to move: play the coach's move to reach Black's turn
    await waitFor("!state.busy"); await E("(function(){const a=analyze(state.turnStart,'w',state.rolled); if(a.moves.length&&!state.played.length) playSteps(a.moves[0].steps.slice());})()"); }
  console.log("Black's turn is animated and stays visible");
  await waitFor("state.phase==='ai'");
  let sawFly=false, sawTumble=false; const t0=Date.now();
  while(Date.now()-t0<8000){ const st=await E("({fly:document.querySelectorAll('.flychk').length,tb:!!state.tumbling,ph:state.phase})");
    if(st.fly) sawFly=true; if(st.tb) sawTumble=true; if(st.fly&&!fs.existsSync(SP+'/bot-midflight.png')) await page.screenshot({path:SP+'/bot-midflight.png'});
    if(st.ph==='await') break; await W(25); }
  ok(sawTumble,'Black\'s dice tumble'); ok(sawFly,'Black\'s checkers fly across the board (seen mid-animation)');
  ok(await waitFor("state.phase==='await'&&state.turn==='w'"),'control returns to you');
  const dots=await E("document.querySelectorAll('.chk.lm').length+document.querySelectorAll('.lmghost').length"), stat=await E("document.getElementById('status').textContent");
  ok(dots>=2,`last-move markers on the board (${dots})`); ok(/Black played \d-\d: /.test(stat),`status: "${stat.slice(0,60)}…"`);
  ok(await page.isVisible('#replayBtn'),'"Replay last move" button visible');
  await page.screenshot({path:SP+'/after-bot.png'});
  const k0=await E("boardKey(state.board)");
  await page.click('#replayBtn'); await W(150);
  ok(await E("state.busy")===true && await page.isDisabled('#rollBtn'),'replay running: Roll disabled meanwhile');
  ok(await waitFor("!state.busy",8000) && await E("boardKey(state.board)")===k0,'replay finishes and restores the current position');
  console.log('Your turn: dice, drag-and-drop, click-to-move');
  await page.click('#rollBtn'); await W(60);
  ok(await E("state.phase")==='rolling' || await E("state.phase")==='moving','roll → dice tumble');
  await waitFor("state.phase==='moving'||state.phase==='ai'||state.phase==='await'");
  if(await E("state.phase")==='moving' && await E("nextSteps().length")>0){
    const plan=await E(`(function(){ const ns=nextSteps(); for(const s of ns){ const from=s.from; const d=destinationsFrom(state.turnStart,'w',state.legalTurns,state.played,from);
      const k=[...d.keys()].find(k=>d.get(k).steps.length===1); if(!k) continue;
      const sc=topChecker(zoneElFor('w',from)).getBoundingClientRect(); const dz=zoneElFor('w',k==='off'?'off':parseInt(k,10)).getBoundingClientRect();
      return {from, to:k, sx:sc.left+sc.width/2, sy:sc.top+sc.height/2, dx:dz.left+dz.width/2, dy:dz.top+dz.height/2}; } return null; })()`);
    if(plan){ const before=await E("state.played.length");
      await page.mouse.move(plan.sx,plan.sy); await page.mouse.down(); await page.mouse.move(plan.sx+10,plan.sy+10,{steps:3});
      ok(await E("document.querySelectorAll('.flychk.dragging').length")===1,'dragging shows a checker under the pointer');
      await page.mouse.move(plan.dx,plan.dy,{steps:8}); await page.screenshot({path:SP+'/dragging.png'}); await page.mouse.up(); await W(120);
      const pl=await E("state.played.map(s=>s.from+'>'+s.to)");
      ok(pl.length===before+1 && pl[before]===`${plan.from}>${plan.to}`,`drag ${plan.from}→${plan.to} plays that move`);
      ok(await E("document.querySelectorAll('.flychk').length")===0,'no stray drag ghost left behind'); }
    // finish the turn by clicking (animated)
    let guard=0; while(await E("state.phase==='moving'&&state.turn==='w'") && guard++<6){
      const c=await E(`(function(){ const ns=nextSteps(); if(!ns.length) return null; const s=ns[0]; const a=zoneElFor('w',s.from).getBoundingClientRect(); return {x:a.left+a.width/2,y:a.top+a.height/2,to:s.to}; })()`);
      if(!c) break; await page.mouse.click(c.x,c.y); await W(60);
      const d=await E(`(function(){ if(!state.dmap) return null; const k=[...state.dmap.keys()][0]; const z=zoneElFor('w',k==='off'?'off':parseInt(k,10)).getBoundingClientRect(); return {x:z.left+z.width/2,y:z.top+z.height/2}; })()`);
      if(!d) break; await page.mouse.click(d.x,d.y); await W(40);
      if(guard===1) ok(await E("document.querySelectorAll('.flychk').length")>=1 || await E("state.played.length")>0,'click-to-move animates the checker');
      await waitFor("!state.busy",3000); }
    ok(await waitFor("state.turn==='b'||state.phase==='over'",4000),'turn completes and passes to Black');
  }
  console.log('Forced move auto-play');
  await waitFor("state.phase==='await'&&state.turn==='w'",20000);
  const forced=await E(`(function(){ const b={points:new Array(25).fill(0),bar:{w:0,b:0},off:{w:13,b:0}}; b.points[2]=1; b.points[1]=1; b.points[20]=-15;
    state.board=b; state.turn='w'; state.phase='await'; render(); beginHumanTurn([6,5]); return state.legalTurns.length; })()`);
  ok(/only one way to play it/.test(await E("document.getElementById('status').textContent")),'forced roll announced');
  ok(await waitFor("state.phase==='over'",5000),'forced bear-off played automatically (game won)');
  console.log('A full game at Fast speed through the real UI');
  await page.selectOption('#speedSel','fast'); ok(await E("state.prefs.speed")==='fast','speed set to Fast');
  await page.click('#bannerNew'); const g0=Date.now(); let done=false;
  while(Date.now()-g0<240000){ await W(30);
    const st=await E("({ph:state.phase,t:state.turn,busy:state.busy,ov:document.getElementById('cubeOverlay').classList.contains('show')})");
    if(st.ov){ await page.click('#takeBtn'); continue; } if(st.ph==='over'){ done=true; break; } if(st.busy) continue;
    if(st.ph==='await'&&st.t==='w'){ await page.click('#rollBtn'); continue; }
    if(st.ph==='moving'&&st.t==='w'){ await E("(function(){ if(state.busy||state.played.length) return; const a=analyze(state.turnStart,'w',state.rolled); if(a.moves.length) playSteps(a.moves[0].steps.slice()); })()"); } }
  ok(done,`full game finished with animations on (${Math.round((Date.now()-g0)/1000)}s)`);
  ok(await E("state.lastRec && state.lastRec.turns.length>10"),'game recorded for review as usual');
  console.log('page errors:', errs.length?errs.join(' | '):'(none)'); if(errs.length) fail++;
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail?1:0);
})();
