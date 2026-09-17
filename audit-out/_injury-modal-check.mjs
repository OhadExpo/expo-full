// Club medical: the injury form for an athlete with an active injury - switcher, "+ New injury", onset
// date (max today + "N days ago"), dated progress notes. READ-ONLY: never presses Save.
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const LANG = process.env.LANG_ || 'he';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: W, height: 900 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1000);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
await signIn(pg, BASE);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => /ניהול|COACH|Manage/i.test((e.innerText || '')) && e.offsetParent); if (el) el.click(); });
await wait(2500);
await pg.evaluate((l) => localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)), LANG);
await pg.goto(`${BASE}/coach/bhbc?lang=${LANG}`, { waitUntil: 'domcontentloaded' }); await wait(8000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /אחר כך|Later/.test(e.innerText || '')); if (x) x.click(); });
await pg.evaluate(() => { const el = [...document.querySelectorAll('.bhbc-hdr-tabs button')].find((e) => /רפואי|Medical/i.test((e.innerText || '').trim())); if (el) el.click(); });
await wait(2500);
// the first row whose medical button opens an EXISTING record (label update)
const opened = await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((e) => /^(‹ צפייה|עדכון|UPDATE|VIEW)/i.test((e.innerText || '').trim()));
  if (btn) { btn.click(); return btn.innerText.trim(); } return null;
});
await wait(1500);
const read = () => pg.evaluate(() => {
  const dlg = [...document.querySelectorAll('[role="dialog"]')].pop() || document.body;
  const chips = [...dlg.querySelectorAll('button')].filter((b) => b.offsetParent && /\d|פציעה חדשה|New injury/.test(b.innerText || '') && b.getBoundingClientRect().height <= 30).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).slice(0, 8);
  const dates = [...dlg.querySelectorAll('input[type="date"]')].map((i) => ({ value: i.value, max: i.max, min: i.min, w: Math.round(i.getBoundingClientRect().width) }));
  const title = (dlg.querySelector('h2, h3, [class*="title"]') || {}).innerText || dlg.innerText.split('\n')[0];
  const ago = [...dlg.querySelectorAll('span')].map((s) => s.innerText).find((t) => /לפני \d+ ימים|היום|אתמול|days ago|today|yesterday/.test(t || ''));
  const overflow = [...dlg.querySelectorAll('*')].filter((e) => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).length;
  return { title: title.slice(0, 60), chips, dates, ago, overflow };
});
const before = await read();
console.log('opened', opened, JSON.stringify(before));
await pg.screenshot({ path: `audit-out/shots-0917/injury-modal-${LANG}-${W}.png`, fullPage: false });
// "+ New injury" -> a blank record for the same athlete
await pg.evaluate(() => { const dlg = [...document.querySelectorAll('[role="dialog"]')].pop(); const b = [...dlg.querySelectorAll('button')].find((x) => /פציעה חדשה|New injury/.test(x.innerText || '')); if (b) b.click(); });
await wait(1200);
console.log('after + new', JSON.stringify(await read()));
await pg.keyboard.press('Escape'); await wait(400);
await pg.close(); b.disconnect();
