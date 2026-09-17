// Does the Hebrew "סינון לפי" role label fit its fixed-width slot? (real library + demo)
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await signIn(pg, BASE);
await pg.evaluate(() => localStorage.setItem('expo-lang', 'he'));
const measure = () => pg.evaluate(() => [...document.querySelectorAll('span')].filter((s) => /^(סינון לפי|הצג)$/.test((s.textContent || '').replace(/ /g, ' ').trim()) && s.offsetParent).map((s) => ({ t: s.textContent, w: s.clientWidth, sw: s.scrollWidth, ink: (() => { const r = document.createRange(); r.selectNodeContents(s); return Math.round(r.getBoundingClientRect().width); })() })));
await pg.goto(`${BASE}/coach/exercises?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(8000);
console.log('real', JSON.stringify(await measure()));
await pg.goto(`${BASE}/demo/coach?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(6000);
await pg.evaluate(() => { const el = [...document.querySelectorAll('button, [role="tab"]')].find((e) => /^(תרגילים|EXERCISES)/.test((e.innerText || '').trim()) && e.offsetParent); if (el) el.click(); });
await wait(2500);
console.log('demo', JSON.stringify(await measure()));
await pg.close(); b.disconnect();
