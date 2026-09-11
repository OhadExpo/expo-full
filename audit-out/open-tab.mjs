// Open a URL as a NEW tab in the debug Chrome (9222) unless a tab with that
// fragment is already open — then reload that one and bring it to the front.
//   CDP=http://127.0.0.1:9222 node audit-out/open-tab.mjs http://127.0.0.1:4182/
import puppeteer from 'puppeteer-core';
const url = process.argv[2];
const b = await puppeteer.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null });
const frag = new URL(url).host;
let pg = (await b.pages()).find((p) => p.url().includes(frag));
if (pg) { await pg.reload({ waitUntil: 'domcontentloaded' }); console.log('reloaded existing tab'); }
else { pg = await b.newPage(); await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); console.log('opened new tab'); }
await pg.bringToFront();
b.disconnect();
