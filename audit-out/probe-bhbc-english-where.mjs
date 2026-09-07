// What is still English in the club zone when it is switched to Hebrew?
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, 'tomerlich11@gmail.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*sign\s*in\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(9000);
await setWidth(pg, 1500, 1000);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(13000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
await wait(1000);
const flipped = await pg.evaluate(() => {
  const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim()));
  if (!b2) return false; b2.click(); return true;
});
console.log('switched to Hebrew:', flipped);
await wait(5000);
const nTabs = await pg.evaluate(() => document.querySelectorAll(".bhbc-tab").length);
for (let i = 0; i < nTabs; i++) {
  const name = await pg.evaluate((k) => { const t=[...document.querySelectorAll(".bhbc-tab")][k]; if(!t) return null; t.click(); return (t.textContent||"").trim(); }, i);
  if (!name || /יציאה/.test(name)) continue;
  await wait(3500);
  const info = await pg.evaluate(() => {
    const els = [...document.querySelectorAll("button,a,div,span")].filter((e) => /^UPDATE/.test((e.innerText||"").trim()) && (e.innerText||"").trim().length < 12);
    const recs = [...document.querySelectorAll("body *")].filter((e) => !e.children.length && /record/i.test(e.textContent||""));
    return {
      n: els.length,
      sample: els.slice(0,2).map((e) => e.outerHTML.slice(0, 300)),
      recN: recs.length,
      recSample: recs.slice(0,2).map((e) => (e.textContent||"").trim().slice(0,120)),
    };
  });
  if (info.n || info.recN) { console.log("TAB " + name + "  update:" + info.n + "  record-leaf:" + info.recN);
    for (const x of info.sample) console.log("   U " + x);
    for (const x of info.recSample) console.log("   R " + JSON.stringify(x)); }
}
await pg.close(); b.disconnect();
