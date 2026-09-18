// LOG AN ON-COURT S&C PERIOD FOR THE WHOLE SQUAD.
//
// Ohad, 17.9:
//   "we did 10 minutes of static streching + bw isos (on mats) on tuedsay (all
//    the team)"
//   "we did a 12 minute ladders and quick feet exercises on saturday the 12th
//    of septmber + dynamic streching"
//   "for every day that we didn't log a s&c period for on court: add
//    (retroactively) 5 minutes of dynamic streching … literally - every
//    practice (exept morning shootarounds)"
//
// An on-court S&C period is the warm-up/prep block inside a team practice: a
// duration and what was done, for everybody. It is NOT a weight-room lift and
// it is NOT the practice itself, so it is stored as type `Conditioning` with
// minutes, a note, load 0 and NO RPE — the same rule the gym follows (his:
// "gym = minutes only NO RPE EVER"). Nobody measured the intensity of five
// minutes of leg swings and inventing one would put a number into ACWR.
//
// Modes:
//   ONE=2026-09-15 MIN=10 NOTE="static stretching + BW isometrics (mats)"
//       one dated period for the whole squad.
//   BACKFILL=1
//       every PAST practice fixture that has no S&C period yet gets 5 minutes
//       of dynamic stretching. Shootarounds are excluded by type, and so is any
//       practice that starts before noon — those are his morning sessions.
//
// Idempotent both ways: a date that already carries a Conditioning entry for an
// athlete is skipped, so the backfill can never double-log and can never
// overwrite the specific periods logged above it.
//
// Snapshots expo-bhbc-loads to audit-out/bhbc-state/ before it writes anything
// (that folder is gitignored — it holds athlete data).
//
//   DRY=1 BACKFILL=1 node scripts/bhbc-log-sc-period.mjs
//         ONE=2026-09-12 MIN=12 NOTE="ladders + quick feet + dynamic stretching" node scripts/bhbc-log-sc-period.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = !!process.env.DRY;
const BY = 'ohadyproductions@gmail.com';
const ONE = process.env.ONE || '';
const BACKFILL = !!process.env.BACKFILL;
const MIN = Number(process.env.MIN || 5);
const NOTE = process.env.NOTE || 'dynamic stretching';
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);
const TYPE = 'Conditioning';

if (!ONE && !BACKFILL) { console.log('give ONE=<date> (with MIN / NOTE) or BACKFILL=1'); process.exit(1); }

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const auth = await s.auth.signInWithPassword({ email: BY, password: process.env.OWNER_PW || '1234' });
if (auth.error) { console.log('sign-in failed: ' + auth.error.message); process.exit(1); }

const get = async (k) => (await s.from('store').select('value').eq('key', k).maybeSingle()).data?.value ?? null;
const roster = (await get('expo-bhbc-roster')) || [];
const fixtures = (await get('expo-bhbc-fixtures')) || [];
const loads = (await get('expo-bhbc-loads')) || {};
if (!roster.length) { console.log('the roster is empty — refusing to write'); process.exit(1); }

const hasPeriod = (id, date) => ((loads[id] && loads[id].sessions && loads[id].sessions[date]) || []).some((e) => e.type === TYPE);

// Which dates get a period, and what it says.
const plan = [];
if (ONE) plan.push({ date: ONE, min: MIN, note: NOTE });
if (BACKFILL) {
  // "every practice (except morning shootarounds)": the shootaround TYPE is out,
  // and so is any practice that tips off before noon.
  const practices = fixtures
    .filter((f) => f && f.type === 'practice' && f.date && f.date <= TODAY)
    .filter((f) => !(f.start && Number(String(f.start).slice(0, 2)) < 12))
    .map((f) => f.date);
  for (const d of [...new Set(practices)].sort()) if (!plan.some((p) => p.date === d)) plan.push({ date: d, min: 5, note: 'dynamic stretching' });
}

const writes = [];
for (const p of plan) {
  for (const a of roster) {
    if (hasPeriod(a.id, p.date)) continue;
    writes.push({ id: a.id, name: a.name, jersey: a.jersey, ...p });
  }
}
const dates = [...new Set(writes.map((w) => w.date))].sort();
console.log(`\n${plan.length} date(s) planned, ${dates.length} still need writing, ${writes.length} entr(ies) across ${roster.length} athletes`);
for (const d of dates) {
  const w = writes.filter((x) => x.date === d);
  console.log(`  ${d}  ${w[0].min} min · ${w[0].note}  → ${w.length} athlete(s)`);
}
if (!writes.length) { console.log('\nnothing to do — every date already carries an S&C period.'); process.exit(0); }
if (DRY) { console.log('\nDRY RUN — nothing written.'); process.exit(0); }

fs.mkdirSync('audit-out/bhbc-state', { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const snap = `audit-out/bhbc-state/loads-before-sc-${stamp}.json`;
fs.writeFileSync(snap, JSON.stringify(loads, null, 2));
console.log('restore point: ' + snap);

const next = JSON.parse(JSON.stringify(loads));
for (const w of writes) {
  const rec = next[w.id] || (next[w.id] = { loads: {}, sessions: {} });
  rec.sessions = rec.sessions || {};
  rec.sessions[w.date] = [...(rec.sessions[w.date] || []),
    { type: TYPE, min: w.min, rpe: null, load: 0, attended: true, team: true, note: w.note, start: '', by: BY }];
}
const up = await s.from('store').upsert({ key: 'expo-bhbc-loads', value: next }, { onConflict: 'key' });
if (up.error) { console.log('WRITE FAILED: ' + up.error.message); process.exit(1); }

// Read it back — a write that was not verified is not a write.
const after = (await get('expo-bhbc-loads')) || {};
let ok = 0;
for (const w of writes) {
  const list = (after[w.id] && after[w.id].sessions && after[w.id].sessions[w.date]) || [];
  if (list.some((e) => e.type === TYPE && e.min === w.min && e.note === w.note)) ok++;
}
console.log(`\n${ok}/${writes.length} verified in the database.`);
process.exit(ok === writes.length ? 0 : 1);
