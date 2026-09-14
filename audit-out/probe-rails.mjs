// Every horizontal rail, measured: does it scroll, is it clipped, and is the
// fade actually on? Shoots the header of each surface at phone width.
//   BASE=http://127.0.0.1:4173 W=390 node audit-out/probe-rails.mjs
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const TAG = process.env.TAG || (BASE.includes('127.0.0.1') ? 'local' : 'prod');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });

const RAILS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('nav, div, ul')) {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowX)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 18 || r.height > 120) continue;
    const kids = [...el.children].map((k) => k.getBoundingClientRect()).filter((k) => k.width > 0.5);
    if (kids.length < 2) continue;
    const minL = Math.min(...kids.map((k) => k.left)), maxR = Math.max(...kids.map((k) => k.right));
    out.push({
      cls: String(el.className || '').slice(0, 22) || el.tagName,
      w: Math.round(r.width), scrollW: el.scrollWidth, clientW: el.clientWidth,
      hiddenLeft: Math.round(Math.max(0, r.left - minL)), hiddenRight: Math.round(Math.max(0, maxR - r.right)),
      fade: el.dataset.fade || '-', mask: getComputedStyle(el).maskImage !== 'none' || getComputedStyle(el).webkitMaskImage !== 'none',
    });
  }
  return out;
})()`;

async function seat(email, role, route, tag) {
  const pg = await b.newPage();
  const cdp = await pg.createCDPSession();
  await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
  await pg.setViewport({ width: W, height: 844, deviceScaleFactor: 2, isMobile: W < 500, hasTouch: W < 500 });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await wait(3500);
  await pg.evaluate((em) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e) set(e, em); if (p) set(p, '1234');
  }, email);
  await wait(400);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
  await wait(10000);
  await pg.evaluate((r) => { const want = r === 'athlete' ? /athlete|מתאמן/i : /coach|מאמן/i; const b2 = [...document.querySelectorAll('button')].find((x) => want.test((x.textContent || '').trim())); if (b2) b2.click(); }, role);
  await wait(5000);
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await wait(10000);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  await wait(1500);
  const rails = await pg.evaluate(RAILS);
  console.log(`${tag}:`);
  for (const r of rails) console.log(`   ${r.cls.padEnd(22)} w=${String(r.w).padStart(4)} scroll=${String(r.scrollW).padStart(4)} hidden L${r.hiddenLeft}/R${r.hiddenRight} fade=${r.fade} mask=${r.mask}`);
  await pg.screenshot({ path: `audit-out/rail-${TAG}-${tag}.png`, clip: { x: 0, y: 0, width: W, height: 220 } });
  await pg.close();
}
await seat('ohadyproductions@gmail.com', 'coach', '/coach', 'coach-header');
await seat('ohadyproductions@gmail.com', 'coach', '/coach/bhbc', 'club-zone');
b.disconnect();
