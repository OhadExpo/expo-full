// Does the medical board actually lock a REGULAR BHBC coach out?
//
// Until the RLS migration lands, `canMedical={isOwner || isPtEmail(email)}` is
// the only thing enforcing it. verify-auth-roles.mjs proves the predicate is
// right; this proves the SCREEN honours it, from the coach's own seat.
//
// Strictly read-only: it reads the board's header badge and counts the edit
// affordances. Nothing is clicked, nothing is submitted — a trial must never
// touch trainee-visible data.
import puppeteer from 'puppeteer-core';
import { safeEval, looksLikeLogin } from './lib/authed-page.mjs';

const BASE = process.argv[2] || 'http://localhost:5212';
const EMAIL = process.argv[3] || 'benshemer4@gmail.com';
const PW = process.env.BHBC_COACH_PASSWORD || process.env.EXPO_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 1400, height: 980 } });
const p = await b.newPage();

await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
await wait(3000);
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

await p.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' }).catch(() => {});
await wait(6000);

// The zone opens on Overview. Click through to MEDICAL - navigation only, it
// writes nothing.
await safeEval(p, () => {
  const tab = [...document.querySelectorAll('button,a,div')]
    .filter((e) => e.offsetParent)
    .find((e) => /^\s*medical\s*$/i.test((e.textContent || '').trim()));
  if (tab) tab.click();
});
await wait(4500);

const r = await safeEval(p, () => {
  const t = document.body.innerText;
  const onLogin = /Don't have an account/i.test(t);
  // The board header renders "N active · Ohad + PT" when editing is allowed,
  // and "N active · view only" when it is not.
  const viewOnly = /active\s*·\s*view only/i.test(t);
  const editable = /active\s*·\s*Ohad \+ PT/i.test(t);
  // innerText returns the CSS-TRANSFORMED text, so the label renders as
  // "UPDATE ›", not "Update ›". Matching the source casing counted zero on
  // BOTH seats and made the PT look locked out when the screenshot showed him
  // holding an UPDATE link and a + REPORT button on every roster row.
  const updateLinks = (t.match(/update\s*›/gi) || []).length;
  const reportBtn = [...document.querySelectorAll('button')].filter((b) => /\+\s*report/i.test(b.textContent || '')).length;
  return { onLogin, viewOnly, editable, updateLinks, reportBtn, sample: t.slice(0, 260).replace(/\n{2,}/g, '\n') };
});

console.log(`seat: ${EMAIL}`);
console.log(`bounced to login : ${r.onLogin}`);
console.log(`board header     : ${r.viewOnly ? 'VIEW ONLY' : r.editable ? 'EDITABLE (Ohad + PT)' : 'not found'}`);
console.log(`"Update ›" links : ${r.updateLinks}`);
console.log(`report buttons   : ${r.reportBtn}`);
// Expectation follows the seat. Asserting only the negative case would let a
// change that locks EVERYONE out — including the PT — pass silently.
const shouldEdit = ['yoel23919@gmail.com', 'ohadyproductions@gmail.com'].includes(EMAIL.toLowerCase());
const ok = !r.onLogin && (shouldEdit
  ? (r.editable && r.updateLinks > 0 && r.reportBtn > 0)
  : (r.viewOnly && r.updateLinks === 0 && r.reportBtn === 0));
console.log(`\nexpected: ${shouldEdit ? 'CAN edit (PT or owner)' : 'read-only (regular coach)'}`);
console.log(ok
  ? (shouldEdit ? 'PASS - the PT can edit the medical board' : 'PASS - a regular coach sees it read-only')
  : 'CHECK - see the numbers above');
if (process.argv[4]) await p.screenshot({ path: process.argv[4] });
await p.close();
await b.disconnect();
process.exit(ok ? 0 : 1);
