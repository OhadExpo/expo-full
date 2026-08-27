// Who can write what in the BHBC store. Asserts the WHOLE matrix, not the one
// case that prompted it.
//
// Every check writes a key's EXISTING value straight back: a real round-trip
// through RLS that changes nothing. Signing in is not the same as being allowed
// to write, and the UI hiding a button is not the same as the database
// refusing one — that gap is exactly what this exists to catch.
//
// Run after scripts/migrations/2026-08-26-bhbc-coach-write-scope.sql.
import { createClient } from '@supabase/supabase-js';

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PW = process.env.BHBC_COACH_PASSWORD || '1234';

const PT = 'yoel23919@gmail.com';
// Second PT added 2026-08-27. Both must hold the same rights, or one of them
// is a PT in the UI and a plain coach in the database.
const PT2 = 'tomerlich11@gmail.com';
const COACH = 'benshemer4@gmail.com';
const OWNER = 'ohadyproductions@gmail.com';

// [who, key, may write?, why]
const MATRIX = [
  [PT,    'expo-bhbc-medical', true,  'the PT reports and edits injuries — this is the job'],
  [PT2,   'expo-bhbc-medical', true,  'the second PT holds identical medical rights'],
  [COACH, 'expo-bhbc-medical', false, 'a regular coach sees the medical board READ-ONLY'],
  [OWNER, 'expo-bhbc-medical', true,  'the owner can do everything'],
  [COACH, 'expo-exercises',    false, 'the shared library belongs to the whole business'],
  [PT,    'expo-exercises',    false, 'the PT is not special outside medical'],
  [PT2,   'expo-exercises',    false, 'nor is the second PT'],
  [PT2,   'expo-bhbc-loads',   true,  'a PT is also a coach — the zone must work for him'],
  [COACH, 'expo-bhbc-loads',   true,  'logging load IS a coach job — must not regress'],
  [COACH, 'expo-bhbc-roster',  true,  'roster upkeep is a coach job'],
  [COACH, 'expo-bhbc-plans',   true,  'session plans are a coach job'],
];

let pass = 0, fail = 0;
const sessions = new Map();

async function clientFor(email) {
  if (sessions.has(email)) return sessions.get(email);
  const sb = createClient(URL, ANON);
  const { error } = await sb.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email} cannot sign in: ${error.message}`);
  sessions.set(email, sb);
  return sb;
}

console.log('BHBC STORE WRITE SCOPE\n');

for (const [email, key, mayWrite, why] of MATRIX) {
  let sb;
  try { sb = await clientFor(email); } catch (e) { console.log('  x ' + e.message); fail++; continue; }
  const { data } = await sb.from('store').select('key,value').eq('key', key).maybeSingle();
  if (!data) { console.log(`  x ${email.split('@')[0]} cannot even READ ${key}`); fail++; continue; }
  // COUNT THE ROWS AFFECTED. A write blocked by a RESTRICTIVE policy - or by
  // there being no permissive policy at all - matches ZERO rows and returns NO
  // error: PostgREST reports plain success. Reading `!error` as "allowed" made
  // this file report 5 passes on 2026-08-27 while a coach's every save was
  // silently hitting nothing. .select() returns the affected rows, so an empty
  // array is the truth.
  const { data: rows, error } = await sb.from('store').update({ value: data.value }).eq('key', key).select('key');
  const can = !error && Array.isArray(rows) && rows.length > 0;
  const ok = can === mayWrite;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${email.split('@')[0].padEnd(18)} ${key.padEnd(20)} write=${String(can).padEnd(5)} expected=${String(mayWrite).padEnd(5)} ${ok ? '' : '<-- ' + why}`);
}

for (const sb of sessions.values()) { try { await sb.auth.signOut(); } catch { /* noop */ } }
console.log(`\nBHBC WRITE SCOPE: ${pass} passed, ${fail} failed`);
if (fail) console.log('Apply the BHBC migrations in scripts/migrations/ (write-scope ceiling + coach write policy).');
process.exit(fail ? 1 : 0);
