// Load the athlete portal AS A TRAINEE and look at it. Read-only: nothing that
// writes is clicked, nothing is submitted. Ohad's rule is that "done" means
// verified from the real seat, and tonight changed strings the athlete sees.
import puppeteer from 'puppeteer-core';
import { safeEval, looksLikeLogin } from './lib/authed-page.mjs';

const BASE = process.argv[2] || 'http://localhost:5212';
const EMAIL = process.argv[3] || 'diego@diegoday.com';
const PW = process.env.EXPO_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 430, height: 930 } });
const p = await b.newPage();

await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
await wait(3000);

// A coach session may be live in this profile — sign out first so we really
// are sitting in the athlete's seat and not the owner's.
const body = await safeEval(p, () => document.body.innerText.slice(0, 300));
if (!looksLikeLogin(body)) {
  await safeEval(p, () => { const x = [...document.querySelectorAll('button,a')].find((e) => /sign out|log out/i.test(e.textContent || '')); if (x) x.click(); });
  await wait(3500);
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(2500);
}

await safeEval(p, ({ email, pw }) => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const w = ins.find((i) => i.type === 'password');
  const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, email); if (w) set(w, pw);
}, { email: EMAIL, pw: PW });
await wait(500);
await safeEval(p, () => { const x = [...document.querySelectorAll('button')].find((e) => /^\s*sign\s*in\s*$/i.test(e.textContent.trim())); if (x) x.click(); });
await wait(8000);

await p.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded' }).catch(() => {});
await wait(5000);
const info = await safeEval(p, () => ({
  url: location.pathname,
  onLogin: /Don't have an account/i.test(document.body.innerText),
  text: document.body.innerText.slice(0, 480).replace(/\n{2,}/g, '\n'),
  sw: document.documentElement.scrollWidth,
  iw: window.innerWidth,
}));
console.log('path:', info.url, '| bounced to login:', info.onLogin);
console.log(`horizontal overflow: ${info.sw > info.iw}  (scrollWidth ${info.sw} vs ${info.iw})`);
console.log('--- what the athlete sees ---');
console.log(info.text);
if (process.argv[4]) await p.screenshot({ path: process.argv[4] });
await p.close();
await b.disconnect();
