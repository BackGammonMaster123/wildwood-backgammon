const {chromium}=require('playwright'); const fs=require('fs');
const SP=process.argv[2];
(async()=>{
  const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>'+fs.readFileSync('backgammon.html','utf8')+'</body></html>';
  fs.writeFileSync('/tmp/page.html',html);
  const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1200,height:900},reducedMotion:'reduce',deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file:///tmp/page.html'); await page.waitForTimeout(400);
  await page.locator('#boardPick').screenshot({path:SP+'/picker.png'});
  await page.click('#playChoice'); await page.waitForTimeout(800);
  // a middle-game position with stacks, a checker on the bar and some borne off
  await page.evaluate(()=>window.eval(`state.gameId++;const b=startingBoard();b.points.fill(0);
    Object.assign(b.points,{1:-2,3:2,4:3,5:2,6:4,8:2,12:-3,13:1,17:-3,19:-4,20:-2,22:1,24:-1});b.bar={w:0,b:0};b.off={w:0,b:0};
    b.bar.b=0;b.off.w=0;b.off.b=0;state.board=b;state.turn='w';state.phase='await';render();`));
  for(const id of ['classic','leather','club','marble','midnight']){
    await page.selectOption('#boardSel',id); await page.waitForTimeout(150);
    await page.locator('#board').screenshot({path:SP+'/board-'+id+'.png'});
  }
  console.log('stored:',await page.evaluate(()=>localStorage.getItem('wwbg-prefs')));
  console.log('page errors:', errs.length?errs.join(' | '):'(none)');
  await browser.close();
})();
