// Athletes roster card: is the status pill (box + border lines) vertically centred in the card's title strip? Box AND ink.
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'https://expo-app.co.il';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: 1920, height: 1000, deviceScaleFactor: Number(process.env.DPR || 1) });
await pg.goto(`${BASE}/coach/athletes?lang=en`, { waitUntil: 'domcontentloaded' }); await wait(8000);
const r = await pg.evaluate(() => {
  const bundle = [...document.scripts].map((s) => s.src).find((s) => /index-/.test(s));
  const pills = [...document.querySelectorAll('button')].filter((e) => e.offsetParent && /^(ACTIVE|INACTIVE|ON HOLD|TRIAL)\s*▾?$/i.test((e.innerText || '').trim().replace(/\s+/g, ' ')) && e.getBoundingClientRect().left > 480).slice(0, 3);
  return { bundle, rows: pills.map((p) => {
    // the strip = nearest ancestor whose height is 40-80px and that is wider than 300px
    let s = p.parentElement; while (s && !(s.getBoundingClientRect().height >= 40 && s.getBoundingClientRect().height <= 90 && s.getBoundingClientRect().width > 300)) s = s.parentElement;
    const sr = s.getBoundingClientRect(), cs = getComputedStyle(s), pr = p.getBoundingClientRect();
    const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
    const inner = [sr.top + bt, sr.bottom - bb];
    return { text: p.innerText.trim(), strip: [+sr.top.toFixed(1), +sr.bottom.toFixed(1)], stripBorders: [bt, bb], pill: [+pr.top.toFixed(1), +pr.bottom.toFixed(1)], pillX: [+pr.left.toFixed(1), +pr.right.toFixed(1)], gapAbove: +(pr.top - inner[0]).toFixed(1), gapBelow: +(inner[1] - pr.bottom).toFixed(1) };
  }) };
});
console.log(JSON.stringify(r));
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT });
await pg.close(); b.disconnect();
