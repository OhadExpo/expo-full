// ONE HARNESS FOR THE ROUTE x LANGUAGE x WIDTH BROWSER GATES.
//
// Written 27.9 for verify-rail-slices / verify-scroller-tail /
// verify-dot-centring / verify-optional-edge, so four gates cannot each get
// the seat, the width or the "measured nothing" rule wrong in a different way.
// It is the verify-date-format.mjs pattern, generalised:
//
//   - routes: every coach tab and every BHBC tab (signed in as the owner, via
//     lib/authed-page.mjs, which THROWS on a wrong seat) and the public demo
//     (/demo, the demo coach tabs, /demo/athlete) in a separate, signed-out
//     context. Coach routes are the tab keys in docs/SURFACES.md; BHBC tabs
//     are the zone's own URLs (/coach/bhbc/<tab>).
//   - widths WIDTHS (default 360,390,412,768,1024,1440) through
//     lib/viewport.mjs setWidth - the ONLY way a width takes on the attached
//     Chrome; phones (<= 620) get touch + pointer:coarse. innerWidth is
//     re-checked on every page and a page that is not at the asked width is
//     SKIPPED, not measured.
//   - languages LANGS (default en,he) through the app's own storage keys.
//   - a throwaway browser context per (lang, width) - one signed-in, one
//     signed-out - always closed in `finally`; b.disconnect() at the end,
//     never browser.close() (it is his debug Chrome).
//   - PAGE_TIMEOUT (default 60000ms) per page: a wedged page is abandoned,
//     reported as NOT MEASURED, and a fresh tab takes over.
//   - a zero must say what it measured: the summary prints pages and elements
//     beside the failure count, and a run that measured nothing EXITS 1.
//
// Env: BASE (default http://127.0.0.1:5199), WIDTHS, LANGS, ONLY (substring of
// a route - e.g. ONLY=bhbc), PAGE_TIMEOUT, THEME (dark|light, default dark),
// BREAK_CSS (a stylesheet injected after load, for break-testing a gate).
import P from 'puppeteer-core';
import { signIn } from './authed-page.mjs';
import { setWidth } from './viewport.mjs';

export const BASE = process.env.BASE || 'http://127.0.0.1:5199';
export const WIDTHS = (process.env.WIDTHS || '360,390,412,768,1024,1440').split(',').map((s) => Number(s.trim())).filter(Boolean);
export const LANGS = (process.env.LANGS || 'en,he').split(',').map((s) => s.trim()).filter(Boolean);
export const PAGE_TIMEOUT = Number(process.env.PAGE_TIMEOUT || 60000);
const ONLY = process.env.ONLY || null;
const THEME = process.env.THEME || 'dark';
// BREAK_CSS: a stylesheet injected after each page settles, to prove a gate
// catches what it claims to (memory: prove a gate by BREAKING the fix). A run
// with it set must FAIL; the summary says loudly that it was a break test.
const BREAK_CSS = process.env.BREAK_CSS || '';
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Coach tabs (SURFACES.md "Coach app" table, the ones reachable by a bare URL).
export const COACH = ['dashboard', 'athletes', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing', 'intake', 'waitlist', 'challenges', 'calendar', 'workouts', 'bugs'].map((r) => `/coach/${r}`);
// The BHBC zone's tabs are URLs of their own since 27.9.
export const BHBC = ['overview', 'roster', 'schedule', 'lifts', 'medical', 'games', 'activity'].map((t) => `/coach/bhbc/${t}`);
// Public demo: the landing, the coach tour and each of its tabs, the athlete portal.
export const DEMO = ['/demo', '/demo/coach', ...['trainees', 'programs', 'exercises', 'sessions', 'review', 'tasks', 'billing'].map((t) => `/demo/coach/${t}`), '/demo/athlete'];

const heightFor = (w) => (w <= 620 ? 844 : 950);

async function withTimeout(p, ms, what) {
  let t;
  // The loser of the race keeps running against a tab we are about to close;
  // its eventual rejection must not become an unhandled one (it kills node).
  p.catch(() => {});
  const guard = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`TIMEOUT ${what} after ${ms}ms`)), ms); });
  try { return await Promise.race([p, guard]); } finally { clearTimeout(t); }
}

async function freshPage(ctx, lang, w) {
  const pg = await ctx.newPage();
  await pg.setBypassServiceWorker(true).catch(() => {});   // a stale SW bundle is not the code under test
  await setWidth(pg, w, heightFor(w));
  await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: THEME }]).catch(() => {});
  await pg.evaluateOnNewDocument((L, T) => {
    try {
      localStorage.setItem('expo-lang', L);
      localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(L));   // the BHBC zone keeps its own language (usePersistentState, JSON)
      localStorage.setItem('expo-theme', T);
      localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
    } catch (e) { /* private mode */ }
  }, lang, THEME);
  return pg;
}

// Settle: text length stable, real text on screen (a splash is stable too),
// fonts loaded, and for the club zone its tab strip present.
async function settle(pg, route) {
  let prev = -1;
  for (let i = 0; i < 30; i++) {
    await wait(500);
    const len = await pg.evaluate(() => (document.body && document.body.innerText || '').length);
    if (len === prev && len > 0) break;
    prev = len;
  }
  for (let i = 0; i < 20; i++) {
    const ink = await pg.evaluate(() => (document.body && document.body.innerText || '').replace(/\s+/g, '').length);
    if (ink >= 40) break;
    await wait(500);
  }
  if (route.includes('/bhbc')) {
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => document.querySelectorAll('.bhbc-hdr-tabs button').length > 2)) break; await wait(500); }
  }
  await pg.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true)).catch(() => {});
  await wait(800);
}

// Scroll positions at rest: an app that scrolls its active tab into view may do
// it smoothly, and a measurement taken mid-animation describes nothing.
export async function waitScrollIdle(pg, maxMs = 4000) {
  const snap = () => pg.evaluate(() => {
    let s = String(scrollX) + ',' + String(scrollY);
    for (const el of document.querySelectorAll('*')) if (el.scrollLeft || el.scrollTop) s += '|' + el.scrollLeft + ',' + el.scrollTop;
    return s;
  });
  let last = await snap(), same = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await wait(150);
    const now = await snap();
    if (now === last) { if (++same >= 3) return true; } else { same = 0; last = now; }
  }
  return false;
}

// runSweep({ name, measure })
//   measure(pg, meta) -> { elements: number, failures: [{ what, detail }] }
//   meta = { route, lang, width, where }
export async function runSweep({ name, measure }) {
  const pick = (list) => list.filter((r) => !ONLY || r.includes(ONLY));
  const AUTHED_ROUTES = pick([...COACH, ...BHBC]);
  const PUBLIC_ROUTES = pick(DEMO);
  const planned = (AUTHED_ROUTES.length + PUBLIC_ROUTES.length) * LANGS.length * WIDTHS.length;

  const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 180000 });
  let pages = 0, elements = 0;
  const failures = [];
  const skipped = [];
  const t0 = Date.now();

  const visitAll = async (ctx, lang, w, routes, authed) => {
    let pg = await freshPage(ctx, lang, w);
    try {
      if (authed) {
        let who = null;
        try { who = await withTimeout(signIn(pg, BASE), PAGE_TIMEOUT * 2, 'sign-in'); }
        catch (e) { who = { signedIn: false, note: String(e.message || e).slice(0, 120) }; }
        if (!who || !who.signedIn) {
          for (const r of routes) skipped.push(`${r} @${w} ${lang} — could not sign in (${(who && who.note) || '?'})`);
          return;
        }
      }
      for (const route of routes) {
        const where = `${route} @${w} ${lang}`;
        try {
          const res = await withTimeout((async () => {
            await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
            await settle(pg, route);
            const state = await pg.evaluate(() => ({ iw: innerWidth, login: !!document.querySelector('input[type="password"]'), ink: (document.body.innerText || '').replace(/\s+/g, '').length }));
            if (state.iw !== w) return { skip: `viewport is ${state.iw}, asked ${w} — NOT measured` };
            if (authed && state.login) return { skip: 'the login screen came back — NOT measured' };
            if (state.ink < 40) return { skip: `only ${state.ink} characters on screen (a splash?) — NOT measured` };
            if (BREAK_CSS) { await pg.addStyleTag({ content: BREAK_CSS }); await wait(400); }
            await waitScrollIdle(pg);
            return await measure(pg, { route, lang, width: w, where });
          })(), PAGE_TIMEOUT, where);
          if (res && res.skip) { skipped.push(`${where} — ${res.skip}`); continue; }
          pages++;
          elements += (res && res.elements) || 0;
          for (const f of (res && res.failures) || []) failures.push({ where, ...f });
        } catch (e) {
          skipped.push(`${where} — ${/TIMEOUT/.test(String(e.message)) ? 'WEDGED' : 'harness error'}: ${String(e.message || e).slice(0, 120)} — NOT measured`);
          // A wedged tab may never answer again. Abandon it; the context (and
          // its signed-in storage) survives, so a fresh tab carries on.
          await pg.close().catch(() => {});
          try { pg = await freshPage(ctx, lang, w); }
          catch (e2) {
            const rest = routes.slice(routes.indexOf(route) + 1);
            for (const r of rest) skipped.push(`${r} @${w} ${lang} — no fresh tab after a wedge (${String(e2.message || e2).slice(0, 80)}) — NOT measured`);
            pg = null;
            return;
          }
        }
      }
    } finally {
      if (pg) await pg.close().catch(() => {});
    }
  };

  try {
    for (const lang of LANGS) {
      for (const w of WIDTHS) {
        if (AUTHED_ROUTES.length) {
          const ctx = await b.createBrowserContext();
          try { await visitAll(ctx, lang, w, AUTHED_ROUTES, true); } catch (e) { skipped.push(`signed-in ${lang} @${w} — context failed: ${String(e.message || e).slice(0, 120)} — NOT measured`); } finally { await ctx.close().catch(() => {}); }
        }
        if (PUBLIC_ROUTES.length) {
          const ctx = await b.createBrowserContext();
          try { await visitAll(ctx, lang, w, PUBLIC_ROUTES, false); } catch (e) { skipped.push(`demo ${lang} @${w} — context failed: ${String(e.message || e).slice(0, 120)} — NOT measured`); } finally { await ctx.close().catch(() => {}); }
        }
        console.log(`  … ${lang} @${w}: ${pages} pages, ${elements} elements, ${failures.length} failures so far (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    }
  } finally {
    await b.disconnect();
  }

  if (BREAK_CSS) console.log(`\n*** BREAK TEST — injected on every page: ${BREAK_CSS.slice(0, 160)} ***`);
  console.log(`\n${name} GATE — ${pages} pages, ${elements} elements measured, ${failures.length} failures`);
  console.log(`  coverage: ${pages} of ${planned} planned route x language x width pages (langs ${LANGS.join(',')}; widths ${WIDTHS.join(',')}; ${BASE})${skipped.length ? `; ${skipped.length} NOT MEASURED` : ''}`);
  for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f.where}  ${f.what}\n         ${f.detail}`);
  if (failures.length > 60) console.log(`  … and ${failures.length - 60} more`);
  if (skipped.length) {
    console.log(`\n  NOT MEASURED (nothing is claimed about these):`);
    for (const s of skipped.slice(0, 30)) console.log(`    ${s}`);
    if (skipped.length > 30) console.log(`    … and ${skipped.length - 30} more`);
  }
  if (pages === 0 || elements === 0) {
    console.log(`  FAIL: measured nothing (${pages} pages, ${elements} elements) — a zero here is not a pass`);
    process.exit(1);
  }
  process.exit(failures.length ? 1 : 0);
}
