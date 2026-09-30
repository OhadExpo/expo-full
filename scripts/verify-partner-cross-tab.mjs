// verify-partner-cross-tab.mjs - the sandbox follows WHO IS SIGNED IN, in every tab (1.10 audit S1).
//
// One browser, two tabs (shared localStorage, like Ohad's laptop during a demo):
// tab A signs in as the partner (sandbox), then tab B signs in as the owner.
// auth-js tells tab A over a BroadcastChannel without writing storage in A, so
// a flag set only on setItem stayed ON: the owner's UI in tab A read and wrote
// the sandbox. Now tab A's next queries must go to the REAL tables.
// HONEST LIMIT (1.10): the old build ALSO passes this sequence - auth-js in tab A
// re-saves the session when tab B signs in, which moved the old flag too. So it is
// a REGRESSION check, not proof of the broadcast-only path the audit described;
// the per-query flag in supabase.js removes that path by construction.
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
  const B = await ctx.newPage(); await B.setViewport({ width: 1366, height: 900 });
  // tab B drops the LOCAL session copy only (no server call: the app's own sign-out is
  // GLOBAL and would sign the real partner out on every device), then signs in as the owner
  await B.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await wait(1500);
  await B.evaluate(() => { for (const k of Object.keys(localStorage)) if (/-auth-token$/.test(k)) localStorage.removeItem(k); document.cookie.split(';').forEach((c) => { const n = c.split('=')[0].trim(); if (n) document.cookie = n + '=; Max-Age=0; Path=/'; }); });
  await signInAs(B, 'ohadyproductions@gmail.com');
  ok(await B.evaluate(() => window.__expoSandbox === false), 'tab B (owner) is NOT the sandbox');
  // tab A: record every REST call from here on, then move to another view in-app
  const hits = [];
  A.on('request', (rq) => { const m = rq.url().match(/\/rest\/v1\/([a-z_0-9]+)/); if (m) hits.push(m[1]); });
  await A.bringToFront(); await wait(4000);
  await A.evaluate(() => { const l = [...document.querySelectorAll('a, button, [role="button"]')].find((e) => /^\s*(ATHLETES|מתאמנים)\b/i.test(e.textContent || '')); if (l) l.click(); });
  await wait(6000);
  await A.goto(BASE + '/coach/programs', { waitUntil: 'domcontentloaded' }); await wait(7000);
  const sbx = hits.filter((t) => t.startsWith('sbx_')), real = hits.filter((t) => !t.startsWith('sbx_'));
  ok(await A.evaluate(() => window.__expoSandbox === false), 'tab A now follows the owner (sandbox flag off)');
  ok(real.length > 0 && sbx.length === 0, `tab A's queries after the owner signed in: ${real.length} real, ${sbx.length} sandbox`);
} catch (e) { fail++; console.log('FAIL: ' + e.message); }
finally { await ctx.close(); b.disconnect(); }
console.log(`PARTNER CROSS-TAB: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
