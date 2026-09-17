// Dump the rendered Hebrew text of every coach-demo top tab (mock data only - public page).
import P from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(`${BASE}/demo/coach?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(6000);
const text = () => pg.evaluate(() => document.body.innerText.split(String.fromCharCode(10)).map((s) => s.trim()).filter((s) => /[\u0590-\u05FF]/.test(s) && s.split(/\s+/).length >= 3));
const tabs = await pg.evaluate(() => [...document.querySelectorAll('nav button, header button')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter(Boolean));
const seen = new Set(); let out = '';
for (const t of tabs) {
  await pg.evaluate((label) => { const el = [...document.querySelectorAll('nav button, header button')].find((e) => (e.innerText || '').trim() === label); if (el) el.click(); }, t);
  await wait(2200);
  const lines = (await text()).filter((l) => !seen.has(l) && seen.add(l));
  out += `\n### ${t}\n` + lines.join(String.fromCharCode(10)) + '\n';
}
fs.writeFileSync('C:/Users/ADMINI~1/AppData/Local/Temp/claude/demo_he.txt', out);
console.log('tabs', tabs.length, 'lines', seen.size);
await pg.close(); b.disconnect();
