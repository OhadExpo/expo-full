// LOOK at the phone, in the state the user is in: dashboard KPI row, an OPEN top-menu dropdown,
// and the club tab strip. Screenshots + the measurements that matter. (17.9 lesson.)
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 412);
const LANG = process.env.LANG_ || 'en';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true);
await pg.emulate({ viewport: { width: W, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
await signIn(pg, BASE);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => /ניהול|COACH|Manage/i.test(e.innerText || '') && e.offsetParent); if (el) el.click(); });
await wait(2000);
await pg.goto(`${BASE}/coach/dashboard?lang=${LANG}`, { waitUntil: 'domcontentloaded' }); await wait(7000);

const kpi = await pg.evaluate(() => [...document.querySelectorAll('.alert-card')].slice(0, 4).map((c) => {
  const r = c.getBoundingClientRect(); const v = c.querySelector('.kpi-value');
  const vr = v && v.getBoundingClientRect();
  const strip = c.firstElementChild ? c.firstElementChild.getBoundingClientRect() : null;
  const overflowsX = v ? v.scrollWidth > v.clientWidth + 1 : null;
  const below = vr && strip ? +(vr.top - strip.bottom).toFixed(1) : null;
  const gapBottom = vr ? +(r.bottom - vr.bottom - parseFloat(getComputedStyle(c).paddingBottom)).toFixed(1) : null;
  return { text: (v && v.innerText.replace(/\s+/g, ' ').slice(0, 18)) || '', cardH: Math.round(r.height), valueClipped: overflowsX, spaceAboveValue: below, spaceBelowValue: gapBottom, rightEdge: vr ? Math.round(vr.right) : null, cardRight: Math.round(r.right) };
}));
console.log('KPI', JSON.stringify(kpi));
await pg.screenshot({ path: `audit-out/shots-0917/phone-dash-${LANG}-${W}.png`, clip: { x: 0, y: 0, width: W, height: 430 } });

const menu = await pg.evaluate(() => {
  const t = [...document.querySelectorAll('[data-submenu-id] > button')].find((e) => e.offsetParent);
  if (!t) return { err: 'no trigger' };
  t.click();
  return new Promise((res) => setTimeout(() => {
    // NB: offsetParent is null for position:fixed - use the rect (17.9, this probe fooled me once)
    const m = [...document.querySelectorAll('.motion-rise')].find((x) => x.getBoundingClientRect().width > 0 && x.querySelector('[role="menuitem"], button'));
    if (!m) return res({ err: 'did not open' });
    const r = m.getBoundingClientRect();
    const pts = [0.15, 0.5, 0.85].map((f) => { const el = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), Math.min(innerHeight - 2, Math.max(2, r.top + r.height * f))); return !!el && (m === el || m.contains(el)); });
    res({ rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], vw: innerWidth, insideViewport: r.left >= 0 && r.right <= innerWidth, visibleAt: pts });
  }, 600));
});
console.log('MENU', JSON.stringify(menu));
await pg.screenshot({ path: `audit-out/shots-0917/phone-menu-${LANG}-${W}.png`, clip: { x: 0, y: 0, width: W, height: 320 } });

await pg.evaluate(() => localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('he')));
await pg.goto(`${BASE}/coach/bhbc?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(8000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /אחר כך|Later/.test(e.innerText || '')); if (x) x.click(); });
const tabs = await pg.evaluate(() => {
  const nav = document.querySelector('.bhbc-hdr-tabs'); if (!nav) return { err: 'no tab strip' };
  const nr = nav.getBoundingClientRect();
  const first = nav.querySelector('button'); const fr = first.getBoundingClientRect();
  const crest = document.querySelector('.bhbc-header-id'); const cr = crest.getBoundingClientRect();
  const overlap = Math.max(0, Math.min(fr.right, cr.right) - Math.max(fr.left, cr.left));
  const onScreen = fr.left >= 0 && fr.right <= innerWidth;
  return { firstTab: first.innerText.trim(), firstRect: [Math.round(fr.left), Math.round(fr.right)], crestRect: [Math.round(cr.left), Math.round(cr.right)], overlapWithCrest: Math.round(overlap), firstOnScreen: onScreen, rowScrollable: document.querySelector('.bhbc-header-inner').scrollWidth > document.querySelector('.bhbc-header-inner').clientWidth + 1 };
});
console.log('CLUB TABS', JSON.stringify(tabs));
await pg.screenshot({ path: `audit-out/shots-0917/phone-club-${W}.png`, clip: { x: 0, y: 0, width: W, height: 220 } });
await pg.close(); b.disconnect();
