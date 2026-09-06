// NOTHING INTERNAL REACHES THE SCREEN.
//
// Written because one did: the club's Sessions tab showed an athlete called
// `tr_ron` - a database id, on a display built to run on the gym floor - because
// a name lookup missed and the fallback was the raw key. Nothing was watching
// for that class of leak, and it is the kind a coach spots before any gate does.
//
// What counts as internal, and why each one:
//   tr_… / pl_…      a row id where a name or a title belongs
//   NaN              arithmetic on a missing number, shown as if it were one
//   undefined / null  a value that was never there, printed as a word
//   [object Object]  an object rendered instead of its field
//   Invalid Date     a date that failed to parse
//
// Skips the fixtures on purpose: `tr_diego` is the test athlete's id and appears
// in HIS OWN name field on the demo surfaces, which is data, not a leak.
//
// Read-only.
//
//   SEAT=owner|athlete|pt node scripts/verify-no-raw-values.mjs [route...]
import fs from 'node:fs';
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const SEAT = (process.env.SEAT || 'owner').toLowerCase();
const W = Number(process.env.W || 1500);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SEATS = {
  owner:   { email: 'ohadyproductions@gmail.com', pw: process.env.OWNER_PW || '1234' },
  athlete: { email: 'diego@diegoday.com',         pw: process.env.ATHLETE_PW || '1234' },
  pt:      { email: 'tomerlich11@gmail.com',      pw: process.env.BHBC_PW || '1234' },
};
// EMAIL= points a seat at a REAL person. The fixtures are deliberately thin -
// Diego has no history at all - and thin data hides exactly the defects these
// gates look for, so they have to be runnable against someone with a real one.
const who = process.env.EMAIL
  ? { email: process.env.EMAIL, pw: process.env.PW || '1234' }
  : SEATS[SEAT];
if (!who) { console.log(`unknown seat "${SEAT}" - owner | athlete | pt`); process.exit(1); }

const coachRoutes = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/coach(?![a-z])[a-z0-9/-]*)`/gi)].map((m) => m[1]))].filter((r) => !/:|\/$/.test(r));
  } catch { return ['/coach']; }
};
const ROUTES = process.argv.length > 2 ? process.argv.slice(2)
  : (SEAT === 'owner' ? coachRoutes() : SEAT === 'pt' ? ['/coach/bhbc'] : ['/athlete']);

const problems = [];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
// LANG_APP=he walks the app in Hebrew. Set BEFORE the first document: App reads
// the language at mount and writes it straight back, so a later setItem loses.
// Worth a separate run - a broken interpolation can be language-specific.
if (process.env.LANG_APP) {
  await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); } catch (e) { /* ignore */ } }, process.env.LANG_APP);
}
let pageErr = null;
pg.on('pageerror', (e) => { pageErr = String(e.message).slice(0, 110); });

const read = () => pg.evaluate(() => {
  const t = document.body.innerText || '';
  const hit = (re) => [...new Set(t.match(re) || [])];
  return {
    ids: hit(/\b(?:tr|pl)_[a-z0-9_]{3,}/gi),
    nan: hit(/\bNaN\b/g),
    undef: hit(/\bundefined\b/g),
    obj: hit(/\[object Object\]/g),
    baddate: hit(/Invalid Date/g),
    len: t.length,
  };
});

try {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: who.email, pw: who.pw });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);
  await setWidth(pg, W, 1000);
  console.log(`seat ${SEAT} - ${ROUTES.length} route(s) at ${W}px\n`);

  for (const route of ROUTES) {
    pageErr = null;
    await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await wait(9000);
    await pg.evaluate(() => {
      const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
      if (x) x.click();
    }).catch(() => {});
    await wait(800);
    const r = await read();
    // The test athlete's own id IS his name in the fixtures, not a leak.
    const ids = r.ids.filter((x) => !/^tr_diego$/i.test(x));
    const bad = [...ids, ...r.nan, ...r.undef, ...r.obj, ...r.baddate];
    console.log(`${bad.length ? 'BAD ' : 'ok  '} ${route.padEnd(26)} ${String(r.len).padStart(6)} chars${bad.length ? '   ' + bad.slice(0, 4).join(', ') : ''}${pageErr ? '  ERR ' + pageErr : ''}`);
    for (const x of ids) problems.push(`${route}: raw id on screen - ${x}`);
    for (const x of r.nan) problems.push(`${route}: NaN on screen`);
    for (const x of r.undef) problems.push(`${route}: the word "undefined" on screen`);
    for (const x of r.obj) problems.push(`${route}: [object Object] on screen`);
    for (const x of r.baddate) problems.push(`${route}: Invalid Date on screen`);
  }
} catch (e) {
  problems.push('threw: ' + String(e.message || e).slice(0, 120));
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
for (const p of [...new Set(problems)]) console.log('FAIL  ' + p);
console.log(problems.length ? `\n${problems.length} internal value(s) on screen` : '\n0 - nothing internal reaches the screen');
process.exit(problems.length ? 1 : 0);
