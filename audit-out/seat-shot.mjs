// Sign in as a given seat and photograph one route, full page.
//   EXPO_EMAIL=... EXPO_PW=1234 CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 \
//     node audit-out/seat-shot.mjs https://expo-app.co.il /coach/bhbc audit-out/seat-physio.png [width]
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
import { setWidth } from '../scripts/lib/viewport.mjs';
const [BASE, ROUTE, OUT] = [process.argv[2], process.argv[3], process.argv[4]];
const W = Number(process.argv[5] || 1500);
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await pg.evaluate(() => { try { localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
await setWidth(pg, W, W < 600 ? 900 : 1000);
await pg.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
await wait(3000);
const info = await pg.evaluate(() => ({ url: location.pathname, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300), bundle: [...document.scripts].map((s) => s.src).filter((s) => /index-/.test(s)).map((s) => s.split('/').pop()) }));
await pg.screenshot({ path: OUT, fullPage: W >= 600 });
console.log(JSON.stringify(info));
console.log('shot:', OUT);
await ctx.close(); b.disconnect();
