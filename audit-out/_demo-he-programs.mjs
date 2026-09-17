// Coach demo in Hebrew: Programs → Grid, then open the first program, and list
// the visible Latin in each view. Needles = labels wired by hole #9.
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(`${BASE}/demo/coach?lang=${process.argv[2] || 'he'}`, { waitUntil: 'domcontentloaded' });
await wait(6000);
const click = (src) => pg.evaluate((s) => { const rx = new RegExp(s); const el = [...document.querySelectorAll('button, a, [role="button"]')].find((e) => rx.test((e.innerText || '').trim()) && e.offsetParent); if (el) { el.click(); return (el.innerText || '').trim(); } return null; }, src);
const latin = () => pg.evaluate(() => { const out = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el || !el.offsetParent) continue; (n.data.match(/[A-Za-z][A-Za-z'’.\-/]{2,}(?:\s+[A-Za-z][A-Za-z'’.\-/]*)*/g) || []).forEach((x) => out.add(x.trim())); } return [...out]; });
await click('^(ATHLETES|מתאמנים)'); await wait(1200);
await click('^(PROGRAMS|תוכניות)$'); await wait(1500);
console.log('grid:', await click('^(GRID|Grid|רשת|כרטיסים)$')); await wait(1500);
console.log('GRID LATIN:', JSON.stringify(await latin()));
console.log('CRUD BUTTONS:', JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('.cd-crud')].slice(0, 6).map((e) => e.textContent.trim()))));
await click('^(TABLE|Table|טבלה)$'); await wait(1200);
const opened = await pg.evaluate(() => { const row = document.querySelector('tbody tr, [data-plan-id]'); if (row) { row.click(); return true; } return false; });
await wait(2000);
console.log('opened:', opened, 'EDITOR LATIN:', JSON.stringify(await latin()));
await pg.close(); b.disconnect();
