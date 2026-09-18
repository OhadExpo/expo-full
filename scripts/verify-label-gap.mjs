// verify-label-gap.mjs — a label must not touch the value beside it.
//
// Ohad, 19.9, from the club zone: "plan and training as titles are mixed with
// the rest of the text bad design, full audit for this type of mistake
// everywhere". What the screenshot actually showed was worse than "mixed" —
// the two spans had NO separator at all, so it rendered:
//
//     PLANNOTHING WAS WRITTEN FOR THIS SLOT
//     TRAINEDZACK BRYANT, DAESHON FRANCIS, ...
//
// A 9px letter-spaced uppercase label followed immediately by a sibling span,
// and nothing between them. There are 53 uses of that label style across 17
// files, so this measures the GAP rather than trusting a grep: for every label
// that sits on the same line as the text after it, how many pixels are between
// the end of the label's ink and the start of the next.
//
//   node scripts/verify-label-gap.mjs
//   ROUTES=/coach/bhbc GAP=4 node scripts/verify-label-gap.mjs
import P from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
// 3px is the floor: below that the two read as one word. A deliberate design
// can sit at 4-6; nothing legible sits at 0.
const GAP = Number(process.env.GAP || 3);
const WIDTHS = (process.env.WIDTHS || '390,1280').split(',').map(Number);
const DEFAULT_ROUTES = ['/coach/bhbc', '/coach/dashboard', '/coach/athletes', '/coach/programs',
  '/coach/tasks', '/coach/sessions', '/coach/billing', '/athlete', '/demo/coach'];
const ROUTES = (process.env.ROUTES || DEFAULT_ROUTES.join(',')).split(',').map((s) => unmangleArg(s.trim())).filter(Boolean);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SCAN = `(() => {
  const out = [];
  let looked = 0;
  const isLabel = (cs) => {
    const ls = parseFloat(cs.letterSpacing);
    return cs.textTransform === 'uppercase'
      && Number.isFinite(ls) && ls >= 0.5
      && parseFloat(cs.fontSize) <= 13
      && (parseInt(cs.fontWeight, 10) || 400) >= 600;
  };
  const inkRight = (el) => {
    const n = [...el.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim());
    if (!n) return null;
    const r = document.createRange(); r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    return b.width ? b : null;
  };
  for (const el of document.querySelectorAll('span,div,label,b,strong')) {
    if (el.children.length) continue;
    const txt = (el.textContent || '').trim();
    if (!txt || txt.length > 28) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (!isLabel(cs)) continue;
    const a = inkRight(el);
    if (!a) continue;
    // The next thing on the SAME LINE that carries text.
    let sib = el.nextElementSibling;
    while (sib && !(sib.textContent || '').trim()) sib = sib.nextElementSibling;
    if (!sib) continue;
    const bEl = sib.children.length ? sib.querySelector('*') || sib : sib;
    const b = inkRight(bEl) || bEl.getBoundingClientRect();
    if (!b || !b.width) continue;
    if (Math.abs(b.top - a.top) > 6) continue;          // not the same line
    looked++;
    // RTL puts the value on the LEFT of the label, so measure the inner edge.
    const rtl = cs.direction === 'rtl';
    const gap = rtl ? (a.left - b.right) : (b.left - a.right);
    if (gap < TOLERANCE) {
      out.push({ label: txt.slice(0, 18), next: (sib.textContent || '').trim().slice(0, 26), gap: Math.round(gap * 10) / 10, rtl });
    }
  }
  return { out, looked };
})()`;

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 900000 });
const pg = await b.newPage();
await signIn(pg, BASE);
if (!(await assertAuthed(pg, BASE))) { await pg.close(); b.disconnect(); process.exit(2); }

const bad = [];
let looked = 0, pages = 0;
for (const route of ROUTES) {
  for (const w of WIDTHS) {
    await pg.setViewport({ width: w, height: 1000, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
    await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await wait(route === '/coach/bhbc' ? 8000 : 5000);
    // OPEN WHAT IS CLOSED FIRST. The pair he photographed - PLAN / TRAINED -
    // lives inside a collapsed practice row, so the first version of this gate
    // measured 14 pairs, found 0, and missed the exact defect it was written
    // for. Same lesson as the tab walk in the ink sweep: a gate only sees what
    // is rendered.
    try {
      for (let round = 0; round < 3; round++) {
        const opened = await pg.evaluate(() => {
          const shut = [...document.querySelectorAll('[aria-expanded="false"]')].filter((e) => e.offsetParent);
          shut.slice(0, 25).forEach((e) => e.click());
          return shut.length;
        });
        if (!opened) break;
        await wait(1200);
      }
    } catch (e) { /* nothing to open */ }
    let res;
    try { res = await pg.evaluate(SCAN.replace(/TOLERANCE/g, String(GAP))); } catch (e) { continue; }
    pages++; looked += res.looked;
    for (const f of res.out) bad.push(`${route} @${w}  "${f.label}" touches "${f.next}"  gap ${f.gap}px${f.rtl ? ' (rtl)' : ''}`);
  }
}
await pg.close();
b.disconnect();

console.log('');
if (!looked) {
  console.log('FAILED: no label/value pairs were found at all - the selector matched nothing, so a zero here means nothing.');
  process.exit(1);
}
for (const x of [...new Set(bad)].slice(0, 40)) console.log('  ' + x);
console.log(bad.length
  ? `${bad.length} label(s) touching their value across ${pages} page loads (${looked} pairs measured)`
  : `0 - every label is clear of its value, ${looked} pairs measured across ${pages} page loads`);
process.exit(bad.length ? 1 : 0);
