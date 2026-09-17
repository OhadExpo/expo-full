// Public booking page in Hebrew at phone width: text + direction + Latin runs (public page).
import P from 'puppeteer-core';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage();
await pg.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
await pg.goto('http://127.0.0.1:4173/book/ohad?lang=he', { waitUntil: 'domcontentloaded' }); await wait(6000);
const info = await pg.evaluate(() => ({ dir: getComputedStyle(document.querySelector('#root > *') || document.body).direction, text: document.body.innerText.slice(0, 900), overflow: document.documentElement.scrollWidth > innerWidth }));
console.log(JSON.stringify(info));
await pg.screenshot({ path: 'audit-out/shots-0917/booking-he-390.png' });
await pg.close(); b.disconnect();
