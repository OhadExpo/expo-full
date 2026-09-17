// Where does a given English word come from on the physio's Hebrew schedule?
// Signs in as the physio, switches the zone to Hebrew, clicks the named tab
// and prints every element whose own text matches the pattern, with its tag,
// class and the surrounding text - so the source line can be found.
//   TAB='לו"ז' PAT='SHOW|MORE|GAME|SUN' node audit-out/probe-bhbc-find-text.mjs
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = 'http://127.0.0.1:4173';
const TAB = process.env.TAB || 'לו"ז';
const PAT = new RegExp(process.env.PAT || 'SHOW|MORE', 'i');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9223'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
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
await setWidth(pg, 1500, 1000);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(13000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
await wait(800);
const flipped = await pg.evaluate(() => {
  const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim()));
  if (!b2) return false; b2.click(); return true;
});
console.log('switched to Hebrew:', flipped);
await wait(4000);
const clicked = await pg.evaluate((tab) => {
  const t = [...document.querySelectorAll('.bhbc-tab,[role="tab"]')].find((x) => (x.textContent || '').trim() === tab);
  if (!t) return false; t.click(); return true;
}, TAB);
console.log('tab', TAB, 'clicked:', clicked);
await wait(4500);
const hits = await pg.evaluate((src) => {
  const re = new RegExp(src, 'i');
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (own && re.test(own)) {
      const p = el.parentElement;
      out.push({ tag: el.tagName, cls: el.className && String(el.className).slice(0, 40), own: own.slice(0, 80), around: (p && p.innerText || '').replace(/\s+/g, ' ').slice(0, 140), html: el.outerHTML.slice(0, 200) });
    }
  }
  return out;
}, PAT.source);
for (const h of hits) console.log(JSON.stringify(h));
console.log(hits.length, 'hits');
await pg.close(); b.disconnect();
