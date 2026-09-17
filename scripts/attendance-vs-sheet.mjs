// ATTENDANCE, TWO WAYS: the roster's counter vs the workouts logged in EXPO.
//
// F7 of the 09-13 billing mandate: "use every other source you can". The
// roster counts sessions performed since the last payment (recovered per
// revision as 'session' events); EXPO's client_workouts holds the workouts an
// athlete logged in the portal. Per linked client per month, both counts side
// by side - evidence for the estimate, not a correction of it. Gym clients
// train in person and rarely log, so a blank EXPO column there is expected.
//
//   node scripts/attendance-vs-sheet.mjs   → audit-out/sheets/attendance-report.txt
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }

const { data: ev } = await s.from('revenue_sheet_event').select('client_name,trainee_id,event_kind,event_date,sessions_count,amount_est').in('event_kind', ['session', 'payment']).not('trainee_id', 'is', null).limit(10000);
const ids = [...new Set((ev || []).map((e) => e.trainee_id))];
const { data: cw } = await s.from('client_workouts').select('client_id,date').in('client_id', ids).limit(20000);
const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const nameOf = Object.fromEntries((trRow?.value || []).filter(Boolean).map((t) => [t.id, t.name]));

const key = (id, d) => id + '|' + String(d).slice(0, 7);
const sheet = new Map(), expo = new Map(), paid = new Map();
for (const e of ev || []) {
  if (e.event_kind === 'session') sheet.set(key(e.trainee_id, e.event_date), (sheet.get(key(e.trainee_id, e.event_date)) || 0) + Number(e.sessions_count || 0));
  else paid.set(key(e.trainee_id, e.event_date), (paid.get(key(e.trainee_id, e.event_date)) || 0) + Number(e.amount_est || 0));
}
for (const w of cw || []) expo.set(key(w.client_id, w.date), (expo.get(key(w.client_id, w.date)) || 0) + 1);
const months = [...new Set([...sheet.keys(), ...expo.keys()].map((k) => k.split('|')[1]))].sort();
const lines = ['client · month : sheet sessions | EXPO workouts | est. paid that month', ''];
let agree = 0, both = 0;
for (const id of ids) {
  const rows = months.map((m) => ({ m, a: sheet.get(id + '|' + m) || 0, b: expo.get(id + '|' + m) || 0, p: paid.get(id + '|' + m) || 0 })).filter((r) => r.a || r.b);
  if (!rows.length) continue;
  lines.push(`${nameOf[id] || id}`);
  for (const r of rows) {
    if (r.a && r.b) { both++; if (Math.abs(r.a - r.b) <= 1) agree++; }
    lines.push(`   ${r.m}   sheet ${String(r.a).padStart(2)}   expo ${String(r.b).padStart(2)}   ${r.p ? '₪' + r.p : ''}`);
  }
}
lines.unshift(`months where both sources have a count: ${both} · within ±1 of each other: ${agree}`, '');
fs.writeFileSync('audit-out/sheets/attendance-report.txt', lines.join('\n'));
console.log(lines.slice(0, 40).join('\n'));
