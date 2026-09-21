// A FIELD'S LABEL BELONGS ABOVE IT.
//
// Ohad, 21.9, on the manage-roster row: "the lands and the box of the date ...
// should stack vertically one above each other", then: "make sure you follow
// this set up and rules anywhere in our platforms."
//
// Side by side, a label eats the width the field needs, the pair reads as two
// loose items rather than one control, and the field's left edge moves with the
// label's length - which is how a column stops being a column.
//
// This finds label/field pairs that are laid out HORIZONTALLY: a short text
// node sitting on the same line as, and immediately before, an input or select.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const W = Number(process.argv[2]) || 1500;
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : [
  '/coach/dashboard', '/coach/athletes', '/coach/exercises', '/coach/programs',
  '/coach/workouts', '/coach/review', '/coach/tasks', '/coach/intake',
  '/coach/waitlist', '/coach/billing', '/coach/sessions', '/coach/calendar', '/coach/bhbc',
];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en')); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
let side = 0, stacked = 0, dead = 0;
for (const route of ROUTES) {
  await setWidth(pg, W, 1100);
  await pg.goto('http://127.0.0.1:5199' + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));
  const r = await pg.evaluate(() => {
    const shell = /DASHBOARD|OVERVIEW|ROSTER/i.test(document.body.innerText || '');
    const hits = [];
    let ok = 0;
    for (const f of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')) {
      const fb = f.getBoundingClientRect();
      if (fb.width < 20 || fb.height < 10) continue;
      // The nearest preceding element that is a short piece of label-ish text.
      let lab = f.previousElementSibling;
      if (!lab || lab.querySelector('input,select,textarea')) continue;
      const t = (lab.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 20) continue;
      const lb = lab.getBoundingClientRect();
      if (lb.width < 4 || lb.height < 4) continue;
      // Same line = their vertical centres agree; above = the label sits higher.
      const sameLine = Math.abs((lb.top + lb.height / 2) - (fb.top + fb.height / 2)) < 6;
      if (sameLine) hits.push({ t: t.slice(0, 18), gap: Math.round(fb.left - lb.right) });
      else ok++;
    }
    return { shell, hits, ok };
  });
  if (!r.shell) { console.log(`${route.padEnd(20)} shell did not render - not measured`); dead++; continue; }
  side += r.hits.length; stacked += r.ok;
  console.log(`${route.padEnd(20)} ${r.hits.length} side-by-side, ${r.ok} stacked${r.hits.length ? '   ' + r.hits.map((h) => `"${h.t}"`).join(' ') : ''}`);
}
console.log(`\n${ROUTES.length - dead} of ${ROUTES.length} routes at ${W}px: ${side} label/field pairs sit SIDE BY SIDE, ${stacked} are stacked`);
// SAY WHAT THIS DID NOT SEE.
//
// It only measures what is ON SCREEN on a default route. src holds 86 <label>
// elements and most of them live in modals, editors and forms that are shut
// when the route loads - the injury modal, booking settings, the intake
// generator, the plan editor. A first run reported 2 pairs in total, and both
// were icons ("+", "->") that the short-text-before-a-field heuristic mistook
// for labels. A low number here means "few pairs were open", not "the platform
// follows the rule".
console.log('  COVERAGE: on-screen controls only. src holds 86 <label> elements; the ones inside modals, editors and forms were never opened by this run, so a low number here is not a clean bill.');
await pg.close(); b.disconnect();
process.exit(side ? 1 : 0);
