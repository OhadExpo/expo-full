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
let side = 0, stacked = 0, dead = 0, probed = 0;
for (const route of ROUTES) {
  await setWidth(pg, W, 1100);
  await pg.goto('http://127.0.0.1:5199' + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));
  // OPEN THE THINGS THE LABELS LIVE IN.
  //
  // A first version measured only what a default route renders and found 8
  // pairs in the whole platform, which is not the platform - src holds 86
  // <label> elements and most sit inside a modal, an editor or a form that is
  // shut when the route loads. Each opener is clicked, measured and dismissed.
  const OPENERS = /^(manage roster|\+ report injury|report injury|\+ generate link|\+ new program|\+ add athlete|\+ log practice|settings|edit|\+ add|\+ plan|update|new challenge|\+ new|request payment|\+ request)/i;
  const openers = await pg.evaluate((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('button')]
      .map((b, i) => ({ i, t: (b.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.t && re.test(x.t)).slice(0, 6);
  }, OPENERS.source);

  const measure = () => pg.evaluate(() => {
    const shell = /DASHBOARD|OVERVIEW|ROSTER/i.test(document.body.innerText || '');
    const hits = [];
    let ok = 0;
    for (const f of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')) {
      const fb = f.getBoundingClientRect();
      if (fb.width < 20 || fb.height < 10) continue;
      // The nearest preceding element that is a short piece of label-ish text.
      let lab = f.previousElementSibling;
      // A CONTROL IS NOT A LABEL FOR THE CONTROL NEXT TO IT. querySelector does
      // not match the element itself, so a <select> sitting before another
      // <select> was read as its label - which is how the athlete / program /
      // week / day picker on /coach/sessions reported two "side-by-side pairs"
      // that are one compound control.
      if (!lab) continue;
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(lab.tagName)) continue;
      if (lab.querySelector('input,select,textarea,button')) continue;
      const t = (lab.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 20) continue;
      // A LABEL, not a glyph and not a column cell.
      //
      // The first honest run returned 15 and not one was a form field:
      // "+", "->", "▾", "—" are icons, and ten were `"In" -> <input number>`
      // inside the Log Practice attendance grid, where "In" names a COLUMN once
      // and the number is a cell. Stacking a label over every cell in a grid is
      // the opposite of the rule - it is what the set-entry cells are protected
      // from. So: the label must contain letters, the field must not be a
      // number cell, and a label that repeats down the page is a column header.
      if (!/[A-Za-z֐-׿]/.test(t)) continue;
      if ((f.getAttribute('type') || '') === 'number') continue;
      // NO "it repeats, so it is a column header" RULE. That was tried and it
      // made the probe blind to the one case it exists for: LANDS labels a date
      // field on EVERY manage-roster row, so it repeats six times and was
      // skipped - the break test reported 0 with the layout deliberately put
      // back side by side. The grid cells it was meant to catch are already
      // excluded by the number-input rule above.
      const lb = lab.getBoundingClientRect();
      if (lb.width < 4 || lb.height < 4) continue;
      // Same line = their vertical centres agree; above = the label sits higher.
      const sameLine = Math.abs((lb.top + lb.height / 2) - (fb.top + fb.height / 2)) < 6;
      if (sameLine) hits.push({ t: t.slice(0, 18), gap: Math.round(fb.left - lb.right) });
      else ok++;
    }
    return { shell, hits, ok };
  });

  const r = await measure();
  if (!r.shell) { console.log(`${route.padEnd(20)} shell did not render - not measured`); dead++; continue; }
  let rSide = r.hits.length, rOk = r.ok, opened = 0;
  const names = r.hits.map((h) => `"${h.t}"`);
  for (const o of openers) {
    try {
      await pg.evaluate((i) => { const b = [...document.querySelectorAll('button')][i]; if (b) b.click(); }, o.i);
      await new Promise((x) => setTimeout(x, 1400));
      const m = await measure();
      if (m.hits.length > rSide || m.ok > rOk) opened++;
      rSide = Math.max(rSide, m.hits.length); rOk = Math.max(rOk, m.ok);
      for (const h of m.hits) if (!names.includes(`"${h.t}"`)) names.push(`"${h.t}"`);
      await pg.keyboard.press('Escape');
      await new Promise((x) => setTimeout(x, 700));
    } catch (e) { /* an opener that navigates instead of opening is fine */ }
  }
  side += rSide; stacked += rOk; probed += openers.length;
  console.log(`${route.padEnd(20)} ${rSide} side-by-side, ${rOk} stacked  (${openers.length} opener(s) clicked, ${opened} revealed fields)${names.length ? '   ' + names.slice(0, 8).join(' ') : ''}`);
}
console.log(`\n${ROUTES.length - dead} of ${ROUTES.length} routes at ${W}px: ${side} label/field pairs sit SIDE BY SIDE, ${stacked} are stacked, after clicking ${probed} opener(s)`);
// SAY WHAT THIS DID NOT SEE.
//
// It only measures what is ON SCREEN on a default route. src holds 86 <label>
// elements and most of them live in modals, editors and forms that are shut
// when the route loads - the injury modal, booking settings, the intake
// generator, the plan editor. The first version reported 2 pairs in the whole
// platform, and both were icons ("+", "->") that the short-text-before-a-field
// heuristic mistook for labels. Clicking the openers took it from 8 pairs to
// 66, which is the difference between a number and a result.
console.log(`  COVERAGE: the default route PLUS up to 6 openers per route (${probed} clicked). Still unreached: tabs that are not the default one, modals behind another modal, and any form whose opener does not match the OPENERS pattern. src holds 86 <label> elements; this run saw ${side + stacked} pairs.`);
await pg.close(); b.disconnect();
process.exit(side ? 1 : 0);
