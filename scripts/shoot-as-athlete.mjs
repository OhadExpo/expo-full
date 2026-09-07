// SEE WHAT AN ATHLETE SEES, FROM THE ATHLETE'S OWN SEAT.
//
// Ohad's standing non-negotiable: "make sure nothing that you ever [do]
// interrupts with the athlete experience on expo and the physical therapists on
// bhbc. they should never be affected or stalled."
//
// scripts/lib/authed-page.mjs signs in as the OWNER, so everything measured
// through it is the coach's view of the app. This signs in as a real trainee
// and shoots the portal, because a coach-seat screenshot cannot prove anything
// about the athlete's.
//
//   node scripts/shoot-as-athlete.mjs [email] [width] [route]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const EMAIL = process.argv[2] || 'diego@diegoday.com';
const W = Number(process.argv[3] || 390);
const ROUTE = process.argv[4] || '/athlete';
const PW = process.env.ATHLETE_PW || '1234';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
pg.on('pageerror', (e) => console.log('[pageerror] ' + String(e.message).slice(0, 160)));

// Start from a clean session, or the owner's cookie makes this the coach again.
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await wait(3500);

await pg.evaluate(({ email, pw }) => {
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
}, { email: EMAIL, pw: PW });
await wait(400);
await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || ''));
  if (btn) btn.click();
});
await wait(9000);

await setWidth(pg, W, 844);
await pg.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' });
await wait(12000);

// Clearing localStorage above also clears the install prompt's dismissal, so a
// fresh athlete meets "Add EXPO to your home screen" first. That is correct
// behaviour, not a defect - but it covers the portal, so it is dismissed the
// way an athlete would dismiss it.
await pg.evaluate(() => {
  const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || ''));
  if (x) x.click();
});
await wait(1200);

const who = await pg.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 140),
  // If this still shows the coach nav, the sign-in did not take and any
  // screenshot below is the wrong seat.
  looksCoach: /dashboard|athletes\s*\d|billing/i.test(document.body.innerText.slice(0, 600)),
  onLogin: /sign in/i.test(document.body.innerText.slice(0, 300)),
}));
if (who.onLogin) { console.log('FAILED: still on the login screen — check the credentials'); process.exit(1); }
if (who.looksCoach) { console.log('FAILED: this is the COACH seat, not the athlete seat'); process.exit(1); }
console.log('seat ok:', who.text.slice(0, 90));

const tag = ROUTE.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'athlete';
const out = `audit-out/athlete-${tag}-${W}.png`;
await pg.screenshot({ path: out, fullPage: true });
console.log('shot ' + out);

const clip = await pg.evaluate((VW) => {
  const bad = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let hasText = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
    if (!hasText) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1 && !['auto', 'scroll'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis') {
      bad.push({ t: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34), over });
    }
  }
  return { bad: bad.slice(0, 6), docW: document.documentElement.scrollWidth, vw: VW };
}, W);
console.log(clip.docW > W + 1 ? `FAIL page scrolls sideways: ${clip.docW} > ${W}` : `ok   no sideways scroll (${clip.docW})`);
console.log(clip.bad.length ? `FAIL ${clip.bad.length} clipped: ${clip.bad.map((x) => `+${x.over} "${x.t}"`).join(', ')}` : 'ok   nothing clipped');
await pg.close(); b.disconnect();
