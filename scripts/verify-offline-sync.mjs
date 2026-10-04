// OFFLINE-PROOF WORKOUTS, MEASURED (5.10 #560).
//
// Ohad: "make sure it autonomously knows when there's not internet or wifi" and
// "make sure the offline capture saves everything regularly as soon as the
// client have wifi or internet". Three things are proved, each the way an
// athlete meets it:
//
//   DEAD WIFI    - every request to Supabase is held open and never answered
//                  (the radio says online; nothing moves). The portal must
//                  render from cache within 6 s and the pill must say offline.
//   EXPIRED BOOT - same dead wifi, and the stored access token is past its
//                  expiry. supabase-js cannot refresh it. The app must still
//                  open on the stored person - never a login screen.
//   MID-FINISH   - a real workout is logged, the network is cut as Complete is
//                  tapped; the row must be queued on the phone, and once the
//                  network is back it must reach the server by itself (no
//                  reload, no tap), and the pill must go Syncing -> Synced.
//
// It WRITES one client_workouts row for the fixture athlete (Diego Day) in the
// third test and DELETES it at the end from his own seat. Sign-outs are
// { scope: 'local' } only - a bare signOut() is global and would log the owner
// out of every device.
//
//   BASE=http://127.0.0.1:5340 CDP=http://127.0.0.1:9445 node scripts/verify-offline-sync.mjs
//   BREAK=1 node scripts/verify-offline-sync.mjs    # the fix neutered: MUST fail
//
// BREAK=1 makes AbortController.abort() a no-op on the page before the app
// loads: no request budget can fire, no probe can time out - exactly the app
// before this change, where a held socket was waited on forever.
import P from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://localhost:5340';   // vite preview binds localhost (::1), not 127.0.0.1
const CDP = process.env.CDP || 'http://127.0.0.1:9445';
const EMAIL = process.env.ATHLETE_EMAIL || 'diego@diegoday.com';
const PW = process.env.ATHLETE_PW || '1234';
const BREAK = process.env.BREAK === '1';
const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const AUTH_KEY = 'sb-gtcbfglttoiyfsnfbhdy-auth-token';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
const notes = [];
let phase = 'startup';
const fail = (m) => problems.push(`[${phase}] ${m}`);
const note = (m) => { notes.push(m); console.log('  ' + m); };

const b = await P.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
pg.on('pageerror', (e) => fail(`page error: ${String(e.message).slice(0, 140)}`));
// DEBUG=1 relays the page's own timeline (queue writes, requests) to the console
const DEBUG = process.env.DEBUG === '1';
if (DEBUG) pg.on('console', (m) => { const t = m.text(); if (/^\[t\]/.test(t)) console.log('    » ' + t.slice(0, 170)); });
const instrument = () => pg.evaluate(() => {
  window.__t0 = performance.now();
  const log = (m) => console.log('[t] ' + Math.round(performance.now() - window.__t0) + 'ms ' + m);
  const os = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { if (k === 'expo-offline-queue') { try { log('queue: ' + JSON.parse(v).map((e) => e.attempts + ':' + (e.lastError || '').slice(0, 40)).join(' | ')); } catch (e) { /* ignore */ } } return os(k, v); };
  const of = window.fetch;
  window.fetch = (u, o) => { const url = String(typeof u === 'string' ? u : (u && u.url)).replace(/^.*supabase\.co/, '').slice(0, 60); if (/^\//.test(url)) log('fetch ' + ((o && o.method) || 'GET') + ' ' + url); return of(u, o).then((r) => { if (/^\//.test(url)) log('  -> ' + r.status + ' ' + url.slice(0, 40)); return r; }, (e) => { if (/^\//.test(url)) log('  -> ERR ' + String(e.message).slice(0, 30) + ' ' + url.slice(0, 40)); throw e; }); };
  const mo = new MutationObserver(() => { const bt = document.querySelector('[data-complete-workout]'); if (!bt) { log('logger closed'); mo.disconnect(); return; } if (bt.textContent !== window.__lastBt) { window.__lastBt = bt.textContent; log('button: ' + bt.textContent.trim()); } });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true });
}).catch(() => {});
if (BREAK) {
  await pg.evaluateOnNewDocument(() => { try { const Real = window.AbortController; window.AbortController = class extends Real { abort() { /* the fix, neutered */ } }; } catch (e) { /* noop */ } });
  console.log('*** BREAK=1: AbortController.abort() is a no-op on every page - no request budgets, no probe timeout ***\n');
}

// THE DEAD WIFI. Requests to Supabase are parked here and never answered until
// release() aborts them. The app shell itself (the preview server) stays up,
// like a phone whose PWA is installed and whose wifi is a dead access point.
let holding = false;
const held = [];
await pg.setRequestInterception(true);
pg.on('request', (r) => {
  if (holding && /supabase\.(co|in)/.test(r.url())) { held.push(r); return; }
  r.continue().catch(() => {});
});
const cut = () => { holding = true; };
const release = async () => {
  holding = false;
  const rs = held.splice(0);
  for (const r of rs) await r.abort('failed').catch(() => {});
};

const bodyText = () => pg.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
const looksLikeLogin = (t) => /Don't have an account|Continue with Google|המשך עם Google|^\s*כניסה\s*$|^\s*Sign-?in\s*$/im.test(t) || (/sign in/i.test(t.slice(0, 200)) && !/log ?out/i.test(t.slice(0, 200)));
const portalUp = (t) => /block|program|warm-?up|תוכנית|בלוק/i.test(t) && /log ?out|יציאה/i.test(t);
const untilPortal = async (maxMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const t = await bodyText();
    if (portalUp(t)) return Date.now() - t0;
    await wait(250);
  }
  return -1;
};
const pill = () => pg.evaluate(() => {
  const el = document.querySelector('[data-net-pill]');
  return el ? { state: el.getAttribute('data-net-pill'), pending: Number(el.getAttribute('data-net-pending') || 0), text: (el.textContent || '').trim(), h: Math.round(el.getBoundingClientRect().height) } : null;
}).catch(() => null);
const untilPill = async (state, maxMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const p = await pill();
    if (p && p.state === state) return { ms: Date.now() - t0, p };
    await wait(250);
  }
  return { ms: -1, p: await pill() };
};
const queued = () => pg.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('expo-offline-queue') || '[]').filter((e) => e.type === 'client_workouts.upsert').map((e) => ({ id: e.payload?.row?.id, client: e.payload?.row?.client_id, attempts: e.attempts, lastError: e.lastError })); } catch { return []; }
}).catch(() => []);

let workoutId = null;
let workoutClientId = null;

try {
  // ── sign in ─────────────────────────────────────────────────────────────
  phase = 'sign-in';
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
  await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(3000);
  await pg.evaluate(({ email, pw }) => {
    const ins = [...document.querySelectorAll('input')];
    const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
    const p = ins.find((i) => i.type === 'password');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e) set(e, email); if (p) set(p, pw);
  }, { email: EMAIL, pw: PW });
  await wait(300);
  await pg.evaluate(() => { const btn = [...document.querySelectorAll('button')].find((x) => /^\s*(sign\s*in|כניסה)\s*$/i.test(x.textContent || '')); if (btn) btn.click(); });
  await wait(8000);
  await setWidth(pg, 390, 844);
  await pg.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const onlineMs = await untilPortal(30000);
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss|אחר כך|לא עכשיו/i.test(e.textContent || '')); if (x) x.click(); }).catch(() => {});
  if (onlineMs < 0) { console.log('FAILED: the portal did not load online as ' + EMAIL + ' - nothing to measure'); console.log((await bodyText()).slice(0, 200)); process.exitCode = 1; throw new Error('no portal'); }
  note(`online   : portal up in ${onlineMs} ms (programme + identity cached by this load)`);
  // the caches this device now holds, the second load's whole supply
  await wait(2500);
  const stored = await pg.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, AUTH_KEY);
  if (!stored || !stored.refresh_token) fail('no stored session after sign-in - the offline tests would be measuring a stranger');

  // ── (a) dead wifi, valid token ──────────────────────────────────────────
  phase = 'dead-wifi';
  // this reload runs the portal in HEBREW, so the pill's Hebrew is measured too
  await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'he'); } catch (e) { /* ignore */ } });
  cut();
  const t0 = Date.now();
  await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => fail(`reload: ${String(e.message).slice(0, 80)}`));
  const deadMs = await untilPortal(20000);
  const deadTotal = Date.now() - t0;
  const text = await bodyText();
  if (deadMs < 0) fail(`dead wifi: the portal never rendered from cache in 20 s - "${text.slice(0, 100)}"`);
  else if (deadTotal > 6000) fail(`dead wifi: the portal took ${deadTotal} ms to render from cache (budget 6000)`);
  if (looksLikeLogin(text)) fail('dead wifi: the login screen was shown to a signed-in athlete');
  const pa = await untilPill('offline', 8000);
  if (pa.ms < 0) fail(`dead wifi: the pill never said offline (pill: ${JSON.stringify(pa.p)})`);
  else if (pa.p.h !== 36) fail(`dead wifi: the pill is ${pa.p.h}px tall, not 36 (house rule for bordered controls)`);
  else if (!/אופליין/.test(pa.p.text)) fail(`dead wifi: the Hebrew portal's pill reads "${pa.p.text}" - not Hebrew`);
  note(`dead wifi: portal from cache in ${deadTotal} ms, pill "${pa.p ? pa.p.text : '-'}" (${pa.p ? pa.p.state : 'none'}) after ${pa.ms} ms, ${held.length} requests held`);
  await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'en'); } catch (e) { /* ignore */ } });

  // ── (b) dead wifi, EXPIRED token ────────────────────────────────────────
  phase = 'expired-boot';
  await pg.evaluate((k) => {
    try { const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 3600; s.expires_in = 0; localStorage.setItem(k, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }, AUTH_KEY);
  const t1 = Date.now();
  await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => fail(`reload: ${String(e.message).slice(0, 80)}`));
  // a login screen in the first 25 s fails the test even if the portal came later
  let loginSeen = false, expMs = -1;
  while (Date.now() - t1 < 25000) {
    const t = await bodyText();
    if (looksLikeLogin(t)) { loginSeen = true; break; }
    if (portalUp(t)) { expMs = Date.now() - t1; break; }
    await wait(250);
  }
  if (loginSeen) fail('expired token offline: the login screen was shown - the stored session was not used');
  else if (expMs < 0) fail(`expired token offline: no portal in 25 s - "${(await bodyText()).slice(0, 100)}"`);
  const pb = await pill();
  note(`expired  : ${loginSeen ? 'LOGIN SCREEN' : expMs < 0 ? 'no portal' : `portal from the stored session in ${expMs} ms`}, pill ${pb ? pb.state : 'none'}`);

  // ── back online: the real refresh must land ─────────────────────────────
  phase = 'back-online';
  await release();
  await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const backMs = await untilPortal(40000);
  if (backMs < 0) fail('back online: the portal did not come back');
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss|אחר כך|לא עכשיו/i.test(e.textContent || '')); if (x) x.click(); }).catch(() => {});
  await wait(2000);
  const refreshed = await pg.evaluate((k) => { try { const s = JSON.parse(localStorage.getItem(k)); return s && s.expires_at * 1000 > Date.now(); } catch { return false; } }, AUTH_KEY);
  if (!refreshed) fail('back online: the expired token was not refreshed by the app');
  note(`back     : portal in ${backMs} ms, token ${refreshed ? 'refreshed' : 'STILL EXPIRED'}`);

  // ── (c) a workout finished as the network dies ──────────────────────────
  phase = 'mid-finish';
  const started = await pg.evaluate(() => {
    const rx = /^(AGAIN|START|שוב|התחל)$/;
    const bt = [...document.querySelectorAll('button')].find((x) => rx.test((x.textContent || '').trim()));
    if (!bt) return null; bt.scrollIntoView({ block: 'center' }); bt.click(); return (bt.textContent || '').trim();
  });
  if (!started) { fail('no START / AGAIN button - no programme day to log'); throw new Error('no day'); }
  if (DEBUG) console.log(`    » opened the day with "${started}"`);
  await wait(1500);
  // the logger's own clock: the moment Complete returns is read from the page,
  // not from a CDP poll (a poll on a page holding dead sockets measured 18 s for
  // a logger that closed in 4 s)
  await pg.evaluate(() => {
    window.__completeAt = null; window.__closedAt = null;
    const mo = new MutationObserver(() => { if (window.__completeAt && !document.querySelector('[data-complete-workout]')) { window.__closedAt = performance.now(); mo.disconnect(); } });
    mo.observe(document.body, { subtree: true, childList: true });
  }).catch(() => {});
  // walk the steps: tick the first set of the first exercise, Next until Complete
  let ticked = false;
  for (let i = 0; i < 30; i++) {
    const st = await pg.evaluate(() => {
      if (document.querySelector('[data-complete-workout]')) return 'end';
      const cb = document.querySelector('input[type=checkbox]');
      if (cb && !cb.checked) { cb.click(); return 'ticked'; }
      const next = document.querySelector('[data-step-next]');
      if (next) { next.scrollIntoView({ block: 'center' }); next.click(); return 'next'; }
      return 'stuck';
    });
    if (DEBUG) console.log(`    » step ${i}: ${st}`);
    if (st === 'ticked') ticked = true;
    if (st === 'end') break;
    if (st === 'stuck') { fail('logger: no Next and no Complete on a step'); break; }
    await wait(700);
  }
  if (!ticked) fail('logger: no set checkbox found to tick - Complete would be refused as empty');
  // the network dies as Complete is tapped
  if (DEBUG) await instrument();
  cut();
  const clicked = await pg.evaluate(() => { const bt = document.querySelector('[data-complete-workout]'); if (!bt) return false; bt.scrollIntoView({ block: 'center' }); window.__completeAt = performance.now(); bt.click(); return true; });
  if (!clicked) { fail('no Complete button'); throw new Error('no complete'); }
  // the row must be in the queue at once (durable before network) ...
  let qrows = [];
  for (let i = 0; i < 20 && !qrows.length; i++) { await wait(250); qrows = await queued(); }
  if (!qrows.length) fail('mid-finish: the workout row was not queued on the phone');
  else { workoutId = qrows[0].id; workoutClientId = qrows[0].client; }
  // ... and the logger must close without waiting on the dead request
  let closedMs = -1;
  for (let i = 0; i < 80 && closedMs < 0; i++) {
    closedMs = await pg.evaluate(() => (window.__closedAt && window.__completeAt) ? Math.round(window.__closedAt - window.__completeAt) : -1).catch(() => -1);
    if (closedMs < 0) await wait(250);
  }
  if (closedMs < 0) fail('mid-finish: Complete did not return while the request hung (20 s)');
  else if (closedMs > 6000) fail(`mid-finish: Complete took ${closedMs} ms to return with the network dead (budget 6000: the row is durable on the phone from the first millisecond)`);
  const pc = await untilPill('offline', 30000);
  if (pc.ms < 0 || !(pc.p && pc.p.pending >= 1)) fail(`mid-finish: the pill does not say offline with the row counted (pill: ${JSON.stringify(pc.p)})`);
  note(`finish   : row ${workoutId || '-'} queued, Complete returned ${closedMs < 0 ? 'NEVER' : `in ${closedMs} ms (page clock)`}, pill "${pc.p ? pc.p.text : '-'}"`);

  // the network returns: nothing is tapped, nothing is reloaded
  const t3 = Date.now();
  await release();
  const syncing = await untilPill('syncing', 45000);
  const synced = await untilPill('synced', 90000);
  let left = await queued();
  for (let i = 0; i < 40 && left.length; i++) { await wait(1000); left = await queued(); }
  if (left.length) fail(`mid-finish: ${left.length} row(s) still queued ${Math.round((Date.now() - t3) / 1000)} s after the network came back (${JSON.stringify(left[0])})`);
  note(`recover  : pill syncing after ${syncing.ms} ms, synced after ${synced.ms} ms, queue empty after ${Math.round((Date.now() - t3) / 1000)} s`);

  // the server's word, from the athlete's own seat
  const s = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: ae } = await s.auth.signInWithPassword({ email: EMAIL, password: PW });
  if (ae) fail('server check: could not sign in as the athlete from node: ' + ae.message);
  else if (workoutId) {
    let row = null;
    for (let i = 0; i < 30 && !row; i++) {
      const { data } = await s.from('client_workouts').select('id, client_id, exercises').eq('id', workoutId).maybeSingle();
      row = data; if (!row) await wait(2000);
    }
    if (!row) fail(`server check: row ${workoutId} is NOT on the server`);
    else {
      const sets = (row.exercises || []).reduce((n, ex) => n + ((ex && ex.sets) || []).filter((x) => x && x.done).length, 0);
      note(`server   : row ${workoutId} is on the server, client ${row.client_id}, ${sets} ticked set(s)`);
      // CLEAN UP: the fixture's test row goes, from his own seat
      const { error: de } = await s.from('client_workouts').delete().eq('id', workoutId);
      const { data: gone } = await s.from('client_workouts').select('id').eq('id', workoutId).maybeSingle();
      if (de || gone) fail(`cleanup: the test row ${workoutId} was NOT deleted (${de ? de.message : 'still readable'})`);
      else note(`cleanup  : test row ${workoutId} deleted`);
    }
    await s.auth.signOut({ scope: 'local' }).catch(() => {});
  }
  // the phone's copy of the test row too, so the fixture's History does not show it
  await pg.evaluate((id) => { try { const a = JSON.parse(localStorage.getItem('expo-cw') || '[]'); localStorage.setItem('expo-cw', JSON.stringify(a.filter((w) => w && w.id !== id))); } catch (e) { /* ignore */ } }, workoutId);
} catch (e) {
  if (!/no portal|no day|no complete/.test(String(e.message))) fail(`threw: ${String(e.message || e).slice(0, 140)}`);
} finally {
  await release().catch(() => {});
  // this context's session only: a sign-out from the page is scope local in the app
  await pg.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } }).catch(() => {});
  await pg.close().catch(() => {});
  await ctx.close().catch(() => {});
  b.disconnect();
}

console.log('');
const uniq = [...new Set(problems)];
for (const p of uniq) console.log('FAIL  ' + p);
// BREAK=1 is expected to end here WITH failures (exit 1): that is the proof the
// gate sees the fix, not a pass that would read green without it.
if (BREAK) console.log(uniq.length ? `\nBREAK=1: ${uniq.length} failure(s) - the gate catches the broken build` : '\nBREAK=1 and 0 failures - THE GATE DOES NOT CATCH THE BROKEN BUILD');
console.log(uniq.length ? `\n${uniq.length} problem(s)` : '\n0 - the portal knows when it is offline, saves on the phone, and syncs by itself when the network is back');
process.exit(uniq.length ? 1 : 0);
