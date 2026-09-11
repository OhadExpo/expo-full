// RTL mirror parity, measured. For each route: every visible element's
// inline-start offset inside its parent (en: left edge from parent's left;
// he: right edge from parent's right) and its y. A physical margin/padding/
// alignment shows up as a difference; text-length differences do not, because
// the offset is taken from the START edge. Output: per route, the worst
// offenders with a DOM path, so the CSS can be found and made logical.
//   CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 ROUTES=/coach,/coach/athletes node audit-out/probe-rtl-mirror.mjs [base] [width]
import P from 'puppeteer-core';
import fs from 'node:fs';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const W = Number(process.argv[3] || 1366);
const ROUTES = (process.env.ROUTES || '/coach,/coach/athletes,/coach/programs,/coach/review,/coach/sessions,/coach/billing,/coach/tasks,/coach/intake,/coach/challenges,/coach/exercises,/coach/calendar,/coach/review-tools').split(',');
const TOL = Number(process.env.TOL || 2);
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await pg.setViewport({ width: W, height: 1000 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
const collect = () => pg.evaluate(() => {
  const path = (el) => { const parts = []; let e = el; while (e && e !== document.body) { const p = e.parentElement; if (!p) break; const sibs = [...p.children].filter((c) => c.tagName === e.tagName); parts.unshift(e.tagName.toLowerCase() + (sibs.length > 1 ? `[${sibs.indexOf(e)}]` : '')); e = p; } return parts.join('>'); };
  const out = {};
  const els = [...document.querySelectorAll('main *, header *')].filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 1000 && r.top >= 0;
  });
  for (const el of els) {
    const p = el.parentElement; if (!p) continue;
    const r = el.getBoundingClientRect(); const pr = p.getBoundingClientRect();
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl' || document.querySelector('.app-root')?.getAttribute('dir') === 'rtl';
    const start = rtl ? (pr.right - r.right) : (r.left - pr.left);
    const end = rtl ? (r.left - pr.left) : (pr.right - r.right);
    out[path(el)] = { start: +start.toFixed(1), end: +end.toFixed(1), y: +r.top.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1), tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30) };
  }
  return out;
});
const report = {};
for (const route of ROUTES) {
  const snaps = {};
  for (const lang of ['en', 'he']) {
    await pg.evaluate((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} }, lang);
    await pg.goto(BASE + route + '?lang=' + lang, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
    await wait(2500);
    snaps[lang] = await collect();
  }
  const rows = [];
  for (const [k, en] of Object.entries(snaps.en)) {
    const he = snaps.he[k]; if (!he) continue;
    // Skip text-bearing leaves whose width differs a lot: their START offset is
    // still meaningful, but their END offset is content-driven.
    const dStart = Math.abs(en.start - he.start), dY = Math.abs(en.y - he.y), dH = Math.abs(en.h - he.h);
    if (dStart > TOL || dH > TOL) rows.push({ k, dStart: +dStart.toFixed(1), dY: +dY.toFixed(1), dH: +dH.toFixed(1), en: `${en.start}/${en.y}/${en.h}`, he: `${he.start}/${he.y}/${he.h}`, text: en.text || he.text, tag: en.tag });
  }
  rows.sort((a, c) => (c.dStart + c.dH) - (a.dStart + a.dH));
  report[route] = { compared: Object.keys(snaps.en).length, flagged: rows.length, rows: rows.slice(0, 40) };
  console.log(`${route.padEnd(22)} compared ${Object.keys(snaps.en).length}  flagged ${rows.length}`);
  for (const r of rows.slice(0, 8)) console.log(`   dStart=${String(r.dStart).padStart(6)} dH=${String(r.dH).padStart(5)} ${r.tag.padEnd(6)} ${r.text.padEnd(30)} ${r.k.slice(-70)}`);
}
fs.writeFileSync(`audit-out/perf/rtl-mirror-${W}.json`, JSON.stringify(report, null, 1));
await ctx.close(); b.disconnect();
