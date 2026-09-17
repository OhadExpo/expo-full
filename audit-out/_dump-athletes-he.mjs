// Rendered Hebrew of /coach/athletes (expandables opened) for a native read of composed lines.
// LOCAL output (task titles are his data): C:/Users/ADMINI~1/AppData/Local/Temp/claude/athletes_he.txt
import P from 'puppeteer-core';
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto('http://127.0.0.1:4173/coach/athletes?lang=he', { waitUntil: 'domcontentloaded' }); await wait(7000);
await pg.evaluate(() => [...document.querySelectorAll('[aria-expanded="false"]')].slice(0, 20).forEach((e) => e.click()));
await wait(1500);
const lines = await pg.evaluate(() => {
  const t = document.querySelector('main')?.innerText || document.body.innerText;
  const attrs = [...document.querySelectorAll('main [title], main [placeholder]')].map((e) => e.getAttribute('title') || e.getAttribute('placeholder'));
  return [...t.split('\n'), ...attrs].map((s) => (s || '').trim()).filter((s) => /[\u0590-\u05FF]/.test(s));
});
fs.writeFileSync('C:/Users/ADMINI~1/AppData/Local/Temp/claude/athletes_he.txt', [...new Set(lines)].join('\n'));
console.log('lines', new Set(lines).size);
await pg.close(); b.disconnect();
