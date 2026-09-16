// A route at desktop width, DPR 1, top of page + optional clip region.
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'https://expo-app.co.il';
const W = Number(process.env.W || 1400);
const ROUTE = process.env.ROUTE || '/coach/athletes';
const TAG = process.env.TAG || 'desk';
const LANG = process.env.LANG_APP || 'en';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: 900, deviceScaleFactor: Number(process.env.DPR || 1) });
if (process.env.THEME) await pg.evaluateOnNewDocument((t) => { window.__THEME = t; try { localStorage.setItem('expo-theme', t); } catch (e) {} }, process.env.THEME);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate((l) => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-lang', l); if (window.__THEME) localStorage.setItem('expo-theme', window.__THEME); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, LANG);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(4000);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
  if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234');
});
await wait(500);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(11000);
await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(5000);
await pg.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' });
await wait(12000);
for (const step of (process.env.CLICK || '').split('>>').filter(Boolean)) {
  const ok = await pg.evaluate((re) => { const rx = new RegExp(re, 'i'); const el = [...document.querySelectorAll('button,a,[role="button"]')].find((x) => rx.test((x.textContent || '').trim())); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; }, step);
  console.log('click', step, ok); await wait(4500);
}
if (process.env.SCROLLTO) { await pg.evaluate((re) => { const rx = new RegExp(re, 'i'); const el = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && rx.test((x.textContent || '').trim())); if (el) el.scrollIntoView({ block: 'center' }); }, process.env.SCROLLTO); await wait(1200); }
await pg.screenshot({ path: `audit-out/${TAG}.png` });
console.log('shot', TAG);
await pg.close(); b.disconnect();
