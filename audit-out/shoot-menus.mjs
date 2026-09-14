// LOOK at every menu, at phone width, on whichever build is pointed at.
// Ohad 15.9: "wtf is going on with the menu??? fix it everywhere" - his
// screenshot did not reach the session, so every menu gets photographed and
// measured instead: the coach header strip, the ⋯ more-menu, the athlete
// portal's tab grid, and the club zone's tab rail.
//   BASE=https://expo-app.co.il W=390 node audit-out/shoot-menus.mjs
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'https://expo-app.co.il';
const W = Number(process.env.W || 390);
const TAG = process.env.TAG || (BASE.includes('127.0.0.1') ? 'local' : 'prod');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });

async function seat(email, role) {
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
  await wait(4000);
  const dismiss = async () => { await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss|אחר כך/i.test(e.textContent || '')); if (x) x.click(); }); await wait(700); };
  await dismiss();
  return { pg, dismiss };
}

// ---- coach header + more menu ----
{
  const { pg, dismiss } = await seat('ohadyproductions@gmail.com', 'coach');
  await pg.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' });
  await wait(9000); await dismiss();
  await pg.screenshot({ path: `audit-out/menu-${TAG}-coach-header.png`, clip: { x: 0, y: 0, width: W, height: 260 } });
  const nav = await pg.evaluate(() => {
    const strip = document.querySelector('nav.hdr-scroll') || document.querySelector('nav');
    if (!strip) return null;
    const r = strip.getBoundingClientRect();
    const items = [...strip.querySelectorAll('button,a')].map((e) => { const b2 = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 18), x: Math.round(b2.x), w: Math.round(b2.width), h: Math.round(b2.height) }; });
    return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), scrollW: strip.scrollWidth, clientW: strip.clientWidth, items };
  });
  console.log('coach nav:', JSON.stringify(nav).slice(0, 700));
  const opened = await pg.evaluate(() => { const el = document.querySelector('[aria-label="More options"]'); if (!el) return false; el.click(); return true; });
  await wait(1200);
  await pg.screenshot({ path: `audit-out/menu-${TAG}-coach-more.png` });
  const menu = await pg.evaluate(() => {
    const panels = [...document.querySelectorAll('div')].filter((d) => { const cs = getComputedStyle(d); return (cs.position === 'absolute' || cs.position === 'fixed') && d.querySelectorAll('button').length >= 3 && d.getBoundingClientRect().width < 320 && d.getBoundingClientRect().height > 80; });
    const p = panels[0]; if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), offRight: Math.round(r.right - window.innerWidth), offLeft: Math.round(r.left), items: [...p.querySelectorAll('button')].map((e) => (e.textContent || '').trim().slice(0, 20)) };
  });
  console.log('more menu:', JSON.stringify(menu).slice(0, 600), 'opened:', opened);
  await pg.close();
}
// ---- athlete portal tab grid ----
{
  const { pg, dismiss } = await seat('roeyh@hotmail.com', 'athlete');
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded' });
  await wait(9000); await dismiss();
  await pg.screenshot({ path: `audit-out/menu-${TAG}-portal-tabs.png`, clip: { x: 0, y: 0, width: W, height: 320 } });
  const tabs = await pg.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b2) => /PROGRAM|BW|MEAL|HISTORY|PRS|MESSAGES|תוכנית|משקל|יומן|היסטוריה|שיאים|הודעות/i.test((b2.textContent || '').trim()) && b2.getBoundingClientRect().top < 400);
    return btns.map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 16), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), clip: e.scrollWidth - e.clientWidth }; });
  });
  console.log('portal tabs:', JSON.stringify(tabs).slice(0, 900));
  await pg.close();
}
b.disconnect();
