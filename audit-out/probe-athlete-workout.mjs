// Latin words INSIDE a workout, in Hebrew, from Diego's seat: press START on
// the first day, count, then open the first exercise's logger and count again.
//   CDP=http://127.0.0.1:9223 node audit-out/probe-athlete-workout.mjs [base]
import P from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const latin = (t) => (t.match(/\b[A-Za-z]{2,}\b/g) || []);
const report = async (label) => {
  const text = await pg.evaluate(() => document.body.innerText);
  const words = latin(text);
  const freq = {}; for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([w, n]) => (n > 1 ? `${w}(${n})` : w)).join(' ');
  console.log(`${label.padEnd(22)} latin=${String(words.length).padStart(3)}  ${top}`);
};
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
await report('program tab');
const started = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find((e) => /^\s*(התחלה|START|שוב|AGAIN)\s*$/i.test((e.textContent || '').trim()));
  if (el) { el.click(); return el.textContent.trim(); } return null;
});
await wait(3000);
await report(`after "${started}"`);
// Open the first exercise (the first numbered row) and look at the logger.
const opened = await pg.evaluate(() => {
  const rows = [...document.querySelectorAll('[role=button],button,div')].filter((e) => /^\s*1\s*$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width < 60);
  const r = rows[0]; if (!r) return false;
  const card = r.closest('div[style*="border"]') || r.parentElement; (card || r).click(); return true;
});
await wait(2500);
await report(`first exercise (${opened})`);
await pg.screenshot({ path: 'audit-out/athlete-workout-he.png' });
console.log('shot: audit-out/athlete-workout-he.png');
await ctx.close();
b.disconnect();
