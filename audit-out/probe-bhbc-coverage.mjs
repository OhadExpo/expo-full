// What is still English in the club zone when it is switched to Hebrew?
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, 'tomerlich11@gmail.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*sign\s*in\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(9000);
await setWidth(pg, 1500, 1000);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(13000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
await wait(1000);
const flipped = await pg.evaluate(() => {
  const b2 = [...document.querySelectorAll('button')].find((x) => /^\s*עב\s*$/.test((x.textContent || '').trim()));
  if (!b2) return false; b2.click(); return true;
});
console.log('switched to Hebrew:', flipped);
await wait(5000);
const seen = new Map();
// Click tabs BY INDEX. The first version matched English labels, so in Hebrew
// nothing matched and it measured ONE tab five times - identical word counts
// on every line, which is what gave it away.
const nTabs = await pg.evaluate(() => document.querySelectorAll(".bhbc-tab").length);
console.log("tabs found:", nTabs);
for (let i = 0; i < nTabs; i++) {
  const name = await pg.evaluate((k) => {
    const t = [...document.querySelectorAll(".bhbc-tab")][k];
    if (!t) return null; t.click(); return (t.textContent || "").trim();
  }, i);
  if (!name) continue;
  if (/יציאה|sign out/i.test(name)) { console.log("skipped the sign-out control - it carries the tab class"); continue; }
  await wait(4000);
  const out = await pg.evaluate(() => {
    const words = (document.body.innerText || "").match(/[A-Za-z][A-Za-z-]{2,}/g) || [];
    return { heb: /[֐-׿]/.test(document.body.innerText || ""), words, len: (document.body.innerText||"").length };
  });
  console.log(name.padEnd(10) + " he=" + out.heb + "  " + out.len + " chars  " + out.words.length + " latin words");
  for (const w of out.words) seen.set(w, (seen.get(w) || 0) + 1);
}
const GONE = ["baseline", "check-in", "Full", "Limited", "Non-contact", "Recovered", "logged"];
const still = GONE.filter((g) => [...seen.keys()].some((w) => w.toLowerCase() === g.toLowerCase()));
console.log(String.fromCharCode(10) + "English words in the Hebrew club zone:");
console.log([...seen.entries()].sort((a, c) => c[1] - a[1]).slice(0, 40).map(([w, n]) => w + "(" + n + ")").join(" "));
console.log(String.fromCharCode(10) + (still.length ? "STILL ENGLISH: " + still.join(", ") : "the words this pass targeted are gone"));
await pg.close(); b.disconnect();
