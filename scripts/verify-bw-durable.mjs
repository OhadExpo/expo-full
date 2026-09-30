// IS A WEIGH-IN SAFE BEFORE THE NETWORK ANSWERS? (#471, AUDIT-470)
//
// The bodyweight save went to the network first and was queued only after an
// ERROR. On a phone that shows "connected" but moves no data the request hangs;
// close the app then and the weigh-in was gone, with no message. The fix queues
// it durably BEFORE the network is touched (the workout row's rule).
//
// This gate proves it on the real portal as the TEST FIXTURE athlete: every
// bw_logs write is held forever (never answered - it never reaches the server),
// a weight is saved, and the offline queue in localStorage must already hold the
// weigh-in. It then removes its own entry and discards the browser context, so
// nothing ever drains to production. Read-only against the database.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5260 node scripts/verify-bw-durable.mjs
//   (break test: point BASE at a build before #471 - it must FAIL)
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5260';
const EMAIL = process.env.FIXTURE || 'diego@diegoday.com';
const PW = process.env.ATHLETE_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
let held = 0, verdict = 'FAIL: not measured';
try {
  await pg.setRequestInterception(true);
  pg.on('request', (req) => {
    // hold every WRITE to bw_logs forever: the server never sees it
    if (/\/rest\/v1\/bw_logs/.test(req.url()) && req.method() !== 'GET') { held++; return; }
    req.continue().catch(() => {});
  });
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => { const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || '')); if (btn) btn.click(); });
  await wait(9000);
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  // the BW tab
  const opened = await pg.evaluate(() => { const t = [...document.querySelectorAll('button[role="tab"], button')].find((x) => /^(BW|משקל)$/i.test((x.textContent || '').trim())); if (t) { t.click(); return true; } return false; });
  if (!opened) throw new Error('no BW tab - not signed in as the athlete?');
  await wait(2500);
  const typed = await pg.evaluate(() => {
    const inp = document.querySelector('input[type="number"]'); if (!inp) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inp, '77.7');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  if (!typed) throw new Error('no weight field on the BW tab');
  await wait(400);
  const saved = await pg.evaluate(() => { const s = [...document.querySelectorAll('button')].find((x) => /^(SAVE|שמירה|שמור)$/i.test((x.textContent || '').trim()) && !x.disabled); if (s) { s.click(); return true; } return false; });
  if (!saved) throw new Error('SAVE not clickable (no active plan on the fixture?)');
  await wait(2500);
  const q = await pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('expo-offline-queue') || '[]'); } catch (e) { return []; } });
  const entry = q.find((e) => e && e.type === 'bw_logs.upsert' && e.payload && e.payload.row && Number(e.payload.row.bw) === 77.7);
  verdict = entry
    ? `PASS: the weigh-in is durable in the offline queue BEFORE any answer (${held} write(s) held, never sent)`
    : `FAIL: a weigh-in whose request is still in flight is NOT in the queue - closing the app now loses it (${held} write(s) held)`;
  // leave nothing behind: drop our entry; the context is discarded below
  await pg.evaluate(() => { try { const q2 = JSON.parse(localStorage.getItem('expo-offline-queue') || '[]').filter((e) => !(e && e.type === 'bw_logs.upsert' && e.payload && e.payload.row && Number(e.payload.row.bw) === 77.7)); localStorage.setItem('expo-offline-queue', JSON.stringify(q2)); } catch (e) { /* gone */ } });
} catch (e) {
  verdict = `FAIL: ${e.message} - NOT measured`;
} finally {
  await ctx.close(); b.disconnect();
}
console.log(verdict);
process.exit(/^PASS/.test(verdict) ? 0 : 1);
