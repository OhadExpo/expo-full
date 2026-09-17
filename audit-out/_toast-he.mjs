// Proves the toast host + field labels translate on the Hebrew screen, READ-ONLY: billing
// "+ new request" modal, create with no athlete picked -> validation toast (nothing is written).
import P from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(`${BASE}/coach/billing?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(7000);
const opened = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => e.offsetParent && /בקשה חדשה|NEW REQUEST/i.test(e.innerText || '')); if (el) { el.click(); return el.innerText.trim(); } return null; });
await wait(1200);
const modal = await pg.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog], div')].reverse().find((x) => x.offsetParent && /סכום|Amount/.test(x.innerText || '') && x.innerText.length < 800); return d ? d.innerText.replace(/\s+/g, ' ') : null; });
const clicked = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => e.offsetParent && /^(יצירת בקשה|Create request)$/.test((e.innerText || '').trim())); if (el) { el.click(); return el.innerText.trim(); } return null; });
await wait(700);
const toasts = await pg.evaluate(() => [...document.querySelectorAll('div')].filter((d) => d.offsetParent && getComputedStyle(d).whiteSpace === 'pre-wrap').map((d) => d.innerText));
console.log(JSON.stringify({ opened, clicked, modal, toasts }, null, 1));
await pg.keyboard.press('Escape');
await pg.close(); b.disconnect();
