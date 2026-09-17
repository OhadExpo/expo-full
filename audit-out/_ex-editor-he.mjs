// Read-only: open the exercise editor (new) on the Hebrew screen and dump its labels. Closes without saving.
import P from 'puppeteer-core';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto('http://127.0.0.1:4173/coach/exercises?lang=he', { waitUntil: 'domcontentloaded' }); await wait(8000);
const btns = await pg.evaluate(() => [...document.querySelectorAll('button')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter((t) => /^\+|חדש|NEW/i.test(t)));
const clicked = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => e.offsetParent && /הוספת תרגיל|NEW EXERCISE|ADD EXERCISE/i.test((e.innerText || '').trim())); if (el) { el.click(); return el.innerText.trim(); } return null; });
await wait(1500);
const labels = await pg.evaluate(() => [...document.querySelectorAll('label')].filter((l) => l.offsetParent).map((l) => l.innerText.trim()));
console.log(JSON.stringify({ btns, clicked, labels }));
await pg.keyboard.press('Escape');
await pg.close(); b.disconnect();
