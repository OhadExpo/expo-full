// Public booking page: the day column labels in each language.
import P from 'puppeteer-core';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
for (const lang of ['he', 'en']) {
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  await pg.goto(`http://127.0.0.1:4173/book/ohad?lang=${lang}`, { waitUntil: 'domcontentloaded' }); await w(6000);
  const t = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
  console.log(lang, '::', t);
  await pg.close();
}
b.disconnect();
