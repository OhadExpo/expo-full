// K13: where does the task-row priority pill sit relative to its row, EN vs HE (start-edge offsets).
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1366, height: 900 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1000); await signIn(pg, BASE);
for (const lang of ['en', 'he']) {
  await pg.goto(`${BASE}/coach/tasks?lang=${lang}`, { waitUntil: 'domcontentloaded' }); await wait(7000);
  const r = await pg.evaluate(() => {
    const sel = document.querySelector('select.task-select option[value]')?.parentElement;
    const rows = [...document.querySelectorAll('select.task-select')].filter((s) => /urgent|high|normal|low/i.test([...s.options].map((o) => o.value).join(' '))).slice(0, 2);
    const rtl = getComputedStyle(document.body).direction === 'rtl' || document.documentElement.dir === 'rtl';
    return rows.map((s) => {
      let row = s.parentElement; for (let i = 0; i < 4; i++) row = row.parentElement;
      const a = s.getBoundingClientRect(), R = row.getBoundingClientRect();
      const start = rtl ? R.right - a.right : a.left - R.left;
      return { start: Math.round(start), w: Math.round(a.width), rowW: Math.round(R.width), dir: getComputedStyle(row).direction, kids: [...s.parentElement.parentElement.children].map((c) => (c.innerText || c.tagName).slice(0, 18)) };
    });
  });
  console.log(lang, JSON.stringify(r));
}
await pg.close(); b.disconnect();
