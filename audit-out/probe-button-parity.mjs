// Hebrew vs English BUTTON parity (Ohad 2026-09-11: "all the buttons are the
// same size and rulings as in the english versions. everywhere").
// For every route: sign in, render in English, record every button's box and
// border; render the same route in Hebrew; pair buttons by DOM path; report
// any pair whose width/height differs by more than 1px or whose border
// (width / style) differs. Writes audit-out/perf/button-parity.json.
//   CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 node audit-out/probe-button-parity.mjs [base] [W]
import fs from 'node:fs';
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const W = Number(process.argv[3] || 1400);
const ROUTES = (process.env.ROUTES || '/coach,/coach/athletes,/coach/programs,/coach/exercises,/coach/review,/coach/review-tools,/coach/workouts,/coach/sessions,/coach/tasks,/coach/billing,/coach/calendar,/coach/intake,/coach/waitlist,/coach/bugs,/coach/smart-import,/coach/exercise-cleanup,/coach/challenges').split(',');
const ATHLETE = (process.env.ATHLETE || '1') === '1';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const collect = () => [...document.querySelectorAll('button, a[role="button"], [role="button"]')].map((el) => {
  const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return null;
  const cs = getComputedStyle(el);
  const path = []; let n = el;
  while (n && n !== document.body) { const p = n.parentElement; if (!p) break; const i = [...p.children].indexOf(n); path.unshift(n.tagName + ':' + i); n = p; }
  return { key: path.join('/'), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height),
    bw: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(' '), bs: cs.borderTopStyle, fs: cs.fontSize, pad: cs.padding, minW: cs.minWidth };
}).filter(Boolean);

async function settle() {
  for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
  await wait(2500);
}
async function snap(route, lang) {
  await pg.evaluate((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} }, lang);
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle();
  return pg.evaluate(collect);
}
const report = [];
async function compare(route) {
  const en = await snap(route, 'en');
  const he = await snap(route, 'he');
  const byKey = new Map(en.map((x) => [x.key, x]));
  const diffs = [];
  for (const h of he) {
    const e = byKey.get(h.key); if (!e) continue;
    const dw = h.w - e.w, dh = h.h - e.h;
    const border = e.bw !== h.bw || e.bs !== h.bs;
    if (Math.abs(dw) > 1 || Math.abs(dh) > 1 || border) diffs.push({ en: e.text, he: h.text, enBox: `${e.w}×${e.h}`, heBox: `${h.w}×${h.h}`, dw, dh, border: border ? `${e.bw}/${e.bs} → ${h.bw}/${h.bs}` : '', minW: e.minW, key: h.key });
  }
  const paired = he.filter((h) => byKey.has(h.key)).length;
  report.push({ route, buttonsEn: en.length, buttonsHe: he.length, paired, diffs });
  console.log(`${route.padEnd(24)} en=${String(en.length).padStart(3)} he=${String(he.length).padStart(3)} paired=${String(paired).padStart(3)} DIFF=${diffs.length}`);
  for (const d of diffs.slice(0, 12)) console.log(`    ${d.enBox.padEnd(8)} → ${d.heBox.padEnd(8)} dw=${String(d.dw).padStart(4)} dh=${String(d.dh).padStart(3)} ${d.border ? '[' + d.border + '] ' : ''}"${d.en}" → "${d.he}"`);
  if (diffs.length > 12) console.log(`    … ${diffs.length - 12} more`);
}
// Coach seat: the English login is the one the helper knows.
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await setWidth(pg, W, 900);
for (const r of ROUTES) { try { await compare(r); } catch (e) { console.log(`${r} FAILED ${String(e.message || e).slice(0, 80)}`); } }
if (ATHLETE) {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(() => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)); const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e) set(e, 'diego@diegoday.com'); if (p) set(p, '1234');
  });
  await wait(400);
  await pg.evaluate(() => { const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || '')); if (btn) btn.click(); });
  await wait(9000);
  await setWidth(pg, 390, 844);
  try { await compare('/athlete'); } catch (e) { console.log(`/athlete FAILED ${String(e.message || e).slice(0, 80)}`); }
}
fs.mkdirSync('audit-out/perf', { recursive: true });
fs.writeFileSync('audit-out/perf/button-parity.json', JSON.stringify(report, null, 1));
const total = report.reduce((n, r) => n + r.diffs.length, 0);
console.log(`\n${total} button(s) differ between English and Hebrew across ${report.length} route(s) -> audit-out/perf/button-parity.json`);
await ctx.close(); b.disconnect();
