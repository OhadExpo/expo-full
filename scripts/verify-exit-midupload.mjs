// DOES EXIT ASK BEFORE ORPHANING AN UPLOADING VIDEO? (#472, AUDIT-470)
//
// EXIT stayed live while a form video uploaded; leaving orphaned the clip (the
// upload finished into an unmounted logger, or failed into a queue entry no
// workout ever claimed). Now EXIT asks first.
//
// As the TEST FIXTURE athlete: every storage upload is held forever (never sent),
// a clip is picked in the logger, EXIT is tapped - a confirm must appear and the
// logger must still be open. STAY is then tapped; the context is discarded. No
// workout is completed, nothing is written.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5261 node scripts/verify-exit-midupload.mjs
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5261';
const EMAIL = process.env.FIXTURE || 'diego@diegoday.com';
const PW = process.env.ATHLETE_PW || '1234';
const CLIP = process.env.CLIP || 'public/testclips/clip08.mp4';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
let verdict = 'FAIL: not measured', held = 0;
try {
  await pg.setRequestInterception(true);
  pg.on('request', (req) => {
    // hold uploads + any workout write forever - nothing reaches the server
    if ((/\/storage\/v1\//.test(req.url()) || /\/rest\/v1\/client_workouts/.test(req.url())) && req.method() !== 'GET') { held++; return; }
    req.continue().catch(() => {});
  });
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3500);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(400);
  await pg.evaluate(() => { const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || '')); if (btn) btn.click(); });
  await wait(9000);
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  // open a day's logger
  const started = await pg.evaluate(() => { const s = [...document.querySelectorAll('button[data-day-action]')].find((x) => /START|AGAIN|התחל|שוב/.test(x.textContent || '')); if (s) { s.click(); return true; } return false; });
  if (!started) throw new Error('no START on the fixture program');
  await wait(3000);
  // walk forward to the first step that offers a clip (the warm-up steps may not)
  let input = null;
  for (let k = 0; k < 20 && !input; k++) {
    input = await pg.$('input[type="file"][accept^="video"]:not([disabled])');
    if (!input) { await pg.evaluate(() => { const n = [...document.querySelectorAll('button')].filter((x) => !x.disabled).find((x) => { const t = (x.textContent || '').trim(); return /→\s*$/.test(t) && !/EXIT|BACK|יציאה|חזרה/i.test(t); }); if (n) n.click(); }); await wait(1500); }
  }
  if (!input) {
    const dbg = await pg.evaluate(() => ({ btns: [...document.querySelectorAll('button')].map((x) => (x.textContent || '').trim().slice(0, 18)).filter(Boolean).slice(0, 30), files: document.querySelectorAll('input[type="file"]').length, head: document.body.innerText.slice(0, 300) }));
    console.log('DEBUG', JSON.stringify(dbg));
    throw new Error('no video input reached in the logger');
  }
  await input.uploadFile(CLIP);
  await wait(2500);
  const uploading = await pg.evaluate(() => /uploading|compress|מעלה|דוחס/i.test(document.body.innerText));
  // EXIT
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /EXIT|יציאה/.test(e.textContent || '') && /←/.test(e.textContent || '')); if (x) x.click(); });
  await wait(1200);
  const asked = await pg.evaluate(() => /still uploading|עדיין עולה/.test(document.body.innerText));
  const stillOpen = await pg.evaluate(() => !!document.querySelector('input[type="file"][accept^="video"]'));
  verdict = asked && stillOpen
    ? `PASS: EXIT mid-upload asks first and the logger stays open (upload in progress: ${uploading}; ${held} write(s) held, never sent)`
    : `FAIL: EXIT mid-upload ${asked ? 'asked but the logger closed' : 'did NOT ask'} (upload in progress: ${uploading}; logger open: ${stillOpen})`;
  await pg.evaluate(() => { const s = [...document.querySelectorAll('button')].find((e) => /^(Stay|להישאר)$/i.test((e.textContent || '').trim())); if (s) s.click(); });
} catch (e) {
  verdict = `FAIL: ${e.message} - NOT measured`;
} finally {
  await ctx.close(); b.disconnect();
}
console.log(verdict);
process.exit(/^PASS/.test(verdict) ? 0 : 1);
