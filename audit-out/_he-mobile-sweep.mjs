// Signed in, Hebrew, real phone emulation (390): does any coach route overflow the
// viewport on EITHER side? In RTL an overflow escapes on the LEFT, which the older
// right-edge-only probe could not see. LOCAL ONLY output (text snippets can hold names).
import P from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = +(process.env.W || 390);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const routes = (process.argv[2] || '/coach/dashboard,/coach/athletes,/coach/programs,/coach/workouts,/coach/review,/coach/tasks,/coach/billing,/coach/intake,/coach/waitlist,/coach/calendar,/coach/exercises,/coach/review-tools,/coach/bhbc').split(',');
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.emulate({ viewport: { width: W, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await signIn(pg, BASE);
await pg.evaluate(() => { localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('he')); });
const out = {};
for (const r of routes) {
  await pg.goto(`${BASE}${r}?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(7000);
  out[r] = await pg.evaluate((vw) => {
    const res = { scrollW: document.documentElement.scrollWidth, vw, bad: [] };
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || !el.offsetParent) continue;
      const rc = el.getBoundingClientRect();
      if (rc.width < 30) continue;
      if (rc.right <= vw + 2 && rc.left >= -2) continue;
      let anc = el.parentElement, contained = false;
      while (anc && anc !== document.body) { const s = getComputedStyle(anc); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { const ar = anc.getBoundingClientRect(); if (ar.right <= vw + 2 && ar.left >= -2) { contained = true; break; } } anc = anc.parentElement; }
      if (contained) continue;
      res.bad.push({ tag: el.tagName.toLowerCase(), left: Math.round(rc.left), right: Math.round(rc.right), w: Math.round(rc.width), txt: (el.textContent || '').trim().slice(0, 40) });
    }
    res.bad = res.bad.filter((x, i, a) => !a.some((y, j) => j !== i && y.txt.includes(x.txt) && y.w < x.w)).slice(0, 8);
    return res;
  }, W);
  console.log(r, 'scrollW', out[r].scrollW, 'offenders', out[r].bad.length);
}
fs.writeFileSync('audit-out/_he-mobile-sweep.json', JSON.stringify(out, null, 1));
await pg.close(); b.disconnect();
