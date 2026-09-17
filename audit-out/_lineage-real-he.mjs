// O9: the Training Analysis page on REAL athletes (signed in as owner), Hebrew, desktop.
// LOCAL ONLY output (athlete names): audit-out/_lineage-real-he.json + png.
import P from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1500);
const s = await signIn(pg, BASE); console.log('signin', JSON.stringify(s));
await pg.evaluate(() => localStorage.setItem('expo-lang', 'he'));
await pg.goto(`${BASE}/coach/programs?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(9000);
const clickText = (re) => pg.evaluate((src) => { const rx = new RegExp(src); const el = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')].find((e) => rx.test((e.innerText || '').trim()) && e.offsetParent !== null); if (el) { el.click(); return (el.innerText || '').trim(); } return null; }, re.source);
const view = await clickText(/ניתוח|ANALYSIS/);
console.log('view clicked:', !!view);
await wait(6000);
for (let i = 0; i < 3; i++) { await pg.evaluate(() => document.querySelectorAll('.lin-hd[role="button"][aria-expanded="false"]').forEach((h) => h.click())); await wait(500); }
const info = await pg.evaluate(() => {
  const hd = document.querySelector('.lin-hd');
  const chain = [];
  for (let e = hd; e; e = e.parentElement) chain.push(`${e.tagName} dir=${e.getAttribute('dir')} css=${getComputedStyle(e).direction}`);
  const text = document.body.innerText;
  const latin = text.match(/[A-Za-z][A-Za-z'’.\-]{2,}(?:\s+[A-Za-z][A-Za-z'’.\-]*)*/g) || [];
  return { headers: document.querySelectorAll('.lin-hd').length, chain, latin: [...new Set(latin)], overflowX: document.documentElement.scrollWidth > window.innerWidth };
});
fs.writeFileSync('audit-out/_lineage-real-he.json', JSON.stringify(info, null, 2));
await pg.screenshot({ path: 'audit-out/shots-0917/_lineage-real-he.png', fullPage: false });
const box = await pg.evaluate(() => { const hd = document.querySelector('.lin-hd'); const r = hd ? hd.parentElement.getBoundingClientRect() : null; return r ? { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 400) } : null; });
if (box) await pg.screenshot({ path: 'audit-out/shots-0917/_lineage-real-he-zoom.png', clip: box });
console.log('headers', info.headers, 'overflowX', info.overflowX);
console.log(info.chain.join('\n'));
await pg.close(); b.disconnect();
