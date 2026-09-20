// #102 — THE APP MUST NOT THROW AWAY AN OAUTH CODE.
//
// Ohad, three times: "google appears, then back to login" (30.8), "on chrome,
// google oauth doesnt always work and half of the attempts it just moves me
// back to the sign in page again" (17.9), "signinig in using the google auth
// sometimes doesnt work" (20.9).
//
// Google returns to origin+pathname carrying `?code=`. supabase-js reads it
// asynchronously; any rewrite of the address bar before that exchange finishes
// destroys the code, the session never forms, and the login screen returns.
// It is a race, so it fails about half the time.
//
// This does not need Google. It needs only to know whether the APP removes a
// code from the URL, so it hooks history.replaceState/pushState before any of
// the app's code runs and records every rewrite. A rewrite that starts with a
// code in the URL and ends without one is the bug, named and located.
//
//   node scripts/verify-oauth-code-survives.mjs
//
// Paths are the ones a sign-in can actually start from, because redirectTo is
// origin + pathname: whichever page he pressed the button on is where Google
// sends him back.
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const PATHS = ['/bhbc', '/bhbc/login', '/login', '/', '/coach/bhbc', '/coach/dashboard', '/athlete'];
const CODE = 'pkce_test_code_do_not_exchange';

const HOOK = () => {
  window.__navLog = [];
  for (const fn of ['replaceState', 'pushState']) {
    const orig = history[fn].bind(history);
    history[fn] = function (a, b2, url) {
      try {
        const before = location.pathname + location.search + location.hash;
        const after = new URL(url == null ? before : String(url), location.href);
        const afterStr = after.pathname + after.search + after.hash;
        const had = /[?&](code|token_hash)=|(access_token|refresh_token)=/.test(before);
        const keeps = /[?&](code|token_hash)=|(access_token|refresh_token)=/.test(afterStr);
        window.__navLog.push({ fn, before, after: afterStr, had, keeps, dropped: had && !keeps,
          stack: (new Error().stack || '').split('\n').slice(2, 5).join(' | ') });
      } catch { /* never let the hook break the app */ }
      return orig(a, b2, url);
    };
  }
};

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let bad = 0, checked = 0;
for (const path of PATHS) {
  const page = await b.newPage();
  try {
    // SIGNED OUT is the state an OAuth return lands in: the session does not
    // exist yet, which is the whole reason the code is in the URL.
    await page.evaluateOnNewDocument(HOOK);
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* private mode */ } });
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(`${BASE}${path}?code=${CODE}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));
    const res = await page.evaluate(() => ({
      url: location.pathname + location.search,
      log: window.__navLog || [],
      stillHasCode: /[?&]code=/.test(location.search),
    }));
    checked++;
    const drops = res.log.filter((x) => x.dropped);
    // TELLING THE TWO KINDS OF DROP APART.
    //
    // supabase-js is SUPPOSED to clear the code: that is what spending it looks
    // like, and it rewrites to the SAME path with the query removed. The app's
    // harmful rewrites are the ones that also change the PATH - /bhbc?code=...
    // to /bhbc/login - because those happen before the exchange and are what
    // loses the session.
    //
    // The first version of this test tried to tell them apart by the stack
    // trace, which works in dev and is useless against the built bundle, where
    // neither "supabase" nor "gotrue" survives minification. It called all
    // seven paths broken, including the ones the fix had already repaired.
    const samePath = (x) => x.before.split('?')[0].split('#')[0] === x.after.split('?')[0].split('#')[0];
    const appDrops = drops.filter((x) => !samePath(x));
    // THE INVARIANT THAT ACTUALLY MATTERS.
    //
    // Tracing the built app showed the first theory was wrong: supabase-js
    // takes the code out of the URL BEFORE the network exchange, so nothing the
    // app does afterwards can "drop" it. The damage is different and worse —
    // the app, still seeing no session, walks the address bar away from where
    // Google landed:
    //     /coach/bhbc?code=...  ->  /coach/bhbc  ->  /bhbc/login  ->  /login
    // The exchange then succeeds, the session is fine, and the user is looking
    // at the login screen. A successful sign-in thrown onto the wrong page is
    // indistinguishable from a failed one.
    // So: an OAuth return must END on the page it arrived at.
    const landedPath = res.url.split('?')[0];
    const moved = landedPath !== path;
    if (appDrops.length || moved) {
      bad += (appDrops.length || 1);
      console.log(`  BAD      ${path}` + (moved ? `  — ended on ${landedPath}, not where Google landed` : ''));
      for (const d of res.log) console.log(`             ${d.fn}  ${d.before}  ->  ${d.after}`);
    } else {
      const spent = drops.length;
      console.log(`  ok       ${path.padEnd(18)} stayed on ${landedPath} · ${res.log.length} rewrite(s)`
        + (spent ? ` (${spent} same-path clear${spent === 1 ? '' : 's'} — supabase spending it)` : ''));
    }
  } catch (e) { console.log(`  ERROR    ${path}: ${e.message}`); bad++; }
  finally { await page.close().catch(() => {}); }
}
b.disconnect();
console.log(`\n${checked} of ${PATHS.length} entry paths checked, ${bad} that throw the code away`);
if (bad || checked !== PATHS.length) process.exitCode = 1;
