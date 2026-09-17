// The athlete detail modal in the club zone - the "full history" he called an
// inconvenient scroll.
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const TAG = process.env.TAG || 'athmodal';
const LANG = process.env.LANG_APP || 'he';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: 900, deviceScaleFactor: 2, isMobile: W < 500, hasTouch: W < 500 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate((l) => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-lang', l); localStorage.setItem('bhbc-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, LANG);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
  if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(10000);
await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(4000);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(12000);
if (LANG === 'he') { await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim())); if (b2) b2.click(); }); await wait(3000); }
const who = process.env.WHO || 'HANNAHS';
const opened = await pg.evaluate((n) => { const el = [...document.querySelectorAll('.bhbc-load-row')].find((x) => (x.textContent || '').toUpperCase().includes(n)); if (!el) return false; el.click(); return true; }, who);
await wait(3500);
// scroll the modal to the history
await pg.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => /FULL HISTORY|היסטוריה מלאה/i.test((e.textContent || '').trim()) && e.children.length === 0); if (h) h.scrollIntoView({ block: 'start' }); });
await wait(1200);
await pg.screenshot({ path: `audit-out/${TAG}.png` });
const m = await pg.evaluate(() => {
  const box = [...document.querySelectorAll('div')].find((e) => e.style && e.style.maxHeight === '431px');
  return box ? { rows: box.children.length, h: Math.round(box.getBoundingClientRect().height), scroll: box.scrollHeight } : 'no history box';
});
console.log('opened', opened, JSON.stringify(m));
await pg.close(); b.disconnect();
