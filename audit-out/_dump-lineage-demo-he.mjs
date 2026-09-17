// Dump the rendered Hebrew of the Training Analysis page on the demo (mock data), all sections open.
import P from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900 });
const clickText = (re) => pg.evaluate((src) => { const rx = new RegExp(src); const el = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')].find((e) => rx.test((e.innerText || '').trim()) && e.offsetParent !== null); if (el) { el.click(); return true; } return false; }, re.source);
await pg.goto(`${BASE}/demo/coach?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(6000);
await clickText(/^(ATHLETES|מתאמנים)/); await wait(1200);
await clickText(/^(PROGRAMS|Programs|תוכניות)$/); await wait(1500);
await clickText(/ניתוח|ANALYSIS/); await wait(3000);
for (let i = 0; i < 3; i++) { await pg.evaluate(() => document.querySelectorAll('.lin-hd[role="button"][aria-expanded="false"]').forEach((h) => h.click())); await wait(500); }
await pg.evaluate(() => document.querySelectorAll('.lin-hd[role="button"]:not([aria-expanded])').forEach((h) => { if (!h.nextElementSibling) h.click(); }));
await wait(1000);
const lines = await pg.evaluate(() => { const hd = document.querySelector('.lin-hd'); const root = hd ? hd.parentElement.parentElement : document.body; return root.innerText.split(String.fromCharCode(10)).map((s) => s.trim()).filter((s) => /[\u0590-\u05FF]/.test(s)); });
const uniq = [...new Set(lines)];
fs.writeFileSync('C:/Users/ADMINI~1/AppData/Local/Temp/claude/lineage_he.txt', uniq.join(String.fromCharCode(10)));
console.log('lines', uniq.length);
await pg.close(); b.disconnect();
