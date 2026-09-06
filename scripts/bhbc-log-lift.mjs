// LOG A WEIGHT-ROOM LIFT FOR NAMED ATHLETES ON ONE DATE.
//
// Ohad reports these in one line - "today dj and nate worked out for 30 minutes
// each" - so this takes exactly that: who, how long, which day.
//
// What it writes and nothing else: minutes, type Lift, attended. NO RPE and
// load 0, because the gym is minutes only (his rule) and intensity was never
// recorded - inventing one would put a number in ACWR that nobody measured.
//
// Refuses an ambiguous name. The roster has TWO players called DJ, and writing
// a session onto the wrong athlete is worse than not writing it.
//
// Idempotent: an athlete who already has a Lift on that date is skipped.
// Snapshots expo-bhbc-loads to audit-out/bhbc-state/ before it writes anything.
//
//   DRY=1 LIFTS="nathan knight:30" node scripts/bhbc-log-lift.mjs
//         LIFTS="nathan knight:30,dj burns:30" DATE=2026-09-06 node scripts/bhbc-log-lift.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = !!process.env.DRY;
const BY = 'ohadyproductions@gmail.com';
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const DATE = process.env.DATE || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const SPEC = process.env.LIFTS || '';
if (!SPEC) { console.log('LIFTS="name:minutes,name:minutes" is required'); process.exit(1); }

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const auth = await s.auth.signInWithPassword({ email: BY, password: process.env.OWNER_PW || '1234' });
if (auth.error) { console.log('sign-in failed: ' + auth.error.message); process.exit(1); }

const get = async (key) => (await s.from('store').select('value').eq('key', key).maybeSingle()).data?.value ?? null;
const roster = (await get('expo-bhbc-roster')) || [];
const loads = (await get('expo-bhbc-loads')) || {};
const nameOf = (p) => `#${p.jersey} ${p.name}`;

const wanted = SPEC.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
  const i = x.lastIndexOf(':');
  return { q: x.slice(0, i).trim(), min: Number(x.slice(i + 1)) };
});

const planned = [];
let refused = 0;
for (const w of wanted) {
  if (!(w.min > 0)) { console.log(`!! "${w.q}" has no usable duration`); refused++; continue; }
  const hits = roster.filter((p) => String(p.name || '').toLowerCase().includes(w.q.toLowerCase()));
  if (!hits.length) { console.log(`!! no one on the roster matches "${w.q}"`); refused++; continue; }
  if (hits.length > 1) {
    console.log(`!! "${w.q}" matches ${hits.length}: ${hits.map(nameOf).join(', ')} - NOT logged, say which`);
    refused++; continue;
  }
  const p = hits[0];
  const list = ((loads[p.id] || {}).sessions || {})[DATE] || [];
  if (list.some((x) => (x.type || '') === 'Lift')) { console.log(`   ${nameOf(p)} already has a Lift on ${DATE} - skipped`); continue; }
  planned.push({ p, min: w.min });
}

console.log(`\n${DATE} weight room:`);
for (const r of planned) console.log(`  ${nameOf(r.p)}  ${r.min} min, no RPE`);
console.log(`\n${planned.length} entr(ies) to write${refused ? `, ${refused} refused` : ''}.`);
if (DRY) { console.log('\nDRY RUN - nothing written.'); process.exit(refused ? 1 : 0); }
if (!planned.length) process.exit(refused ? 1 : 0);

fs.mkdirSync('audit-out/bhbc-state', { recursive: true });
const stamp = `${DATE}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const snap = `audit-out/bhbc-state/loads-before-lift-${stamp}.json`;
fs.writeFileSync(snap, JSON.stringify(loads, null, 2));
console.log(`restore point: ${snap}`);

const next = JSON.parse(JSON.stringify(loads));
for (const r of planned) {
  const a = next[r.p.id] || (next[r.p.id] = {});
  const ses = a.sessions || (a.sessions = {});
  const day = ses[DATE] || (ses[DATE] = []);
  day.push({ by: BY, min: r.min, rpe: null, load: 0, type: 'Lift', attended: true });
}
const up = await s.from('store').upsert({ key: 'expo-bhbc-loads', value: next }, { onConflict: 'key' });
if (up.error) { console.log('WRITE FAILED: ' + up.error.message); process.exit(1); }

// Read it back - a write that reports success and stored nothing is the failure
// this whole project has been bitten by before.
const after = (await get('expo-bhbc-loads')) || {};
let ok = 0;
for (const r of planned) {
  const list = ((after[r.p.id] || {}).sessions || {})[DATE] || [];
  const hit = list.find((x) => x.type === 'Lift' && x.min === r.min);
  console.log(`  ${hit ? 'stored' : 'MISSING'}  ${nameOf(r.p)} ${r.min} min`);
  if (hit) ok++;
}
console.log(`\n${ok}/${planned.length} verified in the database.`);
process.exit(ok === planned.length && !refused ? 0 : 1);
