// verify-signout-local.mjs - signing out on one device does not sign the
// account out everywhere (2.10 #510-R2 H3).
//
// Two isolated browser contexts = two devices, both signed in as the fixture
// athlete. Device A taps LOG OUT in the real portal. Device B must still be
// able to refresh its session. Before the fix the app's signOut() was scope
// GLOBAL and B's refresh token was revoked. Needs BASE (dev :5311 or a build).
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5311';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const EMAIL = process.env.FIXTURE_EMAIL || 'diego@diegoday.com';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const j = await (await fetch(`${CDP}/json/version`)).json();
const b = await P.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, defaultViewport: null, protocolTimeout: 120000 });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, JSON.stringify(got)); } };
async function device() {
  const ctx = await b.createBrowserContext();
  const pg = await ctx.newPage();
  await setWidth(pg, 390, 844);
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await setWidth(pg, 390, 844);
  for (let k = 0; k < 40 && !(await pg.$('input[type=password]')); k++) await wait(500);
  await pg.evaluate((email) => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const ins = [...document.querySelectorAll('input')];
    set(ins.find((i) => /email/i.test(i.type + i.placeholder)), email);
    set(ins.find((i) => i.type === 'password'), '1234');
    [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent)).click();
  }, EMAIL);
  for (let k = 0; k < 30 && !(await pg.evaluate(() => /\/athlete/.test(location.pathname))); k++) await wait(500);
  await wait(1500);
  return { ctx, pg };
}
// refresh through the REST endpoint with the refresh token this device holds
const refreshFrom = (pg) => pg.evaluate(async () => {
  const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
  const tok = k && JSON.parse(localStorage.getItem(k));
  const rt = tok && (tok.refresh_token || (tok.currentSession && tok.currentSession.refresh_token));
  if (!rt) return { status: 0, why: 'no refresh token on this device' };
  const base = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
  const anon = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
  const r = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) });
  return { status: r.status };
});
const A = await device();
const B = await device();
try {
  ok('device A signed in', await A.pg.evaluate(() => /\/athlete/.test(location.pathname)));
  ok('device B signed in', await B.pg.evaluate(() => /\/athlete/.test(location.pathname)));
  const clicked = await A.pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /log\s*out/i.test(e.textContent || '')); if (x) { x.click(); return true; } return false; });
  ok('device A tapped LOG OUT', clicked);
  await wait(4000);
  ok('device A is signed out', await A.pg.evaluate(() => !Object.keys(localStorage).some((x) => /^sb-.*-auth-token$/.test(x))));
  const r = await refreshFrom(B.pg);
  ok('device B can still refresh its session (sign-out was local to A)', r.status === 200, r);
} finally {
  // B signs out LOCALLY so nothing else is touched
  try { await B.pg.evaluate(async () => { const m = await import('/src/supabase.js').catch(() => null); if (m) await m.supabase.auth.signOut({ scope: 'local' }); }); } catch { /* built bundle: context close is enough */ }
  await A.ctx.close().catch(() => {}); await B.ctx.close().catch(() => {});
  b.disconnect();
}
console.log(`SIGN-OUT LOCAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
