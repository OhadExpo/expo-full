// A PHONE TWO PEOPLE USE.
//
// Athletes train together and phones get handed over. Everything the portal
// keeps for offline use - the programme, the bodyweight log, the workouts, the
// trainee record behind their name - sits in localStorage, and the only thing
// standing between one athlete and the next one's data is the purge in
// auth.jsx signOut().
//
// That purge is a REGEX LIST, so it is exactly as good as its last update: the
// offline work added `expo-plans-<id>` and `expo-self-trainee`, and neither
// matched it. Nothing would have noticed. This is the check that notices.
//
// Sign in, load the portal so every cache is written, sign out, and read what
// is left behind.
//
// Read-only apart from the sign-out it performs on the test fixture's own seat.
//
// The physio seat matters more, not less: the club zone caches the squad AND
// their medical status, which is the most sensitive data on the platform.
//
//   node scripts/verify-shared-device.mjs [email]
//   SEAT_URL=/coach/bhbc node scripts/verify-shared-device.mjs tomerlich11@gmail.com
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.argv[2] || 'diego@diegoday.com';
const PW = process.env.ATHLETE_PW || '1234';
const SEAT_URL = process.env.SEAT_URL || '/athlete';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Anything holding one person's training, body or identity. Language and theme
// are preferences, not data about a person, and are deliberately not here.
const PRIVATE = /^expo-(cw|bw|workouts|weekly-focus|portal-vis|bhbc-|checkins|trainees|exercises|plans-|self-trainee|presence)/;

const problems = [];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

try {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
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
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);

  await setWidth(pg, 390, 844);
  await pg.goto(BASE + SEAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(14000);
  await pg.evaluate(() => {
    const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
    if (x) x.click();
  });
  await wait(1500);

  const before = await pg.evaluate((rx) => Object.keys(localStorage).filter((k) => new RegExp(rx).test(k)),
    PRIVATE.source);
  console.log(`signed in : ${before.length} private key(s) cached`);
  for (const k of before) console.log('   ' + k);
  if (!before.length) { console.log('\nFAILED: nothing was cached, so this proves nothing about the purge'); process.exit(1); }

  // Their own Log out, not a scripted storage wipe - the button is what an
  // athlete handing over a phone actually presses.
  const clicked = await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button,a')].find((x) => /log ?out|sign ?out/i.test((x.textContent || '').trim()));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) { console.log('\nFAILED: no log-out control found on the portal'); process.exit(1); }
  await wait(7000);

  const after = await pg.evaluate((rx) => Object.keys(localStorage).filter((k) => new RegExp(rx).test(k)),
    PRIVATE.source);
  console.log(`signed out: ${after.length} private key(s) left behind`);
  for (const k of after) console.log('   ' + k);
  for (const k of after) problems.push(`${k} survived sign-out - the next person on this phone can read it`);

  const onLogin = await pg.evaluate(() => /sign in/i.test(document.body.innerText.slice(0, 400)));
  if (!onLogin) problems.push('log out did not land on the sign-in screen');
} catch (e) {
  problems.push('threw: ' + String(e.message || e).slice(0, 120));
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
const uniq = [...new Set(problems)];
for (const p of uniq) console.log('FAIL  ' + p);
console.log(uniq.length ? `\n${uniq.length} problem(s) on a shared phone` : '\n0 - sign-out leaves nothing personal behind');
process.exit(uniq.length ? 1 : 0);
