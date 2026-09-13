// LOOK at the club zone as the physio, in Hebrew: one screenshot per tab
// (plus the schedule's week view). Writes audit-out/bhbc-he-<tab>.png.
//   node audit-out/shoot-bhbc-tabs.mjs            (CDP 9223, base :4173)
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.setViewport({ width: 1500, height: 1000 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate((email) => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, email); if (p) set(p, '1234');
}, process.env.EMAIL || 'tomerlich11@gmail.com');
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(9000);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(12000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
const flipped = await pg.evaluate(() => { const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim())); if (!b2) return false; b2.click(); return true; });
console.log('hebrew:', flipped);
await wait(4000);
const tabs = ['סקירה', 'סגל', 'לו"ז', 'חדר כוח', 'רפואי', 'משחקים'];
for (const t of tabs) {
  const ok = await pg.evaluate((name) => { const el = [...document.querySelectorAll('.bhbc-tab,[role="tab"]')].find((x) => (x.textContent || '').trim() === name); if (!el) return false; el.click(); return true; }, t);
  await wait(3500);
  const file = `audit-out/bhbc-he-${t.replace(/["\s]/g, '')}.png`;
  await pg.screenshot({ path: file });
  console.log(ok ? 'shot' : 'tab not found', file);
  if (t === 'לו"ז') {
    const wk = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => /^\s*(שבוע|week)\s*$/i.test(x.textContent || '')); if (!el) return false; el.click(); return true; });
    await wait(2500);
    await pg.screenshot({ path: 'audit-out/bhbc-he-week.png' });
    console.log(wk ? 'shot' : 'week toggle not found', 'audit-out/bhbc-he-week.png');
  }
}
await pg.close(); b.disconnect();
