// Enter a game's minutes into the club zone through the SAME function the
// modal uses (applyGameMinutes), from a box score.
//
//   node scripts/bhbc-log-game-minutes.mjs <date> <json {name: minutes}> [rpe] [--dry]
//
// Names are matched against the club roster the same way everywhere else: a
// case-insensitive contains, and a name that matches nothing is REPORTED, never
// guessed. With no rpe the minutes are stored with zero load (see bhbcGameLoad).
import { createClient } from '@supabase/supabase-js';
import { applyGameMinutes } from '../src/bhbcGameLoad.js';
import fs from 'node:fs';

const DRY = process.argv.includes('--dry');
const [date, json, rpeArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!date || !json) { console.log('usage: bhbc-log-game-minutes.mjs <YYYY-MM-DD> \'{"Bryant":32,…}\' [rpe]'); process.exit(2); }
const want = JSON.parse(json);
const rpe = Number(rpeArg) || 0;

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }

const { data: t } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const club = (t?.value || []).filter((x) => x && (x.format === 'Bnei Herzliya' || x.branch === 'Bnei Herzliya' || x.team === 'BHBC'));
const { data: l } = await s.from('store').select('value').eq('key', 'expo-bhbc-loads').maybeSingle();
const loads = l?.value || {};
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
fs.writeFileSync(`audit-out/sheets/backup-expo-bhbc-loads-${stamp}.json`, JSON.stringify(loads));

const minutes = {};
const unmatched = [];
for (const [name, min] of Object.entries(want)) {
  const a = club.find((x) => String(x.name).toLowerCase().includes(String(name).toLowerCase()));
  if (!a) { unmatched.push(name); continue; }
  minutes[a.id] = min;
  console.log(`${String(a.name).padEnd(20)} #${a.jersey ?? ''}  ${min} min`);
}
if (unmatched.length) console.log('NOT ON THE CLUB ROSTER (not written):', unmatched.join(', '));
const next = applyGameMinutes(loads, { date, rpe, minutes });
const wrote = Object.keys(minutes).filter((id) => (next[id]?.sessions?.[date] || []).some((x) => x.type === 'Game'));
console.log(`${date} · rpe ${rpe || '(none - zero load)'} · ${wrote.length} players recorded`);
if (DRY) { console.log('--dry: nothing written'); process.exit(0); }
const { error: e2 } = await s.from('store').upsert({ key: 'expo-bhbc-loads', value: next }, { onConflict: 'key' });
if (e2) { console.log('write failed', e2.message); process.exit(1); }
console.log(`written; backup audit-out/sheets/backup-expo-bhbc-loads-${stamp}.json`);
