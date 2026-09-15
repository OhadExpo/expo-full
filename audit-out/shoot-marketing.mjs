// The marketing site at a given width, top of page.
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:4180';
const W = Number(process.env.W || 1400);
const TAG = process.env.TAG || 'mkt';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: 1000, deviceScaleFactor: 2, isMobile: W < 500, hasTouch: W < 500 });
await pg.goto(BASE + (process.env.PATHNAME || '/'), { waitUntil: 'networkidle2' });
await wait(4000);
const over = await pg.evaluate(() => {
  const vw = innerWidth; const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 6) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    if (r.right > vw + 2 || r.left < -2) out.push({ t: el.tagName, c: String(el.className || '').slice(0, 20), x: Math.round(r.x), w: Math.round(r.width) });
  }
  return { count: out.length, sample: out.slice(0, 5), scrollW: document.documentElement.scrollWidth, vw };
});
await pg.screenshot({ path: `audit-out/${TAG}.png` });
console.log(TAG, W, JSON.stringify(over));
await pg.close(); b.disconnect();
