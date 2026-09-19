// Does the week planner's count agree with the fixtures the rest of the zone shows?
//
// Photographed 19.9 at 360: "WEEK PLANNER (0 SESSIONS · 0 S&C)" for 13-19 Sep,
// while the Overview card on the same zone said today (Sat 19 Sep) has an 18:00
// practice. Both read the SAME `fixtures` array - byDay is built from it - so a
// zero there is either a real inconsistency or the week anchor is not the week
// I think it is. Reading both off one page load settles it.
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';

const BASE = 'http://127.0.0.1:5199';
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
try {
  await signIn(pg, BASE);
  await pg.evaluate(() => { localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en')); });
  await pg.setViewport({ width: 1500, height: 950, isMobile: false });
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 7000));
  // Open the Schedule tab so the planner is mounted.
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('button,[role="tab"]')].find((e) => /schedule/i.test((e.textContent || '').trim()));
    if (t) t.click();
  });
  await new Promise((r) => setTimeout(r, 4000));
  const out = await pg.evaluate(() => {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ');
    const planner = /WEEK PLANNER \(([^)]*)\)/i.exec(text);
    const range = /(\d{1,2} [A-Z]{3}) [—-] (\d{1,2} [A-Z]{3})/.exec(text);
    // Every "+ SESSION" placeholder is a day with nothing written; a day WITH a
    // fixture prints its time instead.
    const times = (text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || []).slice(0, 12);
    return { planner: planner ? planner[1] : null, range: range ? range[0] : null, timesOnPage: times, today: new Date().toISOString().slice(0, 10) };
  });
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.log('ERROR', e.message);
} finally { await pg.close().catch(() => {}); b.disconnect(); }
