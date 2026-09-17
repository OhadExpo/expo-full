// The owner-only BHBC crest button in the coach top bar: present, centred with its neighbours, opens the zone.
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 1400);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: W, height: 900 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
await signIn(pg, BASE);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => /ניהול|COACH|Manage/i.test(e.innerText || '') && e.offsetParent); if (el) el.click(); });
await wait(2000);
await pg.goto(`${BASE}/coach/dashboard?lang=${process.env.LANG_ || 'en'}`, { waitUntil: 'domcontentloaded' }); await wait(7000);
const info = await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('header button')].find((e) => e.querySelector('img[src*="bnei"]'));
  if (!btn) return { err: 'no crest button' };
  const r = btn.getBoundingClientRect(); const img = btn.querySelector('img').getBoundingClientRect();
  const sibs = [...btn.parentElement.children].filter((e) => e.tagName === 'BUTTON' && e.offsetParent).map((e) => { const rr = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 12), mid: +((rr.top + rr.bottom) / 2).toFixed(1), h: Math.round(rr.height) }; });
  const inMenu = [...document.querySelectorAll('[role="menuitem"], [data-submenu-id] button')].some((e) => /BHBC/i.test(e.innerText || ''));
  return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], imgH: Math.round(img.height), mid: +((r.top + r.bottom) / 2).toFixed(1), siblings: sibs, bhbcStillInDropdown: inMenu };
});
console.log(JSON.stringify(info));
await pg.screenshot({ path: 'audit-out/shots-0917/bhbc-button.png', clip: { x: Math.max(0, W - 700), y: 0, width: 700, height: 70 } });
await pg.evaluate(() => { const btn = [...document.querySelectorAll('header button')].find((e) => e.querySelector('img[src*="bnei"]')); if (btn) btn.click(); });
await wait(6000);
console.log('after click url:', pg.url(), (await pg.evaluate(() => document.body.innerText.slice(0, 60))).replace(/\s+/g, ' '));
await pg.screenshot({ path: 'audit-out/shots-0917/bhbc-after-click.png', clip: { x: 0, y: 0, width: Math.min(W, 1400), height: 90 } });
await pg.close(); b.disconnect();
