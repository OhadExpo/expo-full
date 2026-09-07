// The login screen, signed out, in both languages, at phone width.
//   CDP=http://127.0.0.1:9223 node audit-out/shot-login.mjs [base]
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null });
for (const lang of ['en', 'he']) {
  const pg = await b.newPage();
  await pg.evaluateOnNewDocument((l) => { try { localStorage.clear(); localStorage.setItem('expo-lang', l); } catch (e) { /* ignore */ } }, lang);
  await setWidth(pg, 430, 900);
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(5000);
  const t = await pg.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300));
  const latin = (t.match(/[A-Za-z]{3,}/g) || []).filter((w) => !/EXPO|Google|EN/.test(w));
  console.log(`${lang}: ${t}`);
  console.log(`${lang}: ${latin.length} Latin words${latin.length ? ' - ' + latin.slice(0, 12).join(', ') : ''}`);
  await pg.screenshot({ path: `audit-out/login-${lang}.png` });
  await pg.close();
}
b.disconnect();
