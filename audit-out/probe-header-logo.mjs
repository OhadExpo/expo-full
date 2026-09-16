// The coach header at phone width: does the pinned logo COVER the nav?
// Ohad's screenshot (15.9, his phone): the EXPO logo sits on top of the active
// DASHBOARD tab, which reads "ARD" with its box cut off underneath.
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const LANG = process.env.LANG_APP || 'en';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate((l) => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, LANG);
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
await pg.goto(BASE + (process.env.ROUTE || '/coach/dashboard'), { waitUntil: 'domcontentloaded' });
await wait(12000);
// Scroll the rail the way a thumb does, then measure: the fault only appears
// once the active tab has slid under the pinned logo.
await pg.evaluate((px) => {
  const rail = document.querySelector('header .hdr-rail');
  const bar = document.querySelector('header .hdr-scroll');
  const nav = document.querySelector('header nav');
  for (const sc of [rail, bar, nav]) if (sc && sc.scrollWidth > sc.clientWidth + 2) { sc.scrollLeft = px; break; }
}, Number(process.env.SCROLL || 0));
await wait(700);
const out = await pg.evaluate(() => {
  const logo = document.querySelector('header img') || document.querySelector('header svg');
  const nav = document.querySelector('header nav');
  const bar = document.querySelector('header .hdr-scroll') || (nav && nav.parentElement);
  const r = (el) => { if (!el) return null; const x = el.getBoundingClientRect(); return { l: Math.round(x.left), r: Math.round(x.right), t: Math.round(x.top), b: Math.round(x.bottom), w: Math.round(x.width) }; };
  const tabs = nav ? [...nav.querySelectorAll('button,a')].map((el) => {
    const x = el.getBoundingClientRect();
    return { txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14), l: Math.round(x.left), r: Math.round(x.right), w: Math.round(x.width) };
  }) : [];
  const lg = r(logo);
  // A rect still reports a position for content the rail has CLIPPED, so a
  // geometric overlap proves nothing. Ask the page what is actually painted at
  // the logo's own pixels: if a nav control answers, it is drawn over the logo.
  const painted = [];
  if (lg) {
    for (let x = lg.l + 2; x < lg.r - 2; x += 6) {
      for (let y = 10; y < 46; y += 8) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        const btn = el.closest('nav button, nav a, .hdr-right button');
        if (btn && !painted.some((p) => p.el === btn)) painted.push({ el: btn, txt: (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14), at: [x, y] });
      }
    }
  }
  const covered = painted.map((p) => ({ txt: p.txt, at: p.at }));
  const rail = document.querySelector('header .hdr-rail');
  const scroller = [rail, bar, nav].find((x) => x && x.scrollWidth > x.clientWidth + 2) || null;
  return {
    logo: lg, navBox: r(nav), barBox: r(bar),
    logoChain: (() => { const c = []; for (let e = logo; e && e.tagName !== 'BODY'; e = e.parentElement) { const g = getComputedStyle(e); c.push({ t: e.tagName, cls: String(e.className || '').slice(0, 18), pos: g.position, z: g.zIndex, bg: g.backgroundColor, left: g.left, insetInlineStart: g.insetInlineStart }); } return c.slice(0, 5); })(),
    scroller: scroller ? { cls: scroller.className, clientW: scroller.clientWidth, scrollW: scroller.scrollWidth, scrollLeft: Math.round(scroller.scrollLeft), padStart: getComputedStyle(scroller).paddingInlineStart, scrollPadStart: getComputedStyle(scroller).scrollPaddingInlineStart } : null,
    tabs, coveredByLogo: covered,
  };
});
console.log(JSON.stringify(out, null, 1));
await pg.screenshot({ path: `audit-out/${process.env.TAG || 'hdr'}.png` });
await pg.close(); b.disconnect();
