// Restore lost SuperSet members into trainee plans, replacing the corrupt
// placeholder (ex_rvi8ifq11zsmo8nlmzm) with the real exercises read from each
// athlete's Google Drive sheet (mapping in restore-mappings.json).
//
// SAFETY: never writes unless the exercise at the recorded (plan,day,idx) is
// EXACTLY the corrupt placeholder. Idempotent (re-running skips already-fixed
// rows). DRY-RUN by default; pass `apply` to actually write.
//
//   node scripts/apply-restore.cjs          # dry run (no writes)
//   node scripts/apply-restore.cjs apply    # write to Supabase
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const CORRUPT = 'ex_rvi8ifq11zsmo8nlmzm';
const APPLY = process.argv[2] === 'apply';
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const idOf = (e) => e && (e.exerciseId || e.eid || '');
const listOf = (day) => Array.isArray(day.exercises) ? { arr: day.exercises, shape: 'new' }
  : Array.isArray(day.ex) ? { arr: day.ex, shape: 'old' } : { arr: null, shape: null };
const ssOf = (e) => (e.superset || e.ss || '').toString().toUpperCase();

function buildMember(m, shape, letter) {
  const t = (m.tempo === undefined || m.tempo === null || m.tempo === '') ? undefined : m.tempo;
  if (shape === 'old') {
    const o = { id: uid(), eid: m.exerciseId || '', title: m.title, s: m.sets, r: m.reps, ss: letter, n: '' };
    if (t) o.tempo = t;
    return o;
  }
  const o = { id: uid(), exerciseId: m.exerciseId || '', title: m.title, sets: m.sets, reps: m.reps, superset: letter, notes: '' };
  if (t) o.tempo = t;
  return o;
}

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const maps = JSON.parse(fs.readFileSync(path.join(__dirname, 'restore-mappings.json'), 'utf8'));
  // group by plan
  const byPlan = {};
  for (const m of maps) (byPlan[m.planId] ||= []).push(m);

  let plansChanged = 0, restored = 0, mismatches = 0, idMembers = 0, titleOnly = 0;
  const problems = [];

  for (const [planId, entries] of Object.entries(byPlan)) {
    const { data: plan, error } = await sb.from('plans').select('id,name,trainee_id,data').eq('id', planId).maybeSingle();
    if (error || !plan) { problems.push(`PLAN NOT FOUND: ${planId}`); mismatches += entries.length; continue; }
    const data = plan.data || {};
    const days = data.days || [];
    let planTouched = false;

    // group entries by day, process placeholders DESCENDING idx so earlier
    // splices don't shift later indices within the same day.
    const byDay = {};
    for (const e of entries) (byDay[e.dayIndex] ||= []).push(e);

    for (const [di, dayEntries] of Object.entries(byDay)) {
      const day = days[di];
      if (!day) { problems.push(`${plan.name} day[${di}] missing`); mismatches += dayEntries.length; continue; }
      const { arr, shape } = listOf(day);
      if (!arr) { problems.push(`${plan.name} day[${di}] no exercise array`); mismatches += dayEntries.length; continue; }

      // letters already used by NON-placeholder exercises in this day
      const usedSS = new Set(arr.filter(e => idOf(e) !== CORRUPT).map(ssOf).filter(Boolean));

      dayEntries.sort((a, b) => b.idx - a.idx); // descending
      for (const e of dayEntries) {
        const at = arr[e.idx];
        if (!at || idOf(at) !== CORRUPT) {
          // Not the placeholder (already fixed, or idx drift) — refuse to touch.
          problems.push(`SKIP ${plan.name} day[${di}] idx${e.idx}: not the corrupt placeholder (found ${at ? idOf(at) || '∅' : 'OUT-OF-RANGE'})`);
          mismatches++;
          continue;
        }
        // pick a collision-free superset letter for this restored pair
        const letter = LETTERS.find(L => !usedSS.has(L)) || 'Z';
        usedSS.add(letter);
        const members = e.members.map(m => {
          if (m.exerciseId) idMembers++; else titleOnly++;
          return buildMember(m, shape, letter);
        });
        arr.splice(e.idx, 1, ...members); // replace 1 placeholder with N members
        restored++;
        planTouched = true;
        if (!APPLY) {
          console.log(`  ${plan.name} | day[${di}] ${day.name || ''} | idx${e.idx} → [${members.map(x => (shape === 'old' ? x.eid : x.exerciseId) || 'TITLE:' + x.title).join(' + ')}] ss=${letter}`);
        }
      }
    }

    if (planTouched) {
      plansChanged++;
      if (APPLY) {
        const { error: uerr } = await sb.from('plans').update({ data }).eq('id', planId);
        if (uerr) { problems.push(`UPDATE FAILED ${plan.name}: ${uerr.message}`); }
        else console.log(`✓ updated ${plan.name} (${planId})`);
      }
    }
  }

  console.log('\n──────── SUMMARY ' + (APPLY ? '(APPLIED)' : '(DRY RUN)') + ' ────────');
  console.log(`plans touched:   ${plansChanged}`);
  console.log(`placeholders restored: ${restored}`);
  console.log(`  members w/ library id: ${idMembers}`);
  console.log(`  members title-only:    ${titleOnly}`);
  console.log(`mismatches/skipped: ${mismatches}`);
  if (problems.length) { console.log('\nPROBLEMS:'); problems.forEach(p => console.log('  - ' + p)); }
  process.exit(0);
})();
