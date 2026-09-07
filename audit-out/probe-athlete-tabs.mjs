// Latin words on EACH tab of the athlete portal, in Hebrew, from Diego's seat.
// The coverage probe only ever sees the program tab; the other five are where
// an athlete spends the rest of the week.
//   CDP=http://127.0.0.1:9223 node audit-out/probe-athlete-tabs.mjs [base]
import P from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const latin = (t) => (t.match(/\b[A-Za-z]{2,}\b/g) || []);
await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, 'diego@diegoday.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || '')); if (btn) btn.click(); });
await wait(9000);
const tabs = ['תוכנית', 'משקל', 'יומן אוכל', 'היסטוריה', 'שיאים', 'הודעות'];
for (const t of tabs) {
  const clicked = await pg.evaluate((label) => {
    const el = [...document.querySelectorAll('button,[role=tab]')].find((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().replace(/^[▸►\s]+/, '').replace(/\s*\(\d+\)$/, '') === label);
    if (el) { el.click(); return true; } return false;
  }, t);
  await wait(2500);
  const text = await pg.evaluate(() => document.body.innerText);
  const words = latin(text);
  const freq = {}; for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([w, n]) => (n > 1 ? `${w}(${n})` : w)).join(' ');
  console.log(`${t.padEnd(10)} clicked=${clicked} latin=${String(words.length).padStart(3)}  ${top}`);
}
await ctx.close();
b.disconnect();
