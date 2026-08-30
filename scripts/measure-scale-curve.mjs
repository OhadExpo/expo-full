// measure-scale-curve.mjs — what does one athlete actually COST?
//
// The 500-athlete plan rested on an extrapolation from a single browser
// profile (expo-cw at 388 KB for 32 athletes). That is a guess about the shape
// of the curve, and the shape decides whether the answer is "page the queries"
// or "move the cache off localStorage".
//
// This asks the database instead: row counts per table, and the real serialised
// size of the payloads the coach app snapshots. READ ONLY - it issues selects
// and nothing else.
//
//   EXPO_PW=... node scripts/measure-scale-curve.mjs
const BASE = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const EMAIL = process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com';
const PW = process.env.EXPO_PW || '1234';

const tok = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
}).then((r) => r.json());
if (!tok.access_token) { console.log('auth failed:', JSON.stringify(tok).slice(0, 160)); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${tok.access_token}` };

const count = async (table) => {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const cr = r.headers.get('content-range') || '';
  return { status: r.status, total: cr.split('/')[1] || '?' };
};

// The coach app snapshots these store keys wholesale into localStorage.
const storeBytes = async (key) => {
  const r = await fetch(`${BASE}/rest/v1/store?key=eq.${encodeURIComponent(key)}&select=value`, { headers: H });
  if (!r.ok) return { key, err: r.status };
  const rows = await r.json();
  if (!rows.length) return { key, bytes: 0, rows: 0 };
  const text = JSON.stringify(rows[0].value);
  const v = rows[0].value;
  const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0);
  return { key, bytes: text.length, rows: n };
};

console.log('=== row counts ===');
for (const t of ['plans', 'client_workouts', 'bw_logs', 'coach_messages']) {
  try { const c = await count(t); console.log(`  ${t.padEnd(18)} ${String(c.total).padStart(8)}  (http ${c.status})`); }
  catch (e) { console.log(`  ${t.padEnd(18)} error ${String(e.message).slice(0, 50)}`); }
}

console.log('\n=== store keys the coach app mirrors into localStorage ===');
let total = 0;
for (const k of ['expo-trainees', 'expo-exercises', 'expo-workouts', 'expo-cw', 'expo-bw', 'expo-weekly-focus', 'expo-portal-vis']) {
  const s = await storeBytes(k);
  if (s.err) { console.log(`  ${k.padEnd(20)} http ${s.err}`); continue; }
  total += s.bytes;
  console.log(`  ${k.padEnd(20)} ${String(Math.round(s.bytes / 1024)).padStart(6)} KB   ${String(s.rows).padStart(6)} entries`);
}
console.log(`  ${'TOTAL'.padEnd(20)} ${String(Math.round(total / 1024)).padStart(6)} KB`);

const trainees = await storeBytes('expo-trainees');
const n = trainees.rows || 0;

// SEPARATE THE FIXED COST FROM THE PER-ATHLETE COST.
//
// Dividing EVERYTHING by athlete count is wrong and flattering in the wrong
// direction: the exercise library is the single biggest key and does not grow
// with athletes at all, while workout history grows with every session logged,
// not with headcount. Mixing them produced a "20 KB per athlete" figure that
// described neither.
const cw = await fetch(`${BASE}/rest/v1/client_workouts?select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  .then((r) => (r.headers.get('content-range') || '').split('/')[1]).catch(() => null);
const lib = await storeBytes('expo-exercises');
const wk = await storeBytes('expo-workouts');
const pv = await storeBytes('expo-portal-vis');

const fixed = (lib.bytes || 0) + (wk.bytes || 0);
// expo-cw is built in the browser from client_workouts, not stored server-side,
// so it reads 0 here. Its real cost was measured in a live profile: 388 KB for
// the rows below.
const CW_LIVE_BYTES = 388 * 1024;
const cwRows = Number(cw) || 0;
const perWorkout = cwRows ? CW_LIVE_BYTES / cwRows : 0;
const perAthleteStatic = n ? ((trainees.bytes || 0) + (pv.bytes || 0)) / n : 0;

console.log('');
console.log('=== what actually drives the size ===');
console.log(`  fixed, regardless of athletes   ${Math.round(fixed / 1024)} KB  (exercise library + program templates)`);
console.log(`  per athlete, static             ${(perAthleteStatic / 1024).toFixed(1)} KB  (roster row + portal visibility)`);
console.log(`  per LOGGED WORKOUT              ${(perWorkout / 1024).toFixed(1)} KB  (${cwRows} rows -> 388 KB live)`);

console.log('');
console.log('=== projections (5 MB quota) ===');
const scen = [
  ['500 athletes, shallow history as today (~4 each)', 500, 4],
  ['500 athletes, one season logged (~60 each)', 500, 60],
  ['500 athletes, a year logged (~100 each)', 500, 100],
];
for (const [label, athletes, perHead] of scen) {
  const bytes = fixed + perAthleteStatic * athletes + perWorkout * athletes * perHead;
  const mb = bytes / (1024 * 1024);
  console.log(`  ${label.padEnd(46)} ${mb.toFixed(1).padStart(7)} MB  ${mb > 5 ? 'OVER QUOTA x' + (mb / 5).toFixed(1) : 'ok'}`);
}
console.log('');
console.log('  Headcount is not the driver. Logged history is.');
