// Renders a Hebrew string two ways and screenshots it, so a bidi claim can be
// LOOKED AT instead of reasoned about. Pass forward-slash paths only.
import puppeteer from 'puppeteer-core';
const [file, out] = process.argv.slice(2);
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 1200, height: 460 } });
const p = await b.newPage();
await p.goto('file:///' + file, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 700));
await p.screenshot({ path: out });
await p.close();
await b.disconnect();
console.log('shot taken:', out);
