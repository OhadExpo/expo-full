// verify-partner-sandbox.mjs - Elad's seat is a SANDBOX: his own copy, never the real data.
//
// Ohad, 30.9 (#476): "elad copy needs to be perfect by tonight. a perfect clone
// ... so he can review everything" / "fake money but everything ... the ability
// to actually touch or change it (sandbox) - his own version".
//
// Signs in AS the partner (pure node, supabase-js, no browser) and proves:
//   1. the REAL tables return nothing to him and refuse his writes;
//   2. his sbx_ copies hold the data and take his writes (a probe row, removed);
//   3. he is neither staff nor trainer in the database;
//   4. the money he sees is not the real money (owner seat compares).
// Ends every session with signOut({ scope: 'local' }) - a bare signOut is global.
//
//   node scripts/verify-partner-sandbox.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const src = fs.readFileSync('src/supabase.js', 'utf8');
const URL_ = src.match(/SUPA_URL = '([^']+)'/)[1];
const KEY = src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1];
const PARTNER = process.env.PARTNER || 'eladeluz24@gmail.com';
const OWNER = process.env.OWNER || 'ohadyproductions@gmail.com';
const PW = process.env.PW || '1234';
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) { pass++; console.log('  ✓ ' + what); } else { fail++; console.log('  ✗ ' + what); } };

const REAL = ['store', 'plans', 'client_workouts', 'coach_notes', 'bw_logs', 'weekly_focus', 'revenue_month_total', 'bit_payment_requests', 'trainee_evaluations', 'coach_messages'];

const p = mk();
const { error: se } = await p.auth.signInWithPassword({ email: PARTNER, password: PW });
if (se) { console.log('FAIL: partner could not sign in - ' + se.message); process.exit(1); }
const o = mk();
const { error: oe } = await o.auth.signInWithPassword({ email: OWNER, password: PW });
if (oe) { console.log('FAIL: owner could not sign in - ' + oe.message); await p.auth.signOut({ scope: 'local' }); process.exit(1); }
try {
  console.log('1. the REAL tables are closed to him');
  // store: every signed-in account (every athlete too) reads the exercise
  // library, the portal visibility row and presence rows - those three, and
  // nothing else, is the floor; anything more would be a leak to HIM
  const EVERYONE_READS = (k) => k === 'expo-exercises' || k === 'expo-portal-vis' || /^expo-presence/.test(k);
  for (const t of REAL) {
    const { data, error } = await p.from(t).select(t === 'store' ? 'key' : '*').limit(t === 'store' ? 100 : 5);
    const rows = (data || []).filter((r) => t !== 'store' || !EVERYONE_READS(r.key));
    ok(!error && Array.isArray(data) && rows.length === 0, `real ${t}: reads 0 rows${t === 'store' ? ' beyond what every account reads' : ''}${rows.length ? ' - LEAK: ' + rows.map((r) => r.key || r.id).slice(0, 5).join(',') : ''}${error ? ' (error ' + error.code + ')' : ''}`);
  }
  {
    const { error } = await p.from('store').upsert({ key: 'expo-partner-probe', value: [] });
    ok(!!error, `real store: his write is refused${error ? ' (' + error.code + ')' : ' - IT WROTE'}`);
    if (!error) await o.from('store').delete().eq('key', 'expo-partner-probe');
    const { data: pl } = await o.from('plans').select('id').limit(1);
    if (pl && pl[0]) {
      const { data: upd, error: ue } = await p.from('plans').update({ name: 'PARTNER PROBE' }).eq('id', pl[0].id).select('id');
      ok(!ue ? (upd || []).length === 0 : true, 'real plans: his update changes 0 rows');
    }
  }
  console.log('2. his sandbox holds the data and takes his writes');
  for (const t of REAL) {
    const [{ count: mine }, { count: real }] = await Promise.all([
      p.from('sbx_' + t).select('*', { count: 'exact', head: true }),
      o.from(t).select('*', { count: 'exact', head: true }),
    ]);
    ok(mine != null && mine > 0 || real === 0, `sbx_${t}: ${mine} rows (real: ${real})`);
  }
  {
    const { error: we } = await p.from('sbx_store').upsert({ key: 'expo-partner-probe', value: [1] });
    ok(!we, 'sbx_store: his write lands' + (we ? ' - ' + we.message : ''));
    const { data: back } = await p.from('sbx_store').select('value').eq('key', 'expo-partner-probe');
    ok(back && back[0] && JSON.stringify(back[0].value) === '[1]', 'sbx_store: he reads his own write back');
    const { data: realSide } = await o.from('store').select('key').eq('key', 'expo-partner-probe');
    ok((realSide || []).length === 0, 'the real store never saw it');
    await p.from('sbx_store').delete().eq('key', 'expo-partner-probe');
  }
  console.log('3. no staff / trainer powers in the database');
  {
    const { data: pi } = await p.from('sbx_plan_index').select('id').limit(1);
    ok(Array.isArray(pi) && pi.length === 1, 'sbx_plan_index answers him');
    const { error: pe } = await p.rpc('purge_trainee_data', { p_trainee_id: 'nobody_probe' });
    ok(!!pe, 'the REAL purge refuses him' + (pe ? ' (' + (pe.message || '').slice(0, 30) + ')' : ' - IT RAN'));
  }
  console.log('4. the money is fake');
  {
    const [{ data: mine }, { data: real }] = await Promise.all([
      p.from('sbx_revenue_month_total').select('id,amount'), o.from('revenue_month_total').select('id,amount')]);
    const r = new Map((real || []).map((x) => [x.id, Number(x.amount)]));
    const nz = (mine || []).filter((x) => r.get(x.id));
    ok(nz.length > 0 && nz.every((x) => Number(x.amount) !== r.get(x.id)), `revenue totals: ${nz.length} compared, 0 real amounts in his copy`);
  }
} finally {
  await p.auth.signOut({ scope: 'local' });
  await o.auth.signOut({ scope: 'local' });
}
console.log(`\nPARTNER SANDBOX: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
