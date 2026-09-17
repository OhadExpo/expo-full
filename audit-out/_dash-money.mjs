// Owner dashboard money tiles, rendered (background tab): Collected MTD vs the sheet month, averages.
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200); await signIn(pg, BASE);
for (const lang of ['en', 'he']) {
  await pg.goto(`${BASE}/coach/dashboard?lang=${lang}`, { waitUntil: 'domcontentloaded' }); await wait(8000);
  const t = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const pick = (re) => (t.match(re) || [''])[0]; if (process.env.DUMP) console.log(t.slice(0, 1200));
  console.log(lang, JSON.stringify({
    collectedMTD: pick(new RegExp(process.env.MTD || 'COLLECTED MTD.{0,40}', 'i')),
    thisMonthSheet: pick(/(THIS MONTH · SHEET|החודש · גיליון)[^₪]{0,10}₪[\d,]+/i),
    ltv: pick(new RegExp(process.env.LTV || 'AVG LTV.{0,50}', 'i')), ticket: pick(new RegExp(process.env.TICKET || 'AVG TICKET.{0,50}', 'i')),
  }));
}
await pg.close(); b.disconnect();
