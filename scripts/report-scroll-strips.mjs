// EVERY HORIZONTALLY SCROLLABLE STRIP, AND WHETHER IT LOOKS LIKE ONE.
//
// Ohad, 21.9, on a tablet: "fix the overflow" - the club-zone nav had cut
// "WEIGHT R" in half. Nothing was actually unreachable; every tab could be
// reached by scrolling. The fault is that a word sliced down the middle with no
// affordance reads as broken, not as "there is more this way".
//
// So this finds the strips: an element whose content is wider than its box and
// which scrolls. Each one needs a fade on the overflowing edge.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const W = Number(process.argv[2]) || 820;
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : [
  '/coach/dashboard', '/coach/athletes', '/coach/exercises', '/coach/programs',
  '/coach/workouts', '/coach/review', '/coach/tasks', '/coach/intake',
  '/coach/waitlist', '/coach/billing', '/coach/sessions', '/coach/calendar', '/coach/bhbc',
];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en')); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
let total = 0, faded = 0, dead = 0;
for (const route of ROUTES) {
  await setWidth(pg, W, 900);
  await pg.goto('http://127.0.0.1:5199' + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));
  const r = await pg.evaluate(() => {
    const shell = /DASHBOARD|OVERVIEW|ROSTER/i.test(document.body.innerText || '');
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (!/auto|scroll/.test(cs.overflowX)) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (el.clientWidth < 80) continue;
      out.push({
        tag: el.tagName + '.' + (el.className || '').toString().split(' ')[0].slice(0, 22),
        box: Math.round(el.clientWidth), content: el.scrollWidth,
        // a fade is either a mask or the marker class this pass introduces
        hasFade: /gradient/.test(cs.maskImage || cs.webkitMaskImage || '') || el.classList.contains('scroll-strip'),
      });
    }
    return { shell, out };
  });
  if (!r.shell) { console.log(`${route.padEnd(20)} shell did not render`); dead++; continue; }
  total += r.out.length; faded += r.out.filter((x) => x.hasFade).length;
  console.log(`${route.padEnd(20)} ${r.out.length} scrollable strip(s)${r.out.length ? ':' : ''}`);
  for (const x of r.out) console.log(`      ${x.hasFade ? 'faded  ' : 'NO FADE'} ${x.tag} box ${x.box} content ${x.content}`);
}
console.log(`\n${ROUTES.length - dead} of ${ROUTES.length} routes at ${W}px: ${total} scrollable strip(s), ${faded} with a fade, ${total - faded} without`);
await pg.close(); b.disconnect();
process.exit(total - faded ? 1 : 0);
