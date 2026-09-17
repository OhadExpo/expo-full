// Put the debug Chrome's expo-app.co.il session on the OWNER seat (it was left on the test athlete).
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = 'https://expo-app.co.il';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true);
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await wait(2500);
await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k); });
console.log(JSON.stringify(await signIn(pg, BASE)));
await pg.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' }); await wait(6000);
console.log(pg.url(), (await pg.evaluate(() => document.body.innerText.slice(0, 80))).replace(/\s+/g, ' '));
await pg.close(); b.disconnect();
