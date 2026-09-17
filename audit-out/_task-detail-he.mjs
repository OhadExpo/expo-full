// K13: expanded task detail on the Hebrew screen (forced-LTR blocks). Local screenshot only (names).
import P from 'puppeteer-core';
const BASE = 'http://127.0.0.1:4173';
const LANG = process.argv[2] || 'he';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1366, height: 900 });
await pg.goto(`${BASE}/coach/tasks?lang=${LANG}`, { waitUntil: 'domcontentloaded' }); await wait(7000);
await pg.evaluate(() => { const s = document.querySelector('select.task-select'); let row = s; for (let i = 0; i < 3; i++) row = row.parentElement; row.click(); });
await wait(1500);
await pg.screenshot({ path: `C:/Users/ADMINI~1/AppData/Local/Temp/claude/task-detail-${LANG}.png` });
await pg.close(); b.disconnect();
