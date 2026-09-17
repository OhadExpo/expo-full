// Gym page (marketing, local preview :4174): testimonials gone, massage card copy, both languages.
import P from 'puppeteer-core';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: 1280, height: 900 });
for (const path of ['/he#/gym', '/#/gym']) {
  await pg.goto('http://127.0.0.1:4174' + path, { waitUntil: 'domcontentloaded' }); await wait(4000);
  const t = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  console.log(path, JSON.stringify({ len: t.length, neta: /נטע ר\.|Neta R\./.test(t), amir: /אמיר ש\./.test(t), injuries: /פחות פציעות|fewer injuries/.test(t), massage: (t.match(/(פחות כאב[^.]*\.|Less soreness[^.]*\.)/) || [''])[0] }));
}
await pg.close(); b.disconnect();
