// Live check of the Firebase project against firebase/database.rules.json. Creates a throwaway
// email/password user, checks it can write and read its own /users/<uid> (as sync does), that it
// can't read someone else's data or write unknown keys, then deletes the user and its data.
//   node tools/firebase-smoke.js      (behind a proxy: NODE_USE_ENV_PROXY=1 node tools/firebase-smoke.js)
const API_KEY = 'AIzaSyC2Ziw4Jtdm-isG8Qfw_QeTE_uWwJIptc0';
const DB = 'https://wildwood-backgammon-default-rtdb.europe-west1.firebasedatabase.app';
const idt = async (path, body) => { const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; };
const db = async (method, path, tok, body) => { const r = await fetch(`${DB}/${path}.json?auth=${tok}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
(async () => {
  const email = `smoke-${Date.now()}@example.com`;
  const su = await idt('accounts:signUp', { email, password: 'Smoke-' + Math.random().toString(36).slice(2) + '!9', returnSecureToken: true });
  if (su.status !== 200) { console.log('could not create the test user:', su.j.error && su.j.error.message); process.exit(1); }
  const { idToken: tok, localId: uid } = su.j;
  try {
    const w = await db('PATCH', `users/${uid}`, tok, { 'm/t1': JSON.stringify({ id: 't1', steps: [] }), rs: JSON.stringify({ r: 1500, exp: 1 }) });
    ok(w.status === 200, `can write own data (${w.status})`);
    const r = await db('GET', `users/${uid}`, tok);
    ok(r.status === 200 && r.j && JSON.parse(r.j.m.t1).steps.length === 0, 'can read it back intact');
    const other = await db('GET', 'users/someone-else', tok);
    ok(other.status === 401 || other.status === 403, `cannot read another user's data (${other.status})`);
    const root = await db('GET', '', tok);
    ok(root.status === 401 || root.status === 403, `cannot read the whole database (${root.status})`);
    const bad = await db('PATCH', `users/${uid}`, tok, { junk: 'x' });
    ok(bad.status !== 200, `cannot write unknown keys (${bad.status})`);
    const bad2 = await db('PATCH', `users/${uid}`, tok, { 'm/t2': { not: 'a string' } });
    ok(bad2.status !== 200, `records must be text (${bad2.status})`);
    const anon = await idt('accounts:signUp', { returnSecureToken: true });
    if (anon.status === 200) { const a = await db('PATCH', `users/${anon.j.localId}`, anon.j.idToken, { rs: '{}' });
      ok(a.status === 401 || a.status === 403, `anonymous (guest) users cannot store sync data (${a.status})`);
      await idt('accounts:delete', { idToken: anon.j.idToken }); }
    else console.log('  (anonymous sign-in is off: skipped the guest check)');
  } finally {
    await db('DELETE', `users/${uid}`, tok); const del = await idt('accounts:delete', { idToken: tok });
    console.log(`  cleanup: test user ${del.status === 200 ? 'deleted' : 'NOT deleted (' + del.status + ')'}`);
  }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
