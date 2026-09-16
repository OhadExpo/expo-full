import P from 'puppeteer-core';
const BASE = 'http://127.0.0.1:4174';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
for (const [name, path] of [['home', '/he'], ['gym', '/he/gym']]) {
  const pg = await b.newPage();
  await pg.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await pg.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await wait(4000);
  const r = await pg.evaluate(() => ({ url: location.href, dir: document.documentElement.dir || getComputedStyle(document.body).direction, overflowX: document.documentElement.scrollWidth > window.innerWidth, sw: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  console.log(name, JSON.stringify(r));
  await pg.screenshot({ path: `audit-out/shots-0917/mk-${name}-390.png`, fullPage: true });
  await pg.close();
}
b.disconnect();
