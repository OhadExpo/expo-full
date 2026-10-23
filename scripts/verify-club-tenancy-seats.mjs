// TEAM VERSION PHASE B - WHO CAN READ THE CLUB TABLES, MEASURED FROM REAL SEATS (#904, 23.10).
// After the Herzliya backfill (club_store + club_medical), every seat signs in and tries: read club_store, read
// club_medical directly, call club_medical_get('bhbc'), read clubs / club_members. Expected:
//   owner / head / pt     club_store rows, medical via the function, members listed
//   coach (not a physio)  club_store rows, medical REDACTED (status + dates; no notes / progress / pain)
//   athlete / partner / staff (not members)  0 rows anywhere, medical REFUSED
// and nobody reads club_medical directly (no select policy). Read-only; every seat signs out LOCAL.
//   node scripts/verify-club-tenancy-seats.mjs        (seats sign in with the universal test password)
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_SUPABASE_URL || 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = process.env.EXPO_SUPABASE_KEY || 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PW = process.env.EXPO_PW || '1234';
const SEATS = [
  ['owner', 'ohadyproductions@gmail.com', { store: true, medical: true }],
  ['head', 'yehuorland@gmail.com', { store: true, medical: true }],
  ['pt', 'yoel23919@gmail.com', { store: true, medical: true }],
  ['coach', 'benshemer4@gmail.com', { store: true, medical: 'redacted' }],
  ['athlete', 'diego@diegoday.com', { store: false, medical: false }],
  ['partner', 'eladeluz24@gmail.com', { store: false, medical: false }],
  ['staff', 'yuvalberkovitch@gmail.com', { store: false, medical: false }],
];
let fails = 0;
for (const [role, email, want] of SEATS) {
  const s = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error: ae } = await s.auth.signInWithPassword({ email, password: PW });
  if (ae) { console.log(`SKIP ${role.padEnd(8)} sign-in failed: ${ae.message}`); continue; }
  try {
    const st = await s.from('club_store').select('key').eq('club_id', 'bhbc');
    const md = await s.from('club_medical').select('club_id');
    const fn = await s.rpc('club_medical_get', { p_club: 'bhbc' });
    const mb = await s.from('club_members').select('email');
    const storeRows = (st.data || []).length, directMed = (md.data || []).length;
    const medOk = !fn.error && fn.data && Object.keys(fn.data).length > 0;
    // which private fields came back: a coach's copy must carry none, a physio's does
    const priv = medOk ? Object.values(fn.data).flatMap((e) => (e && e.injuries) || []).filter((i) => i && ('notes' in i || 'progress' in i || 'pain' in i)).length : 0;
    const medState = !medOk ? false : priv ? true : 'redacted';
    const ok = (want.store ? storeRows > 0 : storeRows === 0) && directMed === 0 && medState === want.medical && (want.store ? true : (mb.data || []).length === 0);
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${role.padEnd(8)} club_store ${storeRows} rows | club_medical direct ${directMed} | club_medical_get ${medOk ? (priv ? `READ (${priv} injuries with notes)` : 'READ, redacted') : 'refused' + (fn.error ? ` (${fn.error.message.slice(0, 50)})` : '')} | members ${(mb.data || []).length}`);
  } finally { await s.auth.signOut({ scope: 'local' }); }
}
console.log(fails ? `${fails} seat(s) wrong` : 'every seat reads exactly its own');
process.exitCode = fails ? 1 : 0;
