import { readFileSync } from 'node:fs';
// Sign in, then PROVE it, before any sweep measures anything.
//
// WHY THIS EXISTS. On 2026-08-27 I ran a console audit and a mobile-fit audit
// across 36 routes and reported "36/36 clean" and "37/37 fit a phone". Both
// numbers were worthless: the browser was not signed in, so every coach route
// redirected to the sign-in screen and I measured the same small login page
// thirty-six times. It was the theme audit that gave it away — every single
// route reported the identical two low-contrast strings, one of them
// "Don't have an account? Contact your coach."
//
// An audit that silently measures the wrong page is worse than no audit,
// because it produces a number that reads like coverage. So this module does
// two things, and the second matters more than the first:
//
//   1. signIn()   — log in as the owner
//   2. assertAuthed() — load a coach route and REFUSE to continue if what came
//      back is the login screen
//
// Any sweep that skips step 2 can lie again.
const OWNER = process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com';
// Where supabase-js keeps the session. Read out of src/supabase.js, which
// exports it, so a project change cannot leave this looking at a key nobody
// writes any more - which would silently restore the "any session will do" bug
// this is here to prevent.
const AUTH_TOKEN_KEY = (() => {
  try {
    const src = readFileSync(new URL('../../src/supabase.js', import.meta.url), 'utf8');
    const m = src.match(/AUTH_TOKEN_KEY = '([^']+)'/);
    if (m) return m[1];
  } catch (e) { /* fall through */ }
  return 'sb-gtcbfglttoiyfsnfbhdy-auth-token';
})();
const PW = process.env.EXPO_PW || '1234';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 17.9: once the profile's language is Hebrew the login screen renders in
// Hebrew, and every marker here was English - so signIn() reported "already
// signed in" ON the login page and a club-zone sweep measured it (3 strings).
const LOGIN_MARKERS = [
  /Don't have an account/i,
  /Continue with Google/i,
  /^\s*Sign-?in\s*$/im,
  /Coach sign-in/i,
  /המשך עם Google/,
  /^\s*כניסה\s*$/m,
];

export function looksLikeLogin(text) {
  return LOGIN_MARKERS.some((re) => re.test(text || ''));
}

// The app redirects on boot, so an evaluate() fired at the wrong moment dies
// with "Execution context was destroyed, most likely because of a navigation."
// That killed the theme sweep outright. Retry through it rather than crash.
export async function safeEval(page, fn, arg, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) {
      if (!/context was destroyed|Target closed|Cannot find context/i.test(String(e)) || i === tries - 1) throw e;
      await wait(1200);
    }
  }
  return undefined;
}

// ONE RETRY, BECAUSE THE SWITCH IS FLAKY RATHER THAN BROKEN.
//
// Measured 19.9: asking for the physio landed on the owner, and the identical
// call a minute later landed on the physio. The credentials are fine - signing
// in by hand works for both accounts every time. So a single miss should cost a
// retry, not the whole run; two misses in a row is a real problem and throws.
export async function signIn(page, base) {
  try {
    return await signInOnce(page, base);
  } catch (e) {
    if (!/WRONG SEAT/.test(String(e.message || e))) throw e;
    console.log('wrong seat on the first attempt — retrying once');
    return await signInOnce(page, base);
  }
}

async function signInOnce(page, base) {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await wait(3000);

  const already = await safeEval(page, () => document.body.innerText.slice(0, 400));
  if (!looksLikeLogin(already)) {
    // WHICH SEAT, not just "a" seat.
    //
    // 2026-09-18: verify-card-baselines reported "no athlete cards" on
    // /coach/athletes at two widths and counted each as an alignment problem.
    // The page it measured was Diego's ATHLETE PORTAL - an earlier gate
    // (verify-athlete-weight) had signed this shared browser in as the athlete,
    // and "not the login screen" was the only thing this function checked. So
    // every coach gate run after an athlete gate measured the wrong seat and
    // reported whatever it found there. That is the same class of fault as the
    // 36/36 login-page sweep this module was written to prevent.
    const who = await safeEval(page, (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const j = JSON.parse(raw);
        return (j && j.user && j.user.email) || (j && j.currentSession && j.currentSession.user && j.currentSession.user.email) || null;
      } catch (e) { return null; }
    }, AUTH_TOKEN_KEY);
    if (!who || who.toLowerCase() === OWNER.toLowerCase()) {
      return { signedIn: true, note: 'already signed in' + (who ? ' as ' + who : ''), email: who };
    }
    // Someone else is holding the seat. Drop the session and sign in properly
    // rather than measuring their pages.
    // AND THE COOKIE, OR THE OTHER SEAT COMES STRAIGHT BACK.
    //
    // 2026-09-22: src/supabase.js keeps a refresh token in the `expo-rt` cookie
    // and reviveSession() trades it for a new session on boot — deliberately, so
    // an athlete whose storage was evicted never sees a login screen. Clearing
    // only localStorage therefore did nothing: the very next document restored
    // the seat we had just dropped, the login form never appeared, and this
    // function raised WRONG SEAT twice and gave up. Every gate run after an
    // athlete-seat gate hit it.
    await safeEval(page, (key) => {
      try {
        localStorage.removeItem(key);
        for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
        document.cookie = 'expo-rt=; Max-Age=0; Path=/';
      } catch (e) {}
    }, AUTH_TOKEN_KEY);
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await wait(3000);
  }

  await safeEval(page, ({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name + (i.getAttribute('aria-label') || '')));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (e) set(e, email);
    if (p) set(p, pw);
  }, { email: OWNER, pw: PW });

  await wait(400);
  await safeEval(page, () => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => /^\s*(sign\s*in|כניסה)\s*$/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await wait(6000);

  // IT MUST END UP AS THE SEAT IT WAS ASKED FOR, AND IT MUST CHECK.
  //
  // This used to submit the form and return {signedIn:true} without ever
  // looking at the result. Measured 19.9: with EXPO_EMAIL=tomerlich11@gmail.com
  // it reported 'submitted credentials' and the browser was still signed in as
  // the owner - so two whole phone-eyes sweeps I ran 'from the physio seat' and
  // 'from the athlete seat' were the OWNER's screens, sixteen surfaces each.
  // That is the same seat bug that produced nine of twenty-one reds on 18.9,
  // and it survived because the helper reported success either way.
  const landed = await safeEval(page, (key) => {
    const read = (k) => { try { const j = JSON.parse(localStorage.getItem(k)); return (j && j.user && j.user.email) || (j && j.currentSession && j.currentSession.user && j.currentSession.user.email) || null; } catch { return null; } };
    let who = key ? read(key) : null;
    if (!who) for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) { who = read(k); if (who) break; }
    return who;
  }, AUTH_TOKEN_KEY);

  if (!landed) return { signedIn: false, note: 'no session after submitting', email: null };
  if (landed.toLowerCase() !== OWNER.toLowerCase()) {
    console.log(`
WRONG SEAT — asked for ${OWNER}, ended up as ${landed}.`);
    console.log('Everything measured from here would be that other account, so');
    console.log('the numbers would be about the wrong person. Nothing was tested.');
    console.log('Check the password for that account (EXPO_PW) before re-running.');
    // THROW, do not return a flag. Audited 19.9: seventeen verify-* gates and
    // phone-eyes all call `await signIn(...)` and none of them looks at the
    // result - so a returned flag is a guard nobody reads. phone-eyes printed
    // WRONG SEAT and then photographed twenty of the owner's screens anyway.
    // assertAuthed catches 'not signed in at all' but not 'signed in as
    // somebody else', which is the failure that actually happens. Throwing
    // fixes all eighteen callers at once and cannot be ignored by the next one.
    throw new Error(`WRONG SEAT: asked for ${OWNER}, ended up as ${landed}. Nothing was measured.`);
  }
  return { signedIn: true, note: 'submitted credentials', email: landed };
}

// Load a route that REQUIRES auth and refuse to go on if it bounced.
export async function assertAuthed(page, base, route = '/coach/dashboard') {
  await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await wait(3000);
  const text = await safeEval(page, () => document.body.innerText.slice(0, 600));
  if (looksLikeLogin(text)) {
    console.log(`\nNOT SIGNED IN — ${route} came back as the sign-in screen.`);
    console.log('Every route would have measured the same login page, so the');
    console.log('numbers would be meaningless. Nothing was tested.');
    console.log('Set EXPO_PW (and EXPO_EMAIL if not the owner) and try again.');
    return false;
  }
  return true;
}
