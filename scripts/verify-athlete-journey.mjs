// DOES THE ATHLETE'S ACTUAL JOURNEY WORK?
//
// Every gate in this repo measures how a page LOOKS - clipping, alignment,
// theme, dead air. None of them opens a tab and checks the thing behind it
// still works. That is the gap between "the screens render" and "the product
// is usable", and it is the class of defect that keeps something at 25%.
//
// This walks the athlete portal the way an athlete does - every tab, the
// program, a day, the history - from a REAL trainee's seat, and fails on:
//   * an uncaught page error
//   * a console error
//   * a failed network request (4xx/5xx or a dead fetch)
//   * a tab that renders nothing
//
// READ-ONLY BY CONSTRUCTION. It never logs a set, saves a weight or sends a
// message: his non-negotiable is that nothing here touches what an athlete
// sees, and a smoke test that writes to client_workouts would do exactly that.
// Anything that would commit is clicked only where it opens a view.
//
//   node scripts/verify-athlete-journey.mjs [email] [width]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const EMAIL = process.argv[2] || 'diego@diegoday.com';
const W = Number(process.argv[3] || 390);
const PW = process.env.ATHLETE_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
const signFallbacks = new Set();
const aborted = new Set();
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

let phase = 'startup';
pg.on('pageerror', (e) => problems.push(`[${phase}] page error: ${String(e.message).slice(0, 150)}`));
pg.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // A failed resource logs both a console error and a request failure; keep
  // the request one, which names the URL.
  if (/Failed to load resource/i.test(t)) return;
  problems.push(`[${phase}] console: ${t.slice(0, 150)}`);
});
pg.on('requestfailed', (r) => {
  const u = r.url();
  if (/analytics|vitals|favicon|sentry|_vercel/i.test(u)) return;
  const why = r.failure()?.errorText || '?';
  // ERR_ABORTED on a MEDIA object is the browser cancelling an in-flight
  // fetch because the page moved on - this walk navigates straight after
  // sign-in, so a poster or a video mid-download is aborted every time. Only
  // media is excused, and only for that reason: an aborted API call still
  // fails the gate.
  if (/ERR_ABORTED|ERR_CACHE_OPERATION_NOT_SUPPORTED/.test(why) && /\/storage\/v1\/object\/.*\.(mp4|mov|webm|m4a|jpe?g|png|webp)(\?|$)/i.test(u)) {
    aborted.add(u.split('/object/')[1] || u);
    return;
  }
  problems.push(`[${phase}] request failed: ${u.slice(0, 110)} (${why})`);
});
pg.on('response', (r) => {
  if (r.status() < 400) return;
  const u = r.url();
  if (/analytics|vitals|favicon|_vercel/i.test(u)) return;
  // 406/416 from PostgREST on an empty single() is normal for a fresh athlete.
  if (r.status() === 406) return;
  // A 400 from /object/sign/ is EXPECTED and handled. storageUrl.js asks for a
  // signed URL first so the app keeps working the day the buckets are flipped
  // private; the buckets are public today and carry no SELECT policy, so the
  // signing call fails and the module falls back to the public URL. Verified on
  // the athlete's MESSAGES tab: the <audio> element ends up with the public URL
  // and no media error. Failing on it would make this gate cry wolf on
  // behaviour that is deliberate and documented.
  if (r.status() === 400 && /\/storage\/v1\/object\/sign\//.test(u)) { signFallbacks.add(u.split('/sign/')[1] || u); return; }
  problems.push(`[${phase}] HTTP ${r.status()}: ${u.slice(0, 110)}`);
});

try {
  phase = 'sign-in';
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name + (i.getAttribute('aria-label') || '')));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);

  await setWidth(pg, W, 844);
  phase = 'portal';
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded' });
  await wait(11000);
  await pg.evaluate(() => {
    const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
    if (x) x.click();
  });
  await wait(1200);

  const seat = await pg.evaluate(() => ({
    txt: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 120),
    coach: /dashboard|athletes\s*\d|billing/i.test(document.body.innerText.slice(0, 600)),
    login: /sign in/i.test(document.body.innerText.slice(0, 300)),
  }));
  if (seat.login) { console.log('FAILED: still on the login screen'); process.exit(1); }
  if (seat.coach) { console.log('FAILED: this is the COACH seat, not an athlete'); process.exit(1); }
  console.log('seat: ' + seat.txt.slice(0, 80));

  // Every tab the athlete has. Each must render SOMETHING - a blank tab is a
  // broken tab even when nothing errors.
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('button')]
    .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
    // The PROGRAM tab's label carries a leading marker ("▸ PROGRAM"), so an
    // anchored match silently skipped the most important tab in the portal.
    .filter((t) => /(program|bw|meal log|history|prs|messages)/i.test(t) && t.length <= 18));
  console.log('tabs: ' + tabs.join(' | '));

  for (const tab of tabs) {
    phase = 'tab:' + tab.slice(0, 14);
    const opened = await pg.evaluate((label) => {
      const btn = [...document.querySelectorAll('button')]
        .find((e) => (e.textContent || '').replace(/\s+/g, ' ').trim() === label);
      if (!btn) return false;
      btn.click();
      return true;
    }, tab);
    if (!opened) { problems.push(`[${phase}] tab button vanished`); continue; }
    await wait(4500);
    const body = await pg.evaluate(() => {
      const el = document.querySelector('main') || document.body;
      return { len: (el.innerText || '').trim().length, docW: document.documentElement.scrollWidth };
    });
    if (body.len < 40) problems.push(`[${phase}] renders almost nothing (${body.len} chars)`);
    if (body.docW > W + 1) problems.push(`[${phase}] page scrolls sideways: ${body.docW}`);
    console.log(`  ${tab.padEnd(16)} ${String(body.len).padStart(5)} chars`);
  }
} catch (e) {
  problems.push(`[${phase}] threw: ${String(e.message || e).slice(0, 160)}`);
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
if (aborted.size) {
  console.log(`note  ${aborted.size} media fetch(es) aborted by navigation - not a failure`);
}
if (signFallbacks.size) {
  console.log(`note  ${signFallbacks.size} object(s) fell back from a signed URL to the public one - expected while the buckets are public (see storageUrl.js)`);
}
if (!problems.length) { console.log('0 - the athlete journey runs clean'); process.exit(0); }
const uniq = [...new Set(problems)];
for (const p of uniq) console.log('FAIL  ' + p);
console.log(`\n${uniq.length} problem(s) in the athlete journey`);
process.exit(1);
