// AN ATHLETE WHOSE PHONE HAS THE APP BUT CANNOT REACH THE BACKEND.
//
// This is the basement condition, reproduced without a service worker: the app
// shell loads (a SW would serve it from cache; here the local server does), and
// every single call to Supabase fails. What is on the screen?
//
// It is deliberately harsher than the offline gate. That one needs HTTPS to run
// at all. This one runs anywhere and isolates the DATA layer: shell fine,
// backend gone.
//
// Reported separately, because each is its own athlete-facing question:
//   PROGRAMME  - is today's session still on the screen, from cache?
//   TOLD       - is the athlete told the data is not live, rather than stale
//                data reading as current?
//   SIGNED IN  - do they stay signed in, or does a failed token refresh throw
//                them onto a login screen they cannot pass while offline?
//   NO CRASH   - no uncaught error, and it recovers when the backend returns.
//
// Read-only. It never logs a set.
//
//   node scripts/verify-athlete-no-backend.mjs [email]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.argv[2] || 'diego@diegoday.com';
const PW = process.env.ATHLETE_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
let phase = 'startup';
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
pg.on('pageerror', (e) => problems.push(`[${phase}] page error: ${String(e.message).slice(0, 120)}`));

let cutBackend = false;
await pg.setRequestInterception(true);
pg.on('request', (r) => {
  if (cutBackend && /supabase\.(co|in)/.test(r.url())) { r.abort('failed').catch(() => {}); return; }
  r.continue().catch(() => {});
});

const look = () => pg.evaluate(() => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
  const top = t.slice(0, 200);
  return {
    len: t.length,
    head: t.slice(0, 120),
    // NOT a keyword test. "PROGRAM" is a TAB LABEL, so /program/ reported a
    // programme on a screen that had none - block 0, week dashes, no session.
    // The only honest measure is how much of the online content survived.
    empty: /BLOCK\s*0\b/i.test(t) || /WEEK\s*[—–-]\s*[—–-]/i.test(t),
    told: /offline|no connection|not live|last synced|reconnect|couldn.t reach|last saved program|לא מקוון|אין חיבור/i.test(t),
    loginWall: /sign in|log in/i.test(top) && !/log ?out/i.test(top),
  };
});

try {
  phase = 'sign-in';
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);

  phase = 'online';
  await setWidth(pg, 390, 844);
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(13000);
  const on = await look();
  if (on.len < 800 || on.empty) { console.log(`FAILED: the portal did not load online (${on.len} chars) - nothing to compare against`); process.exit(1); }
  console.log(`online     : ${on.len} chars of session`);

  phase = 'backend-cut';
  cutBackend = true;
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(15000);          // long on purpose: every call has to fail before the UI settles
  const off = await look();
  const kept = Math.round((off.len / on.len) * 100);
  console.log(`no backend : ${off.len} chars (${kept}% of online) | empty state: ${off.empty} | told: ${off.told} | login wall: ${off.loginWall}`);
  console.log(`             "${off.head.slice(0, 96)}"`);
  if (off.loginWall) problems.push('signed out with no backend - an athlete offline cannot sign back in');
  if (off.empty) problems.push(`the session is gone and reads as an EMPTY programme, not as offline (${off.len} chars, ${kept}% of online)`);
  else if (kept < 60) problems.push(`most of the session is missing with the backend unreachable (${kept}% of online)`);
  if (!off.told) problems.push('nothing tells the athlete the data is not live - stale reads as current');

  phase = 'recover';
  cutBackend = false;
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(13000);
  const back = await look();
  const ok = back.len >= on.len * 0.9 && !back.empty;
  console.log(`recovered  : ${ok ? 'portal is back' : `STILL BROKEN (${back.len} chars)`}`);
  if (!ok) problems.push('the portal did not recover when the backend returned');
} catch (e) {
  problems.push(`[${phase}] threw: ${String(e.message || e).slice(0, 120)}`);
} finally {
  await pg.setRequestInterception(false).catch(() => {});
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
const uniq = [...new Set(problems)];
for (const p of uniq) console.log('FAIL  ' + p);
console.log(uniq.length ? `\n${uniq.length} problem(s) with the backend unreachable` : '\n0 - the portal holds up with no backend');
process.exit(uniq.length ? 1 : 0);
