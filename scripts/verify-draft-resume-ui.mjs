// verify-draft-resume-ui.mjs - a resumed workout keeps its logged sets when the
// day was reshaped (2.10 #510-B3), through the REAL athlete portal.
//
// Diego (the fixture athlete), in an ISOLATED browser context so no other tab's
// session changes. Opens day 1, lets the logger write its draft, marks a set
// done on the first exercise IN THE DRAFT, then reorders the draft and gives
// that exercise one extra row - exactly what the device sees after the coach
// reshaped the day. Reopens: the done set must be back on the SAME exercise.
// Before #510-B3 any shape mismatch rebuilt the sheet blank. Nothing is
// completed or sent: the draft lives in localStorage and the context is
// thrown away. Needs the dev server (BASE, :5311).
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5311';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const j = await (await fetch(`${CDP}/json/version`)).json();
const b = await P.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, defaultViewport: null, protocolTimeout: 120000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, JSON.stringify(got)); } };
const clickText = (re) => pg.evaluate((src) => { const r = new RegExp(src, 'i'); const el = [...document.querySelectorAll('button,[role=button]')].find((x) => r.test((x.textContent || '').trim())); if (el) { el.click(); return true; } return false; }, re.source);
const drafts = () => pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('expo-stepLogger-')).map((k) => ({ k, v: JSON.parse(localStorage.getItem(k)) })));
try {
  await setWidth(pg, 390, 844);
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await setWidth(pg, 390, 844);
  for (let k = 0; k < 40 && !(await pg.$('input[type=password]')); k++) await wait(500);
  await pg.evaluate(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const ins = [...document.querySelectorAll('input')];
    set(ins.find((i) => /email/i.test(i.type + i.placeholder)), 'diego@diegoday.com');
    set(ins.find((i) => i.type === 'password'), '1234');
    [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent)).click();
  });
  for (let k = 0; k < 30 && !(await pg.evaluate(() => /\/athlete/.test(location.pathname))); k++) await wait(500);
  await wait(2500);
  await clickText(/^maybe later$/);
  ok('portal open as the athlete', await pg.evaluate(() => /\/athlete/.test(location.pathname)), await pg.evaluate(() => location.href));
  // the day list renders after the plan loads: wait for a START, then for the draft
  for (let k = 0; k < 30 && !(await pg.evaluate(() => [...document.querySelectorAll('button')].some((x) => /^start$/i.test((x.textContent || '').trim())))); k++) await wait(500);
  await clickText(/^start$/);
  for (let k = 0; k < 20 && !(await drafts()).length; k++) await wait(500);
  let d = await drafts();
  if (!d.length) console.log('   (no draft: keys =', JSON.stringify(await pg.evaluate(() => Object.keys(localStorage))), ', buttons =', JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('button')].map((x) => (x.textContent || '').trim()).filter(Boolean).slice(0, 20))), ')');
  ok('the logger wrote a draft with its exercise ids', d.length === 1 && Array.isArray(d[0].v.exOrder) && d[0].v.exOrder.length >= 2, d.map((x) => ({ k: x.k, n: x.v && x.v.exOrder && x.v.exOrder.length })));
  if (d.length === 1 && d[0].v.exOrder && d[0].v.exOrder.length >= 2) {
    const { k, v } = d[0];
    const eid0 = v.exOrder[0];
    // a done set on exercise 0, then the coach's reshape: order reversed, one more row on it
    v.allSets[0][0] = { reps: '5', load: '77.5', rpe: '', done: true };
    v.allSets[0] = [...v.allSets[0], { reps: '', load: '', rpe: '', done: false }];
    v.exOrder = [...v.exOrder].reverse();
    v.allSets = [...v.allSets].reverse();
    if (Array.isArray(v.fv)) v.fv = [...v.fv].reverse();
    // A ZERO MUST SAY WHAT IT MEASURED: the planted draft is stamped savedAt 1,
    // so a reopened logger that never re-saved can not pass by echoing it back
    v.savedAt = 1;
    await pg.evaluate(({ k, v }) => localStorage.setItem(k, JSON.stringify(v)), { k, v });
    // reopen the same day from a fresh page
    await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded' });
    await wait(4000);
    await clickText(/^maybe later$/);
    for (let k = 0; k < 30 && !(await pg.evaluate(() => [...document.querySelectorAll('button')].some((x) => /^start$/i.test((x.textContent || '').trim())))); k++) await wait(500);
    await clickText(/^start$/);
    for (let k2 = 0; k2 < 30; k2++) { const cur = (await drafts()).find((x) => x.k === k); if (cur && cur.v && cur.v.savedAt > 1) break; await wait(500); }
    d = await drafts();
    const now = d.find((x) => x.k === k);
    ok('the reopened logger re-saved its draft (it actually mounted on the planted one)', !!now && now.v.savedAt > 1, now && now.v.savedAt);
    const at = now && now.v.exOrder ? now.v.exOrder.indexOf(eid0) : -1;
    const rows = at >= 0 ? now.v.allSets[at] : null;
    ok('the reopened draft is in the day\'s own order again', at === 0, now && now.v.exOrder);
    ok('the done 77.5 set is back on the SAME exercise', !!rows && rows.some((r) => r && r.done && String(r.load) === '77.5'), rows);
    ok('no other exercise got it', now && now.v.allSets.every((rs, i) => i === at || !(rs || []).some((r) => String(r && r.load) === '77.5')), now && now.v.allSets);
    // leave nothing behind
    await pg.evaluate((k) => localStorage.removeItem(k), k);
  }
} finally {
  await pg.close().catch(() => {}); await ctx.close().catch(() => {}); b.disconnect();
}
console.log(`DRAFT RESUME (UI): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
