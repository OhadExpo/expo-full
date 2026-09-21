// THE SAME FIELD, AT A DIFFERENT X, IN ROWS THAT ARE OTHERWISE IDENTICAL.
//
// Ohad, 21.9: "lands and date boxes need to be lined in the same horizontal
// spot from one row to another ... go measure and fix similar cases everywhere
// across all platforms."
//
// Four separate instances turned up by eye in one day, all the same shape:
//   review day cards   - date drifted 2px, set count 8px
//   ROAD AHEAD         - the HOME/AWAY chip at x=254, 175, 164
//   BHBC medical rows  - the diagnosis at 78, 82, 87, 94, 103, 111
//   manage roster      - the LANDS block 77px apart between two kinds of row
// Every one of them is a repeating row whose Nth cell sits in an `auto` track
// or trails inline after variable-length content, so its x is the length of
// whatever came before it.
//
// A cell is ALIGNED if its left edges agree across rows (a left column) OR its
// right edges do (a right-anchored one). Anything else drifts.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const W = Number(process.argv[2]) || 1500;
const TOL = 2;        // sub-pixel rounding is not drift
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : [
  '/coach/dashboard', '/coach/athletes', '/coach/exercises', '/coach/programs',
  '/coach/workouts', '/coach/review', '/coach/tasks', '/coach/intake',
  '/coach/waitlist', '/coach/billing', '/coach/sessions', '/coach/calendar', '/coach/bhbc',
];
const OPENERS = /^(manage roster|\+ report injury|\+ generate link|\+ new program|\+ add athlete|\+ log practice|settings|\+ add|\+ plan)/i;

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en')); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });

const scan = () => pg.evaluate((TOL) => {
  const shell = /DASHBOARD|OVERVIEW|ROSTER/i.test(document.body.innerText || '');
  // Group siblings that share a parent AND a class signature - that is what
  // "rows of the same kind" means in this codebase.
  const groups = new Map();
  for (const el of document.querySelectorAll('*')) {
    // A CLASS IS NOT REQUIRED TO BE A ROW.
    //
    // The first version keyed groups on className and seven routes came back
    // with ZERO rows compared - tasks, intake, waitlist, billing, calendar,
    // workouts, exercises - because this codebase styles most rows inline and
    // gives them no class at all. A sweep that skips seven of thirteen routes
    // is not a sweep. Fall back to the tag name, which is what actually makes
    // siblings the same KIND of row when there is no class to say so.
    if (!el.parentElement) continue;
    const cls = (typeof el.className === 'string' ? el.className : '').trim();
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 12) continue;
    const key = (cls || '<' + el.tagName + '>') + '|' + (el.parentElement.className || el.parentElement.tagName) + '|' + el.children.length;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  const findings = [];
  let rowsSeen = 0;
  for (const [key, els] of groups) {
    const rows = els.filter((e) => e.parentElement === els[0].parentElement);
    if (rows.length < 3) continue;
    const n = rows[0].children.length;
    if (!n || n > 8) continue;
    if (!rows.every((r) => r.children.length === n)) continue;
    // A ROW HAS ITS CELLS SIDE BY SIDE.
    //
    // Once unclassed elements were grouped by tag, this started calling stacked
    // page SECTIONS rows - "Exercises · 1,332" above "TableGrid" - and
    // reporting spreads of 1003px, which is just two blocks of different width.
    // A row is a thing whose children sit on one line, so require at least two
    // children sharing a vertical centre, and require the rows themselves to be
    // the same width, which a column of sections rarely is.
    const online = (r) => {
      const ks = [...r.children].map((c) => c.getBoundingClientRect()).filter((c) => c.width > 4 && c.height > 4);
      if (ks.length < 2) return 0;
      const c0 = ks[0].top + ks[0].height / 2;
      return ks.filter((c) => Math.abs(c.top + c.height / 2 - c0) < 4).length;
    };
    if (!rows.every((r) => online(r) >= 2)) continue;
    const w0 = rows[0].getBoundingClientRect().width;
    if (!rows.every((r) => Math.abs(r.getBoundingClientRect().width - w0) <= 2)) continue;
    rowsSeen += rows.length;
    // ONE LEVEL DEEP IS NOT ENOUGH.
    //
    // The first version compared only the row's direct children and reported 0
    // against a drift of 77px measured by hand minutes earlier - the
    // manage-roster LANDS block. The cell that drifted was the last child OF a
    // cell: the wrapper spanned its track identically in every row while its
    // contents sat at different x inside it. Cells are addressed by path now,
    // "3" and "3.1", so a grandchild is compared too.
    const paths = [];
    for (let i = 0; i < n; i++) {
      paths.push([i]);
      const kid = rows[0].children[i];
      for (let j = 0; j < Math.min(kid.children.length, 6); j++) paths.push([i, j]);
    }
    for (const path of paths) {
      const at = (r) => { let e = r; for (const k of path) { if (!e || !e.children[k]) return null; e = e.children[k]; } return e; };
      if (rows.some((r) => !at(r))) continue;
      // SAME INDEX IS ONLY THE SAME CELL WHEN THE COUNTS MATCH.
      //
      // The programme cards render a PORTAL toggle only when the plan has a
      // visibility key, so child 2 of the action row is "Preview" on one card
      // and "Duplicate" on the next. Compared by index that reads as a 98px
      // drift, and it is not one - it is two different buttons. Every level of
      // the path must hold the same number of children in every row before the
      // cell at the end of it is comparable.
      let comparable = true;
      for (let d = 0; d < path.length && comparable; d++) {
        const parentAt = (r) => { let e = r; for (let k = 0; k < d; k++) e = e.children[path[k]]; return e; };
        const c0 = parentAt(rows[0]).children.length;
        if (rows.some((r) => parentAt(r).children.length !== c0)) comparable = false;
      }
      if (!comparable) continue;
      const i = path.join('.');
      const boxes = rows.map((r) => {
        const rb = r.getBoundingClientRect(), cb = at(r).getBoundingClientRect();
        return { L: cb.left - rb.left, R: rb.right - cb.right, w: cb.width, h: cb.height };
      });
      if (boxes.some((x) => x.w < 6 || x.h < 6)) continue;
      const ls = boxes.map((x) => x.L), rs = boxes.map((x) => x.R);
      const lSpread = Math.max(...ls) - Math.min(...ls);
      const rSpread = Math.max(...rs) - Math.min(...rs);
      if (lSpread > TOL && rSpread > TOL) {
        const sample = (at(rows[0]).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18);
        findings.push({ key: key.split('|')[0].slice(0, 28), cell: i, rows: rows.length,
          l: Math.round(lSpread), r: Math.round(rSpread), sample });
      }
    }
  }
  return { shell, findings, rowsSeen };
}, TOL);

let total = 0, dead = 0, rows = 0;
for (const route of ROUTES) {
  await setWidth(pg, W, 1100);
  await pg.goto('http://127.0.0.1:5199' + route, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));
  // Ohad's rule, 21.9: see the ENTIRE page before judging it. Anything mounted
  // on intersection is absent from a measurement taken at the top, so a sweep
  // can report clean because the broken part never rendered.
  await pg.evaluate(async () => {
    const step = Math.max(200, Math.round(window.innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  let r = await scan();
  if (!r.shell) { console.log(`${route.padEnd(20)} shell did not render - not measured`); dead++; continue; }
  const openers = await pg.evaluate((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('button')].map((b2, i) => ({ i, t: (b2.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.t && re.test(x.t)).slice(0, 4);
  }, OPENERS.source);
  const all = [...r.findings];
  for (const o of openers) {
    try {
      await pg.evaluate((i) => { const b2 = [...document.querySelectorAll('button')][i]; if (b2) b2.click(); }, o.i);
      await new Promise((x) => setTimeout(x, 1500));
      const m = await scan();
      for (const f of m.findings) if (!all.some((a) => a.key === f.key && a.cell === f.cell)) all.push(f);
      rows += m.rowsSeen;
      await pg.keyboard.press('Escape');
      await new Promise((x) => setTimeout(x, 600));
    } catch (e) { /* an opener that navigates is not a failure */ }
  }
  rows += r.rowsSeen; total += all.length;
  console.log(`${route.padEnd(20)} ${all.length} drifting cell(s), ${r.rowsSeen}+ rows, ${openers.length} opener(s)`);
  for (const f of all.slice(0, 6)) console.log(`      .${f.key} cell ${f.cell} across ${f.rows} rows: left spread ${f.l}px, right spread ${f.r}px  "${f.sample}"`);
}
console.log(`\n${ROUTES.length - dead} of ${ROUTES.length} routes at ${W}px, ${rows} row(s) compared: ${total} drifting cell(s)`);
console.log(`  A cell counts as aligned if its LEFT edges agree across rows or its RIGHT edges do (tolerance ${TOL}px). Only rows sharing a parent, a class and a child count are compared.`);
await pg.close(); b.disconnect();
process.exit(total ? 1 : 0);
