// THE ATHLETE'S CONTRACT WITH THE DATABASE, FROM THE ATHLETE'S SEAT.
//
// Signs in as the test fixture athlete with the public key (exactly what the
// app does) and asserts, against the live project:
//   - what the portal READS is readable (exercises, portal visibility, own plans)
//   - the roster row is invisible to it (0 rows, no error) — not an error the
//     app would surface
//   - the athlete's OWN writes round-trip (a marker row in client_workouts,
//     inserted and deleted)
//   - a write it must not make (the roster row) is refused by RLS — 42501 — so
//     the client-side fence in src/seatWrite.js is the first line and not the
//     only one
//
//   node scripts/verify-portal-rls.mjs        (exit 1 on any broken clause)
//   EXPO_EMAIL / EXPO_PW to use another athlete seat.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const src = fs.readFileSync(new URL('../src/supabase.js', import.meta.url), 'utf8');
const URL_ = (src.match(/SUPA_URL = '([^']+)'/) || [])[1];
const KEY = (src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/) || [])[1];
if (!URL_ || !KEY) { console.log('FAIL: could not read the project URL / publishable key from src/supabase.js'); process.exit(1); }
const EMAIL = process.env.EXPO_EMAIL || 'diego@diegoday.com';
const PW = process.env.EXPO_PW || '1234';

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PW });
if (authErr || !auth || !auth.user) { console.log(`FAIL: sign-in as ${EMAIL}: ${authErr && authErr.message}`); process.exit(1); }
const uid = auth.user.id;
console.log(`seat: ${EMAIL}`);

// reads the portal depends on
for (const key of ['expo-exercises', 'expo-portal-vis']) {
  const { data, error } = await sb.from('store').select('key').eq('key', key);
  check(`can read store row ${key}`, !error && Array.isArray(data) && data.length === 1, error ? error.message : `${data ? data.length : 0} row(s)`);
}
{
  const { data, error } = await sb.from('store').select('key').eq('key', 'expo-trainees');
  check('roster row is invisible, not an error', !error && Array.isArray(data) && data.length === 0, error ? error.message : `${data ? data.length : 0} row(s)`);
}
{
  const { data, error } = await sb.from('plans').select('id').limit(1);
  check('can read own plans', !error, error ? error.message : `${data ? data.length : 0} row(s) sampled`);
}
{
  const { data, error } = await sb.from('client_workouts').select('id').limit(1);
  check('can read own workouts', !error, error ? error.message : `${data ? data.length : 0} row(s) sampled`);
}

// the athlete's own write round-trips — client_workouts is keyed to the athlete's
// client id (policy: client_id = current_client_id()), which the app learns from
// the my_trainee RPC; the probe learns it the same way
const markerId = `rls-probe-${uid.slice(0, 8)}-${Date.now()}`;
{
  const { data: me, error: meErr } = await sb.rpc('my_trainee');
  const myId = me && (Array.isArray(me) ? (me[0] && me[0].id) : me.id);
  check('my_trainee resolves the athlete to a client id', !meErr && !!myId, meErr ? meErr.message : (myId ? 'resolved' : 'no id in the RPC result'));
  let { error } = await sb.from('client_workouts').upsert({ id: markerId, client_id: myId || 'unresolved', date: new Date().toISOString(), notes: 'rls-probe' });
  check('own workout write round-trips (insert)', !error, error ? `${error.code} ${error.message}` : markerId);
  const del = await sb.from('client_workouts').delete().eq('id', markerId);
  check('own workout write round-trips (delete)', !del.error, del.error ? `${del.error.code} ${del.error.message}` : 'marker removed');
}

// the write it must never make is refused by the database
{
  const { error } = await sb.from('store').upsert({ key: 'expo-trainees', value: [], updated_at: new Date().toISOString() });
  check('roster write is refused by RLS (42501)', !!error && String(error.code) === '42501', error ? `${error.code} ${error.message.slice(0, 80)}` : 'THE WRITE WENT THROUGH — the fence is down');
}
{
  const { error } = await sb.from('store').upsert({ key: 'expo-exercises', value: [], updated_at: new Date().toISOString() });
  check('library write is refused by RLS (42501)', !!error && String(error.code) === '42501', error ? `${error.code} ${error.message.slice(0, 80)}` : 'THE WRITE WENT THROUGH — the fence is down');
}

await sb.auth.signOut().catch(() => {});
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length} clauses checked from the athlete seat, ${failed} broken`);
process.exit(failed ? 1 : 0);
