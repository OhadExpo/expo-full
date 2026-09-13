// LOOK at one athlete's billing section in Hebrew, with the sheet history block.
//   NAME='עמית יהודאי' node audit-out/shoot-athlete-billing.mjs
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const NAME = process.env.NAME || 'עמית יהודאי';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const pg = await b.newPage();
await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await A.signIn(pg, BASE);
await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' });
await wait(7000);
const clicked = await pg.evaluate((name) => { const el = [...document.querySelectorAll('button,a,div,span')].find((x) => x.children.length === 0 && (x.textContent || '').trim() === name); if (!el) return false; el.click(); return true; }, NAME);
console.log('clicked athlete:', clicked);
await wait(4000);
const tab = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => /^(תשלומים|Billing)$/.test((x.textContent || '').trim()) && x.closest('main,#root') && x.getBoundingClientRect().top > 60); if (!el) return false; el.click(); return true; });
console.log('clicked billing tab:', tab);
await wait(2500);
const y = await pg.evaluate(() => { const el = [...document.querySelectorAll('span,div')].find((x) => /מהגיליון|From the sheet/.test(x.textContent || '') && x.children.length <= 1); if (!el) return null; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); return el.getBoundingClientRect().top; });
console.log('sheet block found:', y != null);
await wait(800);
await pg.screenshot({ path: 'audit-out/athlete-billing-he.png' });
console.log('OK audit-out/athlete-billing-he.png');
await pg.close(); b.disconnect();
