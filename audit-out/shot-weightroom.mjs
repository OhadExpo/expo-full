// Look at the weight-room tab with my own eyes, signed in as the owner.
//   LANG_APP=he W=390 OUT=... node audit-out/shot-weightroom.mjs
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = 'http://127.0.0.1:4173';
const W = Number(process.env.W || 1500);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
if (process.env.LANG_APP) await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) { /* ignore */ } }, process.env.LANG_APP);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate((email) => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, email); if (p) set(p, '1234');
}, process.env.EMAIL || 'ohadyproductions@gmail.com');
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*sign\s*in\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(9000);
await setWidth(pg, W, Number(process.env.H || 1000));
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(14000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
await wait(1000);

// The ZONE has its own language switch - the app-level key does not move it.
if (process.env.LANG_APP === 'he') {
  const flipped = await pg.evaluate(() => { const t = [...document.querySelectorAll('button')].find((x) => /^s*עבs*$/.test((x.textContent || '').trim())); if (!t) return false; t.click(); return true; });
  console.log('zone switched to Hebrew: ' + flipped);
  await wait(4000);
}
const tabs = await pg.evaluate(() => [...document.querySelectorAll('[role="tab"], .bhbc-tab')].map((e) => (e.textContent || '').trim()));
console.log('tabs: ' + JSON.stringify(tabs));
const clicked = await pg.evaluate((want) => {
  const el = [...document.querySelectorAll('[role="tab"], .bhbc-tab')].find((e) => new RegExp(want, 'i').test((e.textContent || '').trim()));
  if (!el) return null;
  el.click();
  return (el.textContent || '').trim();
}, process.env.TAB || 'weight room|חדר כוח');
console.log('clicked: ' + clicked);
await wait(4000);
const seen = await pg.evaluate(() => {
  const t = document.body.innerText || '';
  return { chars: t.length, head: t.slice(0, 400).replace(/\n{2,}/g, '\n') };
});
console.log('--- page ---\n' + seen.head + '\n---');
await pg.screenshot({ path: process.env.OUT || 'audit-out/wr-tab.png', fullPage: process.env.FULL === '1' });
console.log('shot: ' + (process.env.OUT || 'audit-out/wr-tab.png'));
await pg.close();
b.disconnect();
