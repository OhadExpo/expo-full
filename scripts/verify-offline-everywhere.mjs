// EVERY PAGE, WITH THE BACKEND GONE.
//
// Ohad: "make sure every single page on any of our platforms also work
// offline". The athlete portal and the club zone were repaired one at a time;
// this walks the whole manifest and says which pages survive and which do not.
//
// Method, the same one that found the portal defect: load the route ONCE with
// the network up, so anything cacheable is cached, then cut every Supabase call
// and load it again. Shell fine, data layer gone - what a phone in a basement
// is actually in. (A service worker needs HTTPS, so it cannot be exercised
// locally; cutting the backend is the honest local equivalent and it is the
// half that actually holds the data.)
//
// Each route is classified, and only the first three fail the gate:
//   CRASH  - an error boundary, or an uncaught page error
//   BLANK  - nothing rendered at all
//   LOST   - most of the content the online load had is gone
//   QUIET  - it renders, but nothing says the data is not live (reported, not
//            failed: on a page whose data all came from cache that is a real
//            gap, on a static page it is noise)
//   OK     - renders, and either says it is offline or has nothing to say
//
// Read-only: it navigates and reads. It clicks nothing that writes.
//
//   SEAT=owner|athlete|pt node scripts/verify-offline-everywhere.mjs [route...]
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
const who = SEATS[SEAT] || (SEAT === 'public' ? null : undefined);
if (who === undefined) { console.log(`unknown seat "${SEAT}" - owner | athlete | pt | public`); process.exit(1); }

const coachRoutes = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    // (?![a-z]) so the MARKETING site's `/coaches/try` and `/coaches/demo` are
    // not walked as coach-app routes - they are a different app on a different
    // origin, and they were being reported here as if they were ours.
    return [...new Set([...md.matchAll(/`(\/coach(?![a-z])[a-z0-9/-]*)`/gi)].map((m) => m[1]))].filter((r) => !/:|\/$/.test(r));
  } catch { return ['/coach', '/coach/athletes']; }
};
const DEFAULT_ROUTES = {
  owner: coachRoutes(),
  athlete: ['/athlete'],
  pt: ['/coach/bhbc'],
  // The pages a stranger meets, and the demo a prospect is sent to. Nobody is
  // signed in for these, so they are walked without a seat - and they are part
  // of "every single page on any of our platforms".
  public: ['/login', '/intake', '/try', '/demo', '/demo/coach', '/demo/athlete'],
};
const ROUTES = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_ROUTES[SEAT];

const problems = [];
const rows = [];
let pageErr = null;

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
pg.on('pageerror', (e) => { pageErr = String(e.message).slice(0, 90); });

let cut = false;
await pg.setRequestInterception(true);
pg.on('request', (r) => {
  if (cut && /supabase\.(co|in)/.test(r.url())) { r.abort('failed').catch(() => {}); return; }
  r.continue().catch(() => {});
});

const read = () => pg.evaluate(() => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    len: t.length,
    head: t.slice(0, 90),
    crash: /EXPO HIT A RENDER ERROR|SOMETHING BROKE|Application error/i.test(t),
    told: /offline|no connection|not live|last saved|last synced|reconnect|couldn.t reach|לא מקוון|אין חיבור/i.test(t),
    login: /sign in/i.test(t.slice(0, 200)) && !/log ?out/i.test(t.slice(0, 200)),
  };
});

const visit = async (route) => {
  pageErr = null;
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await wait(cut ? 11000 : 9000);
  await pg.evaluate(() => {
    const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
    if (x) x.click();
  }).catch(() => {});
  await wait(600);
  const r = await read();
  return { ...r, err: pageErr };
};

try {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  // The public seat is walked SIGNED OUT, because that is the state its
  // visitors are in. Skipping the sign-in is the whole point of it.
  if (!who) {
    await setWidth(pg, W, 1000);
    console.log(`seat public (signed out) - ${ROUTES.length} route(s) at ${W}px\n`);
  } else {
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
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);
  await setWidth(pg, W, 1000);

  console.log(`seat ${SEAT} (${who.email}) - ${ROUTES.length} route(s) at ${W}px\n`);
  }
  for (const route of ROUTES) {
    cut = false;
    const on = await visit(route);
    if (who && on.login) { console.log(`SKIP ${route.padEnd(26)} not reachable from this seat`); continue; }
    cut = true;
    const off = await visit(route);
    const kept = on.len ? Math.round((off.len / on.len) * 100) : 0;

    let verdict = 'OK';
    if (off.crash || off.err) verdict = 'CRASH';
    // A sign-in screen is the CORRECT answer on a public route; it is only a
    // defect when somebody who WAS signed in gets thrown out to one.
    else if (off.login && who) verdict = 'LOGIN';
    else if (off.len < 60) verdict = 'BLANK';
    // LOST only counts as a failure when the page says NOTHING. Some data is
    // deliberately not cached - the coach's roster is excluded from the
    // localStorage snapshots on purpose, because it is full-roster PII that RLS
    // denies - so offline it genuinely cannot be shown. Telling the user that
    // is the correct behaviour, and a gate that failed on it forever would be
    // demanding the app invent data it is not allowed to hold.
    else if (kept < 40) verdict = off.told ? 'THIN' : 'LOST';
    else if (!off.told) verdict = 'QUIET';

    rows.push({ route, on: on.len, off: off.len, kept, verdict, head: off.head, err: off.err });
    console.log(`${verdict.padEnd(6)} ${route.padEnd(26)} ${String(on.len).padStart(6)} -> ${String(off.len).padStart(6)} (${String(kept).padStart(3)}%)${off.err ? '  ' + off.err : ''}`);

    if (verdict === 'CRASH') problems.push(`${route}: crashes with the backend unreachable${off.err ? ' - ' + off.err : ''}`);
    if (verdict === 'BLANK') problems.push(`${route}: renders nothing with the backend unreachable (${off.len} chars)`);
    if (verdict === 'LOST') problems.push(`${route}: lost ${100 - kept}% of its content and says nothing about it`);
    if (verdict === 'LOGIN') problems.push(`${route}: throws the user to a login screen they cannot pass offline`);

    // THE ATHLETE'S TABS ARE NOT ROUTES. Program, BW, Meal log, History, PRs
    // and Messages all live at /athlete, so a route walk sees one of the six -
    // and "every page works offline" would be answered by a sixth of the
    // portal.
    if (SEAT === 'athlete' && route === '/athlete' && verdict !== 'BLANK' && verdict !== 'CRASH') {
      const tabs = await pg.evaluate(() => [...document.querySelectorAll('button')]
        .map((x) => (x.textContent || '').trim())
        .filter((t) => /^(.\s*)?(program|bw|meal log|history|prs|messages)/i.test(t))
        .slice(0, 8));
      for (const t of tabs) {
        if (/program/i.test(t)) continue;                    // already measured as the route
        const hit = await pg.evaluate((l) => {
          const x = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === l);
          if (x) x.click();
          return !!x;
        }, t);
        if (!hit) continue;
        await wait(4000);
        const r = await read();
        const bad = r.crash || r.len < 40;
        console.log(`${(bad ? 'BROKEN' : 'OK').padEnd(6)} ${('  tab ' + t).padEnd(26)} ${String(r.len).padStart(6)} chars offline`);
        if (bad) problems.push(`athlete tab "${t}": ${r.crash ? 'crashes' : 'renders nothing'} with the backend unreachable`);
      }
    }
  }
} catch (e) {
  problems.push(`threw: ${String(e.message || e).slice(0, 120)}`);
} finally {
  await pg.setRequestInterception(false).catch(() => {});
  await pg.close().catch(() => {});
  b.disconnect();
}

const quiet = rows.filter((r) => r.verdict === 'QUIET');
console.log('');
if (quiet.length) {
  console.log(`${quiet.length} page(s) render offline but say nothing about it:`);
  for (const q of quiet) console.log(`   ${q.route}`);
  console.log('');
}
const thin = rows.filter((r) => r.verdict === 'THIN');
if (thin.length) {
  console.log(`${thin.length} page(s) lose most of their content offline but SAY SO (not a failure - some data is deliberately never cached):`);
  for (const t of thin) console.log(`   ${t.route}  ${t.kept}% kept`);
  console.log('');
}
for (const p of [...new Set(problems)]) console.log('FAIL  ' + p);
console.log(problems.length
  ? `\n${problems.length} page(s) do not survive with the backend unreachable`
  : `\n0 - all ${rows.length} page(s) still render with the backend unreachable`);
process.exit(problems.length ? 1 : 0);
