// Club overview: the one-word preview toggle, and START SESSION gone from the TODAY card.
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 1400);
const LANG = process.env.LANG_ || 'he';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true); await pg.setViewport({ width: W, height: 1000 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
await signIn(pg, BASE);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => /ניהול|COACH|Manage/i.test(e.innerText || '') && e.offsetParent); if (el) el.click(); });
await wait(2000);
await pg.evaluate((l) => localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)), LANG);
await pg.goto(`${BASE}/coach/bhbc?lang=${LANG}`, { waitUntil: 'domcontentloaded' }); await wait(8000);
console.log(JSON.stringify(await pg.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((e) => e.offsetParent).map((e) => e.innerText.replace(/\s+/g, ' ').trim());
  const preview = btns.find((t) => /כמאמן|PREVIEW|תצוגת/i.test(t));
  return { preview, previewWords: preview ? preview.replace(/[◉●]/g, '').trim().split(/\s+/).length : null, startSessionPresent: btns.some((t) => /התחל אימון|START SESSION/i.test(t)), logPracticePresent: btns.some((t) => /רישום אימון|LOG PRACTICE/i.test(t)) };
})));
await pg.screenshot({ path: `audit-out/shots-0917/club-overview-${LANG}-${W}.png`, clip: { x: 0, y: 0, width: Math.min(W, 1400), height: 520 } });
await pg.close(); b.disconnect();
