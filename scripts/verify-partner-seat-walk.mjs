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
const OUT = process.env.OUT || `audit-out/partner-walk-${PARTNER ? 'partner' : 'owner'}.json`;
const SBX = new Set(['athlete_app_opens', 'athlete_meals', 'availability_rules', 'bit_payment_requests', 'bookings',
  'bug_reports', 'challenge_participants', 'challenges', 'chat_logs', 'client_workouts', 'coach_booking_settings',
  'coach_messages', 'coach_note_comments', 'coach_note_events', 'coach_notes', 'coach_payment_settings', 'coach_tasks',
  'coaching_contracts', 'intake_submissions', 'intake_tokens', 'invoices', 'leads', 'plans', 'program_shares',
  'revenue_cell_history', 'revenue_month_total', 'revenue_owed', 'revenue_sheet_event', 'store', 'subscriptions',
  'trainee_activity', 'trainee_evaluations', 'trainee_next_actions', 'weekly_focus', 'bw_logs', 'plan_index']);
const routes = (() => {
  const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
  return [...new Set([...md.matchAll(/`(\/coach(?:\/[a-z0-9/-]*)?)`/gi)].map((m) => m[1]))].filter((r) => !/:/.test(r));
})();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.setViewport({ width: 1366, height: 900 });
const res = {}; let cur = 'boot'; const bad = [];
const note = (k, v) => { (res[cur] = res[cur] || { rest: new Set(), errs: [] })[k] instanceof Set ? res[cur][k].add(v) : res[cur][k].push(v); };
pg.on('request', (rq) => { const m = rq.url().match(/\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/); if (m) note('rest', (m[1] ? 'rpc:' : '') + m[2]); });
pg.on('response', (rs) => { if (/supabase\.co\/(rest|storage)\//.test(rs.url()) && rs.status() >= 400) note('errs', rs.status() + ' ' + rs.url().replace(/^.*\/(rest|storage)\/v1\//, '').slice(0, 70)); });
pg.on('pageerror', (e) => note('errs', 'pageerror ' + String(e.message || e).slice(0, 90)));
let fails = 0;
try {
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
    await wait(3500);
    const v = await pg.evaluate(() => ({ len: document.body.innerText.length, saveFail: /SAVE FAILED|not saved|לא נשמר|שמירה נכשלה/i.test(document.body.innerText), banner: /SANDBOX|סביבת ניסוי/.test(document.body.innerText.slice(0, 400)), athletes: document.querySelectorAll('.tv-cards-grid > *').length }));
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
