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
  // CLICK=<regex>: a real mouse click on the smallest visible element whose text matches, then settle (drill-down screens).
  for (const rx of (process.env.CLICK || '').split('||').filter(Boolean)) {
    const hit = await pg.evaluate((r) => { const re = new RegExp(r); const el = [...document.querySelectorAll('button,a,div,span,td,h2,h3')].filter((e) => re.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 700).sort((x, y) => x.textContent.length - y.textContent.length)[0]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: el.textContent.trim().slice(0, 30) }; }, rx);
    if (hit) { await pg.mouse.click(hit.x, hit.y); await wait(2500); console.log('  clicked', JSON.stringify(hit.t)); } else console.log('  no match for', rx);
  }
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
  const name = (route.replace(/\//g, '_').replace(/^_/, '') || 'root') + (process.env.NAME ? '-' + process.env.NAME : '');
  fs.writeFileSync(`audit-out/he-screens/${name}.txt`, lines.join('\n'));
  console.log(route, lines.length, 'lines', lines.filter((l) => /[֐-׿]/.test(l)).length, 'hebrew');
}
await ctx.close(); b.disconnect();
