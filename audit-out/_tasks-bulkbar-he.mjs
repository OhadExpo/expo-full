// O19: the Tasks bulk bar in Hebrew, rendered. READ-ONLY: selects one row (client
// state only) and never clicks a status / delete button.
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1500);
await signIn(pg, BASE);
await pg.evaluate(() => localStorage.setItem('expo-lang', 'he'));
await pg.goto(`${BASE}/coach/tasks?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(9000);
await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => (e.innerText || '').trim() === 'לוח'); if (b) b.click(); });
await wait(2500);
const picked = await pg.evaluate(() => { const b = document.querySelector('.tv8-board-select'); if (!b) return 'no board select'; b.click(); return 'clicked (title: ' + b.getAttribute('title') + ')'; });
console.log('select:', JSON.stringify(picked)); await pg.screenshot({ path: 'audit-out/shots-0917/_tasks-he.png' });
await wait(1200);
const bar = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).zIndex === '1400');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { text: el.innerText.replace(/\s+/g, ' '), titles: [...el.querySelectorAll('[title]')].map((e) => e.getAttribute('title')), dir: getComputedStyle(el).direction, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
});
console.log(JSON.stringify(bar, null, 1));
if (bar) await pg.screenshot({ path: 'audit-out/shots-0917/tasks-bulkbar-he.png', clip: { x: Math.max(0, bar.box.x - 10), y: bar.box.y - 10, width: bar.box.width + 20, height: bar.box.height + 20 } });
await pg.close(); b.disconnect();
