// WHAT AN ATHLETE DOWNLOADS TO SEE THEIR PORTAL, WITH A BUDGET.
//
// The build prints chunk sizes; it does not say which of them a phone on a
// train actually pulls. This measures the real thing - cold cache, a real
// trainee seat, the BUILT output - and fails if it grows past the budget.
//
// It exists because the measurement kept finding coach code in the athlete's
// first load: WorkoutReview and the MovementLab pose engine (177KB) came down
// with the portal because one component was imported statically, and SensorLab
// plus the pose warmer sat in the entry chunk though both are owner-only. None
// of that was visible from the build output. A budget is what stops it coming
// back quietly.
//
// Needs the BUILT app served:  npx vite preview --port 4173 --host 127.0.0.1
//
//   node scripts/verify-athlete-weight.mjs [email] [budgetKB]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.argv[2] || 'diego@diegoday.com';
const BUDGET_KB = Number(process.argv[3] || 900);
const PW = process.env.ATHLETE_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Anything that is unmistakably the COACH's tooling has no business in an
// athlete's first load, whatever the total says.
const COACH_ONLY = /WorkoutReview|MovementLab|SensorLab|SmartImport|TrainingLineage|CoachDemo|AnatomyModel|autoAnalyzeVideos|pdf-/i;

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
const cdp = await pg.createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.clearBrowserCache');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

const seen = new Map();
pg.on('response', async (r) => {
  const u = r.url();
  if (!/\.(js|css|woff2?|ttf)(\?|$)/i.test(u)) return;
  try {
    const len = Number(r.headers()['content-length'] || 0);
    seen.set(u, len || (await r.buffer().catch(() => ({ length: 0 }))).length || 0);
  } catch { /* body already gone */ }
});

try {
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
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

  seen.clear();                       // measure the PORTAL, not the login screen
  await setWidth(pg, 390, 844);
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(14000);
  const onPortal = await pg.evaluate(() => !/sign in/i.test(document.body.innerText.slice(0, 300)));
  if (!onPortal) { console.log('FAILED: never reached the portal'); process.exit(1); }
} finally {
  await pg.close().catch(() => {});
  b.disconnect();
}

const rows = [...seen.entries()].map(([u, n]) => ({ n, f: u.split('/').pop() })).sort((a, b2) => b2.n - a.n);
const total = rows.reduce((a, r) => a + r.n, 0);
const kb = Math.round(total / 1024);
const coach = rows.filter((r) => COACH_ONLY.test(r.f));

console.log(`athlete portal cold load: ${rows.length} files, ${kb} KB  (budget ${BUDGET_KB} KB)`);
for (const r of rows.slice(0, 8)) console.log(`  ${(r.n / 1024).toFixed(1).padStart(8)} KB  ${r.f.slice(0, 44)}`);

let bad = 0;
if (kb > BUDGET_KB) { bad++; console.log(`\nFAIL  over budget by ${kb - BUDGET_KB} KB`); }
for (const c of coach) { bad++; console.log(`FAIL  coach-only code in the athlete's first load: ${c.f} (${(c.n / 1024).toFixed(1)} KB)`); }
console.log(bad ? `\n${bad} problem(s)` : `\n0 - ${kb} KB, nothing coach-only`);
process.exit(bad ? 1 : 0);
