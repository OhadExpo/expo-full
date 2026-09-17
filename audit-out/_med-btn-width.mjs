// Width of the club zone's MED buttons in both states and both languages -
// the two states must be the same box (Ohad: every button in a column the same size).
import puppeteer from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = 'http://127.0.0.1:4173';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
const page = await b.newPage(); await page.setViewport({ width: 1440, height: 1000 });
await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await w(1500);
await signIn(page, BASE);
for (const lang of ['he', 'en']) {
  await page.evaluate((l) => localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)), lang);
  await page.goto(`${BASE}/coach/bhbc`, { waitUntil: 'domcontentloaded' }); await w(10000);
  const r = await page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('button')) {
      const t = (el.innerText || '').trim();
      if (!/MED|רפואי/.test(t) || t.length > 12) continue;
      const box = el.getBoundingClientRect();
      const fits = el.scrollWidth <= el.clientWidth + 0.5;
      (out[t] = out[t] || new Set()).add(`${box.width.toFixed(1)}${fits ? '' : ' OVERFLOW'}`);
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
  });
  console.log(lang, JSON.stringify(r));
}
await page.evaluate(() => localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en')));
await page.close(); b.disconnect();
