// verify-partner-cross-tab.mjs - the sandbox follows WHO IS SIGNED IN, in every tab (1.10 audit S1).
//
// One browser, two tabs (shared localStorage, like Ohad's laptop during a demo):
// tab A signs in as the partner (sandbox), then tab B signs in as the owner.
// auth-js tells tab A over a BroadcastChannel without writing storage in A, so
// a flag set only on setItem stayed ON: the owner's UI in tab A read and wrote
// the sandbox. Now tab A's next queries must go to the REAL tables.
// (1.10 triple audit) The seat change must also RELOAD tab A: following the store
// alone wrote tab A's stale state into the new seat's tables. The reload check
// below is what the old builds fail.
// (1.10 audit C) Every check is measured before this gate navigates tab A itself -
// an earlier version ended with a goto that reloaded the tab, so it passed on any
// build. Break-tested 1.10: the build before the seat guard (dist-499) fails 3 of
// 6; the build that only reloaded on its NEXT query failed the reload check too.
// Read-only (it only navigates). Headless Chrome, a throwaway context.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5271 node scripts/verify-partner-cross-tab.mjs
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5271';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, w) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + w); };
const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const signInAs = async (pg, email) => {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await wait(3000);
  await pg.evaluate(({ email }) => {
    const ins = [...document.querySelectorAll('input')];
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
    if (e) set(e, email); if (p) set(p, '1234');
  }, { email });
  await wait(300);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
  await wait(8000);
};
try {
  const A = await ctx.newPage(); await A.setViewport({ width: 1366, height: 900 });
  await A.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); } catch (e) {} });
  await signInAs(A, 'eladeluz24@gmail.com');
  await A.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' }); await wait(6000);
  ok(await A.evaluate(() => window.__expoSandbox === true), 'tab A (partner) is the sandbox');
  // a mark that only survives if tab A is NOT reloaded
  await A.evaluate(() => { window.__tabMark = 'before'; });
  // tab A is watched from BEFORE tab B exists: the reload now comes the moment B writes the session
  // (a 'storage' event), during B's sign-in - a listener added after it saw nothing, and the fresh
  // owner page's own writes were then counted as stale ones
  const hits = [], writesA = []; let reloaded = false;
  A.on('framenavigated', (f) => { if (f === A.mainFrame()) reloaded = true; });
  A.on('request', (rq) => {
    const m = rq.url().match(/\/rest\/v1\/([a-z_0-9]+)/); if (!m) return;
    if (reloaded) hits.push(m[1]);
    else if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(rq.method())) writesA.push(rq.method() + ' ' + m[1]);
  });
  const B = await ctx.newPage(); await B.setViewport({ width: 1366, height: 900 });
  // tab B drops the LOCAL session copy only (no server call: the app's own sign-out is
  // GLOBAL and would sign the real partner out on every device), then signs in as the owner
  await B.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await wait(1500);
  await B.evaluate(() => { for (const k of Object.keys(localStorage)) if (/-auth-token$/.test(k)) localStorage.removeItem(k); document.cookie.split(';').forEach((c) => { const n = c.split('=')[0].trim(); if (n) document.cookie = n + '=; Max-Age=0; Path=/'; }); });
  await signInAs(B, 'ohadyproductions@gmail.com');
  ok(await B.evaluate(() => window.__expoSandbox === false), 'tab B (owner) is NOT the sandbox');
  // tab A: move to another view in-app (no navigation by this gate)
  await A.bringToFront(); await wait(4000);
  await A.evaluate(() => { const l = [...document.querySelectorAll('a, button, [role="button"]')].find((e) => /^\s*(ATHLETES|מתאמנים)\b/i.test(e.textContent || '')); if (l) l.click(); });
  await wait(8000);
  // EVERYTHING below is measured before this gate navigates tab A itself (audit C M5: a final goto
  // reloaded the tab, so the mark vanished and the queries were the fresh page's - on any build)
  const sbx = hits.filter((t) => t.startsWith('sbx_')), real = hits.filter((t) => !t.startsWith('sbx_'));
  ok(reloaded && await A.evaluate(() => window.__tabMark !== 'before'), 'tab A RELOADED by itself when someone else signed in (its old state cannot be written anywhere)');
  ok(await A.evaluate(() => window.__expoSandbox === false), 'tab A now follows the owner (sandbox flag off)');
  // no write left tab A for a REAL table before it reloaded (the stale-state overwrite the audit found)
  ok(!writesA.some((w) => !/sbx_|__seat_changed/.test(w)), `no real-table write from the old tab (${writesA.length} write(s): ${writesA.join(', ') || 'none'})`);
  ok(real.length > 0 && sbx.length === 0, `tab A's queries after its reload: ${real.length} real, ${sbx.length} sandbox`);
} catch (e) { fail++; console.log('FAIL: ' + e.message); }
finally { await ctx.close(); b.disconnect(); }
console.log(`PARTNER CROSS-TAB: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
