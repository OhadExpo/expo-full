// Where exactly is the ink crossing the border, and what is the element?
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await pg.setViewport({ width: W, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
const info = await pg.evaluate((needle) => {
  const hit = [...document.querySelectorAll('div,span,button')].find((el) => (el.textContent || '').replace(/\s+/g, ' ').trim() === needle);
  if (!hit) return 'not found';
  const cs = getComputedStyle(hit);
  const box = hit.getBoundingClientRect();
  const rects = [];
  const w = document.createTreeWalker(hit, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const rc of r.getClientRects()) rects.push({ t: n.textContent.trim().slice(0, 18), l: Math.round(rc.left), r: Math.round(rc.right), tp: Math.round(rc.top), bt: Math.round(rc.bottom) }); }
  return {
    outer: hit.outerHTML.slice(0, 420),
    box: { l: Math.round(box.left), r: Math.round(box.right), t: Math.round(box.top), b: Math.round(box.bottom) },
    border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join('/'),
    display: cs.display, overflow: cs.overflow, pad: cs.padding, rects,
    parent: hit.parentElement ? hit.parentElement.outerHTML.slice(0, 200) : null,
  };
}, process.env.NEEDLE || 'חימום · Block #27(3)');
console.log(JSON.stringify(info, null, 1));
await pg.close(); b.disconnect();
