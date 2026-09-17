// Rendered English on HEBREW coach screens, with expandables opened. Catches what the
// source gate can't: English stored in lookup maps / data-driven labels (e.g. the tasks
// activity log's EVENT_VERB, 17.9). LOCAL ONLY output (athlete names):
//   C:/Users/ADMINI~1/AppData/Local/Temp/claude/en_leak_he.txt
import P from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/en_leak_he.txt';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1500);
await signIn(pg, BASE);
await pg.evaluate(() => { localStorage.setItem('expo-lang', 'he'); });

const routes = (process.env.ROUTES || '/coach/dashboard,/coach/athletes,/coach/programs,/coach/exercises,/coach/review,/coach/review-tools,/coach/workouts,/coach/sessions,/coach/sessions-single,/coach/intake,/coach/waitlist,/coach/chat-audit,/coach/smart-import,/coach/tasks,/coach/bugs,/coach/challenges,/coach/calendar,/coach/billing,/coach/exercise-matching,/coach/exercise-classify,/coach/exercise-cleanup').split(',');

const expand = () => pg.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0;
  for (let pass = 0; pass < 2; pass++) {
    const els = [...document.querySelectorAll('[aria-expanded="false"]')].filter((e) => e.offsetParent && !/nav|menu/i.test(e.closest('header') ? 'nav' : '')).slice(0, 40);
    for (const e of els) { try { e.click(); n++; } catch {} }
    await sleep(700);
  }
  return n;
});

const collect = () => pg.evaluate(() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const attr = [...document.querySelectorAll('[title],[placeholder],[aria-label]')].filter((e) => e.offsetParent);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const s = t.nodeValue.trim();
    if (!s || s.length > 70 || /[\u0590-\u05FF]/.test(s) || !/[A-Za-z]{3,}/.test(s)) continue;
    const el = t.parentElement; if (!el || !el.offsetParent) continue;
    if (getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"]') || +getComputedStyle(el).opacity === 0) continue;
    if (el.closest('input,textarea,select,code,pre,[data-allow-copy]')) continue;
    // skip when a Hebrew sibling sentence wraps it (data inside a Hebrew line)
    const host = el.closest('div,li,td,button') || el;
    const hostHe = /[\u0590-\u05FF]/.test(host.innerText || '');
    out.push({ s, tag: el.tagName.toLowerCase(), up: getComputedStyle(el).textTransform === 'uppercase', hostHe });
  }
  for (const e of attr) for (const a of ['title', 'placeholder', 'aria-label']) {
    const v = (e.getAttribute(a) || '').trim();
    if (v && !/[\u0590-\u05FF]/.test(v) && /[A-Za-z]{3,}/.test(v) && v.length <= 90) out.push({ s: `@${a}: ${v}`, tag: e.tagName.toLowerCase(), up: false, hostHe: true });
  }
  return out;
});

const report = [];
const seen = new Map();
for (const r of routes) {
  await pg.goto(`${BASE}${r}?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(7000);
  const opened = await expand(); await wait(1200);
  const rows = await collect();
  const fresh = [];
  for (const x of rows) { const k = x.s; if (seen.has(k)) continue; seen.set(k, r); fresh.push(x); }
  report.push(`\n### ${r}  (expanded ${opened}, english nodes ${rows.length}, new ${fresh.length})`);
  for (const x of fresh) report.push(`${x.up ? 'UP ' : '   '}${x.hostHe ? 'inHE ' : '     '}<${x.tag}> ${x.s}`);
}
fs.writeFileSync(OUT, report.join('\n'));
console.log('wrote', OUT, 'unique', seen.size);
await pg.close(); b.disconnect();
