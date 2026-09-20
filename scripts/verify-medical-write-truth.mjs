// #111 — DOES BEN ACTUALLY HAVE WRITE ACCESS TO BHBC MEDICAL?
//
// _verify-bhbc-medical.mjs says he does. It decides that from `!error` after
// an UPDATE — and an UPDATE that matches ZERO rows is not an error. Under RLS
// a forbidden row is simply invisible to the UPDATE, so PostgREST returns 204
// and the gate reads "write succeeded". That is a false positive, and it is
// the same shape as every other vacuous pass: the check cannot fail.
//
// This one counts the rows that actually changed, by asking the write to
// return them.
import { createClient } from '@supabase/supabase-js';
const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PW = process.env.BHBC_COACH_PASSWORD || '1234';
const MED = 'expo-bhbc-medical';

async function probe(email, expectWrite) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password: PW });
  if (authErr) { console.log(`  ! ${email.padEnd(26)} cannot sign in: ${authErr.message}`); return null; }
  const { data: row } = await sb.from('store').select('key,value').eq('key', MED).maybeSingle();
  const canRead = !!row;
  // Identity write, and ASK FOR THE ROWS BACK. No rows returned = nothing was
  // written, whatever the error field says.
  const { data: wrote, error: wErr } = await sb.from('store')
    .update({ value: row ? row.value : {} }).eq('key', MED).select('key');
  const rows = (wrote || []).length;
  const canWrite = !wErr && rows > 0;
  const ok = canWrite === expectWrite;
  console.log(`  ${ok ? '✓' : '✗'} ${email.padEnd(26)} read=${canRead ? 'yes' : 'NO '} write=${canWrite ? 'YES' : 'no '}`
    + ` (rows changed: ${rows}${wErr ? `, error: ${wErr.code || wErr.message}` : ', no error'})`
    + `  expected ${expectWrite ? 'yes' : 'no'} — ${ok ? 'as expected' : '*** WRONG ***'}`);
  await sb.auth.signOut();
  return ok;
}

console.log(`BHBC medical (${MED}) — write proven by ROWS CHANGED, not by absence of an error\n`);
const r = [];
r.push(await probe('yoel23919@gmail.com', true));        // PT — must write
r.push(await probe('tomerlich11@gmail.com', true));      // PT — must write
r.push(await probe('benshemer4@gmail.com', false));      // coach, not PT — must NOT
r.push(await probe('elishai115@gmail.com', false));      // coach, not PT — must NOT
r.push(await probe('ohadyproductions@gmail.com', true)); // owner — must write
const bad = r.filter((x) => x === false).length;
console.log(`\n${r.filter((x) => x !== null).length} seat(s) checked, ${bad} wrong`);
if (bad) process.exitCode = 1;
