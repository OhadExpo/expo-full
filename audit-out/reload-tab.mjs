// Reload every tab in the debug Chrome whose URL contains the given fragment.
import puppeteer from 'puppeteer-core';
const cdp = process.env.CDP || 'http://127.0.0.1:9222';
const frag = process.argv[2] || '4181';
const browser = await puppeteer.connect({ browserURL: cdp, defaultViewport: null });
let n = 0;
for (const p of await browser.pages()) { if (p.url().includes(frag)) { await p.reload({ waitUntil: 'domcontentloaded' }); n++; } }
console.log(`reloaded ${n} tab(s) matching ${frag}`);
browser.disconnect();
