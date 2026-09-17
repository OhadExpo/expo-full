// Athlete portal BEFORE (production portal, :4180 candidate) vs AFTER (branch, :4173): /demo/athlete text, EN + HE.
import P from 'puppeteer-core';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: 390, height: 844 });
for (const [name, base] of [['BEFORE', 'http://127.0.0.1:4180'], ['AFTER', 'http://127.0.0.1:4173']]) for (const lang of ['en', 'he']) {
  await pg.goto(`${base}/demo/athlete?lang=${lang}`, { waitUntil: 'domcontentloaded' }); await wait(6000);
  const t = await pg.evaluate(() => ({ dir: document.documentElement.dir || getComputedStyle(document.body).direction, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260) }));
  console.log(name, lang, JSON.stringify(t));
}
await pg.close(); b.disconnect();
