// EVERY DATE ON SCREEN IS DAY-FIRST.
//
// 27.9, Ohad: "make sure all the dates everywhere are day/month/year (dd/mm)".
// A CONTENT gate over the RENDERED text of every coach route, every BHBC tab
// and the demo (en + he): it fails on
//   ISO       2026-09-25            (year first - a raw value leaking to screen)
//   MM-DD     09-25                 (month first, the history column's old form)
//   US        9/25/2026, 09/25      (month first with a day above 12, i.e. provably US)
// Numbers that cannot be dates (a day part over 31, a month over 12) are not
// flagged, so "8-12 reps" never trips it. Prints what it measured beside the zero.
//
//   node scripts/verify-date-format.mjs            (local preview :5199)
//   BASE=https://expo-app.co.il node scripts/verify-date-format.mjs
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const COACH = ['dashboard', 'athletes', 'sessions', 'review', 'tasks', 'billing', 'intake', 'waitlist', 'challenges', 'calendar', 'programs', 'exercises', 'workouts', 'bugs'];
const BHBC = ['overview', 'roster', 'schedule', 'lifts', 'medical', 'games', 'activity'];
const DEMO = ['/demo/coach', '/demo/athlete'];
const PATTERNS = [
  ['ISO', /\b20\d{2}-\d{2}-\d{2}\b/g],
  ['MM-DD', /(?<![\d/.-])(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?![\d-])(?!\s*(?:[*x×]|min\b|reps?\b|sec\b|%))/gi],
  ['US', /(?<![\d/])(0?[1-9]|1[0-2])\/(1[3-9]|2\d|3[01])(\/(20)?\d{2})?(?![\d/])/g],
];

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 180000 });
let pages = 0, chars = 0;
const bad = [];
async function scan(pg, label) {
  // A CLOSED SECTION HIDES ITS DATES (27.9: the cleared-injury history printed
  // raw ISO for a week because it loads collapsed). Open every collapsed
  // section first - twice, for sections nested in sections.
  for (let k = 0; k < 2; k++) {
    await pg.evaluate(() => { document.querySelectorAll('[aria-expanded="false"]').forEach((el) => { try { el.click(); } catch (e) {} }); });
    await wait(700);
  }
  const text = await pg.evaluate(() => document.body.innerText || '');
  pages++; chars += text.length;
  for (const [kind, rx] of PATTERNS) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(text))) {
      const ctx = text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ');
      bad.push(`${label}  ${kind} "${m[0]}"  …${ctx}…`);
    }
  }
}
for (const lang of ['en', 'he']) {
  const ctx = await b.createBrowserContext(); const pg = await ctx.newPage();
  try {
    await setWidth(pg, 1440, 950);
    await pg.evaluateOnNewDocument((L) => { try { localStorage.setItem('expo-lang', L); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(L)); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} }, lang);
    await signIn(pg, BASE);
    for (const r of COACH) {
      await pg.goto(`${BASE}/coach/${r}`, { waitUntil: 'domcontentloaded' });
      await wait(4500);
      await scan(pg, `${lang} /coach/${r}`);
    }
    for (const t of BHBC) {
      await pg.goto(`${BASE}/coach/bhbc/${t}`, { waitUntil: 'domcontentloaded' });
      for (let i = 0; i < 20; i++) { await wait(500); if (await pg.evaluate(() => document.querySelectorAll('.bhbc-hdr-tabs button').length > 2)) break; }
      await wait(2000);
      await scan(pg, `${lang} /coach/bhbc/${t}`);
    }
  } finally { await ctx.close(); }
  const dctx = await b.createBrowserContext(); const dp = await dctx.newPage();
  try {
    await setWidth(dp, 1440, 950);
    await dp.evaluateOnNewDocument((L) => { try { localStorage.setItem('expo-lang', L); } catch (e) {} }, lang);
    for (const r of DEMO) { await dp.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' }); await wait(4000); await scan(dp, `${lang} ${r}`); }
  } finally { await dctx.close(); }
}
await b.disconnect();
console.log(`DATE-FORMAT GATE — ${pages} pages, ${chars} characters of rendered text, ${bad.length} month-first or ISO dates`);
for (const x of bad.slice(0, 60)) console.log('  ' + x);
if (pages === 0 || chars < 5000) { console.log('  FAIL: measured nothing'); process.exit(1); }
process.exit(bad.length ? 1 : 0);
