// GOOGLE SIGN-IN, ON THE PLATFORMS THAT ACTUALLY BREAK IT.
//
// Ohad, 22.9: "make sure the google sign in works on every platform available
// on earth" (#154), after photographing the installed app on 21.9 with "sign in
// with google isnt working" (#137).
//
// Two failures are real and neither used to say anything:
//   1. IN-APP BROWSERS. Google's policy refuses OAuth in an embedded
//      user-agent and answers 403 disallowed_useragent. A prospect tapping an
//      EXPO link from Instagram, Facebook or an Android WebView got a Google
//      error page. The app now stops before the round trip and says so.
//   2. A ROUND TRIP THAT CHANGES WINDOWS. supabase-js uses PKCE, so only the
//      storage holding the verifier can exchange the code. When the flow starts
//      in the installed app and finishes in the browser (or the other way
//      round) the exchange cannot complete, and all the user saw was the login
//      screen again. That is now named on the return leg.
//
// This proves (1) BOTH WAYS: three embedded UAs are stopped, and real Chrome
// still reaches accounts.google.com. A gate that only ever blocks proves
// nothing.
//
// AN ISOLATED BROWSER CONTEXT per case, because the debug profile is shared and
// another open tab re-persists the owner session the moment storage is cleared.
// This is the one case where the persistent profile is the wrong tool: the
// whole point is to be signed OUT.
//
// AND THE USER AGENT GOES ON AFTER THE VIEWPORT. lib/viewport.mjs uses
// page.emulate(), which carries its own userAgent and silently overwrites an
// earlier setUserAgent — the first run of this test sent all four UAs to Google
// and looked like the gate did not work, when the gate never saw them.
//
//   node scripts/verify-google-signin.mjs
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const UAS = [
  ['Instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113'],
  ['Facebook', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]'],
  ['AndroidWV', 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36'],
  ['RealChrome', 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'],
];

const problems = [];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
for (const [name, ua] of UAS) {
  const ctx = await b.createBrowserContext();
  const pg = await ctx.newPage();
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.setUserAgent(ua);
  await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'en'); } catch (e) { /* blocked */ } });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 6000));
  const clicked = await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /Continue with Google/i.test(x.textContent || ''));
    if (!btn) return 'no google button';
    btn.click();
    return 'clicked';
  });
  await new Promise((r) => setTimeout(r, 3000));
  const out = await pg.evaluate(() => ({ host: location.host, txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160) }));

  const wantBlocked = name !== 'RealChrome';
  const blocked = /127\.0\.0\.1|localhost/.test(out.host) && /in-app browser|דפדפן של אפליקציה/i.test(out.txt);
  const reachedGoogle = /accounts\.google\.com/.test(out.host);
  const ok = wantBlocked ? blocked : reachedGoogle;
  if (clicked !== 'clicked') problems.push(`${name}: there was no Google button to press — the login screen did not render`);
  else if (!ok) problems.push(`${name}: ${wantBlocked ? 'was NOT stopped before Google' : 'did not reach accounts.google.com'} (host=${out.host})`);
  console.log(`${ok && clicked === 'clicked' ? 'ok  ' : 'BAD '} ${name.padEnd(11)} ${clicked} -> ${out.host}`);
  await pg.close();
  await ctx.close();
}
b.disconnect();

for (const p of problems) console.log('FAIL  ' + p);
console.log(problems.length
  ? `\n${problems.length} platform(s) wrong`
  : `\n0 - all ${UAS.length} user-agents behave as they should (3 stopped, 1 through to Google)`);
process.exit(problems.length ? 1 : 0);
