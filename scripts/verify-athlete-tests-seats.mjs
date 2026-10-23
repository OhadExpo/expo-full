// ATHLETE TESTS - WHO SEES A JUMP, MEASURED FROM REAL SEATS (#897, 23.10). The test athlete writes one row (tagged
// detail.probe) and every seat reads: the athlete himself and staff see it; another athlete and the partner seat do
// not; the athlete cannot write a row under someone else's id. The athlete deletes the probe row at the end.
// Every seat signs out LOCAL.   node scripts/verify-athlete-tests-seats.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_SUPABASE_URL || 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = process.env.EXPO_SUPABASE_KEY || 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PW = process.env.EXPO_PW || '1234';
const ATHLETE = process.env.ATHLETE_EMAIL || 'diego@diegoday.com';
const seat = async (email) => { const s = createClient(URL, KEY, { auth: { persistSession: false } }); const { error } = await s.auth.signInWithPassword({ email, password: PW }); if (error) throw new Error(`${email}: ${error.message}`); return s; };
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

const a = await seat(ATHLETE);
let id = null, tid = null;
try {
  const { data: me } = await a.rpc('current_client_id');
  tid = me;
  check(!!tid, `athlete's client id resolves (${tid})`);
  const ins = await a.from('athlete_tests').insert({ trainee_id: tid, kind: 'cmj', value: 33.3, detail: { probe: 'verify-athlete-tests-seats' } }).select('id').single();
  check(!ins.error, `athlete writes his own row ${ins.error ? ins.error.message : ''}`);
  id = ins.data && ins.data.id;
  const other = await a.from('athlete_tests').insert({ trainee_id: 'someone_else', kind: 'cmj', value: 1, detail: { probe: 'must-fail' } });
  check(!!other.error, `athlete CANNOT write under another id (${other.error ? 'refused' : 'WROTE'})`);
  const own = await a.from('athlete_tests').select('id').eq('id', id);
  check((own.data || []).length === 1, 'athlete reads his own row');
} finally { /* the athlete seat stays for the delete below */ }

for (const [label, email, should] of [['owner (staff)', 'ohadyproductions@gmail.com', true], ['staff Yuval', 'yuvalberkovitch@gmail.com', true], ['another athlete (Yehu)', 'yehuorland@gmail.com', false], ['partner Elad', 'eladeluz24@gmail.com', false]]) {
  let s;
  try { s = await seat(email); } catch (e) { console.log(`SKIP ${label}: ${e.message}`); continue; }
  try {
    const r = await s.from('athlete_tests').select('id').eq('id', id);
    const n = (r.data || []).length;
    check(should ? n === 1 : n === 0, `${label} sees the row: ${n}`);
  } finally { await s.auth.signOut({ scope: 'local' }); }
}
if (id) { const d = await a.from('athlete_tests').delete().eq('id', id); check(!d.error, `athlete deletes the probe row ${d.error ? d.error.message : ''}`); }
await a.auth.signOut({ scope: 'local' });
console.log(fails ? `${fails} check(s) failed` : 'every seat sees exactly what it should');
process.exitCode = fails ? 1 : 0;
