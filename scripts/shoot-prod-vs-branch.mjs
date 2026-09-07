// WHAT IS LIVE, BESIDE WHAT IS WAITING.
//
// "Before" is not a screenshot I took an hour ago - it is expo-app.co.il as it
// stands right now, on the commit that was last deployed. "After" is this
// branch, served locally. Same seat, same route, same width, minutes apart.
//
// Read-only on production: it signs in, navigates, and screenshots. It never
// clicks anything that writes.
//
//   ROUTES=/coach/bhbc,/coach node scripts/shoot-prod-vs-branch.mjs
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const PROD = process.env.PROD || 'https://expo-app.co.il';
const BRANCH = process.env.BRANCH || 'http://127.0.0.1:4173';
const OUT = 'audit-out/pairs';
const W = Number(process.env.W || 1500);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const SEATS = {
  owner: { email: 'ohadyproductions@gmail.com', pw: '1234' },
  pt: { email: 'tomerlich11@gmail.com', pw: '1234' },
  athlete: { email: process.env.ATHLETE || 'amit@enoshy.com', pw: '1234' },
};
const JOBS = (process.env.JOBS || 'owner:/coach/bhbc:bhbc,owner:/coach:dashboard,pt:/coach/bhbc:pt-zone,athlete:/athlete:portal')
  // An optional 4th field is a tab label regex (both languages) clicked after
  // the route loads - the athlete's MEAL LOG, HISTORY etc. are tabs, not routes.
  .split(',').map((x) => { const [seat, route, name, tab] = x.split(':'); return { seat, route, name, tab }; });

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });

const shoot = async (base, job, tag) => {
  const pg = await b.newPage();
  // LANG=he walks the app in Hebrew. It has to be set before the FIRST
  // document: App reads the language at mount and writes it straight back.
  // The club ZONE keeps its own switch under a usePersistentState key; the
  // app-level key does not move it, and a "Hebrew" zone pair taken without this
  // came back English on both sides.
  if (process.env.LANG_APP) await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l)); } catch (e) { /* ignore */ } }, process.env.LANG_APP);
  const who = SEATS[job.seat];
  try {
    await pg.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
    await pg.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(4000);
    await pg.evaluate(({ email, pw }) => {
      const ins = [...document.querySelectorAll('input')];
      const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
      const p = ins.find((i) => i.type === 'password');
      const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      if (e) set(e, email); if (p) set(p, pw);
    }, who);
    await wait(500);
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*sign\s*in\s*$/i.test(y.textContent || '')); if (x) x.click(); });
    await wait(10000);
    await setWidth(pg, W, 1100);
    await pg.goto(base + job.route, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(15000);
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss|אחר כך|לא עכשיו/i.test(e.textContent || '')); if (x) x.click(); }).catch(() => {});
    await wait(1200);
    if (process.env.LANG_APP === 'he' && /\/coach\/bhbc/.test(job.route)) {
      // Production may store the switch under an older key: if the zone still
      // shows its "עב" toggle, the zone is English - click it.
      const flipped = await pg.evaluate(() => { const t = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'עב'); if (!t) return false; t.click(); return true; }).catch(() => false);
      if (flipped) { console.log(`${tag} ${job.name}: zone switched to Hebrew by click`); await wait(4000); }
    }
    if (job.tab) {
      const hit = await pg.evaluate((rx) => { const re = new RegExp(rx, 'i'); const el = [...document.querySelectorAll('button,[role="tab"]')].find((b) => re.test((b.textContent || '').trim())); if (!el) return null; el.click(); return (el.textContent || '').trim(); }, job.tab).catch(() => null);
      console.log(tag + ' ' + job.name + ': tab ' + (hit ? 'clicked "' + hit + '"' : 'NOT FOUND (' + job.tab + ')'));
      await wait(5000);
    }
    const chars = await pg.evaluate(() => (document.body.innerText || '').length);
    const file = path.join(OUT, `${job.name}${process.env.LANG_APP ? '-' + process.env.LANG_APP : ''}-${tag}.png`);
    await pg.screenshot({ path: file, fullPage: true });
    console.log(`${tag.padEnd(6)} ${job.seat.padEnd(7)} ${job.route.padEnd(14)} ${String(chars).padStart(6)} chars -> ${file}`);
    return { file, chars };
  } catch (e) {
    console.log(`${tag} ${job.name}: FAILED ${String(e.message).slice(0, 90)}`);
    return null;
  } finally {
    await pg.close().catch(() => {});
  }
};

const results = [];
for (const job of JOBS) {
  const before = await shoot(PROD, job, 'live');
  const after = await shoot(BRANCH, job, 'branch');
  results.push({ ...job, before, after });
}
// MANIFEST= names the output so a phone-width run does not overwrite the desktop one.
fs.writeFileSync(path.join(OUT, process.env.MANIFEST || (process.env.LANG_APP ? 'pairs-' + process.env.LANG_APP + '.json' : 'pairs.json')), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.before && r.after).length}/${results.length} complete pairs`);
b.disconnect();
