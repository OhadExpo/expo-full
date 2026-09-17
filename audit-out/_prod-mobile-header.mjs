// Production coach header on a real phone emulation (412px Android, like his Samsung): does any tab sit under the logo?
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'https://expo-app.co.il';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const ctx = process.env.FRESH ? await b.createBrowserContext() : null;
const pg = ctx ? await ctx.newPage() : await b.newPage();
await pg.emulate({ viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1500);
await signIn(pg, BASE);
await pg.evaluate(() => localStorage.setItem('expo-lang', 'en'));
await pg.goto(`${BASE}/coach/dashboard?lang=en`, { waitUntil: 'domcontentloaded' }); await wait(8000);
const bundle = await pg.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /index-/.test(s)));
const m = await pg.evaluate(() => {
  const logo = document.querySelector('div.hdr-scroll > :first-child');
  const rail = document.querySelector('.hdr-rail');
  const lr = logo?.getBoundingClientRect();
  const tabs = [...document.querySelectorAll('nav.hdr-scroll button')].map((t) => { const r = t.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(Math.max(1, Math.min(innerWidth - 1, cx)), cy); return { t: t.innerText.trim().slice(0, 14), l: Math.round(r.left), r: Math.round(r.right), visibleAtCentre: cx > 0 && cx < innerWidth ? (t.contains(top)) : 'offscreen' }; });
  return { logo: lr && [Math.round(lr.left), Math.round(lr.right), Math.round(lr.top), Math.round(lr.bottom)], railLeft: rail && Math.round(rail.getBoundingClientRect().left), railScroll: rail?.scrollLeft, tabs };
});
console.log(JSON.stringify({ bundle, ...m }));
await pg.screenshot({ path: 'audit-out/shots-0917/prod-mobile-header.png', clip: { x: 0, y: 0, width: 412, height: 200 } });
await pg.close(); if (ctx) await ctx.close(); b.disconnect();
