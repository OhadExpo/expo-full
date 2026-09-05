// LOG THE PRACTICES THAT HAPPENED, AND TODAY'S TWO LIFTS.
//
// Ohad: "log in the previous practices and today francis worked out", "nate
// worked out today", and for the backlog: the full squad minus the limited
// players, "but follow the history of medicals so it's updated".
//
// What it writes, and nothing else:
//   BACKLOG - every fixture of type `practice` in the window that has no
//             session logged for it yet, with the minutes and start time the
//             FIXTURE already holds. No RPE and load 0: attendance and duration
//             are facts, intensity was never recorded and is not invented.
//   TODAY   - Daeshon Francis 30 min and Nathan Knight 60 min, type Lift,
//             weight room. Their own durations, so their own entries.
//
// Who is IN: everyone whose medical record does not have them limited or out on
// that date. The record carries a status, an onset and an RTP target, so an
// athlete counts as unavailable from onset until RTP - and if the status is
// still `limited` with no resolution, until now. Measured on this data that is
// Francis (knee, from 25 Aug) and עמית מנחם (ankle, from 24 Aug), both still
// limited today, which is exactly the "minus the limited two" he asked for.
//
// Idempotent: a date+start+type that already exists for an athlete is skipped,
// so running it twice cannot double-log. DRY=1 prints and writes nothing.
//
//   DRY=1 node scripts/bhbc-log-backlog.mjs      # show me first
//         node scripts/bhbc-log-backlog.mjs      # write it
import { createClient } from '@supabase/supabase-js';

const DRY = !!process.env.DRY;
const BY = 'ohadyproductions@gmail.com';
const FROM = process.env.FROM || '2026-08-30';
const TO = process.env.TO || '2026-09-05';
const TODAY = process.env.TODAY || '2026-09-05';

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
await s.auth.signInWithPassword({ email: BY, password: process.env.OWNER_PW || '1234' });

const get = async (key) => (await s.from('store').select('value').eq('key', key).maybeSingle()).data?.value ?? null;
const roster = (await get('expo-bhbc-roster')) || [];
const medical = (await get('expo-bhbc-medical')) || {};
const fixtures = (await get('expo-bhbc-fixtures')) || [];
const loads = (await get('expo-bhbc-loads')) || {};

const nameOf = (id) => {
  const p = roster.find((x) => x.id === id);
  return p ? `#${p.jersey} ${p.name}` : id;
};

// UNAVAILABLE ON A DATE, from the medical record only.
const injuriesOf = (id) => {
  const v = medical[id];
  return Array.isArray(v) ? v : (v && v.injuries) || [];
};
const unavailableOn = (id, date) => {
  for (const inj of injuriesOf(id)) {
    const status = String(inj.status || '').toLowerCase();
    if (status !== 'limited' && status !== 'out') continue;      // available never blocks
    const onset = inj.onsetDate || inj.onset;
    if (!onset || date < onset) continue;                        // not injured yet on that date
    const resolved = inj.resolvedDate || inj.closedDate;
    if (resolved && date > resolved) continue;                   // already back
    // An RTP in the past with the status still limited means he is NOT back:
    // the target was missed, which is what the record says.
    return `${inj.bodyPart || 'injury'}${inj.side && inj.side !== 'N/A' ? ' ' + inj.side : ''} (${status}, from ${onset})`;
  }
  return null;
};

const already = (id, date, start, type) => {
  const list = ((loads[id] || {}).sessions || {})[date] || [];
  return list.some((x) => (x.type || '') === type && (x.start || '') === (start || ''));
};

// ---- what to write -------------------------------------------------------
const planned = [];

// 1. the backlog of practices
const practices = fixtures
  .filter((f) => f && f.type === 'practice' && f.date >= FROM && f.date <= TO)
  .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));

for (const f of practices) {
  for (const p of roster) {
    const why = unavailableOn(p.id, f.date);
    if (why) continue;
    if (already(p.id, f.date, f.start, 'Practice')) continue;
    planned.push({ id: p.id, date: f.date, entry: { by: BY, min: f.minutes, rpe: null, load: 0, team: true, type: 'Practice', start: f.start, attended: true } });
  }
}

// 2. today's weight room, one entry each because the durations differ
const TODAY_LIFTS = [
  { match: /daeshon francis/i, min: 30 },
  { match: /nathan knight/i, min: 60 },
];
for (const t of TODAY_LIFTS) {
  const p = roster.find((x) => t.match.test(x.name || ''));
  if (!p) { console.log(`!! no roster match for ${t.match}`); continue; }
  if (already(p.id, TODAY, '', 'Lift')) { console.log(`   ${nameOf(p.id)} already has a Lift on ${TODAY} - skipped`); continue; }
  planned.push({ id: p.id, date: TODAY, entry: { by: BY, min: t.min, rpe: null, load: 0, type: 'Lift', attended: true } });
}

// ---- report --------------------------------------------------------------
console.log(`\nPRACTICES in ${FROM}..${TO}: ${practices.length}`);
for (const f of practices) {
  const outs = roster.filter((p) => unavailableOn(p.id, f.date));
  const adds = planned.filter((x) => x.date === f.date && x.entry.type === 'Practice' && x.entry.start === f.start).length;
  console.log(`  ${f.date} ${f.start} ${String(f.minutes).padStart(3)}min -> ${adds} athlete(s)` +
    (outs.length ? `   OUT: ${outs.map((p) => nameOf(p.id)).join(', ')}` : ''));
}
const todayRows = planned.filter((x) => x.entry.type === 'Lift');
console.log(`\nTODAY ${TODAY} weight room:`);
for (const r of todayRows) console.log(`  ${nameOf(r.id)}  ${r.entry.min} min, no RPE`);
for (const p of roster) {
  const why = unavailableOn(p.id, TODAY);
  if (why) console.log(`  (${nameOf(p.id)} is ${why} - not logged today unless you say so)`);
}
console.log(`\n${planned.length} entr(ies) to write.`);

if (DRY) { console.log('\nDRY RUN - nothing written.'); process.exit(0); }

// ---- write ---------------------------------------------------------------
const next = JSON.parse(JSON.stringify(loads));
for (const row of planned) {
  next[row.id] = next[row.id] || { loads: {}, sessions: {} };
  next[row.id].sessions = next[row.id].sessions || {};
  next[row.id].sessions[row.date] = next[row.id].sessions[row.date] || [];
  next[row.id].sessions[row.date].push(row.entry);
}
const { error } = await s.from('store').upsert({ key: 'expo-bhbc-loads', value: next });
if (error) { console.log('WRITE FAILED:', error.message); process.exit(1); }

// ---- verify by reading it back -------------------------------------------
const after = (await get('expo-bhbc-loads')) || {};
let ok = 0, missing = 0;
for (const row of planned) {
  const list = ((after[row.id] || {}).sessions || {})[row.date] || [];
  const found = list.some((x) => x.type === row.entry.type && (x.start || '') === (row.entry.start || '') && x.min === row.entry.min);
  if (found) ok++; else { missing++; console.log(`  MISSING after write: ${nameOf(row.id)} ${row.date} ${row.entry.type}`); }
}
console.log(`\nwritten and read back: ${ok} present, ${missing} missing`);
process.exit(missing ? 1 : 0);
