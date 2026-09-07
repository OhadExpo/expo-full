// Latin words on the coach's DRILL-DOWN screens in Hebrew: a program opened
// from /coach/programs, and an athlete opened from /coach/athletes. The route
// sweep only ever sees the lists.
//   CDP=http://127.0.0.1:9223 node audit-out/probe-coach-drilldowns.mjs [base]
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const latin = (t) => (t.match(/\b[A-Za-z]{2,}\b/g) || []);
const report = async (label) => {
  const text = await pg.evaluate(() => document.body.innerText);
  const words = latin(text);
  const freq = {}; for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 26).map(([w, n]) => (n > 1 ? `${w}(${n})` : w)).join(' ');
  console.log(`${label.padEnd(26)} latin=${String(words.length).padStart(4)}  ${top}`);
};
// English login first (the helper knows it), Hebrew after.
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
await setWidth(pg, 1400, 900);

async function open(route, clickText, label) {
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 400)) break; }
  await wait(2500);
  const clicked = await pg.evaluate((re) => {
    const rx = new RegExp(re);
    const el = [...document.querySelectorAll('button,a,[role=button],h3,h2')].find((e) => rx.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0);
    if (el) { el.click(); return (el.textContent || '').trim().slice(0, 40); } return null;
  }, clickText);
  await wait(4000);
  await report(`${label} → "${clicked}"`);
  await pg.screenshot({ path: `audit-out/drill-${label.replace(/\W+/g, '-')}.png` });
}
await open('/coach/programs', '^(Block #\\d+|בלוק #\\d+)', 'program');
await open('/coach/athletes', '^(EDIT|עריכה|ערוך)$', 'athlete-edit');
await open('/coach/athletes', '^(PORTAL|פורטל)$', 'athlete-portal-preview');
if (process.env.MORE) {
  await open('/coach/review', '^(OPEN|פתח|REVIEW|בדוק|בדיקה|VIEW|הצג)$', 'review-detail');
  await open('/coach/exercises', '^(EDIT|ערוך|עריכה|✎)$', 'exercise-edit');
  await open('/coach/bhbc', '^(\\+ LOG PRACTICE|\\+ רישום אימון|\\+ LOG|רישום)', 'bhbc-log-modal');
  await open('/coach/calendar', '^(\\+ NEW|\\+ חדש|NEW EVENT|אירוע חדש|\\+ ADD|\\+ הוסף)', 'calendar-new');
}
await ctx.close();
b.disconnect();
