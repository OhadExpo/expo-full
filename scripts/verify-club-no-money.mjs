// A CLUB ATHLETE IS NEVER TOLD ABOUT MONEY.
//
// Ohad, 21.9: "whenever athletes are tagged to bhbc / bnei hertzelia ... remove
// the payments and billing from all their names" - "athlete pages and
// everything".
//
// The predicate lived in FIVE places before this gate existed, and two of them
// were wrong (TraineeDetail's edit form was missing `team === 'BHBC'`, and
// TraineeCRM was handed the payments array regardless). A grep proves what the
// source says; this proves what the SCREEN says.
//
// It never prints an athlete's name. The repo is public.
//
//   node scripts/verify-club-no-money.mjs [width]
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const W = Number(process.argv[2]) || 1500;
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (s) => (s || '').trim().split(/\s+/).map((w) => (w[0] || '?') + '.').join(' ');

// What "money" looks like on a trainee page. Shekel sign, the billing tab, the
// package/rate fields, and the CRM's payment event.
const MONEY = [
  { id: 'shekel sign', re: /₪/ },
  { id: 'the word Payment', re: /\bpayments?\b/i },
  { id: 'the word Billing', re: /\bbilling\b/i },
  { id: 'Sessions Left / Remaining', re: /sessions\s+(left|remaining)/i },
  { id: 'Per Session', re: /per\s+session/i },
  { id: 'Monthly', re: /\bmonthly\b/i },
  { id: 'Package', re: /\bpackage\b/i },
];

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const problems = [];
try {
  await A.signIn(pg, BASE);
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
  await setWidth(pg, W, 1100);

  // 1. WHO IS A CLUB ATHLETE - asked of the app, not of a hard-coded list, so
  //    the gate keeps working when the roster changes.
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
  await wait(9000);
  const names = await pg.evaluate(() => {
    const out = new Set();
    for (const e of document.querySelectorAll('a,button,div,span,td')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(t) || /^[֐-׿]+ [֐-׿]+$/.test(t)) out.add(t);
    }
    return [...out].slice(0, 40);
  });
  if (!names.length) { problems.push('no club athlete found on /coach/bhbc - the gate measured NOTHING'); }
  console.log(`club zone offered ${names.length} candidate name(s)`);

  // 2. OPEN EACH ON THE COACH'S TRAINEE PAGE and read the whole rendered page.
  let checked = 0;
  for (const name of names.slice(0, 6)) {
    await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' });
    await wait(7000);
    const opened = await pg.evaluate((n) => {
      const hit = [...document.querySelectorAll('button,a,td,div')]
        .filter((e) => !e.children.length && (e.textContent || '').replace(/\s+/g, ' ').trim() === n)
        .find((e) => e.closest('button,a,tr,[role=button]'));
      if (!hit) return false;
      (hit.closest('button,a,tr,[role=button]') || hit).click();
      return true;
    }, name);
    if (!opened) continue;
    await wait(6000);
    // #149: see the ENTIRE page.
    await pg.evaluate(async () => {
      for (let y = 0; y < 12; y++) { window.scrollBy(0, window.innerHeight); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    await wait(900);
    const r = await pg.evaluate((pats) => {
      const txt = (document.body.innerText || '');
      const tabs = [...document.querySelectorAll('button')].map((x) => (x.textContent || '').trim());
      const isDetail = /BODYWEIGHT|MEDICAL|PROGRAMS|SINCE/i.test(txt);
      const hits = pats.filter((p) => new RegExp(p.src, p.flags).test(txt)).map((p) => p.id);
      return { isDetail, hits, tabs: tabs.filter((t) => /billing/i.test(t)) };
    }, MONEY.map((m) => ({ id: m.id, src: m.re.source, flags: m.re.flags })));
    if (!r.isDetail) continue;
    checked++;
    const bad = [...r.hits, ...r.tabs.map((t) => `a "${t}" tab`)];
    console.log(`${bad.length ? 'BAD ' : 'ok  '} ${mask(name).padEnd(12)} ${bad.length ? bad.join(', ') : 'no money anywhere on the page'}`);
    for (const x of bad) problems.push(`${mask(name)}: ${x}`);
  }
  if (!checked) problems.push('opened 0 trainee pages - the gate measured NOTHING');
  console.log(`\nCOVERAGE: ${checked} club athlete page(s) read in full (scrolled to the bottom) at ${W}px, against ${MONEY.length} money patterns.`);
} catch (e) {
  problems.push('threw: ' + String(e.message || e).slice(0, 160));
} finally { await pg.close().catch(() => {}); b.disconnect(); }

for (const p of problems) console.log('FAIL  ' + p);
console.log(problems.length ? `\n${problems.length} money leak(s)` : '\n0 money leaks');
process.exit(problems.length ? 1 : 0);
