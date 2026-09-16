// Screenshot each top tab of /demo/coach (viewport, not full page) at desktop
// and a phone emulation.  node audit-out/_shoot-demo-tabs.mjs <outdir> [lang]
import P from 'puppeteer-core';
import fs from 'node:fs';
const OUT = process.argv[2]; const LANG = process.argv[3] || 'he';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
fs.mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
for (const vp of [{ n: 'desk', width: 1400, height: 900, m: false }, { n: 'phone', width: 390, height: 844, m: true }]) {
  const pg = await b.newPage();
  await pg.emulate({ viewport: { width: vp.width, height: vp.height, deviceScaleFactor: vp.m ? 2 : 1, isMobile: vp.m, hasTouch: vp.m }, userAgent: vp.m ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : await b.userAgent() });
  await pg.goto(`${BASE}/demo/coach?lang=${LANG}`, { waitUntil: 'domcontentloaded' }); await w(6000);
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('nav button, header button')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter((t) => t && t.length < 20));
  let i = 0;
  for (const t of tabs.slice(0, 7)) {
    await pg.evaluate((label) => { const el = [...document.querySelectorAll('nav button, header button')].find((e) => (e.innerText || '').trim() === label); if (el) el.click(); window.scrollTo(0, 0); }, t);
    await w(1800);
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await pg.screenshot({ path: `${OUT}/${vp.n}-${String(i).padStart(2, '0')}.png` });
    console.log(vp.n, i, JSON.stringify(t), 'overflowX', overflow);
    i++;
  }
  await pg.close();
}
b.disconnect();
