// Screenshot any route through the running debug Chrome, optionally after
// clicking something. Used to LOOK at a change instead of asserting it landed.
import puppeteer from 'puppeteer-core';
const [url, out, waitMs] = process.argv.slice(2);
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 1400, height: 1000 } });
const p = await b.newPage();
await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, Number(waitMs || 2500)));
await p.screenshot({ path: out, fullPage: false });
const txt = await p.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n{2,}/g, '\n'));
console.log('shot:', out);
console.log('--- visible text ---');
console.log(txt);
await p.close();
await b.disconnect();
