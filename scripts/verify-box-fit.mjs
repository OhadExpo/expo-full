// verify-box-fit.mjs - no BOX runs past the screen or past its own card, on a phone (1.10 #499).
//
// Ohad's photo (BHBC > LIFTS, 390 phone): the whole card was 388px in a 368px
// track - a grid item's default min-width:auto let a month grid inside an
// overflow-x:auto scroller stretch it - and the app root clipped the right edge
// (the S&C toggle, the last column). verify-no-text-overflow did not see it: it
// measures TEXT, and it only opens each route's default tab.
//
// This gate measures BOXES, and opens every tab:
//   A. any visible box whose edge crosses the viewport (not inside a scroller
//      that clips it, not a fixed/absolute overlay or an off-screen drawer);
//   B. any visible box that crosses the border of the bordered card it sits in.
// For every coach route in docs/SURFACES.md + every tab button inside it (the
// BHBC zone's tabs too), the athlete portal + its tabs, and the demo routes, at
// 360/390/414 (real phone emulation), English and Hebrew.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5274 node scripts/verify-box-fit.mjs [--widths 360,390,414] [--lang en,he] [--only bhbc]
// Exit 1 on any finding, any surface not measured, or nothing measured.
//
// AUDIT C (1.10) - what the first version could not see, and what changed:
//  - at <=620px html/body/#root clip overflow-x (and the BHBC zone does too), and
//    any clipping ancestor counted as "contained": check A could NEVER fire on a
//    phone. A PAGE-LEVEL clip or scroller (html, body, #root, .app-root, .bhbc-zone,
//    or anything spanning the whole screen width) no longer contains anything.
//  - a box CUT by its own bordered card (overflow:hidden on the card) is a CUT
//    finding - being cut off is the bug, not a pass.
//  - the athlete and the partner seats are proven signed in (not the login page),
//    a tab that cannot be clicked is an error, a "tab" that navigates to another
//    route is not a tab, and every measured view is written to measured.json.
//  - STILL NOT MEASURED: fixed/absolute layers (modals, drawers, popovers) - this
//    gate does not open them.
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5274';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WIDTHS = arg('--widths', '360,390,414').split(',').map(Number);
const LANGS = arg('--lang', 'en,he').split(',');
const ONLY = arg('--only', null);
const OUT = process.env.OUT || 'audit-out/box-fit';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const coachRoutes = (() => {
  const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
  return [...new Set([...md.matchAll(/`(\/coach(?:\/[a-z0-9/-]*)?)`/gi)].map((m) => m[1]))].filter((r) => !/:/.test(r));
})();
const SURFACES = [
  ...coachRoutes.map((url) => ({ seat: 'owner', url })),
  // Elad's sandbox seat: the owner's screens plus the sandbox banner (read-only navigation)
  ...coachRoutes.map((url) => ({ seat: 'partner', url })),
  { seat: 'athlete', url: '/athlete' },
  ...['/demo', '/demo/coach', '/demo/athlete', '/try'].map((url) => ({ seat: 'none', url })),
  // the MARKETING site (expo-il) - "all platforms" (#499): MARKETING_BASE=http://127.0.0.1:5251
  ...(process.env.MARKETING_BASE ? ['/', '/#/online', '/#/programs', '/#/gym', '/#/privacy', '/#/terms', '/#/accessibility'].map((url) => ({ seat: 'marketing', url, base: process.env.MARKETING_BASE })) : []),
].filter((s) => !ONLY || ONLY.split(',').some((o) => s.url.includes(o))).filter((s) => !process.env.SEATS || process.env.SEATS.split(',').includes(s.seat));

// runs in the page: every box that crosses the screen or its card
const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const pageWrapper = (a) => a === document.documentElement || a === document.body || a.id === 'root' || a.classList.contains('app-root') || a.classList.contains('bhbc-zone');
  const fullWidth = (a) => { const r = a.getBoundingClientRect(); return r.left <= 1 && r.width >= vw - 2; };
  const bordered = (a) => { const cs = getComputedStyle(a); return parseFloat(cs.borderRightWidth) >= 0.5 && parseFloat(cs.borderLeftWidth) >= 0.5 && a.getBoundingClientRect().width > 120; };
  const cardOf = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (parseFloat(cs.borderRightWidth) >= 0.5 && parseFloat(cs.borderLeftWidth) >= 0.5 && a.getBoundingClientRect().width > 120) return a; } return null; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, canvas, video, [aria-hidden="true"], [data-allow-overflow]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (cs.position === 'fixed' || cs.position === 'absolute') continue;
    const q = el.getBoundingClientRect();
    if (q.width < 2 || q.height < 2) continue;
    // inside a scroller (or a clip) that contains it: its own business
    let inScroller = false, cutBy = null;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.position === 'fixed' || acs.position === 'absolute') { inScroller = true; break; }   // overlays/drawers move as a unit
      if (pageWrapper(a)) continue;                                                                  // the page itself contains nothing
      if (/(auto|scroll)/.test(acs.overflowX)) { inScroller = true; break; }
      if (/(hidden|clip)/.test(acs.overflowX) && !fullWidth(a)) { const ar = a.getBoundingClientRect(); if (q.right > ar.right + 1 || q.left < ar.left - 1) { if (bordered(a)) cutBy = a; else inScroller = true; break; } }
    }
    if (inScroller) continue;
    if (cutBy) { const cr = cutBy.getBoundingClientRect(); out.push({ kind: 'CUT', tag: el.tagName, text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), l: Math.round(q.left), r: Math.round(q.right), card: `${Math.round(cr.left)}-${Math.round(cr.right)}` }); continue; }
    if (q.right > vw + 1 || q.left < -1) {
      out.push({ kind: 'SCREEN', tag: el.tagName, text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30), l: Math.round(q.left), r: Math.round(q.right), vw });
      continue;
    }
    const card = cardOf(el);
    if (card) {
      const cr = card.getBoundingClientRect();
      if (q.right > cr.right + 1.5 || q.left < cr.left - 1.5) out.push({ kind: 'CARD', tag: el.tagName, text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), l: Math.round(q.left), r: Math.round(q.right), card: `${Math.round(cr.left)}-${Math.round(cr.right)}` });
    }
  }
  // the outermost offender per branch only (a child of an offender is the same finding)
  return out.slice(0, 40);
};

const tabsOf = async (pg, root) => pg.evaluate((root) => {
  // in-page tab buttons: role=tab, or a nav row of 2-8 short uppercase buttons
  const set = new Set();
  // the app's own header nav (.hdr-scroll) goes to OTHER routes - each is measured as its own surface;
  // an element the reader cannot see is not a tab he can press
  const skip = (b) => !!b.closest('.hdr-scroll') || !b.getClientRects().length || getComputedStyle(b).visibility === 'hidden';
  for (const t of document.querySelectorAll('[role="tab"]')) { if (skip(t)) continue; const s = (t.innerText || '').trim(); if (s && s.length < 24) set.add(s); }
  for (const nav of document.querySelectorAll('nav, [data-tabs], .bhbc-tabs, [class*="tabs"]')) {
    for (const b of nav.querySelectorAll('button, a')) {
      if (skip(b)) continue;
      if (b.tagName === 'A' && b.href && !new URL(b.href, location.href).pathname.startsWith(root)) continue;   // a link out of this surface is not one of its tabs
      const s = (b.innerText || '').trim(); if (s && s.length < 24 && !/sign out|log out|יציאה|התנתק/i.test(s)) set.add(s);
    }
  }
  return [...set].slice(0, 14);
}, root);
const clickTab = (pg, label) => pg.evaluate((l) => { const x = [...document.querySelectorAll('[role="tab"], nav button, nav a, [data-tabs] button, .bhbc-tabs button, [class*="tabs"] button')].find((e) => !e.closest('.hdr-scroll') && e.getClientRects().length && (e.innerText || '').trim() === l); if (x) { x.click(); return true; } return false; }, label);

const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const findings = []; const measuredViews = []; let measured = 0, errors = 0;
for (const seat of ['owner', 'partner', 'athlete', 'none', 'marketing']) {
  const list = SURFACES.filter((s) => s.seat === seat);
  if (!list.length) continue;
  const ctx = await b.createBrowserContext();
  const pg = await ctx.newPage();
  try {
    await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
    if (seat === 'marketing') { const { assertMarketingSite } = await import('./lib/il-site.mjs'); await pg.goto(process.env.MARKETING_BASE + '/', { waitUntil: 'domcontentloaded' }); await assertMarketingSite(pg, process.env.MARKETING_BASE); }
    if (seat === 'owner' || seat === 'athlete' || seat === 'partner') {
      process.env.EXPO_EMAIL = { owner: 'ohadyproductions@gmail.com', athlete: 'diego@diegoday.com', partner: 'eladeluz24@gmail.com' }[seat];
      const A = await import('./lib/authed-page.mjs?' + seat);
      let ok = false; for (let k = 0; k < 3 && !ok; k++) { await A.signIn(pg, BASE); ok = await A.assertAuthed(pg, BASE, seat === 'athlete' ? '/athlete' : '/coach/dashboard'); }
      if (ok && seat === 'partner') ok = await pg.evaluate(() => window.__expoSandbox === true);
      if (!ok) throw new Error('could not sign in as ' + seat);
    }
    for (const lang of LANGS) {
      await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)); } catch (e) {} }, lang);
      for (const w of WIDTHS) {
        await pg.emulate({ viewport: { width: w, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' });
        // the partner seat is the owner's screens plus a one-row banner: measured at the NARROWEST width only
        if (seat === 'partner' && w !== Math.min(...WIDTHS)) continue;
        for (const s of list) {
          const id = `${s.url}/${lang}/${w}`;
          try {
            await pg.goto((s.base || BASE) + s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            if (s.url.includes('#')) { await pg.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange'))); }
            for (let k = 0; k < 30; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.trim().length > 60 && !/LOADING DATA/.test(document.body.innerText.slice(0, 300)))) break; }
            await wait(2500);
            if ((seat === 'owner' || seat === 'athlete' || seat === 'partner') && await pg.evaluate(() => !!document.querySelector('input[type="password"]'))) throw new Error('signed out - not measured');
            const views = [{ tab: '(default)' }];
            const root = s.url.split('#')[0] || '/';
            for (const t of await tabsOf(pg, root)) views.push({ tab: t });
            for (const v of views) {
              if (v.tab !== '(default)') {
                const okc = await clickTab(pg, v.tab);
                if (!okc) { errors++; console.log(`ERROR ${id} [${v.tab}] tab not clickable - not measured`); continue; }
                await wait(2200);
                if (!(await pg.evaluate(() => location.pathname)).startsWith(root)) { await pg.goto((s.base || BASE) + s.url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await wait(4000); continue; }
              }
              const f = await pg.evaluate(MEASURE);
              measured++; measuredViews.push(`${id} [${v.tab}]`);
              for (const x of f) { findings.push({ id, tab: v.tab, ...x }); }
              if (f.length) console.log(`FIND ${id.padEnd(30)} [${v.tab}] ${f.length}: ${f.slice(0, 3).map((x) => `${x.kind} ${x.tag} "${x.text}" ${x.l}-${x.r}${x.card ? ' card ' + x.card : ' vw ' + x.vw}`).join(' | ')}`);
            }
          } catch (e) { errors++; console.log(`ERROR ${id} ${String(e.message || e).slice(0, 90)}`); }
        }
      }
    }
  } finally {
    await ctx.close();
  }
}
b.disconnect();
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
fs.writeFileSync(`${OUT}/measured.json`, JSON.stringify(measuredViews, null, 1));
const perSeat = {}; for (const s of SURFACES) perSeat[s.seat] = (perSeat[s.seat] || 0) + 1;
console.log('surfaces per seat: ' + Object.entries(perSeat).map(([k, v]) => `${k} ${v}`).join(', ') + ` - widths ${WIDTHS.join('/')}, languages ${LANGS.join('/')} -> ${OUT}/measured.json`);
const views = new Set(findings.map((f) => `${f.id} [${f.tab}]`));
console.log(`\n${measured} page x tab x width x language views measured. Boxes past the screen, past their card, or cut by it: ${findings.length} (in ${views.size} views) -> ${OUT}/findings.json`);
if (!measured) { console.log('FAIL: measured nothing'); process.exit(1); }
if (errors) { console.log(`FAIL: ${errors} surface(s) not measured`); process.exit(1); }
process.exit(findings.length ? 1 : 0);
