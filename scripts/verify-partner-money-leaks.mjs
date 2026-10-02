// verify-partner-money-leaks.mjs - INDEPENDENT money check of Elad's sandbox (1.10 triple audit).
//
// The first money gate compared only the columns the faker fakes, with the
// faker's own rule - circular: it passed while 294 "basis" texts, 8 auto-task
// notes ("(800/mo)") and on-screen notes still carried the real prices. This
// one does not ask the faker what money is:
//   1. EVERY text/json column of EVERY sbx_ table is compared with its real row
//      (by primary key). Any money token - "₪N", "N ש"ח" (every spelling),
//      "N/mo", "N לחודש", and in price-formula fields "× N" - that is still the
//      real number in the same place is a LEAK.
//      Rows pair by primary key, and by a NATURAL key when a re-sync gave the
//      real row a new id (audit C, 1.10: 53% of revenue_sheet_event went
//      unchecked by id alone); a money table with sandbox rows left unpaired
//      fails - an unchecked row is not a clean one.
//   2. ONE multiplier per athlete, across the roster prices, the sheet events,
//      the owed rows, the cell history and the auto-notes, joined through every
//      name variant of that athlete (sbx_alias, owner-readable).
//   3. every NUMERIC money column (month totals, invoices, subscriptions,
//      contracts, payment requests, payment settings): no value >= 20 equal
//      to the real one.
// Read-only, as the owner (supabase-js), local sign-out.
//
//   node scripts/verify-partner-money-leaks.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const src = fs.readFileSync('src/supabase.js', 'utf8');
const db = createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (c, w) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + w); };

const TABLES = ['athlete_app_opens', 'athlete_meals', 'availability_rules', 'bit_payment_requests', 'bookings', 'bug_reports',
  'challenge_participants', 'challenges', 'chat_logs', 'client_workouts', 'coach_booking_settings', 'coach_messages',
  'coach_note_comments', 'coach_note_events', 'coach_notes', 'coach_payment_settings', 'coach_tasks', 'coaching_contracts',
  'intake_submissions', 'intake_tokens', 'invoices', 'leads', 'plans', 'program_shares', 'revenue_cell_history',
  'revenue_month_total', 'revenue_owed', 'revenue_sheet_event', 'store', 'subscriptions', 'trainee_activity',
  'trainee_evaluations', 'trainee_next_actions', 'weekly_focus', 'bw_logs'];
const PK = { store: 'key', intake_tokens: 'token' };
// natural keys: a real row that a re-sync re-created (new id) still pairs with its copy
const NK = {
  revenue_sheet_event: ['source', 'sheet_id', 'section', 'event_kind', 'event_date', 'first_seen_rev', 'sessions_count', 'trainee_id'],
  revenue_cell_history: ['sheet_id', 'rev', 'tab', 'section', 'field', 'client_name'],
  revenue_owed: ['section', 'trainee_id', 'client_name', 'last_payment'],
  revenue_month_total: ['month', 'channel'],
  intake_tokens: ['form_type', 'trainee_id', 'label', 'created_at'],
};
const MONEY_TABLES = new Set(['revenue_sheet_event', 'revenue_cell_history', 'revenue_owed', 'revenue_month_total', 'invoices', 'subscriptions', 'coaching_contracts', 'bit_payment_requests', 'coach_payment_settings']);
// fields that ARE a price (every number >= 20 not a block/date is money) and fields that hold a "× rate" formula
const PRICE_FIELDS = new Set(['revenue_sheet_event.rate_text', 'revenue_owed.price_text']);
const TIMES_FIELDS = new Set(['revenue_owed.method', 'revenue_sheet_event.basis']);
// every way a price is written in his sheets/notes - INDEPENDENT of the faker's own list (audit C M1:
// "70 לאימון" passed both while the gate reused the faker's vocabulary)
const MARK = String.raw`(?:ש"ח|ש״ח|שייח|ש"י|ש\\"ח|₪|/mo|/חודש|\s*לחודש|\s*שח(?![א-ת])|\s*שקל|\s*NIS\b|\s*ILS\b|\s*nis\b|\s*לאימון|\s*לשיעור|/אימון|\s*per session|\s*a month)`;
const NUM = String.raw`[0-9][0-9,]*(?:\.[0-9]+)?`;
const n = (x) => Number(String(x).replace(/,/g, ''));
function moneyTokens(text, { price = false, times = false } = {}) {
  const s = String(text == null ? '' : text);
  const out = [];
  const re = new RegExp(String.raw`₪\s*(${NUM})|(${NUM})\s*${MARK}` + (times ? String.raw`|×\s*(${NUM})` : ''), 'g');
  for (const m of s.matchAll(re)) out.push(n(m[1] || m[2] || m[3]));
  if (price && !out.length) {
    if (/^\s*[0-9][0-9,]*(\.[0-9]+)?\s*$/.test(s)) out.push(n(s));
    else for (const m of s.matchAll(/[0-9][0-9,]*[0-9]|[0-9]/g)) {
      const prev = s[m.index - 1] || '', nx = s[m.index + m[0].length] || '', nx2 = s[m.index + m[0].length + 1] || '';
      if (prev !== '#' && prev !== '.' && !(nx === '.' && /[0-9]/.test(nx2)) && n(m[0]) >= 20) out.push(n(m[0]));
    }
  }
  return out;
}
async function all(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const { error: se } = await db.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: process.env.PW || '1234' });
if (se) { console.log('FAIL: owner sign-in - ' + se.message); process.exit(1); }
try {
  console.log('1. no real money left in ANY text/json column of the sandbox');
  let scanned = 0, withMoney = 0, leaks = 0; const examples = []; const unpairedMoney = [];
  const cache = {};
  for (const t of TABLES) {
    const [real, mine] = await Promise.all([all(t), all('sbx_' + t)]);
    cache[t] = { real, mine };
    const key = PK[t] || 'id';
    const byId = new Map(real.map((r) => [String(r[key]), r]));
    const nk = NK[t] && ((r) => NK[t].map((c) => String(r[c])).join('|'));
    const byNk = nk && new Map(real.map((r) => [nk(r), r]));
    let unpaired = 0;
    for (const x of mine) {
      const y = byId.get(String(x[key])) || (byNk && byNk.get(nk(x)));
      if (!y) { unpaired++; continue; }
      for (const col of Object.keys(y)) {
        const rv = y[col];
        if (rv == null || typeof rv === 'number' || typeof rv === 'boolean') continue;
        const rt = typeof rv === 'string' ? rv : JSON.stringify(rv);
        if (!/[0-9]/.test(rt)) continue;
        scanned++;
        const f = `${t}.${col}`;
        // price fields inside cell history are per-row (the 'field' column says which)
        const price = PRICE_FIELDS.has(f) || (t === 'revenue_cell_history' && col === 'value' && ['price_month', 'price_session'].includes(y.field));
        const opts = { price, times: TIMES_FIELDS.has(f) };
        const rTok = moneyTokens(rt, opts);
        if (!rTok.length) continue;
        withMoney++;
        const xv = x[col];
        const mTok = moneyTokens(typeof xv === 'string' ? xv : JSON.stringify(xv), opts);
        const same = rTok.filter((v, i) => mTok[i] === v && v !== 0);
        if (same.length) { leaks++; if (examples.length < 6) examples.push(`${f} [${y[key]}] real ${rTok.join('/')} = sandbox ${mTok.join('/')}`); }
      }
    }
    cache[t].unpaired = unpaired;
    if (MONEY_TABLES.has(t) && unpaired) unpairedMoney.push(`${t}: ${unpaired} of ${mine.length} sandbox rows have no real row by id${nk ? ' or natural key' : ''}`);
  }
  ok(!unpairedMoney.length, `every sandbox row of the ${MONEY_TABLES.size} money tables was paired with its real row and checked${unpairedMoney.length ? '\n      ' + unpairedMoney.join('\n      ') : ''}`);
  ok(withMoney > 0 && leaks === 0, `${scanned} text/json values scanned, ${withMoney} hold money, ${leaks} still show a real amount${examples.length ? '\n      ' + examples.join('\n      ') : ''}`);

  console.log('2. one multiplier per athlete, across every table and every name variant');
  const { data: alias } = await db.from('sbx_alias').select('name,athlete');
  const aka = new Map((alias || []).map((a) => [a.name, a.athlete]));
  const who = (name, tid) => tid || aka.get(name) || name;
  const ratios = new Map();
  const add = (a, rv, fv, where) => {
    if (!a || rv == null || fv == null) return;
    const r = Number(rv), f = Number(fv);
    if (!(r >= 20) || !isFinite(f)) return;
    if (!ratios.has(a)) ratios.set(a, []);
    ratios.get(a).push({ k: f / r, where });
  };
  const pair = (t, key, fn) => { const byId = new Map(cache[t].real.map((r) => [String(r[key]), r])); for (const x of cache[t].mine) { const y = byId.get(String(x[key])); if (y) fn(y, x); } };
  pair('revenue_sheet_event', 'id', (y, x) => {
    const a = who(y.client_name, y.trainee_id);
    add(a, y.rate_amount, x.rate_amount, 'event.rate'); add(a, y.amount_est, x.amount_est, 'event.est');
    for (const c of ['basis', 'notes', 'counter_before', 'counter_after', 'sessions_text']) {
      const r = moneyTokens(y[c], { times: c === 'basis' }), m = moneyTokens(x[c], { times: c === 'basis' });
      r.forEach((v, i) => add(a, v, m[i], 'event.' + c));
    }
  });
  pair('revenue_owed', 'id', (y, x) => {
    const a = who(y.client_name, y.trainee_id);
    add(a, y.amount, x.amount, 'owed.amount');
    const r = moneyTokens(y.method, { times: true }), m = moneyTokens(x.method, { times: true });
    r.forEach((v, i) => add(a, v, m[i], 'owed.method'));
  });
  pair('revenue_cell_history', 'id', (y, x) => {
    if (!['price_month', 'price_session'].includes(y.field)) return;
    const r = moneyTokens(y.value, { price: true }), m = moneyTokens(x.value, { price: true });
    r.forEach((v, i) => add(who(y.client_name, null), v, m[i], 'cell.' + y.field));
  });
  pair('coach_notes', 'id', (y, x) => {
    const r = moneyTokens(y.body), m = moneyTokens(x.body);
    r.forEach((v, i) => add(y.target_id, v, m[i], 'note'));
  });
  {
    const rr = (cache.store.real.find((s) => s.key === 'expo-trainees') || {}).value || [];
    const mm = new Map(((cache.store.mine.find((s) => s.key === 'expo-trainees') || {}).value || []).map((t) => [t.id, t]));
    for (const t of rr) { const f = mm.get(t.id); if (!f) continue; for (const c of ['monthly', 'monthlyPrice', 'packagePrice', 'perSession', 'sessionPrice']) add(t.id, t[c], f[c], 'roster.' + c); }
  }
  const split = [];
  for (const [a, list] of ratios) {
    const ks = list.map((l) => l.k);
    const lo = Math.min(...ks), hi = Math.max(...ks);
    if (hi / lo > 1.02) split.push(`${a}: ${[...new Set(list.map((l) => `${l.where} x${l.k.toFixed(3)}`))].slice(0, 5).join(', ')}`);
  }
  ok(ratios.size > 20 && split.length === 0, `${ratios.size} athletes, ${[...ratios.values()].reduce((s, l) => s + l.length, 0)} money values: ${split.length} athletes scaled by more than one multiplier${split.length ? '\n      ' + split.slice(0, 6).join('\n      ') : ''}`);

  console.log('3. no real amount left in a NUMERIC money column');
  const NUMERIC = { revenue_month_total: ['amount'], invoices: ['amount'], subscriptions: ['amount'], coaching_contracts: ['monthly_rate'],
    bit_payment_requests: ['amount', 'paid_amount'], coach_payment_settings: ['default_monthly'], revenue_owed: ['amount'], revenue_sheet_event: ['rate_amount', 'amount_est'] };
  let numChecked = 0; const numLeaks = [];
  for (const [t, cols] of Object.entries(NUMERIC)) {
    const key = PK[t] || 'id';
    const byId = new Map(cache[t].real.map((r) => [String(r[key]), r]));
    const nk = NK[t] && ((r) => NK[t].map((c) => String(r[c])).join('|'));
    const byNk = nk && new Map(cache[t].real.map((r) => [nk(r), r]));
    for (const x of cache[t].mine) {
      const y = byId.get(String(x[key])) || (byNk && byNk.get(nk(x)));
      if (!y) continue;
      for (const c of cols) {
        if (y[c] == null || !(Math.abs(Number(y[c])) >= 20)) continue;
        numChecked++;
        if (Number(x[c]) === Number(y[c])) numLeaks.push(`${t}.${c} [${y[key]}] ${y[c]}`);
      }
    }
  }
  ok(numChecked > 50 && !numLeaks.length, `${numChecked} numeric amounts checked across ${Object.keys(NUMERIC).length} tables: ${numLeaks.length} still the real number${numLeaks.length ? '\n      ' + numLeaks.slice(0, 6).join('\n      ') : ''}`);
} catch (e) { fail++; console.log('FAIL: ' + e.message); }
finally { await db.auth.signOut({ scope: 'local' }); }
console.log(`\nPARTNER MONEY LEAKS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
