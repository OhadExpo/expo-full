// The coach top bar, measured and photographed in both languages at one width:
// every direct child of the header (logo, tabs, toggle, icon buttons) with its
// box, so "not OCD" becomes numbers. Viewport-only screenshots (fast).
//   CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 node audit-out/probe-nav.mjs [base] [width]
import P from 'puppeteer-core';
import fs from 'node:fs';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const W = Number(process.argv[3] || 1500);
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DPR = Number(process.env.DPR || 1);
await pg.setViewport({ width: W, height: 900, deviceScaleFactor: DPR });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
const out = {};
for (const lang of ['en', 'he']) {
  await pg.evaluate((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} }, lang);
  await pg.goto(BASE + '/coach?lang=' + lang, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
  await wait(2000);
  out[lang] = await pg.evaluate(() => {
    const hdr = document.querySelector('header') || document.querySelector('nav')?.closest('div');
    if (!hdr) return { error: 'no header' };
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const items = [...hdr.querySelectorAll('a,button,img,svg')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top < 80 && !e.closest('button') || e.tagName === 'BUTTON'; });
    const seen = new Set();
    const rows = [];
    for (const e of items) {
      if (e.tagName !== 'BUTTON' && e.tagName !== 'A' && e.tagName !== 'IMG' && e.tagName !== 'SVG') continue;
      if (e.closest('button') && e.tagName !== 'BUTTON') continue;
      if (seen.has(e)) continue; seen.add(e);
      const cs = getComputedStyle(e);
      rows.push({ tag: e.tagName, text: (e.textContent || e.getAttribute('aria-label') || e.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 24), ...r(e), pad: cs.padding, border: cs.borderWidth, font: cs.fontSize });
    }
    return { header: r(hdr), dir: getComputedStyle(hdr).direction, rows };
  });
  await pg.screenshot({ path: `audit-out/nav-${lang}-${W}${DPR > 1 ? '@' + DPR + 'x' : ''}.png`, clip: { x: 0, y: 0, width: W, height: DPR > 1 ? 60 : 120 } });
}
fs.writeFileSync(`audit-out/perf/nav-${W}.json`, JSON.stringify(out, null, 1));
for (const lang of ['en', 'he']) {
  const o = out[lang];
  console.log(`--- ${lang} dir=${o.dir} header ${JSON.stringify(o.header)}`);
  for (const row of o.rows || []) console.log(`${row.tag.padEnd(6)} x=${String(row.x).padStart(7)} y=${String(row.y).padStart(5)} w=${String(row.w).padStart(6)} h=${String(row.h).padStart(5)} pad=${row.pad.padEnd(14)} bw=${row.border.padEnd(12)} ${row.text}`);
}
await ctx.close(); b.disconnect();
