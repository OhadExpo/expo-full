// verify-billing-rows.mjs — every billing row must resolve to a real athlete.
//
// One of Ohad's older open items reads only "billing parse rows"; the original
// complaint text survives in no document. The literal reading is the one worth
// checking: a payment request whose trainee_id does not resolve to anybody on
// the roster shows up on /coach/billing as a row with no name, and the ROSTER
// STATUS block keyed by the couple's PARENT id shows "NO REQUEST" for an
// athlete who has in fact paid (that is what parseTraineeId's tr_x__0/__1
// rollup in BillingView exists for).
//
// So this checks the data behind that screen:
//   1. every bit_payment_requests.trainee_id resolves - directly, or through
//      the couple sub-member rollup - to a trainee that exists;
//   2. no request carries a null/zero amount (the column is NOT NULL precisely
//      so no reconstructed history lands here, see CLAUDE.md);
//   3. no request has a status the screen does not render.
//
//   node scripts/verify-billing-rows.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// NOT named URL: that shadows the global URL constructor the line below needs.
const SUPA = process.env.SUPA_URL || 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
// The publishable key is the one the browser already ships; scripts/ reads it
// from the same single source so the two can never drift.
const KEY = process.env.SUPA_ANON
  || (readFileSync(new URL('../src/supabase.js', import.meta.url), 'utf8').match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/) || [])[1];
const EMAIL = process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com';
const PW = process.env.EXPO_PW || '1234';

if (!KEY) {
  console.log('FAILED: no anon key in SUPA_ANON / VITE_SUPABASE_ANON_KEY - the check cannot run, and a silent pass would be worse.');
  process.exit(1);
}

const sb = createClient(SUPA, KEY, { auth: { persistSession: false } });
const { error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PW });
if (authErr) { console.log('FAILED: could not sign in as the owner - ' + authErr.message); process.exit(1); }

const parseTraineeId = (tid) => {
  const m = typeof tid === 'string' ? tid.match(/^(.+)__(\d+)$/) : null;
  return m ? { parentId: m[1], memberIdx: Number(m[2]) } : null;
};
const RENDERED = new Set(['pending', 'paid', 'cancelled', 'canceled', 'refunded']);

const { data: reqs, error: rErr } = await sb.from('bit_payment_requests').select('id,trainee_id,amount,status,created_at');
if (rErr) { console.log('FAILED: could not read bit_payment_requests - ' + rErr.message); process.exit(1); }

// The roster lives in the store blob, not a table.
const { data: store, error: sErr } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
if (sErr) { console.log('FAILED: could not read the roster - ' + sErr.message); process.exit(1); }
const trainees = Array.isArray(store?.value) ? store.value : (store?.value?.data || []);
if (!Array.isArray(trainees) || !trainees.length) {
  console.log('FAILED: the roster came back empty, so "every row resolves" would be vacuously false rather than measured.');
  process.exit(1);
}
const ids = new Set(trainees.map((t) => t && t.id).filter(Boolean));

const bad = [];
for (const r of reqs || []) {
  const parsed = parseTraineeId(r.trainee_id);
  const resolves = ids.has(r.trainee_id) || (parsed && ids.has(parsed.parentId));
  if (!resolves) bad.push(`row ${r.id}: trainee_id "${r.trainee_id}" is on no athlete - it renders as a nameless row`);
  const amt = Number(r.amount);
  if (!Number.isFinite(amt) || amt <= 0) bad.push(`row ${r.id}: amount is ${JSON.stringify(r.amount)} - the column is NOT NULL so this should be impossible`);
  if (r.status && !RENDERED.has(String(r.status).toLowerCase())) bad.push(`row ${r.id}: status "${r.status}" is not one the billing screen renders`);
}

console.log(`${(reqs || []).length} payment request(s) against ${ids.size} athletes`);
for (const x of bad) console.log('  ' + x);
if (!reqs || !reqs.length) {
  // Never say "all rows are fine" about no rows. Measured 18.9: ZERO payment
  // requests exist against 32 athletes, which is why /coach/billing is empty
  // and why the dashboard reads its Collected MTD off the finance sheet. That
  // is a fact about the business, not a defect - so this does not fail - but
  // it must not read as a clean bill of health either.
  console.log('NOTHING TO CHECK - there are no payment requests at all. The billing screen is empty because nothing has ever been written to bit_payment_requests, not because the rows are good.');
  process.exit(0);
}
console.log(bad.length ? `${bad.length} unresolvable/invalid row(s)` : `0 - all ${reqs.length} billing rows resolve to a real athlete`);
process.exit(bad.length ? 1 : 0);
