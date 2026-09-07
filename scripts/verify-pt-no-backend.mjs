// A PHYSIO IN THE GYM WITH NO SIGNAL.
//
// The athlete side was measured and repaired; the physios run the same risk and
// nothing had ever checked them. They work courtside at Bnei Herzliya, on gym
// wifi, and the club zone is where the roster and the session board live.
//
// Same method as verify-athlete-no-backend.mjs: one good load, then every
// Supabase call is cut. Shell fine, data layer gone.
//
//   ROSTER   - is the squad still on the screen, from cache?
//   TOLD     - is the physio told the data is not live?
//   SIGNED IN- do they stay signed in rather than hitting a login wall they
//              cannot pass without a network?
//   NO CRASH - no uncaught error, and it recovers.
//
// Read-only. It clicks nothing that commits, and never writes a physio's data.
//
//   node scripts/verify-pt-no-backend.mjs [email]
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.argv[2] || 'tomerlich11@gmail.com';   // a PT, per authRoles.js
const PW = process.env.BHBC_PW || '1234';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
let phase = 'startup';
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
pg.on('pageerror', (e) => problems.push(`[${phase}] page error: ${String(e.message).slice(0, 120)}`));

let cutBackend = false;
await pg.setRequestInterception(true);
pg.on('request', (r) => {
  if (cutBackend && /supabase\.(co|in)/.test(r.url())) { r.abort('failed').catch(() => {}); return; }
  r.continue().catch(() => {});
});

const look = () => pg.evaluate(() => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
  const top = t.slice(0, 200);
  return {
    len: t.length,
    head: t.slice(0, 130),
    // A squad number is the signal a roster actually rendered - a heading alone
    // proves nothing, which is the mistake the athlete gate made first.
    players: (t.match(/#\d+/g) || []).length,
    told: /offline|no connection|not live|last synced|reconnect|couldn.t reach|last saved|לא מקוון|אין חיבור/i.test(t),
    loginWall: /sign in|log in/i.test(top) && !/log ?out/i.test(top),
  };
});

try {
  phase = 'sign-in';
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
    const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await wait(9000);

  // The click has to be CONFIRMED, not fired and hoped for. A single blind
  // click at 13s reported "the squad is gone offline" - it had landed before
  // the zone finished rendering, and what got measured was the Overview tab.
  // The tab strip renames the current tab out of the list, so "Roster gone,
  // Overview present" is the proof it actually switched.
  const roster = async () => {
    await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let k = 0; k < 40; k++) {
      await wait(1000);
      const onRoster = await pg.evaluate(() => {
        const tabs = [...document.querySelectorAll('.bhbc-tab')];
        const names = tabs.map((e) => (e.textContent || '').trim());
        if (!names.some((n) => /^overview$/i.test(n))) {
          const t = tabs.find((e) => /^\s*roster\s*$/i.test((e.textContent || '').trim()));
          if (t) t.click();                   // never the sign-out tab: it shares the class
          return false;
        }
        return true;
      });
      if (onRoster) break;
    }
    await wait(4000);
    return look();
  };

  phase = 'online';
  await setWidth(pg, 1500, 1000);
  const on = await roster();
  if (on.players < 3) { console.log(`FAILED: the roster did not load online (${on.players} players, ${on.len} chars)`); process.exit(1); }
  console.log(`online     : ${on.len} chars, ${on.players} squad numbers`);

  phase = 'backend-cut';
  cutBackend = true;
  const off = await roster();
  const kept = Math.round((off.players / on.players) * 100);
  console.log(`no backend : ${off.len} chars | ${off.players} of ${on.players} players (${kept}%) | told: ${off.told} | login wall: ${off.loginWall}`);
  console.log(`             "${off.head.slice(0, 100)}"`);
  if (off.loginWall) problems.push('signed out with no backend - a physio courtside cannot sign back in');
  if (off.players === 0) problems.push(`the squad is gone with the backend unreachable (${off.len} chars)`);
  else if (kept < 60) problems.push(`most of the squad is missing with the backend unreachable (${kept}%)`);
  if (!off.told) problems.push('nothing tells the physio the data is not live - stale reads as current');

  phase = 'recover';
  cutBackend = false;
  const back = await roster();
  const ok = back.players >= on.players * 0.9;
  console.log(`recovered  : ${ok ? 'roster is back' : `STILL BROKEN (${back.players} players)`}`);
  if (!ok) problems.push('the club zone did not recover when the backend returned');
} catch (e) {
  problems.push(`[${phase}] threw: ${String(e.message || e).slice(0, 120)}`);
} finally {
  await pg.setRequestInterception(false).catch(() => {});
  await pg.close().catch(() => {});
  b.disconnect();
}

console.log('');
const uniq = [...new Set(problems)];
for (const p of uniq) console.log('FAIL  ' + p);
console.log(uniq.length ? `\n${uniq.length} problem(s) for a physio with no backend` : '\n0 - the club zone holds up with no backend');
process.exit(uniq.length ? 1 : 0);
