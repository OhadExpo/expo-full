// Locate a rendered text node on a Hebrew coach screen and print its ancestor chain + nearby text (debug aid).
import P from 'puppeteer-core';
const [, , route, needle] = process.argv;
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto(`${BASE}${route}?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(7000);
console.log(await pg.evaluate((n) => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (t.nodeValue.trim() === n) {
    const chain = []; let e = t.parentElement;
    for (let i = 0; i < 5 && e; i++, e = e.parentElement) chain.push(`${e.tagName} ${(e.getAttribute('style') || '').slice(0, 60)} :: ${(e.innerText || '').replace(/\s+/g, ' ').slice(0, 90)}`);
    return chain.join('\n');
  }
  return 'not found';
}, needle));
await pg.close(); b.disconnect();
