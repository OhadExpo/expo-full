// Ink, not box: every small button (icon-only: ≤2 characters, or one <svg>)
// on a route, the centre of its INK (text range rect / svg rect) compared with
// the centre of its box. Ohad 2026-09-12: "the share button next to expand all
// is not vertically and horizontally centered … run a full audit everywhere".
//   CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 ROUTES=/coach,... node audit-out/probe-glyph-centring.mjs [base] [width] [tol]
import P from 'puppeteer-core';
import fs from 'node:fs';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const W = Number(process.argv[3] || 1500);
const TOL = Number(process.argv[4] || 1);
const ROUTES = (process.env.ROUTES || '/coach,/coach/athletes,/coach/programs,/coach/review,/coach/sessions,/coach/billing,/coach/tasks,/coach/exercises,/coach/calendar,/coach/intake,/coach/challenges,/coach/review-tools').split(',');
const CLICK = process.env.CLICK || ''; // optional: open a card on the first route (e.g. '^Block #')
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await pg.setViewport({ width: W, height: 1000 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
const all = {};
for (const route of ROUTES) {
  await pg.goto(BASE + route + '?lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
  await wait(2000);
  if (CLICK && route === ROUTES[0]) {
    const hit = await pg.evaluate((r) => { const rx = new RegExp(r); const el = [...document.querySelectorAll('div,span,button')].filter((e) => rx.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 700).sort((x, y) => x.textContent.length - y.textContent.length)[0]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, CLICK);
    if (hit) { await pg.mouse.click(hit.x, hit.y); await wait(3000); }
  }
  const rows = await pg.evaluate((tol) => {
    const out = [];
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      const box = el.getBoundingClientRect(); if (box.width === 0 || box.height === 0 || box.width > 60 || box.height > 60) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue;
      const svg = el.querySelector('svg');
      const text = (el.textContent || '').trim();
      let ink;
      if (svg && !text) ink = svg.getBoundingClientRect();
      else if (text.length > 0 && text.length <= 2) {
        // The tightest visible text node.
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, best = null;
        while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; const p = n.parentElement; if (getComputedStyle(p).visibility === 'hidden') continue; const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (r.width > 0) best = r; }
        ink = best;
      }
      if (!ink) continue;
      const dx = (ink.left + ink.width / 2) - (box.left + box.width / 2);
      const dy = (ink.top + ink.height / 2) - (box.top + box.height / 2);
      if (Math.abs(dx) > tol || Math.abs(dy) > tol) out.push({ text: text || '<svg>', dx: +dx.toFixed(1), dy: +dy.toFixed(1), box: `${box.width.toFixed(0)}×${box.height.toFixed(0)}`, ink: `${ink.width.toFixed(0)}×${ink.height.toFixed(0)}`, y: +box.top.toFixed(0), title: (el.getAttribute('title') || el.getAttribute('aria-label') || '').slice(0, 30) });
    }
    return out;
  }, TOL);
  all[route] = rows;
  console.log(`${route.padEnd(22)} off-centre ${rows.length}`);
  for (const r of rows.slice(0, 12)) console.log(`   ${String(r.text).padEnd(6)} dx=${String(r.dx).padStart(5)} dy=${String(r.dy).padStart(5)} box=${r.box.padEnd(7)} ink=${r.ink.padEnd(7)} y=${r.y} ${r.title}`);
}
fs.writeFileSync('audit-out/perf/glyph-centring.json', JSON.stringify(all, null, 1));
await ctx.close(); b.disconnect();
