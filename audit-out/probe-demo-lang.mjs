// Does the public demo portal follow the language, and does ?lang=he take?
//   CDP=http://127.0.0.1:9223 node audit-out/probe-demo-lang.mjs http://127.0.0.1:4173
import P from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null });
const ctx = await b.createBrowserContext();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const latin = (t) => (t.match(/\b[A-Za-z]{2,}\b/g) || []).length;
async function look(url, label) {
  const pg = await ctx.newPage();
  await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
  await wait(2500);
  const r = await pg.evaluate(() => ({ dir: document.querySelector('[dir]')?.getAttribute('dir') || document.dir || '-', stored: (() => { try { return localStorage.getItem('expo-lang'); } catch { return '?'; } })(), text: document.body.innerText }));
  console.log(`${label.padEnd(34)} dir=${r.dir.padEnd(4)} stored=${String(r.stored).padEnd(5)} latin=${latin(r.text)}  :: ${r.text.replace(/\s+/g, ' ').slice(0, 90)}`);
  await pg.close();
}
await look(BASE + '/demo/athlete', 'fresh, no hint');
await look(BASE + '/demo/athlete?lang=he', 'with ?lang=he');
await look(BASE + '/demo/athlete', 'next visit, no hint (kept?)');
await look(BASE + '/demo/athlete?lang=en', 'back with ?lang=en');
await ctx.close();
b.disconnect();
