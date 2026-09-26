// THE CALENDAR SHOWS WHAT THE WEEK SHOWS.
//
// 27.9, Ohad: "scheduele is not updated (should be automatic)". The SCHEDULE
// card's month view had been EMPTY for ten days (a dropped prop) while the week
// planner above it listed the same days' practices. Layout gates could not see
// it - an empty grid is perfectly aligned. This is a CONTENT gate: signed in as
// the owner, on the BHBC schedule tab, every day the week planner lists
// sessions for must show the same number in the month calendar.
//
//   node scripts/verify-schedule-populated.mjs            (local preview :5199)
//   BASE=https://expo-app.co.il node scripts/...          (production)
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 180000 });
const ctx = await b.createBrowserContext(); const pg = await ctx.newPage();
let fail = 0;
try {
  await setWidth(pg, 1440, 950);
  await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
  await signIn(pg, BASE);
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 30; i++) { await wait(700); if (await pg.evaluate(() => document.querySelectorAll('.bhbc-hdr-tabs button').length > 2)) break; }
  await pg.evaluate(() => { const t = [...document.querySelectorAll('.bhbc-hdr-tabs button')].find((x) => /schedule/i.test(x.innerText)); if (t) t.click(); });
  // the month view: wait for it; switch to it only if another mode is showing
  for (let i = 0; i < 20; i++) { await wait(500); if (await pg.evaluate(() => document.querySelectorAll('[data-cal-date]').length > 0 && document.querySelectorAll('[data-week-date]').length > 0)) break; }
  if (!(await pg.evaluate(() => document.querySelectorAll('[data-cal-date]').length))) {
    await pg.evaluate(() => { const m = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim().toUpperCase() === 'MONTH'); if (m) m.click(); });
    for (let i = 0; i < 10; i++) { await wait(500); if (await pg.evaluate(() => document.querySelectorAll('[data-cal-date]').length > 0)) break; }
  }
  const r = await pg.evaluate(() => {
    const week = [...document.querySelectorAll('[data-week-date]')].map((e) => [e.dataset.weekDate, Number(e.dataset.weekN)]);
    const cal = Object.fromEntries([...document.querySelectorAll('[data-cal-date]')].map((e) => [e.dataset.calDate, Number(e.dataset.calN)]));
    const unwired = /Schedule data is not connected/.test(document.body.innerText);
    return { week, cal, unwired, calCells: Object.keys(cal).length };
  });
  const withSessions = r.week.filter(([, n]) => n > 0);
  console.log(`SCHEDULE-POPULATED — ${r.week.length} planner days (${withSessions.length} with sessions), ${r.calCells} month cells`);
  if (r.unwired) { console.log('  FAIL: the schedule card says its data is not connected'); fail++; }
  if (r.week.length === 0 || r.calCells === 0) { console.log('  FAIL: measured nothing - planner or month view not found'); fail++; }
  if (withSessions.length === 0) { console.log('  FAIL: the week planner lists no sessions this week - nothing to compare (is the club calendar synced?)'); fail++; }
  for (const [d, n] of withSessions) {
    const c = r.cal[d];
    if (c == null) continue; // the planner week can straddle into a month not shown
    if (c !== n) { console.log(`  MISMATCH ${d}: planner ${n}, month ${c}`); fail++; }
  }
  console.log(fail ? `  ${fail} failing` : '  every planner day matches the month view');
} finally { await ctx.close(); await b.disconnect(); }
process.exit(fail ? 1 : 0);
