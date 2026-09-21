// ONE BOX HEIGHT, EVERYWHERE.
//
// Ohad's standing rule (memory: new-ui-box-dimensions): "all the buttons the
// same size everywhere as rule (vertical size)". Text inside may vary - Hebrew
// gets +3px - the BOX never does.
//
// The tap-target pass on 21.9 raised controls to a 40px floor and that is not
// the same thing: a floor lets every button sit at a DIFFERENT height above it,
// and a button inside a flex row with align-items:stretch grows to the row.
// That is how the club zone's COPY chip became a full-height slab against a
// 48px MANAGE ROSTER beside it.
//
// This reports the distinct heights actually on screen, per surface, so the
// spread is a number instead of an impression.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const W = Number(process.argv[2]) || 390;
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : [
  '/coach/dashboard', '/coach/athletes', '/coach/exercises', '/coach/programs',
  '/coach/workouts', '/coach/review', '/coach/tasks', '/coach/intake',
  '/coach/waitlist', '/coach/billing', '/coach/sessions', '/coach/bhbc',
];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
// THE CLUB ZONE HAS ITS OWN LANGUAGE KEY. Setting expo-lang alone leaves it in
// Hebrew and the shell check missed it entirely, so /coach/bhbc - the surface
// the COPY chip lives on - was reported as "did not render" and never measured.
await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en')); } catch (e) {} });
const tally = new Map();
let dead = 0, total = 0;
for (const route of ROUTES) {
  await setWidth(pg, W, 1100);
  await pg.goto('http://127.0.0.1:5199' + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 9000));
  const r = await pg.evaluate(() => {
    const shell = /DASHBOARD|OVERVIEW|ROSTER/i.test(document.body.innerText || '');
    const out = [];
    // Inputs and selects sit in the SAME rows as the buttons, so a filter field
    // at 30px beside a 32px button is the same fault by another route.
    for (const el of document.querySelectorAll('button, [role="button"], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select')) {
      const b = el.getBoundingClientRect();
      if (b.width < 8 || b.height < 6) continue;
      // Real buttons only: skip rows and cards that merely carry role=button,
      // and skip bare icon glyphs, which are a different control class.
      const field = /^(INPUT|SELECT)$/.test(el.tagName);
      const t = field ? (el.tagName.toLowerCase() + ' ' + (el.placeholder || el.value || el.type || '').slice(0, 18)).trim()
                      : (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const cs = getComputedStyle(el);
      // A BUTTON, not a card or a row that merely carries role="button".
      // Those were 87 of the 599 and every one of them was a plan card, a task
      // row, a day card or a collapsible strip header - counting them made the
      // spread look like a button problem when it is not.
      if (!field) {
        if (t.length > 26 || el.querySelectorAll('div,p,table,img').length > 1) continue;
        const boxed = cs.borderTopWidth !== '0px' || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
        if (!boxed) continue;
      }
      const par = el.parentElement ? getComputedStyle(el.parentElement) : null;
      out.push({ h: Math.round(b.height), t: t.slice(0, 22),
        stretched: !!par && par.display.includes('flex') && (cs.alignSelf === 'stretch' || (cs.alignSelf === 'auto' && par.alignItems === 'normal')) });
    }
    return { shell, out };
  });
  if (!r.shell) { console.log(`${route.padEnd(20)} the coach shell did not render - not measured`); dead++; continue; }
  const hs = new Map();
  for (const x of r.out) { if (!hs.has(x.h)) hs.set(x.h, []); hs.get(x.h).push(x); tally.set(x.h, (tally.get(x.h) || 0) + 1); total++; }
  const sorted = [...hs.entries()].sort((a, c) => a[0] - c[0]);
  console.log(`${route.padEnd(20)} ${r.out.length} button(s), ${sorted.length} distinct height(s): ${sorted.map(([h, v]) => `${h}px x${v.length}`).join('  ')}`);
  for (const [h, v] of sorted) {
    if (h === 40) continue;                       // the floor: that is the target
    console.log(`      ${h}px  ${v.map((x) => '"' + x.t + '"').join(' ').slice(0, 150)}`);
  }
}
const all = [...tally.entries()].sort((a, c) => c[1] - a[1]);
console.log(`\n${ROUTES.length - dead} of ${ROUTES.length} routes measured at ${W}px, ${total} buttons, ${all.length} DISTINCT HEIGHTS`);
for (const [h, n] of all) console.log(`  ${String(h).padStart(3)}px  x${n}`);
await pg.close(); b.disconnect();
