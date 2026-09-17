// Dashboard task lists on a phone: AUTO-ALERTS + HISTORY rows - are they legible, or 1-2 chars per line?
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const LANG = process.env.LANG_ || 'he';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true);
await pg.emulate({ viewport: { width: W, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
await signIn(pg, BASE);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => /ניהול|COACH|Manage/i.test(e.innerText || '') && e.offsetParent); if (el) el.click(); });
await wait(2000);
await pg.goto(`${BASE}/coach/dashboard?lang=${LANG}`, { waitUntil: 'domcontentloaded' }); await wait(8000);
// the AUTO-ALERTS tab is the one he photographed
await pg.evaluate(() => { const t = [...document.querySelectorAll('button')].find((e) => /AUTO-?ALERTS|התראות אוטומטיות/i.test(e.innerText || '')); if (t) t.click(); });
await wait(1200);
// open the history section if collapsed
await pg.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => /HISTORY|היסטוריה/.test(e.textContent || '') && e.getAttribute('role') === 'button'); if (h) h.click(); });
await wait(1200);
// the narrowest text columns on the page: chars per line
const bad = await pg.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('div, span, td, li')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim(); if (t.length < 6) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 16;
    const lines = Math.max(1, Math.round(r.height / lineH));
    const cpl = t.length / lines;
    if (lines >= 3 && cpl <= 9) out.push({ text: t.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), lines, cpl: +cpl.toFixed(1) });
  }
  return out.slice(0, 12);
});
console.log('NARROW COLUMNS', JSON.stringify(bad, null, 1));
const y = await pg.evaluate(() => { const el = [...document.querySelectorAll('*')].find((e) => /AUTO-ALERTS|התראות אוטומטיות/.test((e.textContent || '').slice(0, 40))); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : 0; });
await pg.evaluate((yy) => scrollTo(0, Math.max(0, yy - 40)), y);
await wait(700);
await pg.screenshot({ path: `audit-out/shots-0917/dash-lists-${LANG}-${W}.png` });
await pg.close(); b.disconnect();
