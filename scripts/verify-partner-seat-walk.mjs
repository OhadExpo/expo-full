// verify-partner-seat-walk.mjs - the partner's SANDBOX seat, route by route (#476).
//
// Signed in AS the partner (EXPO_EMAIL), in a throwaway context of the headless
// Chrome, it opens every /coach route in docs/SURFACES.md and records:
//   - every REST call: a sandboxed table must be hit as sbx_<table>, never raw
//     (a raw hit = a path supabase.js did not redirect - it would read nothing);
//   - HTTP 4xx/5xx from Supabase, "SAVE FAILED"/"not saved" text, page errors;
//   - how much the page shows (text length) - an empty page is a bug.
// Run it once as the owner too (SEAT=owner) and compare the text lengths: a
// clone shows what the owner sees.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5268 EXPO_EMAIL=eladeluz24@gmail.com node scripts/verify-partner-seat-walk.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5268';
const EMAIL = (process.env.EXPO_EMAIL || '').toLowerCase();
const PARTNER = EMAIL === 'eladeluz24@gmail.com';
const OUT = process.env.OUT || `audit-out/partner-walk-${PARTNER ? 'partner' : 'owner'}${process.env.ATHLETES ? '-athletes' : ''}${process.env.EXPAND ? '-expanded' : ''}${process.env.SET ? '-' + process.env.SET : ''}${process.env.THEME ? '-' + process.env.THEME : ''}-${process.env.W || 1366}-${process.env.LANG_UI || 'en'}.json`;
const SBX = new Set(['athlete_app_opens', 'athlete_meals', 'availability_rules', 'bit_payment_requests', 'bookings',
  'bug_reports', 'challenge_participants', 'challenges', 'chat_logs', 'client_workouts', 'coach_booking_settings',
  'coach_messages', 'coach_note_comments', 'coach_note_events', 'coach_notes', 'coach_payment_settings', 'coach_tasks',
  'coaching_contracts', 'intake_submissions', 'intake_tokens', 'invoices', 'leads', 'plans', 'program_shares',
  'revenue_cell_history', 'revenue_month_total', 'revenue_owed', 'revenue_sheet_event', 'store', 'subscriptions',
  'trainee_activity', 'trainee_evaluations', 'trainee_next_actions', 'weekly_focus', 'bw_logs', 'plan_index']);
// ATHLETES=1: every athlete's own page instead of the menu routes (ids read
// from the owner's roster - the sandbox copy has the same ids). W=390 walks it
// as a phone (real device emulation), LANG=he in Hebrew. LIMIT=n caps the list.
const W = Number(process.env.W || 1366), PHONE = W < 700, LANG = process.env.LANG_UI || 'en';
let routes = (() => {
  const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
  return [...new Set([...md.matchAll(/`(\/coach(?:\/[a-z0-9/-]*)?)`/gi)].map((m) => m[1]))].filter((r) => !/:/.test(r));
})();
if (process.env.ATHLETES) {
  const src0 = fs.readFileSync('src/supabase.js', 'utf8');
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(src0.match(/SUPA_URL = '([^']+)'/)[1], src0.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: process.env.PW || '1234' });
  const { data } = await db.from('store').select('value').eq('key', 'expo-trainees');
  await db.auth.signOut({ scope: 'local' });
  routes = ((data && data[0] && data[0].value) || []).filter((t) => t && t.id && !t.bhbcGhost && t.status !== 'archived').map((t) => '/coach/athletes/' + t.id);
}
// SET=athlete-previews | programs | program-previews: every athlete's portal
// preview, every program's editor, every program's preview (ids read as the owner)
if (process.env.SET) {
  const src1 = fs.readFileSync('src/supabase.js', 'utf8');
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(src1.match(/SUPA_URL = '([^']+)'/)[1], src1.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: process.env.PW || '1234' });
  if (process.env.SET === 'athlete-previews') {
    const { data } = await db.from('store').select('value').eq('key', 'expo-trainees');
    routes = ((data && data[0] && data[0].value) || []).filter((t) => t && t.id && !t.bhbcGhost && t.status !== 'archived').map((t) => '/coach/athletes/' + t.id + '/preview');
  } else {
    const { data } = await db.from('plan_index').select('id').order('updated_at', { ascending: false });
    routes = (data || []).map((x) => '/coach/programs/' + x.id + (process.env.SET === 'program-previews' ? '/preview' : ''));
  }
  await db.auth.signOut({ scope: 'local' });
}
if (process.env.LIMIT) routes = routes.slice(0, Number(process.env.LIMIT));
if (process.env.ONLY) routes = routes.filter((r) => process.env.ONLY.split(',').some((o) => r.endsWith(o)));
if (process.env.REPEAT) routes = Array.from({ length: Number(process.env.REPEAT) }, () => routes).flat();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.emulate({ viewport: { width: W, height: PHONE ? 844 : 900, deviceScaleFactor: PHONE ? 3 : 1, isMobile: PHONE, hasTouch: PHONE },
  userAgent: PHONE ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36' });
const res = {}; let cur = 'boot'; const bad = [];
const note = (k, v) => { (res[cur] = res[cur] || { rest: new Set(), errs: [] })[k] instanceof Set ? res[cur][k].add(v) : res[cur][k].push(v); };
pg.on('request', (rq) => { const m = rq.url().match(/\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/); if (m) note('rest', (m[1] ? 'rpc:' : '') + m[2]); });
pg.on('response', (rs) => { if (/supabase\.co\/(rest|storage)\//.test(rs.url()) && rs.status() >= 400) note('errs', rs.status() + ' ' + rs.url().replace(/^.*\/(rest|storage)\/v1\//, '').slice(0, 70)); });
pg.on('pageerror', (e) => note('errs', 'pageerror ' + String(e.message || e).slice(0, 90)));
let fails = 0;
try {
  await pg.evaluateOnNewDocument((l, th) => { try { localStorage.setItem('expo-lang', l); if (th) localStorage.setItem('expo-theme', th); } catch (e) {} }, LANG, process.env.THEME || '');
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
  let ok = false; for (let k = 0; k < 3 && !ok; k++) { await signIn(pg, BASE); ok = await assertAuthed(pg, BASE); }
  if (!ok) throw new Error('could not sign in as ' + EMAIL);
  const who = await pg.evaluate(() => { try { const k = Object.keys(localStorage).find((x) => /-auth-token$/.test(x)); return JSON.parse(localStorage.getItem(k)).user.email; } catch { return null; } });
  if (String(who).toLowerCase() !== EMAIL) throw new Error(`WRONG SEAT: signed in as ${who}, expected ${EMAIL}`);
  console.log(`seat: ${who}  sandbox flag: ${await pg.evaluate(() => window.__expoSandbox)}`);
  for (const r of routes) {
    cur = r;
    await pg.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let k = 0; k < 20; k++) { await wait(700); if (await pg.evaluate(() => !/LOADING DATA/.test(document.body.innerText.slice(0, 300)))) break; }
    // past the loading splash too, not only LOADING DATA: under load a lazy view can sit on its
    // 12-character fallback for seconds (a measurement of the splash is not a measurement)
    for (let k = 0; k < 30; k++) { if (await pg.evaluate(() => document.body.innerText.trim().length > 60)) break; await wait(500); }
    await wait(3500);
    // EXPAND=1: open every closed section (nested ones appear as their parent opens)
    if (process.env.EXPAND) {
      for (let pass = 0; pass < 4; pass++) {
        const n = await pg.evaluate(() => { const c = [...document.querySelectorAll('.title-strip[aria-expanded="false"]')]; c.forEach((x) => x.click()); return c.length; });
        if (!n) break; await wait(1500);
      }
      res[r] = res[r] || { rest: new Set(), errs: [] };
      res[r].closedLeft = await pg.evaluate(() => document.querySelectorAll('.title-strip[aria-expanded="false"]').length);
    }
    if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/${r.replace(/\//g, '_')}-${Date.now()}.png` });
    const v = await pg.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth, onPage: location.pathname, len: document.body.innerText.length, saveFail: /SAVE FAILED|השמירה נכשלה|NOT SAVED YET|עוד לא נשמר/i.test(document.body.innerText) /* the app's own error strings - 'nothing is saved to the athlete' is copy, not an error */, banner: /SANDBOX|סביבת ניסוי/.test(document.body.innerText.slice(0, 400)), athletes: document.querySelectorAll('.tv-cards-grid > *').length }));
    const e = res[r] || { rest: new Set(), errs: [] };
    const raw = [...e.rest].filter((t) => SBX.has(t));
    const problems = [];
    if (PARTNER && raw.length) problems.push('RAW (unredirected): ' + raw.join(','));
    // and the other way round: a seat that is NOT the partner must never touch the sandbox
    if (!PARTNER && [...e.rest].some((t) => /^(rpc:)?sbx_/.test(t))) problems.push('OWNER HIT THE SANDBOX: ' + [...e.rest].filter((t) => /sbx_/.test(t)).join(','));
    if (e.errs.length) problems.push('HTTP/page: ' + e.errs.slice(0, 4).join(' | '));
    if (v.saveFail) problems.push('save-failed text on screen');
    if (PARTNER && !v.banner) problems.push('no SANDBOX banner');
    if (v.len < 100) problems.push(`near-empty page (${v.len} chars)`);
    if (process.env.THEME && v.theme !== process.env.THEME) problems.push(`theme is ${v.theme}, not ${process.env.THEME}`);
    if (v.over > 1) problems.push(`page scrolls sideways ${v.over}px`);
    if ((process.env.ATHLETES || process.env.SET) && v.onPage !== r) problems.push(`bounced to ${v.onPage}`);
    res[r] = { rest: [...e.rest], errs: e.errs, ...v, problems };
    if (problems.length) fails++;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${r.padEnd(34)} text ${String(v.len).padStart(6)}${v.athletes ? '  athletes ' + v.athletes : ''}  ${problems.join(' ; ')}`);
  }
} catch (e) { fails++; console.log('FAIL: ' + e.message); }
finally {
  try { await pg.evaluate(async () => { const m = await import('/src/supabase.js').catch(() => null); if (m) await m.supabase.auth.signOut({ scope: 'local' }); }); } catch { /* built bundle: the context close below drops the session */ }
  await ctx.close(); b.disconnect();
}
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(`\n${routes.length} routes, ${fails} with problems -> ${OUT}`);
process.exit(fails ? 1 : 0);
