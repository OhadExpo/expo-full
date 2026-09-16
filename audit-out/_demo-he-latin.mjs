// Walk the coach demo's top tabs in Hebrew and list every visible Latin run,
// so a label that still renders English cannot hide behind a green gate.
//   BASE=http://127.0.0.1:4173 node audit-out/_demo-he-latin.mjs [needle,needle]
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const NEEDLES = (process.argv[2] || '').split(',').filter(Boolean);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(`${BASE}/demo/coach?lang=he`, { waitUntil: 'domcontentloaded' });
await wait(6000);
const visibleLatin = () => pg.evaluate(() => {
  const out = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walk.nextNode())) {
    const el = n.parentElement; if (!el || !el.offsetParent) continue;
    const m = n.data.match(/[A-Za-z][A-Za-z'’.\-]{2,}(?:\s+[A-Za-z][A-Za-z'’.\-]*)*/g);
    if (m) m.forEach((x) => out.add(x.trim()));
  }
  return [...out];
});
const tabs = await pg.evaluate(() => [...document.querySelectorAll('nav button, header button')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter(Boolean));
const seen = new Map();
for (const t of tabs) {
  await pg.evaluate((label) => { const el = [...document.querySelectorAll('nav button, header button')].find((e) => (e.innerText || '').trim() === label); if (el) el.click(); }, t);
  await wait(1800);
  for (const x of await visibleLatin()) { if (!seen.has(x)) seen.set(x, t); }
}
console.log('tabs:', tabs.join(' | '));
const list = [...seen.entries()].map(([x, t]) => `${x}  @${t}`);
console.log(list.join('\n'));
if (NEEDLES.length) console.log('\nNEEDLES STILL ENGLISH:', NEEDLES.filter((nd) => [...seen.keys()].some((k) => k.toUpperCase().includes(nd.toUpperCase()))));
await pg.close(); b.disconnect();
