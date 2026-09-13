// Log gym sessions into expo-bhbc-loads exactly as the zone's LogModal does
// (type Lift, minutes only, zero load, attended). Snapshot first.
//   node scripts/bhbc-log-lifts.mjs '<json array of {name, date, min, note?}>'
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }
const wanted = JSON.parse(process.argv[2] || '[]');
const { data: t } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const club = (t?.value || []).filter((x) => x && (x.format === 'Bnei Herzliya' || x.branch === 'Bnei Herzliya' || x.team === 'BHBC'));
const { data: l } = await s.from('store').select('value').eq('key', 'expo-bhbc-loads').maybeSingle();
const loads = l?.value || {};
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
fs.writeFileSync(`audit-out/sheets/backup-expo-bhbc-loads-${stamp}.json`, JSON.stringify(loads));
let n = 0;
for (const w of wanted) {
  const a = club.find((x) => x.name.toLowerCase().includes(w.name.toLowerCase()));
  if (!a) { console.log('no club athlete matches', w.name); continue; }
  const rec = loads[a.id] || { loads: {}, sessions: {}, readiness: {} };
  rec.sessions = rec.sessions || {};
  const day = rec.sessions[w.date] || [];
  if (day.some((x) => x.type === 'Lift' && Number(x.min) === Number(w.min))) { console.log('already logged', a.name, w.date); continue; }
  day.push({ type: 'Lift', min: Number(w.min), rpe: null, load: 0, attended: true, by: 'ohadyproductions@gmail.com', ...(w.note ? { note: w.note } : {}) });
  rec.sessions[w.date] = day;
  loads[a.id] = rec;
  console.log('logged', a.name, w.date, w.min + ' min');
  n++;
}
if (n) {
  const { error: e2 } = await s.from('store').upsert({ key: 'expo-bhbc-loads', value: loads }, { onConflict: 'key' });
  if (e2) { console.log('write failed', e2.message); process.exit(1); }
  console.log('written; backup at audit-out/sheets/backup-expo-bhbc-loads-' + stamp + '.json');
}
