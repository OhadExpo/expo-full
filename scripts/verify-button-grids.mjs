// EVERY BUTTON GRID, EVERYWHERE, OCD (#899, Ohad 23.10 on the Properties fix: "make sure everthing everywhere is ocd like
// this"). For every route in docs/SURFACES.md (plus the club tabs), at phone / tablet / desktop, Hebrew and English, it
// measures every .chip-grid and .joined-buttons on the page:
//   HOLE      a row of the grid that does not fill its width (3 + 2 in a 3-column grid leaves an empty cell)
//   CLIPPED   a cell whose label is cut (its content is wider than the cell)
//   EDGES     two grids stacked one right under the other (<= 16px apart) whose outer left/right edges differ - the
//             "two grids, two start lines" defect of the Workouts and Properties screens
//   UNEVEN    cells in one grid of different heights
// Read-only (opens pages, clicks nothing). Prints each finding with the route, width, language and the grid's label.
//   BASE=https://expo-app.co.il node scripts/verify-button-grids.mjs [--w=390,820,1440] [--only=bhbc]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5392';
const WIDTHS = ((process.argv.find((a) => a.startsWith('--w=')) || '--w=390,820,1440').slice(4)).split(',').map(Number);
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
let ROUTES = [...new Set([...md.matchAll(/`(\/(?:coach|athlete)\/[a-z0-9/-]*[a-z0-9])`/g)].map((m) => m[1]))].filter((p) => !/<|\.\.\./.test(p));
for (const t of ['overview', 'roster', 'schedule', 'practices', 'lifts', 'medical', 'games']) ROUTES.push(`/coach/bhbc/${t}`);
ROUTES = [...new Set(ROUTES)].filter((r) => !ONLY || r.includes(ONLY)).sort();

const MEASURE = () => {
  const out = [];
  const grids = [...document.querySelectorAll('.chip-grid, .joined-buttons')].filter((g) => { const r = g.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(g).visibility !== 'hidden'; });
  const label = (g) => (g.getAttribute('aria-label') || [...g.children].map((c) => c.textContent.trim()).filter(Boolean).slice(0, 3).join('/')).slice(0, 50);
  for (const g of grids) {
    const gr = g.getBoundingClientRect();
    const cells = [...g.children].filter((c) => c.getBoundingClientRect().width > 0);
    if (!cells.length) continue;
    if (getComputedStyle(g).display === 'grid') {
      const tops = [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top)))];
      for (const t of tops) {
        const row = cells.filter((c) => Math.round(c.getBoundingClientRect().top) === t);
        const used = row.reduce((a, c) => a + c.getBoundingClientRect().width, 0);
        const inner = g.clientWidth;
        if (inner - used > 4) out.push({ kind: 'HOLE', grid: label(g), detail: `a row of ${row.length} fills ${Math.round(used)} of ${inner}px` });
      }
    }
    for (const c of cells) if (c.scrollWidth > c.clientWidth + 1) out.push({ kind: 'CLIPPED', grid: label(g), detail: `"${c.textContent.trim().slice(0, 30)}" needs ${c.scrollWidth}px, has ${c.clientWidth}` });
    const hs = [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().height)))];
    if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 1 && getComputedStyle(g).display === 'grid') {
      // only cells that share a row must match
      const tops = [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top)))];
      for (const t of tops) { const rh = [...new Set(cells.filter((c) => Math.round(c.getBoundingClientRect().top) === t).map((c) => Math.round(c.getBoundingClientRect().height)))]; if (rh.length > 1 && Math.max(...rh) - Math.min(...rh) > 1) out.push({ kind: 'UNEVEN', grid: label(g), detail: `heights ${rh.join('/')} in one row` }); }
    }
  }
  // stacked pairs
  for (let i = 0; i < grids.length; i++) for (let j = 0; j < grids.length; j++) {
    if (i === j) continue;
    const a = grids[i].getBoundingClientRect(), b = grids[j].getBoundingClientRect();
    const gap = b.top - a.bottom;
    if (gap < 0 || gap > 16) continue;
    if (grids[i].contains(grids[j]) || grids[j].contains(grids[i])) continue;
    const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    if (horizontalOverlap < Math.min(a.width, b.width) * 0.5) continue;
    const dl = Math.round(b.left - a.left), dr = Math.round(b.right - a.right);
    if (Math.abs(dl) > 1 || Math.abs(dr) > 1) out.push({ kind: 'EDGES', grid: `${label(grids[i])} over ${label(grids[j])}`, detail: `start ${dl}px, end ${dr}px apart` });
  }
  return { grids: grids.length, findings: out };
};

const b = await puppeteer.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9444'   /* #958: off-screen Chrome; CDP=9222 to use his */, defaultViewport: null, protocolTimeout: 300000 });
const all = []; let measured = 0, empty = 0;
for (const lang of ['he', 'en']) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  await p.evaluateOnNewDocument((l) => { try { (localStorage.setItem('expo-lang', l), sessionStorage.setItem('expo-athlete-lang', l)); sessionStorage.setItem('bhbc-lang-session', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch { /* */ } }, lang);
  const si = await signIn(p, BASE);
  if (!si || !si.signedIn) { console.log(`NOT MEASURED (${lang}): sign-in failed - ${JSON.stringify(si)}`); await ctx.close(); continue; }
  for (const w of WIDTHS) {
    const mob = w < 1000;
    await p.emulate({ viewport: { width: w, height: 1000, deviceScaleFactor: 1, isMobile: mob, hasTouch: mob }, userAgent: mob ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
    for (const r of ROUTES) {
      try {
        await p.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 60000 }); await new Promise((x) => setTimeout(x, 6000));
        const here = await p.evaluate(() => location.pathname);
        if (/\/login$/.test(here)) { console.log(`NOT MEASURED ${lang} ${w} ${r}: landed on /login`); continue; }
        const res = await p.evaluate(MEASURE);
        measured++; if (!res.grids) empty++;
        for (const f of res.findings) { all.push({ lang, w, r, ...f }); console.log(`${f.kind.padEnd(7)} ${lang} ${String(w).padEnd(4)} ${r.padEnd(34)} [${f.grid}] ${f.detail}`); }
      } catch (e) { console.log(`ERROR ${lang} ${w} ${r}: ${String(e.message).slice(0, 80)}`); }
    }
  }
  await ctx.close();
}
b.disconnect();
fs.writeFileSync('audit-out/BUTTON-GRIDS-899.json', JSON.stringify(all, null, 1));
const byKind = {}; for (const f of all) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
console.log(`\n${measured} route x width x language combinations measured (${empty} had no button grid), ${all.length} finding(s) ${JSON.stringify(byKind)}`);
process.exit(all.length ? 1 : 0);
