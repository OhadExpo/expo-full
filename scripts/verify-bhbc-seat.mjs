// DOES THE BHBC SEAT WORK, AND STAY INSIDE ITS BOUNDARIES?
//
// Every functional check in this repo signs in as the OWNER, so all of them
// describe Ohad's view of the app. The BHBC coaches and physios see a different
// product - the /bhbc zone - and nothing verified that theirs works at all.
// His standing non-negotiable names them explicitly: the physios must never be
// affected or stalled.
//
// Two halves, and both matter:
//   WORKS    - the zone loads, every tab renders, nothing throws or 4xx's.
//   BOUNDED  - the seat cannot reach owner-only surfaces. /coach/billing is the
//              sharpest test: revenue is owner-only, and a BHBC coach landing
//              on a working billing screen would be a real leak.
//
// Read-only: it opens tabs and clicks nothing that commits. Nothing here may
// write to a physio's data.
//
//   node scripts/verify-bhbc-seat.mjs [email] [width]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const EMAIL = process.argv[2] || 'tomerlich11@gmail.com';   // a PT, per authRoles.js
const W = Number(process.argv[3] || 1500);
const PW = process.env.BHBC_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
let phase = 'startup';
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

pg.on('pageerror', (e) => problems.push(`[${phase}] page error: ${String(e.message).slice(0, 140)}`));
pg.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|preloaded using link preload/i.test(t)) return;
  problems.push(`[${phase}] console: ${t.slice(0, 140)}`);
});
pg.on('requestfailed', (r) => {
  const u = r.url(); const why = r.failure()?.errorText || '?';
  if (/analytics|vitals|favicon|sentry/i.test(u)) return;
  // MEDIA only, and only for two browser-level reasons: ERR_ABORTED is the
  // page navigating on mid-download, and ERR_CACHE_OPERATION_NOT_SUPPORTED is
  // the debug profile's cache refusing a range request on a video. Neither is
  // the app failing. An aborted API call still fails this gate.
  if (/ERR_ABORTED|ERR_CACHE_OPERATION_NOT_SUPPORTED/.test(why) && /\/storage\/v1\/object\/.*\.(mp4|mov|webm|m4a|jpe?g|png|webp)(\?|$)/i.test(u)) return;
  problems.push(`[${phase}] request failed: ${u.slice(0, 100)} (${why})`);
});
pg.on('response', (r) => {
  const s = r.status(); if (s < 400) return;
  const u = r.url();
  if (/analytics|vitals|favicon/i.test(u)) return;
  if (s === 406) return;
  if (s === 400 && /\/storage\/v1\/object\/sign\//.test(u)) return;
  // A BHBC seat being REFUSED owner-only data is the system working. Those
  // come back 401/403 and are asserted separately below, not counted as faults.
  if ((s === 401 || s === 403) && /revenue_|bit_payment/.test(u)) return;
  problems.push(`[${phase}] HTTP ${s}: ${u.slice(0, 100)}`);
});

try {
  phase = 'sign-in';
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name + (i.getAttribute('aria-label') || '')));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);
  await setWidth(pg, W, 1000);

  phase = 'bhbc-zone';
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded', timeout: 45000 });
  for (let k = 0; k < 60; k++) {
    await wait(400);
    if (await pg.evaluate(() => document.querySelectorAll('*').length > 400
      && !/^\s*loading/i.test(document.body.innerText.trim()))) break;
  }
  await wait(2500);
  const seat = await pg.evaluate(() => ({
    login: /sign in/i.test(document.body.innerText.slice(0, 300)),
    txt: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 100),
    // "Sign out" carries the same class as the tabs. Clicking it logged the PT
    // out mid-run, which made the logout request abort, the next tab render
    // 122 chars, and - worst - the boundary check below pass against a LOGIN
    // screen instead of against a blocked page. A false pass on the security
    // assertion is the one result here that must never be wrong.
    tabs: [...document.querySelectorAll('.bhbc-tab')]
      .map((e) => (e.textContent || '').trim())
      .filter((t) => !/sign\s*out|log\s*out|preview as/i.test(t)),
  }));
  if (seat.login) { console.log(`FAILED: ${EMAIL} cannot sign in`); process.exit(1); }
  console.log('seat : ' + seat.txt.slice(0, 78));
  if (!seat.tabs.length) { problems.push('[bhbc-zone] no BHBC tabs rendered'); }
  console.log('tabs : ' + seat.tabs.join(' | '));

  for (const tab of seat.tabs) {
    phase = 'tab:' + tab.slice(0, 12);
    const ok = await pg.evaluate((label) => {
      const t = [...document.querySelectorAll('.bhbc-tab')].find((e) => (e.textContent || '').trim() === label);
      if (!t) return false; t.click(); return true;
    }, tab);
    if (!ok) { problems.push(`[${phase}] tab vanished`); continue; }
    await wait(4000);
    const len = await pg.evaluate(() => (document.body.innerText || '').trim().length);
    if (len < 200) problems.push(`[${phase}] renders almost nothing (${len} chars)`);
    console.log(`  ${tab.padEnd(20)} ${String(len).padStart(6)} chars`);
  }

  // BOUNDED. Revenue is owner-only; a BHBC seat must not see it.
  phase = 'boundary';
  await pg.goto(BASE + '/coach/billing', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await wait(9000);
  const leak = await pg.evaluate(() => {
    const t = document.body.innerText;
    return {
      sheets: /from the sheets/i.test(t),
      money: /₪\s?\d/.test(t),
      names: /עמית יהודאי|איילת קזצב/.test(t),
      head: t.replace(/\s+/g, ' ').trim().slice(0, 90),
    };
  });
  if (leak.sheets || leak.names) problems.push(`[boundary] BHBC seat can SEE owner revenue: ${leak.head}`);
  console.log(`bound: /coach/billing -> ${leak.sheets || leak.names ? 'LEAK' : 'no revenue visible'} ("${leak.head.slice(0, 46)}")`);
} catch (e) {
  problems.push(`[${phase}] threw: ${String(e.message || e).slice(0, 140)}`);
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
const uniq = [...new Set(problems)];
for (const p of uniq.slice(0, 20)) console.log('FAIL  ' + p);
console.log(uniq.length ? `\n${uniq.length} problem(s) on the ${EMAIL} seat`
                        : `\n0 - the BHBC seat works and stays inside its boundaries`);
process.exit(uniq.length ? 1 : 0);
