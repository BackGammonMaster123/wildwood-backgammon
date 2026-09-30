// Cloud sync against a stand-in for Firebase (Auth REST + Realtime Database REST), with two
// simulated devices sharing one account. Checks sign-in from the email link, merging, deletions,
// conflicts, rating changes made on both devices, safe encoding, errors and sign-out.
const fs = require('fs'); const { JSDOM } = require('jsdom');
const html = fs.readFileSync('backgammon.html', 'utf8');
const doc = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '\n</body></html>';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake Firebase ----
const FB = { users: {}, codes: {}, tokens: {}, db: {}, n: 0, offline: false, sent: [] };
function resp(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) }; }
function issue(uid, email) { const t = 'tok' + (++FB.n); FB.tokens[t] = uid; return { idToken: t, refreshToken: 'ref-' + uid, localId: uid, email, expiresIn: '3600' }; }
function getPath(p) { let o = FB.db; for (const k of p) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; }
function setPath(p, v) { let o = FB.db; for (let i = 0; i < p.length - 1; i++) { if (typeof o[p[i]] !== 'object' || o[p[i]] === null) o[p[i]] = {}; o = o[p[i]]; }
  if (v === null) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = v; }
async function fakeFetch(url, opt = {}) {
  if (FB.offline) throw new TypeError('Failed to fetch');
  const u = new URL(url), body = opt.body ? (/json/.test((opt.headers || {})['Content-Type']) ? JSON.parse(opt.body) : Object.fromEntries(new URLSearchParams(opt.body))) : null;
  if (u.host === 'identitytoolkit.googleapis.com') {
    if (u.pathname.endsWith('accounts:sendOobCode')) { const code = 'code' + (++FB.n); FB.codes[code] = body.email; FB.sent.push({ email: body.email, code, continueUrl: body.continueUrl }); return resp(200, { email: body.email }); }
    if (u.pathname.endsWith('accounts:signInWithEmailLink')) { const e = FB.codes[body.oobCode];
      if (!e || e !== body.email) return resp(400, { error: { message: 'INVALID_OOB_CODE' } }); delete FB.codes[body.oobCode];
      FB.users[e] = FB.users[e] || 'uid' + Object.keys(FB.users).length; return resp(200, issue(FB.users[e], e)); }
  }
  if (u.host === 'securetoken.googleapis.com') { const uid = body.refresh_token.replace('ref-', ''); const j = issue(uid);
    return resp(200, { id_token: j.idToken, refresh_token: j.refreshToken, user_id: uid, expires_in: '3600' }); }
  if (u.host.endsWith('firebasedatabase.app')) {
    const uid = FB.tokens[u.searchParams.get('auth')], path = u.pathname.replace(/^\/|\.json$/g, '').split('/');
    if (!uid || path[0] !== 'users' || path[1] !== uid) return resp(401, { error: 'Permission denied' });   // the rules
    if (opt.method === 'GET') return resp(200, getPath(path));
    if (opt.method === 'PATCH') { for (const [k, v] of Object.entries(body)) { if (v !== null && typeof v !== 'string') return resp(400, { error: 'non-string record' }); setPath([...path, ...k.split('/')], v); } return resp(200, body); }
  }
  return resp(404, {});
}
// ---- devices ----
function device(url, storage = {}, allowed = true) {
  const dom = new JSDOM(doc, { runScripts: 'dangerously', pretendToBeVisual: true, url,
    beforeParse(w) { w.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.requestAnimationFrame = (cb) => setTimeout(cb, 0); w.confirm = () => true; w.fetch = fakeFetch; if (allowed) w.WWBG_CLOUD_TEST = true;
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v); } });
  const w = dom.window;
  return { w, E: (s) => w.eval(s), el: (id) => w.document.getElementById(id), storage() { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; } };
}
const addMistake = (d, id, ts) => d.E(`mistakes.push({id:'${id}',ts:${ts},type:'move',by:'w',mode:'vsai',board:startingBoard(),dice:[3,1],bestSteps:[],playedLabel:'x',loss:0.1}); saveMistakes(mistakes);`);
const ids = (d) => d.E('mistakes.map(m=>m.id).sort().join(",")');
async function settle(d) { for (let i = 0; i < 100; i++) { await wait(20); if (!d.E('CLOUD.busy') && !d.E('CLOUD.timer&&0')) { await wait(80); if (!d.E('CLOUD.busy')) return; } } }

(async () => {
  console.log('A. Signing in on device A (link opened on the same device)');
  let A = device('https://a.test/app/'); await wait(300);
  ok(!A.el('syncCard').hidden && /Email me a link/.test(A.el('syncBody').textContent), 'sync card offers the email sign-in');
  addMistake(A, 'mA1', 1000); addMistake(A, 'mA2', 2000);
  A.E(`hist.games.push({ts:3000,v:2,mode:'vsai',matchTo:0,player:'w',name:'You',n:10,loss:0.2,cN:0,cLoss:0,cont:{n:10,loss:0.2},race:{n:0,loss:0},won:true,pts:1}); saveHist(); rateResult('medium',1,true);`);
  A.el('syncEmail').value = 'me@example.com'; A.el('syncSend').click(); await wait(50);
  ok(FB.sent.length === 1 && FB.sent[0].continueUrl === 'https://a.test/app/' && /emailed a sign-in link/.test(A.el('syncBody').textContent), 'link requested; card says to check email');
  A = device('https://a.test/app/?mode=signIn&oobCode=' + FB.sent[0].code + '&apiKey=k&lang=en', A.storage()); await wait(300); await settle(A);
  ok(A.E('!!CLOUD.session') && A.E('location.search') === '' && /Signed in as me@example.com/.test(A.el('syncBody').textContent), 'link signs in, clears the URL, card shows the account');
  const uid = FB.users['me@example.com'], U = () => FB.db.users[uid];
  ok(U() && Object.keys(U().m).length === 2 && Object.keys(U().hg).length === 1 && Object.keys(U().rl).length === 1 && JSON.parse(U().rs).r === 1710, 'first sync uploads mistakes, history, rating');
  ok(typeof U().m.mA1 === 'string', 'records are stored as JSON text (so empty arrays survive)');

  console.log('B. Device B: its own data, link opened without the email stored');
  const B = device('https://b.test/app/'); await wait(300); addMistake(B, 'mB1', 1500);
  B.el('syncEmail').value = 'me@example.com'; B.el('syncSend').click(); await wait(50);
  const B2 = device('https://b.test/app/?mode=signIn&oobCode=' + FB.sent[1].code, { ...B.storage(), 'wwbg-cloud-email': '' }); await wait(300);
  ok(/Confirm your email/.test(B2.el('syncBody').textContent), 'asks to confirm the email when the link is opened elsewhere');
  B2.el('syncEmail').value = 'me@example.com'; B2.el('syncConfirm').click(); await wait(100); await settle(B2);
  ok(ids(B2) === 'mA1,mA2,mB1' && B2.E('hist.games.length') === 1 && B2.E('rating.r') === 1710, 'B now has A\'s data plus its own');
  await A.E('cloudSync()'); await settle(A);
  ok(ids(A) === 'mA1,mA2,mB1', 'A picks up B\'s mistake');

  console.log('C. Deletion and conflicts');
  A.el('clearBtn') && A.E("openLearn()"); A.el('clearBtn').click(); await wait(150); await settle(A);
  ok(Object.keys(U().m || {}).length === 0, 'clearing mistakes on A removes them from the cloud');
  addMistake(B2, 'mB2', 5000); B2.E('CLOUD.delay=1e9; clearTimeout(CLOUD.timer)');   // made on B before B hears of the clear
  await B2.E('cloudSync()'); await settle(B2);
  ok(ids(B2) === 'mB2', 'B drops the cleared mistakes but keeps the one it added since');
  await A.E('cloudSync()'); await settle(A); A.E('CLOUD.delay=1e9; clearTimeout(CLOUD.timer)');
  A.E(`mistakes[0].sr={box:1,due:0,seen:1,right:1,wrong:0,last:6000}; saveMistakes(mistakes)`);
  B2.E(`mistakes[0].sr={box:0,due:0,seen:1,right:0,wrong:1,last:7000}; saveMistakes(mistakes)`);
  await A.E('cloudSync()'); await B2.E('cloudSync()'); await A.E('cloudSync()');
  ok(A.E('mistakes[0].sr.last') === 7000 && B2.E('mistakes[0].sr.last') === 7000, 'both edited the same quiz item: the later answer wins on both');

  console.log('D. Rated games on both devices before syncing');
  const r0 = A.E('rating.r'), e0 = A.E('rating.exp');
  const dA = A.E("rateResult('medium',1,true)"), dB = B2.E("rateResult('strong',3,false)");
  await A.E('cloudSync()'); await B2.E('cloudSync()'); await A.E('cloudSync()');
  const want = r0 + dA + dB;
  ok(Math.abs(A.E('rating.r') - want) < 1e-9 && Math.abs(B2.E('rating.r') - want) < 1e-9 && A.E('rating.exp') === e0 + 4 && B2.E('rating.exp') === e0 + 4,
    `both devices end at ${want.toFixed(1)} (${r0} ${dA >= 0 ? '+' : ''}${dA.toFixed(1)} ${dB.toFixed(1)}), experience +4`);
  ok(A.E('rating.log.length') === B2.E('rating.log.length'), 'rating logs match');

  console.log('E. Game records with empty lists');
  A.E(`gameRecs.push({id:'g1',ts:9000,mode:'vsai',names:{w:'You',b:'Black'},humans:{w:true,b:false},turns:[{t:'move',p:'w',board:startingBoard(),dice:[6,6],steps:[]}],result:{winner:'w',kind:'single',pts:1}}); saveGames();`);
  await A.E('cloudSync()'); await B2.E('cloudSync()');
  ok(B2.E("(gameRecs.find(g=>g.id==='g1')||{turns:[{}]}).turns[0].steps.length") === 0, 'a turn with no move (empty steps) arrives intact');

  console.log('F. Errors, sign-out, where the card shows');
  FB.offline = true; const before = ids(A); await A.E('cloudSync()');
  ok(/connection|Sync failed|reach/i.test(A.el('syncBody').textContent) && ids(A) === before, 'offline: the card shows an error and local data is untouched');
  FB.offline = false; await A.E('cloudSync()');
  ok(!A.el('syncBody').querySelector('.sc-err'), 'back online: the error clears');
  A.el('syncOut').click(); await wait(20);
  ok(!A.E('CLOUD.session') && /Email me a link/.test(A.el('syncBody').textContent) && ids(A) === before, 'sign-out keeps the data on the device');
  const C = device('https://claude.example/app/', {}, false); await wait(300);
  ok(C.el('syncCard').hidden, 'the card stays hidden where sync isn\'t available (the Claude artifact)');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
