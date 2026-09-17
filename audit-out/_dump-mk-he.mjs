// Dump rendered Hebrew text of the marketing site pages (public).
import P from 'puppeteer-core';
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1300, height: 900 });
const seen = new Set(); let out = '';
for (const path of ['/he', '/he#/programs', '/he#/gym', '/he#/about', '/he#/programs/rehab-return', '/he#/programs/athlete-conditioning-12']) {
  await pg.goto('http://127.0.0.1:4174' + path, { waitUntil: 'domcontentloaded' }); await wait(3500);
  const lines = await pg.evaluate(() => document.body.innerText.split(String.fromCharCode(10)).map((s) => s.trim()).filter((s) => /[\u0590-\u05FF]/.test(s) && s.split(/\s+/).length >= 3));
  out += `\n### ${path}\n` + lines.filter((l) => !seen.has(l) && seen.add(l)).join(String.fromCharCode(10)) + '\n';
}
fs.writeFileSync('C:/Users/ADMINI~1/AppData/Local/Temp/claude/mk_he.txt', out);
console.log('lines', seen.size);
await pg.close(); b.disconnect();
