// Mobile top-menu dropdown (ATHLETES / SESSIONS): is it visible, or clipped by the scrolling rail?
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'https://expo-app.co.il';
const W = Number(process.env.W || 412);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true);
await pg.emulate({ viewport: { width: W, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1500);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
await signIn(pg, BASE);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => /ניהול|COACH|Manage/i.test(e.innerText || '') && e.offsetParent); if (el) el.click(); });
await wait(2000);
await pg.goto(`${BASE}/coach/dashboard?lang=en`, { waitUntil: 'domcontentloaded' }); await wait(7000);
const out = await pg.evaluate(() => {
  const trigger = [...document.querySelectorAll('[data-submenu-id] > button')].find((e) => e.offsetParent);
  if (!trigger) return { err: 'no submenu trigger' };
  trigger.click();
  return new Promise((res) => setTimeout(() => {
    const menu = document.querySelector('[data-submenu-id] .motion-rise');
    if (!menu) return res({ err: 'menu did not open' });
    const r = menu.getBoundingClientRect(), cs = getComputedStyle(menu);
    const cx = Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2));
    const pts = [0.1, 0.35, 0.6, 0.9].map((f) => { const y = r.top + r.height * f; const el = document.elementFromPoint(cx, Math.min(innerHeight - 2, Math.max(2, y))); return { f, ok: !!el && (menu === el || menu.contains(el)), el: el && (el.tagName + '.' + String(el.className).slice(0, 18)) }; });
    const hit = document.elementFromPoint(cx, Math.min(innerHeight - 2, Math.max(2, r.top + 12)));
    // which ancestor establishes a containing block / clips?
    const chain = []; let e = menu.parentElement;
    while (e && e !== document.body) { const s = getComputedStyle(e); chain.push(`${e.tagName}.${(e.className || '').toString().slice(0, 18)} ovf=${s.overflow}/${s.overflowY} tr=${s.transform === 'none' ? 'none' : 'YES'} filt=${s.filter} contain=${s.contain} wc=${s.willChange}`); e = e.parentElement; }
    res({ rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], vw: innerWidth, vh: innerHeight, pos: cs.position, z: cs.zIndex, visible: menu.contains(hit) || menu === hit, pts, hitTag: hit && hit.tagName + '.' + (hit.className || '').toString().slice(0, 20), chain: chain.slice(0, 5) });
  }, 500));
});
console.log(JSON.stringify(out, null, 1));
await pg.screenshot({ path: `audit-out/shots-0917/submenu-${W}.png`, clip: { x: 0, y: 0, width: W, height: 320 } });
await pg.close(); b.disconnect();
