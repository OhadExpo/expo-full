// #115 — "make sure all athletes are stayed logged in even when closing the
// app or chrome or safari".
//
// Checked the server first: auth.sessions has ZERO rows with not_after set,
// the oldest live session is five months old and sessions are observed living
// 35 days. Nothing server-side signs anyone out. The session is lost on the
// DEVICE, so the client has to hold it in more than one place and read back
// from whichever survives.
//
// This proves it by destroying stores one at a time and reloading.
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const KEY = 'sb-gtcbfglttoiyfsnfbhdy-auth-token';
const RT = 'expo-rt';                 // the refresh-token cookie, 12 chars

// "NOT THE LOGIN SCREEN" IS NOT THE SAME AS "SIGNED IN".
//
// Two false readings before this settled. A boot splash is neither, and the
// first version passed one on 261 characters. Then the replacement matched the
// PUBLIC ENTRY CHOOSER, whose copy reads "Tasks, athletes & plans" — so a
// signed-out visitor looked signed in, and the sign-out check looked broken
// when it was working.
//
// So both states get a positive marker, and anything else is "still loading":
//   signed in  = the coach nav, which has Dashboard AND Billing together
//   signed out = a password field, the sign-in copy, or the chooser's Enter →
const state = async (page) => {
  // WRITTEN AGAINST THE TWO SCREENS AS THEY ACTUALLY READ, not against a guess.
  // Captured once and then checked into this comment so the next person does
  // not re-derive it:
  //   revived : "CHOOSE YOUR PORTAL HEY אוהד ... אוהד·SIGN OUT"
  //   cleared : "COACHING PLATFORM SIGN IN EXISTING USER ... Coach + athlete login"
  // Both live at "/" and NEITHER has a password field, so url and pw are
  // useless here. "SIGN OUT" can only be rendered for someone who is signed in,
  // and it is the one string the other screen cannot have. Three earlier
  // detectors (no-password, an app-shell regex, the CHOOSE YOUR PORTAL
  // heading) each matched both screens and produced a false pass or a stall.
  for (let i = 0; i < 20; i++) {
    const r = await page.evaluate(() => {
      const t = (document.body.innerText || '');
      const nav = [...document.querySelectorAll('button,[role="tab"],a')]
        .map((e) => (e.textContent || '').trim()).filter(Boolean).join(' | ');
      return {
        signedIn: /sign out|התנתק/i.test(t) || (/dashboard|סקירה/i.test(nav) && /billing|תשלומים/i.test(nav)),
        signedOut: !!document.querySelector('input[type="password"]')
          || /existing user|coach \+ athlete login|continue with google/i.test(t),
        nav: nav.slice(0, 70),
      };
    });
    if (r.signedIn) return { in: true, out: false, ...r };
    if (r.signedOut) return { in: false, out: true, ...r };
    await new Promise((res) => setTimeout(res, 600));
  }
  return { in: false, out: false, stalled: true, nav: '(never resolved)' };
};

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let pass = 0, fail = 0;
const check = (label, ok, detail) => { if (ok) { pass++; console.log(`  ok    ${label}${detail ? ' — ' + detail : ''}`); } else { fail++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); } };

const page = await b.newPage();
try {
  // A FRESH sign-in, not a reused session. signIn() short-circuits when a
  // token is already in localStorage, and then nothing is ever WRITTEN — so the
  // cookie never gets set and the test measures the old build's leftovers. The
  // first run of this gate failed for exactly that reason and the fix looked
  // broken when it was not yet exercised.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* blocked */ } });
  await page.evaluate(() => { for (const c of document.cookie.split(';')) document.cookie = c.split('=')[0].trim() + '=; Max-Age=0; Path=/'; });
  await signIn(page, BASE);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/coach/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 4500));

  const where = await page.evaluate((k) => ({
    ls: !!localStorage.getItem(k),
    ss: !!sessionStorage.getItem(k),
    ck: String(document.cookie || '').split(';').some((p) => p.split('=')[0].trim() === 'expo-rt'),
  }), KEY);
  console.log(`after sign-in the token is in: localStorage=${where.ls} sessionStorage=${where.ss} cookie=${where.ck}`);
  check('the refresh token is mirrored to a cookie', where.ck, 'so clearing localStorage alone cannot sign anyone out');

  // 1. LOCALSTORAGE WIPED — the Safari / "clear site data" case.
  await page.evaluate((k) => { localStorage.removeItem(k); }, KEY);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));
  let s = await state(page);
  check('survives localStorage being wiped', s.in, s.stalled ? 'STALLED' : `nav: ${s.nav}`);
  const healed = await page.evaluate((k) => !!localStorage.getItem(k), KEY);
  check('and localStorage holds a session again', healed, 'revived from the cookie');

  // 2. EVERYTHING BUT THE COOKIE — a full storage eviction.
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* blocked */ } });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));
  s = await state(page);
  check('survives localStorage AND sessionStorage cleared', s.in, s.stalled ? 'STALLED' : `nav: ${s.nav}`);

  // 3. SIGN-OUT MUST STILL SIGN OUT. A durability change that makes sign-out
  //    fail is far worse than the bug it fixes.
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* blocked */ } });
  await page.evaluate((k) => { document.cookie = `${k}=; Max-Age=0; Path=/`; }, RT);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));
  s = await state(page);
  // POSITIVE EVIDENCE, NOT AN ABSENCE. `!s.in` also passes when the poll never
  // resolved, which is how this line read "(never resolved)" and still counted
  // as a pass. A sign-out has to SHOW the login screen.
  check('clearing every store DOES sign out', s.out === true && !s.stalled,
    s.stalled ? 'STALLED — never resolved to either state' : `nav: ${s.nav}`);
} catch (e) { console.log('ERROR', e.message); fail++; }
finally { await page.close().catch(() => {}); b.disconnect(); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
