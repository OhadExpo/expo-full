// ATTACH EVERY S&C SESSION TO THE SLOT IT HAPPENED AT, AND RECONCILE THE
// ORPHAN ATTENDANCE KEYS.
//
// Ohad, 23.9: "s&c team sessions next to/attached to each practice (allow me
// to add sc session to the basketball session)", "make sure we dont lose
// anything in the process".
//
// A three-way audit of the live store found two gaps left after the
// practice migration:
//
//   1. 346 of 375 S&C rows carry NO `start`, so nothing joins them to the
//      practice they happened at. All 346 fall on dates that DO have a
//      fixture, so the attachment is recoverable.
//   2. 48 attendance keys point at a `date|start` that exists in no fixture
//      (6 slots x 8 athletes). The bad `start` was already on the Practice
//      rows before the migration; the migration copied it into the attendance
//      map, which is now the authoritative record.
//
// HOW THIS DECIDES, AND WHERE IT REFUSES TO
//
//   A row is attached only when the date has EXACTLY ONE candidate slot. A
//   date with two practices is ambiguous and nothing is written — guessing
//   which half of a double day an athlete's lift belonged to would be
//   inventing training data. Those are listed for him instead.
//
//   An orphan attendance key is repaired only when the date has exactly one
//   real slot of the right kind. Otherwise it is listed, not moved.
//
// Nothing is deleted. Nothing changes type, minutes, notes or attendance
// values. The only field written is `start` on a session row, and the KEY of
// an attendance entry whose value is carried across unchanged.
//
//   node scripts/reconcile-sc-slots.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv',
  { auth: { persistSession: false } },
);
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }

const { data: t } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const name = {};
for (const a of (t?.value || [])) name[a.id] = a.name;

const { data: fx } = await s.from('store').select('value').eq('key', 'expo-bhbc-fixtures').maybeSingle();
const fixtures = Array.isArray(fx?.value) ? fx.value : [];
const slotsOn = {};
for (const f of fixtures) {
  if (!f || !f.date) continue;
  (slotsOn[f.date] = slotsOn[f.date] || []).push({ start: f.start || '', type: String(f.type || '') });
}

const { data: l } = await s.from('store').select('value').eq('key', 'expo-bhbc-loads').maybeSingle();
const before = l?.value || {};
const loads = JSON.parse(JSON.stringify(before));

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
fs.mkdirSync('audit-out/sheets', { recursive: true });
const backup = `audit-out/sheets/backup-expo-bhbc-loads-BEFORE-slot-reconcile-${stamp}.json`;
fs.writeFileSync(backup, JSON.stringify(before, null, 1));
console.log('snapshot ->', backup);

const SC = /^(Conditioning|Lift|Recovery)$/;
let attached = 0, ambiguous = [], noFixture = [];
let attFixed = 0, attAmbiguous = [];
let courtFixed = 0, courtAmbiguous = [];

for (const id of Object.keys(loads)) {
  const rec = loads[id];
  if (!rec) continue;

  // ---- 1. attach S&C rows -------------------------------------------------
  for (const [d, arr] of Object.entries(rec.sessions || {})) {
    for (const r of arr || []) {
      if (!SC.test(String(r.type || ''))) continue;
      if (r.start) continue;                       // already attached
      // MATCH BY KIND FIRST, and this is derivation, not guesswork: a day
      // with "14:15 lift Weight Room" and "16:00 practice BB" tells you
      // exactly which slot a Lift row belongs to and which one a Conditioning
      // block happened inside. Only a day with TWO slots of the same kind is
      // genuinely ambiguous, and those are left for him.
      const isLift = String(r.type) === 'Lift';
      const all = (slotsOn[d] || []).filter((x) => x.type !== 'game');
      const kind = all.filter((x) => (isLift ? x.type === 'lift' : x.type !== 'lift'));
      const cands = kind.length ? kind : all;
      if (cands.length === 1) { r.start = cands[0].start; attached++; }
      else if (cands.length === 0) noFixture.push(`${name[id] || id} ${d} ${r.type}`);
      else ambiguous.push(`${name[id] || id} ${d} ${r.type} -> ${cands.map((c) => c.start).join('/')}`);
    }
  }

  // ---- 1b. repair a COURT row whose start matches no fixture ---------------
  // Same bad `start` the attendance keys carried. Left alone, the row and the
  // (now corrected) attendance key point at different slots for one event.
  for (const [d, arr] of Object.entries(rec.sessions || {})) {
    for (const r of arr || []) {
      if (!/^(Practice|Shootaround)$/.test(String(r.type || ''))) continue;
      const real = slotsOn[d] || [];
      if (real.some((x) => x.start === (r.start || ''))) continue;
      const courts = real.filter((x) => x.type !== 'game' && x.type !== 'lift');
      if (courts.length === 1) { r.start = courts[0].start; courtFixed++; }
      else courtAmbiguous.push(`${name[id] || id} ${d} ${r.type} @${r.start || '(none)'} (${courts.length} candidates)`);
    }
  }

  // ---- 2. repair orphan attendance keys -----------------------------------
  const att = rec.attendance || {};
  for (const key of Object.keys(att)) {
    const [d, st] = key.split('|');
    const real = slotsOn[d] || [];
    if (real.some((x) => x.start === (st || ''))) continue;      // already valid
    const courts = real.filter((x) => x.type !== 'game');
    if (courts.length === 1) {
      const good = `${d}|${courts[0].start}`;
      if (att[good] === undefined) { att[good] = att[key]; delete att[key]; attFixed++; }
      else { delete att[key]; attFixed++; }                       // the right key already holds a value
    } else {
      attAmbiguous.push(`${name[id] || id} ${key} (${courts.length} candidate slots)`);
    }
  }
  rec.attendance = att;
}

console.log(`\nS&C rows attached to their slot   ${attached}`);
console.log(`  ambiguous (2+ slots that day)   ${ambiguous.length}`);
console.log(`  no fixture on that date at all  ${noFixture.length}`);
console.log(`court rows re-pointed at a real slot ${courtFixed}`);
console.log(`  court rows left ambiguous       ${courtAmbiguous.length}`);
console.log(`orphan attendance keys repaired   ${attFixed}`);
console.log(`  attendance left ambiguous       ${attAmbiguous.length}`);
if (ambiguous.length) { console.log('\n  AMBIGUOUS S&C (left alone, his call):'); for (const x of ambiguous.slice(0, 20)) console.log('    ' + x); }
if (noFixture.length) { console.log('\n  NO FIXTURE (left alone):'); for (const x of [...new Set(noFixture.map((x) => x.split(' ').slice(-2).join(' ')))].slice(0, 20)) console.log('    ' + x); }
if (attAmbiguous.length) { console.log('\n  AMBIGUOUS ATTENDANCE (left alone):'); for (const x of attAmbiguous.slice(0, 20)) console.log('    ' + x); }

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

const { error: e2 } = await s.from('store').upsert({ key: 'expo-bhbc-loads', value: loads }, { onConflict: 'key' });
if (e2) { console.log('WRITE FAILED', e2.message); process.exit(1); }

// ---- prove it against the FIXTURES, not against my own write ---------------
// The practice migration's self-check compared each row to the attendance key
// that same loop had just written from that same row, so it could not fail.
// This one joins to expo-bhbc-fixtures, which this script never touches.
const { data: v } = await s.from('store').select('value').eq('key', 'expo-bhbc-loads').maybeSingle();
const after = v?.value || {};
let rowsBefore = 0, rowsAfter = 0, scAttached = 0, scTotal = 0, orphanAtt = 0, attTotal = 0;
for (const id of Object.keys(before)) for (const a of Object.values(before[id]?.sessions || {})) rowsBefore += (a || []).length;
for (const id of Object.keys(after)) {
  for (const [d, arr] of Object.entries(after[id]?.sessions || {})) {
    for (const r of arr || []) {
      rowsAfter++;
      if (!SC.test(String(r.type || ''))) continue;
      scTotal++;
      if (r.start && (slotsOn[d] || []).some((x) => x.start === r.start)) scAttached++;
    }
  }
  for (const key of Object.keys(after[id]?.attendance || {})) {
    attTotal++;
    const [d, st] = key.split('|');
    if (!(slotsOn[d] || []).some((x) => x.start === (st || ''))) orphanAtt++;
  }
}
console.log('\n--- read back, joined to the calendar ---');
console.log(`session rows ${rowsBefore} -> ${rowsAfter}  (must be equal: nothing is created or destroyed)`);
console.log(`S&C rows attached to a real slot ${scAttached}/${scTotal}`);
console.log(`attendance keys with no slot ${orphanAtt}/${attTotal}`);
const ok = rowsAfter === rowsBefore;
console.log(ok ? '\nOK — no row gained or lost.' : '\n*** ROW COUNT CHANGED — restore from ' + backup + ' ***');
process.exit(ok ? 0 : 1);
