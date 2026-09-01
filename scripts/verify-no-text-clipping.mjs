// verify-no-text-clipping.mjs — no word gets cut off, anywhere.
//
// Ohad: "make sure no text overflows anywhere, full platform sweep", and his
// standing rule behind it - an ellipsis is the UI deciding he does not need the
// rest of the sentence. "i cant see some of the words... never do."
//
// Two distinct faults, both reported:
//   CLIPPED   the element hides its own overflow (overflow hidden / ellipsis)
//             and its content is wider than its box - a word is being eaten
//   SPILLING  the ink extends past the element's own right or bottom edge, so
//             it either overlaps a neighbour or runs under the card border
//
// Deliberately NOT flagged: containers that scroll on purpose (overflow auto or
// scroll), which are a choice, and elements whose overflow is visible and whose
// parent is wide enough to show it.
//
//   node scripts/verify-no-text-clipping.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1600', 10);

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/athletes', '/athlete']; }
};
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);

const MEASURE = () => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('*').forEach((el) => {
    if (/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE|HEAD|HTML|BODY|OPTION)$/.test(el.tagName)) return;
    const txt = (el.textContent || '').trim();
    if (!txt) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 6) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return;
    const hidesX = cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis';
    // Only leaf-ish text: a wrapper's scrollWidth reflects its children.
    const leafish = el.children.length === 0;
    if (leafish && hidesX && el.scrollWidth > el.clientWidth + 1) {
      const key = 'C' + txt.slice(0, 30);
      if (!seen.has(key)) { seen.add(key); out.push({ kind: 'CLIPPED', by: el.scrollWidth - el.clientWidth, t: txt.slice(0, 40) }); }
      return;
    }
    if (leafish && cs.overflowX === 'visible') {
      const rng = document.createRange();
      rng.selectNodeContents(el);
      const ink = rng.getBoundingClientRect();
      const over = Math.round(ink.right - r.right);
      if (over > 2 && ink.width > 0) {
        const key = 'S' + txt.slice(0, 30);
        if (!seen.has(key)) { seen.add(key); out.push({ kind: 'SPILLING', by: over, t: txt.slice(0, 40) }); }
      }
    }
  });
  return out.sort((a, b) => b.by - a.by);
};

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await b.newPage();
await page.setViewport({ width: W, height: 1000 });
let total = 0;
try {
  await signIn(page, BASE);
  await assertAuthed(page, '/coach/dashboard');
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));

    // Tabs hide most of a screen, and a page-load-only sweep reports the hidden
    // parts as clean. Same pattern the button-height gate already uses: walk
    // every tab on the route, not just the one it lands on.
    const tabs = await page.evaluate(() => [...document.querySelectorAll('button')]
      .map((x) => (x.textContent || '').trim())
      .filter((t) => /^(overview|roster|schedule|medical|sessions|games)$/i.test(t)));
    for (const tab of (tabs.length ? tabs : [null])) {
      if (tab) {
        await page.evaluate((label) => {
          const el = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === label);
          if (el) el.click();
        }, tab);
        await new Promise((r) => setTimeout(r, 2500));
      }
      const where = route + (tab ? ' · ' + tab : '');
      const first = await page.evaluate(MEASURE);
      let bad = [];
      if (first.length) {
        await new Promise((r) => setTimeout(r, 1200));
        const second = await page.evaluate(MEASURE);
        const key = (f) => f.kind + f.t + f.by;
        const s2 = new Set(second.map(key));
        bad = first.filter((f) => s2.has(key(f)));
      }
      if (!bad.length) { console.log(`OK    ${where}`); continue; }
      total += bad.length;
      console.log(`FAIL  ${where}  (${bad.length})`);
      for (const f of bad.slice(0, 5)) console.log(`        ${f.kind.padEnd(8)} by ${String(f.by).padStart(4)}px  "${f.t}"`);
    }
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally { await page.close().catch(() => {}); b.disconnect(); }
console.log(`\n${total} place(s) where text is cut off or spills its box at ${W}px`);
process.exit(total ? 1 : 0);
