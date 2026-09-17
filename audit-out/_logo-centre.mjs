// Mobile coach header: is the EXPO logo centred in the bar, letters level with the tab row? (background tab, no new window)
import P from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true);
await pg.emulate({ viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200); await signIn(pg, BASE);
for (const lang of ['en', 'he']) {
  await pg.goto(`${BASE}/coach/dashboard?lang=${lang}`, { waitUntil: 'domcontentloaded' }); await wait(7000);
  console.log('url', pg.url(), (await pg.evaluate(() => document.body.innerText.slice(0, 160))).replace(/s+/g, ' '));
  const m = await pg.evaluate(() => {
    const img = document.querySelector('div.hdr-scroll > :first-child'); const r = img.getBoundingClientRect();
    const tab = document.querySelector('nav.hdr-scroll button'); const t = tab.getBoundingClientRect();
    const bar = document.querySelector('div.hdr-scroll').getBoundingClientRect();
    // letters occupy rows 85..240 of the 286px-tall source PNG; caret 10..60
    const k = r.height / 286;
    return { bundle: [...document.scripts].map((s) => s.src).find((s) => /index-/.test(s)), bar: [Math.round(bar.top), Math.round(bar.bottom)], logo: [+(r.top).toFixed(1), +(r.bottom).toFixed(1)], caretTop: +(r.top + 10 * k).toFixed(1), lettersCentre: +(r.top + 162.5 * k).toFixed(1), tabCentre: +((t.top + t.bottom) / 2).toFixed(1) };
  });
  console.log(lang, JSON.stringify(m));
  await pg.screenshot({ path: `audit-out/shots-0917/logo-centre-${lang}.png`, clip: { x: 0, y: 0, width: 412, height: 80 } });
}
await pg.close(); b.disconnect();
