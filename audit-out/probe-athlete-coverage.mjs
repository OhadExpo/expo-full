// What is still English on the athlete's own screen when the app is in Hebrew?
// Same method that found 100 English words on the physio's medical board: walk
// the real tabs, count Latin words, and print them so the list is actionable.
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = 'http://127.0.0.1:4173';
const EMAIL = process.env.EMAIL || 'amit@enoshy.com';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'he'); } catch (e) { /* ignore */ } });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
// Clear BOTH: the Supabase session lives in localStorage, so clearing only
// sessionStorage left the PREVIOUS seat signed in and measured the wrong app.
// The language is re-set by the on-new-document hook on the reload below.
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate((email) => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, email); if (p) set(p, '1234');
}, EMAIL);
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(10000);
await setWidth(pg, 390, 800);
await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded' });
await wait(11000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
await wait(1000);
const seen = new Map();
// The portal's tabs are buttons in one strip. Click by INDEX - matching English
// labels is exactly the mistake that made the club-zone probe measure one tab
// five times.
const labels = await pg.evaluate(() => {
  const strip = [...document.querySelectorAll('button')].filter((b2) => { const r = b2.getBoundingClientRect(); return r.top < 260 && r.width > 24 && r.height > 18; });
  return strip.map((b2) => (b2.innerText || '').trim()).slice(0, 12);
});
console.log('controls near the top:', JSON.stringify(labels));
for (let i = 0; i < labels.length; i++) {
  const name = await pg.evaluate((k) => {
    const strip = [...document.querySelectorAll('button')].filter((b2) => { const r = b2.getBoundingClientRect(); return r.top < 260 && r.width > 24 && r.height > 18; });
    const el = strip[k]; if (!el) return null;
    const t = (el.innerText || '').trim();
    if (/יציאה|log ?out|התנתק/i.test(t)) return 'SKIP';
    el.click(); return t;
  }, i);
  if (!name || name === 'SKIP') continue;
  await wait(3500);
  const out = await pg.evaluate(() => {
    const txt = document.body.innerText || '';
    return { heb: /[\u0590-\u05FF]/.test(txt), words: txt.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [], len: txt.length };
  });
  console.log((name || '?').replace(/\n/g, ' ').slice(0, 14).padEnd(15) + ' he=' + out.heb + '  ' + out.len + ' chars  ' + out.words.length + ' latin words');
  for (const w of out.words) seen.set(w, (seen.get(w) || 0) + 1);
}
console.log('\nEnglish on the athlete screen, in Hebrew:');
console.log([...seen.entries()].sort((a, c) => c[1] - a[1]).slice(0, 45).map(([w, n]) => w + '(' + n + ')').join(' '));
await pg.close(); b.disconnect();
