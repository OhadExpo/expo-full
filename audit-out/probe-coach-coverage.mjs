// What is still English on the COACH app when it is set to Hebrew?
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ROUTES = (process.env.ROUTES || '/coach,/coach/athletes,/coach/programs,/coach/review,/coach/tasks,/coach/billing').split(',');
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
// The helper keeps whatever session the profile holds - after a physio gate
// every coach route measured the club zone. Start signed OUT, always.
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await A.signIn(pg, BASE);
// Hebrew AFTER the sign-in: the helper recognises the English login only.
await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'he'); } catch (e) {} });
await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'he'); } catch (e) {} });
await pg.reload({ waitUntil: 'domcontentloaded' });
await wait(6000);
// The owner is DUAL-ROLE: without a portal choice the app can land on the
// athlete side, and six routes then measure the same page six times.
await pg.evaluate(() => {
  const b2 = [...document.querySelectorAll('button')].find((x) => /coach|מאמן/i.test((x.textContent || '').trim()));
  if (b2) b2.click();
});
await wait(4000);
await setWidth(pg, 1500, 1000);
const seen = new Map();
for (const r of ROUTES) {
  await pg.goto(BASE + r, { waitUntil: 'domcontentloaded' });
  await wait(9000);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  await wait(800);
  const out = await pg.evaluate(() => {
    const dir = getComputedStyle(document.querySelector('.app-root') || document.body).direction;
    const words = (document.body.innerText || '').match(/[A-Za-z][A-Za-z'’-]{2,}/g) || [];
    return { dir, words };
  });
  for (const w of out.words) seen.set(w, (seen.get(w) || 0) + 1);
  console.log(`${r.padEnd(20)} dir=${out.dir}  ${out.words.length} latin words`);
  if (process.env.VERBOSE) { const c = new Map(); for (const w of out.words) c.set(w, (c.get(w) || 0) + 1); console.log('    ' + [...c.entries()].sort((x, y) => y[1] - x[1]).slice(0, 45).map(([w, n]) => n > 1 ? w + '(' + n + ')' : w).join(' ')); }
}
const sorted = [...seen.entries()].sort((a, c) => c[1] - a[1]).slice(0, 60);
console.log('\nmost frequent English words across those coach screens:');
console.log(sorted.map(([w, n]) => `${w}(${n})`).join(' '));
await pg.close(); b.disconnect();
