// The club zone at phone width, in Hebrew, as the owner: roster tab, the
// MANAGE ROSTER dialog, and the load board - the three surfaces he called a
// mess on 15.9. Photographs and measures what overflows.
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const TAG = process.env.TAG || 'zone';
const LANG = process.env.LANG_APP || 'he';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await pg.setViewport({ width: W, height: 844, deviceScaleFactor: 2, isMobile: W < 500, hasTouch: W < 500 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate((l) => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('expo-lang', l); localStorage.setItem('bhbc-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 864e5)); } catch (e) {} }, LANG);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(10000);
await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim())); if (b2) b2.click(); });
await wait(4000);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(12000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
await wait(1000);
if (LANG === 'he') { await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim())); if (b2) b2.click(); }); await wait(3000); }

const overflow = () => `(() => {
  const out = [];
  const vw = innerWidth;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 6) continue;
    if (r.right > vw + 2 || r.left < -2) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') continue;
      out.push({ t: el.tagName, c: String(el.className || '').slice(0, 24), x: Math.round(r.x), w: Math.round(r.width), txt: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 28) });
    }
  }
  return out.slice(0, 10);
})()`;

// roster tab
await pg.evaluate(() => { const el = [...document.querySelectorAll('.bhbc-tab,[role="tab"]')].find((x) => /^(סגל|Roster)$/.test((x.textContent || '').trim())); if (el) el.click(); });
await wait(3500);
await pg.screenshot({ path: `audit-out/${TAG}-roster-390.png` });
console.log('roster overflow:', JSON.stringify(await pg.evaluate(overflow())).slice(0, 600));

// manage roster dialog
const opened = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => /manage roster|ניהול הסגל/i.test((x.textContent || '').trim())); if (!el) return false; el.click(); return true; });
await wait(2500);
await pg.screenshot({ path: `audit-out/${TAG}-manage-390.png` });
console.log('manage opened:', opened, 'overflow:', JSON.stringify(await pg.evaluate(overflow())).slice(0, 700));
await pg.keyboard.press('Escape');
await wait(1200);

// load board (overview)
await pg.evaluate(() => { const el = [...document.querySelectorAll('.bhbc-tab,[role="tab"]')].find((x) => /^(סקירה|Overview)$/.test((x.textContent || '').trim())); if (el) el.click(); });
await wait(3500);
await pg.evaluate(() => window.scrollTo(0, 1200));
await wait(900);
await pg.screenshot({ path: `audit-out/${TAG}-board-390.png` });
console.log('board shot');
await pg.close();
b.disconnect();
