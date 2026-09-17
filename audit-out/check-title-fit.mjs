// Does a card title still read in full, and does it stay inside its card?
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await pg.setViewport({ width: 390, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
  if (e) set(e, 'roeyh@hotmail.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(12000);
await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded' });
await wait(11000);
const out = await pg.evaluate(() => [...document.querySelectorAll('span')]
  .filter((el) => /^(DAILY|BLOCK|DAY |חימום)/i.test((el.textContent || '').trim()) && el.children.length === 0)
  .slice(0, 8)
  .map((el) => { const r = el.getBoundingClientRect(); const card = el.closest('div[style*="border"]'); const cr = card && card.getBoundingClientRect();
    return { t: (el.textContent || '').trim().slice(0, 40), clipped: el.scrollWidth - el.clientWidth, w: Math.round(r.width), over: cr ? Math.round(r.right - cr.right) : null }; }));
console.log(JSON.stringify(out, null, 1));
await pg.close(); b.disconnect();
