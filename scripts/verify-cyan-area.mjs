// WHERE IS CYAN A FILL, AND HOW BIG IS IT?
//
// Ohad, 19.9, on /coach/chat-audit in light: "all cyan is horrible design. full
// sweep and redisgn to be perfectly aligned with my ocd. everywhere and
// anywhere in our platforms."
//
// That is not a request to change the brand colour - three standing rules say
// cyan stays bright, and they are right. It sharpens them: cyan as a STROKE (a
// hairline, a border, a label, a logo) is the identity; cyan as a large flat
// FILL is what he is pointing at. A primary button filled cyan is correct. Five
// full-bleed cyan bars stacked down a page is not.
//
// So the thing to measure is AREA, not count. A grep says 37 files use cyan as
// a background; that is useless. This says which elements paint how many square
// pixels of it, per route, per theme, worst first - so the redesign has a list.
//
//   node scripts/verify-cyan-area.mjs [width]
//   THEMES=light node scripts/verify-cyan-area.mjs
//   MAX=12000 node scripts/verify-cyan-area.mjs     # fail above this area
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const W = Number(process.argv[2] || 1500);
const THEMES = (process.env.THEMES || 'light,dark').split(',');
// 25,000px2, and the first number I picked was wrong. I guessed 8,000 on the
// theory that a chip is ~1,500 and a primary button ~3,000 - but measured, the
// marketing CTAs are 331x37 = 12,232 and 317x39 = 12,396, and a filled cyan CTA
// is the brand doing its job, not the defect. The defect is a BAR: his strips
// were ~460x41 = 18,860 at phone width, and a card strip at 1500px is ~53,000.
// 25,000 sits above the widest legitimate button and below the narrowest slab.
const MAX = Number(process.env.MAX || 25000);

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/dashboard']; }
};

// Brand cyan is #39BDFF = rgb(57,189,255). "Cyan-ish" means near it in hue and
// saturated - a pale tint of it is exactly what we are moving TO, so a tint
// must not be counted as a fill.
const MEASURE = `(() => {
  const out = [];
  const isCyanFill = (c) => {
    const m = /^rgba?\\((\\d+), ?(\\d+), ?(\\d+)(?:, ?([\\d.]+))?\\)$/.exec(c || '');
    if (!m) return null;
    const r = +m[1], g = +m[2], b = +m[3], a = m[4] === undefined ? 1 : +m[4];
    if (a < 0.5) return null;
    if (b < 150) return null;
    if (b - r < 60) return null;
    if (g <= r) return null;
    if (b - g < 20) return null;
    const pale = (r + g + b) / 3 > 215;
    if (pale) return null;
    return { r, g, b, a };
  };
  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
    const hit = isCyanFill(cs.backgroundColor);
    if (!hit) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const area = Math.round(r.width * r.height);
    const txt = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 34);
    out.push({
      area, w: Math.round(r.width), h: Math.round(r.height),
      tag: el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''),
      bg: cs.backgroundColor, txt,
    });
  });
  return out.sort((a, b) => b.area - a.area).slice(0, 8);
})()`;

const ROUTES = (process.env.ROUTES ? process.env.ROUTES.split(',') : routesFromManifest()).map(unmangleArg);
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const page = await b.newPage();
let worst = [], views = 0, elements = 0;
try {
  await signIn(page, BASE);
  await page.setViewport({ width: W, height: 950, isMobile: false });
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      // ?theme= is applied by public/boot-theme.js BEFORE paint. Setting
      // data-theme from outside does not hold - the app re-applies it on mount,
      // and the sample would silently be taken in the wrong theme.
      await page.goto(`${BASE}${route}?theme=${theme}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 3500));
      let hits = [];
      try { hits = await page.evaluate(MEASURE); } catch { hits = []; }
      views++;
      elements += hits.length;
      for (const h of hits) if (h.area >= MAX) worst.push({ ...h, route, theme });
    }
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 2;
} finally { await page.close().catch(() => {}); b.disconnect(); }

worst.sort((a, b2) => b2.area - a.area);
for (const x of worst.slice(0, 40)) {
  console.log(`${String(x.area).padStart(7)}px2  ${String(x.w).padStart(4)}x${String(x.h).padStart(3)}  ${x.theme.padEnd(5)}  ${x.route.padEnd(26)} ${x.tag.slice(0, 26).padEnd(26)} ${x.bg.padEnd(20)} "${x.txt}"`);
}
// The coverage prints beside the number, always: a zero from a sweep that
// reached nothing is the failure this whole audit keeps finding.
console.log(`\n${worst.length} cyan FILL(s) at or above ${MAX}px2 — ${views} view(s) measured across ${ROUTES.length} route(s) x ${THEMES.length} theme(s) at ${W}px, ${elements} cyan-ish element(s) seen in total`);
process.exit(worst.length ? 1 : 0);
