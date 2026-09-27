// A FINISHED WORKOUT CAN NOT BE LOST — PROVEN FROM THE ATHLETE'S SEAT.
//
// The owner's ask (27.9): "make sure the lost workout days never happen ever
// again". This drives the REAL athlete portal of a local build in a headless
// phone-width Chrome, as the TEST FIXTURE athlete only, and breaks each thing
// that used to lose a session:
//
//   (a) offline      — go offline, Complete, reload while still offline, come
//                      back online → exactly ONE row lands, with the ticked count
//   (b) closed tab   — Complete with the upsert request killed, close the page
//                      within 100 ms → on reopen the row lands
//   (c) duplicates   — double-tap Complete, then AGAIN + Complete → still exactly
//                      ONE row for that plan/day/week, done count unchanged
//   (d) empty        — Complete with 0 ticked sets → refused on screen, no row
//   (e) permanent    — the upsert answered 403/42501 → the workout stays parked,
//                      "WORKOUT NOT SAVED YET" is on screen; unblock + RETRY →
//                      it lands and the banner goes
//
// Every row it writes carries a run marker in `notes`; cleanup deletes ONLY rows
// with that marker that did not exist before the run (as the athlete; if the
// athlete seat may no longer DELETE, as the owner — still only marker rows).
// Days are opened only from a START button (never AGAIN), so a fixture row that
// existed before the run is never edited.
//
//   npx vite preview --port 5232 --strictPort --host 127.0.0.1   (your build)
//   node scripts/verify-workout-durability.mjs
//   BASE=<url> to point it elsewhere. SHOTS=<dir> for the screenshots.
// Exit 1 on any broken clause, or if it measured nothing.
import fs from 'node:fs';
import path from 'node:path';
import P from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

// FIXTURE SEAT ONLY. This writes rows to the shared production database; it
// must never do that as a real athlete, so any other seat is refused outright.
const FIXTURE = 'diego@diegoday.com';
if (process.env.EXPO_EMAIL && process.env.EXPO_EMAIL.toLowerCase() !== FIXTURE) {
  console.log(`FAIL: this gate writes workouts — it runs ONLY as the fixture athlete (${FIXTURE}), not ${process.env.EXPO_EMAIL}`);
  process.exit(1);
}
process.env.EXPO_EMAIL = FIXTURE;
const PW = process.env.EXPO_PW || '1234';
const OWNER = 'ohadyproductions@gmail.com';
const { signIn } = await import('./lib/authed-page.mjs');

const BASE = process.env.BASE || 'http://127.0.0.1:5232';
const SHOTS = process.env.SHOTS || path.join('audit-out', 'workout-durability');
fs.mkdirSync(SHOTS, { recursive: true });
const RUN = 'wd-gate-' + Date.now().toString(36);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const src = fs.readFileSync(new URL('../src/supabase.js', import.meta.url), 'utf8');
const URL_ = (src.match(/SUPA_URL = '([^']+)'/) || [])[1];
const KEY = (src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/) || [])[1];
if (!URL_ || !KEY) { console.log('FAIL: could not read the project URL / key from src/supabase.js'); process.exit(1); }

const results = [];
const check = (clause, name, ok, detail) => { results.push({ clause, name, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} (${clause}) ${name}${detail ? ' — ' + detail : ''}`); };

// ── server side (reads + cleanup) as the fixture athlete ────────────────────
const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
{
  const { data, error } = await sb.auth.signInWithPassword({ email: FIXTURE, password: PW });
  if (error || !data?.user) { console.log(`FAIL: sign-in as the fixture: ${error && error.message}`); process.exit(1); }
}
const { data: meRaw } = await sb.rpc('my_trainee');
const CLIENT = meRaw && (Array.isArray(meRaw) ? meRaw[0]?.id : meRaw.id);
if (!CLIENT) { console.log('FAIL: my_trainee did not resolve the fixture to a client id'); process.exit(1); }
const before = await sb.from('client_workouts').select('id').eq('client_id', CLIENT);
if (before.error) { console.log('FAIL: could not read the fixture history: ' + before.error.message); process.exit(1); }
const PRE = new Set((before.data || []).map((r) => r.id));
console.log(`seat: fixture athlete · ${PRE.size} pre-existing rows left untouched · run marker ${RUN}`);

const doneOf = (row) => { let n = 0; for (const e of row.exercises || []) for (const s of e.sets || []) if (s && s.done) n++; return n; };
async function markerRows(marker) {
  const { data, error } = await sb.from('client_workouts').select('id,plan_name,day_name,week,notes,exercises').eq('client_id', CLIENT).like('notes', marker + '%');
  if (error) throw new Error(error.message);
  return (data || []).filter((r) => !PRE.has(r.id));
}
async function pollRows(marker, want, ms) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) { rows = await markerRows(marker); if (rows.length >= want) break; await wait(1500); }
  return rows;
}
async function cleanup(marker) {
  const rows = await markerRows(marker);
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  let { error } = await sb.from('client_workouts').delete().in('id', ids);
  const left = await markerRows(marker);
  if (error || left.length) {
    // The proposed migration removes the athlete's DELETE. Clean up as the
    // owner then — still only this run's marker rows, never anything else.
    const own = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await own.auth.signInWithPassword({ email: OWNER, password: PW });
    if (!s.error) ({ error } = await own.from('client_workouts').delete().in('id', left.map((r) => r.id)).like('notes', marker + '%'));
    await own.auth.signOut().catch(() => {});
  }
  return rows.length;
}

// ── the browser ─────────────────────────────────────────────────────────────
const browser = await P.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-first-run', '--no-default-browser-check'],
  protocolTimeout: 240000,
});

async function openSeat(lang = 'en') {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((l) => {
    try { localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {}
    try { if (!localStorage.getItem('expo-lang')) localStorage.setItem('expo-lang', l); } catch (e) {}
  }, lang);
  const who = await signIn(page, BASE);
  if (!who || !who.signedIn) throw new Error('could not sign in as the fixture: ' + (who && who.note));
  return { ctx, page };
}
async function portal(page) {
  await page.goto(BASE + '/athlete', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 60; i++) {
    await wait(700);
    const n = await page.evaluate(() => document.querySelectorAll('[data-day-action]').length).catch(() => 0);
    if (n > 0) { await wait(1500); return n; }
  }
  return 0;
}
const actionLabel = (page, idx) => page.evaluate((i) => { const b = document.querySelectorAll('[data-day-action]')[i]; return b ? (b.textContent || '').replace(/→/g, '').trim() : null; }, idx);
const clickAction = (page, idx) => page.evaluate((i) => { const b = document.querySelectorAll('[data-day-action]')[i]; if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; }, idx);
const inLogger = (page) => page.evaluate(() => !!document.querySelector('[data-step-next],[data-complete-workout]'));
const atEnd = (page) => page.evaluate(() => !!document.querySelector('[data-complete-workout]'));

// Walk the logger to the Complete screen, ticking up to `ticks` sets.
async function walk(page, ticks) {
  let ticked = 0, sawSet = false;
  for (let i = 0; i < 80; i++) {
    if (await atEnd(page)) break;
    const r = await page.evaluate((left) => {
      const boxes = [...document.querySelectorAll('input[type=checkbox]')];
      let t = 0;
      for (const b of boxes) { if (t >= left) break; if (!b.checked) { b.click(); t++; } }
      return { t, n: boxes.length };
    }, ticks - ticked);
    ticked += r.t; if (r.n) sawSet = true;
    await wait(250);
    const moved = await page.evaluate(() => { const b = document.querySelector('[data-step-next]'); if (!b) return false; b.click(); return true; });
    if (!moved) break;
    await wait(450);
  }
  return { ticked, sawSet, end: await atEnd(page) };
}
async function setNotes(page, text) {
  await page.evaluate((t) => {
    const ta = document.querySelector('textarea');
    if (!ta) return;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, t);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await wait(400);
}
const clickComplete = (page) => page.evaluate(() => { const b = document.querySelector('[data-complete-workout]'); if (!b) return false; b.click(); return true; });
const exitLogger = (page) => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /EXIT|יציאה/.test(x.textContent || '')); if (b) b.click(); return !!b; });
async function waitClosed(page, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (!(await inLogger(page).catch(() => true))) return true; await wait(300); } return false; }
async function queueWorkouts(page) {
  return page.evaluate(() => { try { return JSON.parse(localStorage.getItem('expo-offline-queue') || '[]').filter((e) => e.type === 'client_workouts.upsert').length; } catch (e) { return -1; } });
}
async function shot(page, name) { const f = path.join(SHOTS, name + '.png'); await page.screenshot({ path: f, fullPage: true }); console.log(`     screenshot ${f}`); }

// Find a START day that actually has sets to tick (a thin imported day has none).
let DAY = -1;
async function pickDay(page) {
  const n = await page.evaluate(() => document.querySelectorAll('[data-day-action]').length);
  for (let i = 0; i < n; i++) {
    if (!/^(START|התחל)$/.test((await actionLabel(page, i)) || '')) continue;
    await clickAction(page, i); await wait(1500);
    if (!(await inLogger(page))) continue;
    // look for set rows without ticking anything, then leave (the draft is harmless)
    let found = false;
    for (let k = 0; k < 40 && !found; k++) {
      found = await page.evaluate(() => document.querySelectorAll('input[type=checkbox]').length > 0);
      if (found || await atEnd(page)) break;
      const moved = await page.evaluate(() => { const b = document.querySelector('[data-step-next]'); if (!b) return false; b.click(); return true; });
      if (!moved) break; await wait(400);
    }
    await exitLogger(page); await wait(1200);
    if (found) return i;
  }
  return -1;
}
// A logger opened by a gate that EXITed keeps its draft; start each clause from
// a clean device so no draft from an earlier clause is restored into it.
async function openDay(page) {
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('expo-stepLogger-')) localStorage.removeItem(k); });
  if (!/^(START|התחל)$/.test((await actionLabel(page, DAY)) || '')) return false;
  await clickAction(page, DAY); await wait(1500);
  return inLogger(page);
}

const clauses = { a: false, b: false, c: false, d: false, e: false };
try {
  // ── setup: choose the day ───────────────────────────────────────────────
  {
    const { ctx, page } = await openSeat('en');
    const n = await portal(page);
    if (!n) throw new Error('the portal rendered no day to open (no [data-day-action])');
    DAY = await pickDay(page);
    if (DAY < 0) throw new Error('no START day with set rows in the fixture portal — nothing can be measured');
    console.log(`day: button #${DAY} (${await page.evaluate((i) => document.querySelectorAll('[data-day-action]')[i].getAttribute('data-day-action'), DAY)})`);
    await ctx.close();
  }

  // ── (a) offline ─────────────────────────────────────────────────────────
  {
    const M = RUN + '-a';
    const { ctx, page } = await openSeat('en');
    await portal(page);
    if (await openDay(page)) {
      const w = await walk(page, 2); await setNotes(page, M);
      const cdp = await page.target().createCDPSession();
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await clickComplete(page);
      const closed = await waitClosed(page, 8000);
      const q = await queueWorkouts(page);
      check('a', 'offline Complete: logger closes with the row queued on the device', closed && q >= 1, `closed=${closed} queued=${q} ticked=${w.ticked}`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); // offline reload → error page, storage intact
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await portal(page);
      await pollRows(M, 1, 60000); await wait(4000);
      const again = await markerRows(M);
      check('a', 'after reload + online exactly one row lands with the ticked count', again.length === 1 && doneOf(again[0]) === w.ticked, `rows=${again.length} done=${again[0] ? doneOf(again[0]) : '-'} expected=${w.ticked}`);
      clauses.a = true;
    } else check('a', 'could open the day', false);
    await ctx.close(); await cleanup(RUN + '-a');
  }

  // ── (b) tab closed right after Complete, request killed ────────────────
  {
    const M = RUN + '-b';
    const { ctx, page } = await openSeat('en');
    await portal(page);
    if (await openDay(page)) {
      const w = await walk(page, 1); await setNotes(page, M);
      await page.setRequestInterception(true);
      page.on('request', (r) => { if (/\/rest\/v1\/client_workouts/.test(r.url()) && r.method() !== 'GET') r.abort('failed').catch(() => {}); else r.continue().catch(() => {}); });
      await clickComplete(page);
      await wait(60);
      await page.close({ runBeforeUnload: false });
      const serverNow = await markerRows(M);
      const page2 = await ctx.newPage();
      await page2.setBypassServiceWorker(true);
      await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await portal(page2);
      await pollRows(M, 1, 60000); await wait(3000);
      const rows = await markerRows(M);
      check('b', 'closed within 100 ms with the request killed → the row lands on reopen', serverNow.length === 0 && rows.length === 1 && doneOf(rows[0]) === w.ticked, `before-reopen=${serverNow.length} after=${rows.length} done=${rows[0] ? doneOf(rows[0]) : '-'}`);
      clauses.b = true;
    } else check('b', 'could open the day', false);
    await ctx.close(); await cleanup(RUN + '-b');
  }

  // ── (c) double tap + AGAIN ──────────────────────────────────────────────
  {
    const M = RUN + '-c';
    const { ctx, page } = await openSeat('en');
    await portal(page);
    if (await openDay(page)) {
      const w = await walk(page, 2); await setNotes(page, M);
      await page.evaluate(() => { const b = document.querySelector('[data-complete-workout]'); b.click(); b.click(); });
      await waitClosed(page, 10000);
      await pollRows(M, 1, 30000); await wait(3000);
      const first = await markerRows(M);
      check('c', 'double tap on Complete → one row', first.length === 1, `rows=${first.length}`);
      await wait(1500);
      const label = await actionLabel(page, DAY);
      await clickAction(page, DAY); await wait(1500);
      const w2 = await walk(page, 0);
      const notesKept = await page.evaluate(() => (document.querySelector('textarea') || {}).value || '');
      await clickComplete(page);
      await waitClosed(page, 10000); await wait(5000);
      const rows = await markerRows(M);
      const same = first[0] ? (await sb.from('client_workouts').select('id').eq('client_id', CLIENT).eq('plan_name', first[0].plan_name).eq('day_name', first[0].day_name).eq('week', first[0].week)).data.filter((r) => !PRE.has(r.id)) : [];
      check('c', `${label} + Complete re-saves the same row (one row for that plan/day/week, done count kept)`, rows.length === 1 && same.length === 1 && rows[0].id === first[0]?.id && doneOf(rows[0]) === w.ticked, `button=${label} end=${w2.end} notesKept=${notesKept === M} rows=${rows.length} planDayWeek=${same.length} done=${rows[0] ? doneOf(rows[0]) : '-'} expected=${w.ticked}`);
      clauses.c = true;
    } else check('c', 'could open the day', false);
    await ctx.close(); await cleanup(RUN + '-c');
  }

  // ── (d) zero sets ───────────────────────────────────────────────────────
  {
    const M = RUN + '-d';
    const { ctx, page } = await openSeat('en');
    await portal(page);
    if (await openDay(page)) {
      await walk(page, 0); await setNotes(page, M);
      await clickComplete(page); await wait(1200);
      const refused = await page.evaluate(() => { const r = document.querySelector('[data-finish-refused="zero"]'); return r ? r.textContent.trim() : null; });
      const still = await atEnd(page);
      await shot(page, 'd-zero-sets-en');
      // Hebrew: same device, language switched, the draft brings him back to the Complete screen
      await page.evaluate(() => localStorage.setItem('expo-lang', 'he'));
      await portal(page); await clickAction(page, DAY); await wait(1500);
      for (let i = 0; i < 40 && !(await atEnd(page)); i++) { await page.evaluate(() => document.querySelector('[data-step-next]')?.click()); await wait(350); }
      await clickComplete(page); await wait(1200);
      const refusedHe = await page.evaluate(() => { const r = document.querySelector('[data-finish-refused="zero"]'); return r ? r.textContent.trim() : null; });
      await shot(page, 'd-zero-sets-he');
      await wait(4000);
      const rows = await markerRows(M);
      check('d', 'Complete with 0 ticked sets is refused on screen, stays in the logger, no row', !!refused && still && rows.length === 0, `en="${refused}" he="${refusedHe}" stayed=${still} rows=${rows.length}`);
      clauses.d = true;
    } else check('d', 'could open the day', false);
    await ctx.close(); await cleanup(RUN + '-d');
  }

  // ── (e) permanent error → parked + visible, then lands ─────────────────
  {
    const M = RUN + '-e';
    const { ctx, page } = await openSeat('en');
    await portal(page);
    if (await openDay(page)) {
      const w = await walk(page, 1); await setNotes(page, M);
      let block = true;
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        if (block && /\/rest\/v1\/client_workouts/.test(r.url()) && r.method() !== 'GET') {
          r.respond({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "client_workouts"', details: null, hint: null }) }).catch(() => {});
        } else r.continue().catch(() => {});
      });
      await clickComplete(page);
      const closed = await waitClosed(page, 10000); await wait(2500);
      const banner = await page.evaluate(() => { const b = document.querySelector('[data-unsaved-workouts]'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; });
      const q = await queueWorkouts(page);
      await shot(page, 'e-not-saved-en');
      await page.evaluate(() => localStorage.setItem('expo-lang', 'he'));
      await portal(page); await wait(2500);
      const bannerHe = await page.evaluate(() => { const b = document.querySelector('[data-unsaved-workouts]'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; });
      await shot(page, 'e-not-saved-he');
      const mid = await markerRows(M);
      check('e', 'a 403/42501 on the upsert parks the workout and shows it as not saved (after a reload too)', closed && !!banner && !!bannerHe && q >= 1 && mid.length === 0, `closed=${closed} queued=${q} rows=${mid.length} en="${banner}" he="${bannerHe}"`);
      block = false;
      await page.evaluate(() => document.querySelector('[data-unsaved-retry]')?.click());
      await pollRows(M, 1, 45000); await wait(3000);
      const rows = await markerRows(M);
      const gone = await page.evaluate(() => !document.querySelector('[data-unsaved-workouts]'));
      check('e', 'unblocked + RETRY → the row lands once and the banner goes', rows.length === 1 && doneOf(rows[0]) === w.ticked && gone, `rows=${rows.length} done=${rows[0] ? doneOf(rows[0]) : '-'} bannerGone=${gone}`);
      clauses.e = true;
    } else check('e', 'could open the day', false);
    await ctx.close(); await cleanup(RUN + '-e');
  }
} catch (e) {
  check('-', 'gate ran to the end', false, String(e && e.message || e).slice(0, 200));
} finally {
  // belt and braces: nothing of this run may stay behind
  let left = 0;
  try { await cleanup(RUN); left = (await markerRows(RUN)).length; } catch (e) { left = -1; }
  check('-', 'cleanup: no rows of this run left', left === 0, `left=${left}`);
  await browser.close().catch(() => {});
  await sb.auth.signOut().catch(() => {});
}

const measured = Object.entries(clauses).filter(([, v]) => v).map(([k]) => k);
const failed = results.filter((r) => !r.ok).length;
console.log(`coverage: clauses measured ${measured.length}/5 [${measured.join(',') || 'none'}] · ${results.length} checks · ${failed} broken · fixture seat only`);
if (measured.length < 5) console.log('FAIL: not every clause was measured — a partial run proves nothing about the rest');
process.exit(failed || measured.length < 5 ? 1 : 0);
