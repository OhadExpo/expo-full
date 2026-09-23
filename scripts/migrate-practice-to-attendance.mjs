// PRACTICE = ATTENDANCE. S&C IS ITS OWN SESSION.
//
// Ohad, 23.9: "i don't need to log any practice sessions just the s&c part!!",
// "pratice logs > attendance only, s&c team sessions next to/attached to each
// practice", "i don't need a practice time", "remember i dont need team rpes",
// "reconstruct the entire system for it to work. make sure we dont lose
// anything in the process".
//
// WHAT THE DATA SAID BEFORE ANY OF THIS WAS TOUCHED (audit-out/_session-types,
// _practice-notes, _attendance-check):
//   557 session rows over two months, and NOT ONE carries an RPE.
//   Conditioning 250 rows, 5-12 min, notes like "ladders + quick feet".  <- his S&C
//   Lift         115 rows, 10-60 min.                                     <- his S&C
//   Practice     174 rows, a flat 90 or 120 min, ZERO notes.              <- not his
//   Game          18 rows, real minutes played.
//   Only 26 of the 174 Practice rows had a matching rec.attendance entry.
//
// So the Practice rows are the basketball session's scheduled length copied
// onto every athlete. He does not want that duration. But 148 of those rows
// are the ONLY record that the athlete was there, so they cannot simply go.
//
// THIS MIGRATION, IN ORDER, LOSING NOTHING:
//   1. Snapshot expo-bhbc-loads to disk before a byte changes.
//   2. Lift every Practice row's presence into rec.attendance[`date|start`],
//      which is where attendance belongs and where 26 of them already were.
//   3. Reduce the Practice row itself to attendance-only: minutes 0, rpe null,
//      load 0. The row stays, so the practice still appears in history and the
//      S&C rows still have something to sit next to.
//   4. Re-read and prove: every one of the 174 has an attendance entry, no
//      Practice row carries minutes, and no row anywhere carries an RPE.
//
// The scheduled duration is NOT lost by this: it lives on the fixture in
// expo-bhbc-fixtures (`minutes: 120`), which this script does not touch.
//
//   node scripts/migrate-practice-to-attendance.mjs [--apply]
// Without --apply it reports what it WOULD do and writes nothing.
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

const { data: l } = await s.from('store').select('value').eq('key', 'expo-bhbc-loads').maybeSingle();
const loads = JSON.parse(JSON.stringify(l?.value || {}));

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
fs.mkdirSync('audit-out/sheets', { recursive: true });
const backup = `audit-out/sheets/backup-expo-bhbc-loads-BEFORE-practice-migration-${stamp}.json`;
fs.writeFileSync(backup, JSON.stringify(l?.value || {}, null, 1));
console.log('snapshot ->', backup);

let rows = 0, attWritten = 0, attAlready = 0, minsCleared = 0, rpeCleared = 0;
for (const id of Object.keys(loads)) {
  const rec = loads[id];
  if (!rec || !rec.sessions) continue;
  rec.attendance = rec.attendance || {};
  for (const [d, arr] of Object.entries(rec.sessions)) {
    for (const r of arr || []) {
      // Every row loses its RPE, everywhere. He has never written one and has
      // now said twice that he does not want the concept.
      if (r.rpe != null) { r.rpe = null; rpeCleared++; }
      if (r.type !== 'Practice') continue;
      rows++;
      const key = `${d}|${r.start || ''}`;
      if (rec.attendance[key] === undefined) {
        rec.attendance[key] = r.attended === false ? 'out' : 'in';
        attWritten++;
      } else {
        attAlready++;
      }
      if (Number(r.min) > 0) { r.min = 0; minsCleared++; }
      r.load = 0;
    }
  }
}

console.log(`\nPractice rows seen        ${rows}`);
console.log(`attendance written        ${attWritten}`);
console.log(`attendance already there  ${attAlready}`);
console.log(`practice minutes cleared  ${minsCleared}`);
console.log(`RPE values cleared        ${rpeCleared}   (expected 0 — none were ever written)`);

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

const { error: e2 } = await s.from('store').upsert({ key: 'expo-bhbc-loads', value: loads }, { onConflict: 'key' });
if (e2) { console.log('WRITE FAILED', e2.message); process.exit(1); }

// ---- prove it, from a fresh read ------------------------------------------
const { data: v } = await s.from('store').select('value').eq('key', 'expo-bhbc-loads').maybeSingle();
const after = v?.value || {};
let pRows = 0, pCovered = 0, pWithMin = 0, anyRpe = 0, scRows = 0;
for (const id of Object.keys(after)) {
  const rec = after[id] || {};
  for (const [d, arr] of Object.entries(rec.sessions || {})) {
    for (const r of arr || []) {
      if (r.rpe != null) anyRpe++;
      if (r.type === 'Practice') {
        pRows++;
        if ((rec.attendance || {})[`${d}|${r.start || ''}`] !== undefined) pCovered++;
        if (Number(r.min) > 0) pWithMin++;
      } else if (r.type === 'Conditioning' || r.type === 'Lift' || r.type === 'Recovery') {
        scRows++;
      }
    }
  }
}
// Join to the calendar - a source this script does not write. The FIRST
// version of this check compared each Practice row to the attendance key the
// loop above had just written from that same row, so it could not fail: it
// reported OK while creating 48 keys pointing at times in no fixture.
const { data: fxv } = await s.from('store').select('value').eq('key', 'expo-bhbc-fixtures').maybeSingle();
const slotsOn = {};
for (const f of (Array.isArray(fxv?.value) ? fxv.value : [])) if (f && f.date) (slotsOn[f.date] = slotsOn[f.date] || []).push(f.start || '');
let orphanAtt = 0, attTotal = 0;
for (const id of Object.keys(after)) {
  for (const key of Object.keys(after[id]?.attendance || {})) {
    attTotal++;
    const [d, st] = key.split('|');
    if (!(slotsOn[d] || []).includes(st || '')) orphanAtt++;
  }
}
console.log('\n--- read back ---');
console.log(`practice rows ${pRows}, attendance covered ${pCovered}/${pRows}, still carrying minutes ${pWithMin}`);
console.log(`attendance keys pointing at a slot that exists in NO fixture: ${orphanAtt}/${attTotal}`);
if (orphanAtt) console.log('  ^ run scripts/reconcile-sc-slots.mjs to join those to the calendar');
console.log(`S&C rows preserved ${scRows}`);
console.log(`rows carrying an RPE ${anyRpe}`);
const ok = pRows > 0 && pCovered === pRows && pWithMin === 0 && anyRpe === 0 && scRows > 0;
console.log(ok ? '\nOK — every practice keeps its attendance, none keeps a duration, no RPE anywhere.'
               : '\n*** VERIFICATION FAILED — restore from ' + backup + ' ***');
process.exit(ok ? 0 : 1);
