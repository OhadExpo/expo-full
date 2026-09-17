// Club zone at a real phone width, Hebrew, signed in: screenshots of each tab's top (LOCAL ONLY - names).
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await signIn(pg, BASE);
await pg.evaluate(() => localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('he')));
await pg.goto(`${BASE}/coach/bhbc?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(8000);
const promptDir = await pg.evaluate(() => { const el = [...document.querySelectorAll('div')].find((d) => /תתקין את EXPO/.test(d.innerText || '') && d.innerText.length < 200); return el ? getComputedStyle(el).direction : 'no prompt'; });
console.log('install prompt direction:', promptDir);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /אחר כך|Later/.test(e.innerText || '')); if (x) x.click(); });
await wait(800);
const tabs = (process.argv[2] || 'סקירה,סגל').split(',');
for (const t of tabs) {
  await pg.evaluate((label) => { const el = [...document.querySelectorAll('.bhbc-tab, [role="tab"]')].find((e) => (e.innerText || '').trim() === label); if (el) el.click(); }, t);
  await wait(2500);
  const y = await pg.evaluate((needle) => { const el = [...document.querySelectorAll('button')].find((e) => /MED|רפואי|\+ רפואי/.test((e.innerText || '').trim()) && e.offsetParent); if (!el) return 0; const r = el.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 200); return Math.round(r.top); });
  await wait(800);
  await pg.screenshot({ path: `audit-out/shots-0917/_bhbc-phone-${tabs.indexOf(t)}.png` });
  console.log(t, 'med button at', y);
}
await pg.close(); b.disconnect();
