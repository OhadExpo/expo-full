// Screenshot the club zone medical protocol block (label run-on check).
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1.5 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await signIn(pg, BASE);
await pg.evaluate(() => localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('he')));
await pg.goto(`${BASE}/coach/bhbc?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(8000);
await pg.evaluate(() => { const el = [...document.querySelectorAll('.bhbc-tab, [role="tab"]')].find((e) => (e.innerText || '').trim() === 'רפואי'); if (el) el.click(); });
await wait(3000);
const box = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').includes('הפניה רפואית') && (d.innerText || '').includes('סף כאב')).sort((a, b) => a.innerText.length - b.innerText.length)[0];
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 600) };
});
console.log(JSON.stringify(box));
if (box) { await wait(500); const r2 = await pg.evaluate(() => { const el = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').includes('הפניה רפואית') && (d.innerText || '').includes('סף כאב')).sort((a, b) => a.innerText.length - b.innerText.length)[0]; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 600) }; }); await pg.screenshot({ path: 'audit-out/shots-0917/_bhbc-med-protocol.png', clip: r2 }); }
await pg.close(); b.disconnect();
