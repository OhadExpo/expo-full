// Console errors and unhandled rejections across every route IN THE MANIFEST.
//
// A page can render, pass a mobile-fit check and a smoke test, and still throw
// on every load. This looks for that.
//
// WHY THIS REPLACES THE HARDCODED LIST. docs/SURFACES.md says, in its own
// words: "Any audit, sweep, regression check, or 'review everything' task MUST
// enumerate from this file, not from memory." The previous version carried a
// hand-written list of 17 routes while the manifest describes 43. Eleven real
// coach routes — /coach/bugs, /coach/challenges, /coach/exercise-matching,
// /coach/exercise-classify, /coach/exercise-cleanup, /coach/smart-import,
// /coach/waitlist, /coach/intake, /coach/chat-audit, /coach/sessions-single —
// had never been checked for console errors at all. An audit that quietly skips
// a quarter of the app reports "17/17 clean" and means very little.
//
// Usage:
//   node scripts/audit-console.mjs [baseUrl] [route ...]
// With explicit routes it checks only those; otherwise it reads the manifest.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const BASE = process.argv[2] || 'http://localhost:5199';

function routesFromManifest() {
  const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
  const out = new Set();
  for (const m of md.matchAll(/\|\s*`([^`]+)`/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim().replace(/`/g, '');
      // Skip wildcards and parameterised routes — they need a real id to load.
      if (p.startsWith('/') && !p.includes('*') && !p.includes('<') && !p.includes(':')) out.add(p);
    }
  }
  return [...out].sort();
}

const ROUTES = process.argv.length > 3 ? process.argv.slice(3) : routesFromManifest();

// Noise that is not a defect: extension chatter, favicon, aborted media.
const IGNORE = [
  /favicon/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /chrome-extension:/i,
  /Download the React DevTools/i,
  /\[vite\] connect/i,
  /ResizeObserver loop/i,
];

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: { width: 1280, height: 900 } });
const page = await b.newPage();
let bad = 0;

// Sign in and PROVE it. Without this every coach route bounces to the sign-in
// screen and the sweep measures the same small login page over and over,
// reporting perfect coverage of nothing. That is exactly what happened on
// 2026-08-27: "36/36 routes clean" was 36 measurements of the login page.
await signIn(page, BASE);
if (!(await assertAuthed(page, BASE))) { await page.close(); await b.disconnect(); process.exit(2); }
const failures = [];

console.log(`${ROUTES.length} routes from docs/SURFACES.md against ${BASE}\n`);

for (const route of ROUTES) {
  const errs = [];
  const onConsole = (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 150)); };
  const onPageErr = (e) => errs.push('throw: ' + String(e).slice(0, 150));
  const onReqFail = (r) => {
    const u = r.url();
    const why = (r.failure() && r.failure().errorText) || '';
    // ERR_ABORTED is not a failure. A <video> that starts a range request and
    // is then unmounted reports as requestfailed and is completely normal.
    // Counting it once flagged a form video on 13 of 17 routes that turned out
    // to return HTTP 200 with no reference to it anywhere in the data.
    if (/ERR_ABORTED|ERR_CACHE_OPERATION_NOT_SUPPORTED/.test(why)) return;
    if (!IGNORE.some((re) => re.test(u))) errs.push(`requestfailed(${why}): ` + u.slice(0, 100));
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageErr);
  page.on('requestfailed', onReqFail);

  // A navigation can abort because the PREVIOUS route still had work in
  // flight — /coach/tasks failed once this way and was clean on both repeats.
  // Reporting that as a defect is how a sweep earns a reputation for flaking,
  // so an aborted navigation gets exactly one retry before it counts.
  const load = async () => {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !/LOADING DATA/i.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
  };
  try {
    await load();
  } catch (e) {
    if (/ERR_ABORTED/.test(String(e))) {
      try { await load(); } catch (e2) { errs.push('navigation: ' + String(e2).slice(0, 90)); }
    } else {
      errs.push('navigation: ' + String(e).slice(0, 90));
    }
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageErr);
  page.off('requestfailed', onReqFail);

  const real = [...new Set(errs)].filter((e) => !IGNORE.some((re) => re.test(e)));
  if (real.length) {
    bad++;
    failures.push({ route, real });
    console.log(`ERRORS ${route.padEnd(28)} ${real.length}`);
    real.slice(0, 3).forEach((e) => console.log('        ' + e));
  } else {
    console.log(`ok     ${route.padEnd(28)} clean`);
  }
}

console.log(`\n${ROUTES.length - bad}/${ROUTES.length} routes free of console errors`);
if (failures.length) {
  console.log('\nroutes to fix:');
  for (const f of failures) console.log(`  ${f.route}  (${f.real.length})`);
}
await page.close();
await b.disconnect();
process.exit(bad ? 1 : 0);
