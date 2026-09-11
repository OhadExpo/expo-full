// Every visible string on a coach route, in Hebrew, in reading order — what
// he actually sees, not the dictionary. One file per route for the judge.
//   CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 ROUTES=/coach,/coach/athletes node audit-out/dump-screen-he.mjs [base]
import P from 'puppeteer-core';
import fs from 'node:fs';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTES = (process.env.ROUTES || '/coach,/coach/athletes,/coach/programs,/coach/review,/coach/sessions,/coach/billing,/coach/tasks').split(',');
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await pg.setViewport({ width: 1500, height: 1000 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
fs.mkdirSync('audit-out/he-screens', { recursive: true });
for (const route of ROUTES) {
  await pg.goto(BASE + route + '?lang=he', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
  await wait(2500);
  // Visible text nodes only, deduplicated, Hebrew-bearing lines first-class;
  // names and numbers are kept so the judge sees the context they sit in.
  const lines = await pg.evaluate(() => {
    const out = []; const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
      const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      if (seen.has(t)) continue; seen.add(t);
      out.push(t);
    }
    return out;
  });
  const name = route.replace(/\//g, '_').replace(/^_/, '') || 'root';
  fs.writeFileSync(`audit-out/he-screens/${name}.txt`, lines.join('\n'));
  console.log(route, lines.length, 'lines', lines.filter((l) => /[֐-׿]/.test(l)).length, 'hebrew');
}
await ctx.close(); b.disconnect();
