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

  // 1. WHO IS A CLUB ATHLETE - asked of the ROSTER, not of a hard-coded list,
  //    so the gate keeps working when the roster changes.
  //
  //    The first version read names off /coach/bhbc and then looked for a row
  //    with that exact text on /coach/athletes. There are no rows: the roster is
  //    `.tv-athlete-card`, one card per athlete, whose textContent is the name
  //    glued to the phone, the email and the status. It opened 0 pages and said
  //    so. Now it reads the cards themselves and asks each one whether it is a
  //    club card - which also tests the LIST, where the money used to show.
  await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' });
  await wait(9000);
  const cards = await pg.evaluate(() => {
    const out = [];
    const all = [...document.querySelectorAll('.tv-athlete-card')];
    all.forEach((c, i) => {
      const t = (c.textContent || '').replace(/\s+/g, ' ').trim();
      // The club card names the club instead of a rate. Any card that says so is
      // a club athlete; a card that says BOTH is already a failure.
      const club = /BHBC|Bnei Herzliya|בני הרצליה/i.test(t);
      const money = /Financials|₪|OVERDUE|per session|monthly|חיוב|תשלום/i.test(t);
      if (club) out.push({ i, money, name: t.slice(0, 24) });
    });
    return { out, total: all.length };
  });
  if (!cards.total) problems.push('no athlete cards on /coach/athletes - the gate measured NOTHING');
  if (cards.total && !cards.out.length) problems.push(`${cards.total} athlete card(s) and not one is a club card - the club tag is not reaching the roster, so this gate proves nothing`);
  for (const c of cards.out) if (c.money) problems.push(`${mask(c.name)}: the ROSTER CARD still shows money`);
  console.log(`roster: ${cards.total} card(s), ${cards.out.length} club card(s), ${cards.out.filter((c) => c.money).length} of them showing money`);
  const names = cards.out.map((c) => c.i);

  // 2. OPEN EACH ON THE COACH'S TRAINEE PAGE and read the whole rendered page.
  let checked = 0;
  for (const idx of names.slice(0, 6)) {
    await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' });
    await wait(7000);
    const opened = await pg.evaluate((i) => {
      const c = [...document.querySelectorAll('.tv-athlete-card')][i];
      if (!c) return false;
      // Click the name, not the card's action buttons.
      const target = c.querySelector('[class*=name], h3, h2, strong') || c;
      target.click();
      return true;
    }, idx);
    if (!opened) continue;
    const name = String(idx);
    await wait(6000);
    // #149: see the ENTIRE page.
    await pg.evaluate(async () => {
      for (let y = 0; y < 12; y++) { window.scrollBy(0, window.innerHeight); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    await wait(900);
    const r = await pg.evaluate((pats) => {
      // SCOPE IT TO THE ATHLETE'S PAGE, NOT THE APP.
      //
      // The first honest run reported "the word Billing" and "a Billing tab" on
      // all six club athletes. It was reading document.body, and the coach's top
      // navigation has a BILLING tab on every screen — the gate was flagging the
      // app's own nav as a leak on the athlete's page. Six identical findings
      // that all named the same element is the shape of that mistake.
      // The trainee page is the PARENT OF THE td-sec-* SECTIONS — not some
      // ancestor found by walking up to the first styled div, which on this page
      // swallows the coach's navigation and puts its BILLING tab back inside the
      // measurement.
      const anySec = document.querySelector('[id^="td-sec-"]');
      const scope = anySec ? anySec.parentElement : null;
      // AND ONLY WHAT IS ON THE SCREEN. The billing section is hidden with
      // display:none for a club athlete, and textContent reads straight through
      // that — which is how a correctly hidden section was reported as a leak.
      const shown = (el) => !!(el.getClientRects().length);
      const txt = scope ? (scope.innerText || '') : (document.body.innerText || '');
      const inScope = (el) => (scope ? scope.contains(el) : true) && shown(el);
      const tabs = [...document.querySelectorAll('button')].filter(inScope).map((x) => (x.textContent || '').trim());
      const isDetail = /BODYWEIGHT|MEDICAL|PROGRAMS|SINCE|משקל|רפואי/i.test(txt);
      // NAME THE ELEMENT, NOT THE PAGE. "the word Billing" six times over is not
      // actionable and does not say whether the gate is looking at the athlete's
      // page or at the app around it.
      const where = (re) => {
        for (const el of document.querySelectorAll('body *')) {
          if (el.children.length) continue;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!t || !re.test(t)) continue;
          if (!inScope(el)) continue;
          const path = [];
          for (let p = el; p && p !== document.body && path.length < 4; p = p.parentElement) {
            path.push(p.tagName.toLowerCase() + (typeof p.className === 'string' && p.className ? '.' + p.className.split(/\s+/)[0] : '') + (p.id ? '#' + p.id : ''));
          }
          return `"${t.slice(0, 30)}" in ${path.join(' < ')}`;
        }
        return null;
      };
      const hits = [];
      for (const p of pats) {
        const re = new RegExp(p.src, p.flags);
        if (!re.test(txt)) continue;
        hits.push(p.id + ' — ' + (where(re) || 'NOT FOUND IN ANY LEAF: it is in the page text but not in a leaf element inside the scope'));
      }
      return { isDetail, hits, scoped: !!scope, tabs: tabs.filter((t) => /billing|חיוב/i.test(t)) };
    }, MONEY.map((m) => ({ id: m.id, src: m.re.source, flags: m.re.flags })));
    if (!r.isDetail) continue;
    checked++;
    const bad = [...r.hits, ...r.tabs.map((t) => `a "${t}" tab`)];
    console.log(`${bad.length ? "BAD " : "ok  "} ${("card #" + name).padEnd(10)} scoped=${r.scoped} ${bad.length ? bad.join(', ') : 'no money anywhere on the page'}`);
    for (const x of bad) problems.push(`club card #${name}: ${x}`);
  }
  if (!checked) problems.push('opened 0 trainee pages - the gate measured NOTHING');
  console.log(`\nCOVERAGE: ${checked} club athlete page(s) read in full (scrolled to the bottom) at ${W}px, against ${MONEY.length} money patterns.`);
} catch (e) {
  problems.push('threw: ' + String(e.message || e).slice(0, 160));
} finally { await pg.close().catch(() => {}); b.disconnect(); }

for (const p of problems) console.log('FAIL  ' + p);
console.log(problems.length ? `\n${problems.length} money leak(s)` : '\n0 money leaks');
process.exit(problems.length ? 1 : 0);
