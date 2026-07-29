// Backfill missing exercise `title` snapshots into every plan.
//
// WHY: athlete devices cannot read the exercise library (expo-exercises is
// RLS staff-only), so the athlete portal resolves an exercise NAME only from
// the `title` embedded in the plan row. Some plan exercises carry an
// `exerciseId` (library ref) but no `title` -> athletes see "Exercise 1/2/3"
// (ClientPortal.jsx fallback). This fills the missing titles from the library
// so every plan is self-contained.
//
// SAFE: fill-empty-only. Never overwrites an existing non-empty title.
// Never touches sets/reps/notes/video. Resolves title from the canonical
// library by exerciseId/eid (and, as a last resort, a library id match).
//
// Usage:
//   node scripts/backfill-plan-exercise-titles.cjs            # DRY RUN (default)
//   node scripts/backfill-plan-exercise-titles.cjs --apply    # write changes

const { createClient } = require('@supabase/supabase-js');
const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const APPLY = process.argv.includes('--apply');

const s = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

function isBlank(v) { return v == null || String(v).trim() === ''; }

(async () => {
  const { error: authErr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (authErr) { console.error('AUTH FAILED:', authErr.message); process.exit(1); }

  // 1. Build the id -> title map from the library.
  const { data: exStore, error: exErr } = await s
    .from('store').select('value').eq('key', 'expo-exercises').single();
  if (exErr) { console.error('LIBRARY READ FAILED:', exErr.message); process.exit(1); }
  const lib = Array.isArray(exStore.value) ? exStore.value : [];
  const titleById = new Map();
  for (const e of lib) {
    const id = e && e.id != null ? String(e.id) : '';
    const t = e && e.title != null ? String(e.title).trim() : '';
    if (id && t) titleById.set(id, t);
  }
  console.log(`Library: ${lib.length} exercises, ${titleById.size} with a title.`);

  // 2. Load all plans.
  const { data: plans, error: plErr } = await s
    .from('plans').select('id,name,trainee_id,data');
  if (plErr) { console.error('PLANS READ FAILED:', plErr.message); process.exit(1); }
  console.log(`Plans: ${plans.length}`);

  let plansChanged = 0, cellsFilled = 0, stillUnresolved = 0;
  const unresolvedSamples = [];
  const changedPlanSamples = [];

  for (const plan of plans) {
    const data = plan.data;
    if (!data || !Array.isArray(data.days)) continue;
    let planTouched = false;

    for (const day of data.days) {
      if (!day || typeof day !== 'object') continue;
      // both shapes: expanded `exercises` and compressed `ex`
      for (const key of ['exercises', 'ex']) {
        const arr = day[key];
        if (!Array.isArray(arr)) continue;
        arr.forEach((ex, i) => {
          if (!ex || typeof ex !== 'object') return;
          if (!isBlank(ex.title)) return;          // already has a name
          if (!isBlank(ex.t)) return;              // compressed title key present
          const libId = !isBlank(ex.exerciseId) ? String(ex.exerciseId).trim()
                      : !isBlank(ex.eid)        ? String(ex.eid).trim()
                      : '';
          let resolved = libId && titleById.has(libId) ? titleById.get(libId) : '';
          // last resort: the row id itself is sometimes a library id (old data)
          if (!resolved && !isBlank(ex.id) && titleById.has(String(ex.id).trim())) {
            resolved = titleById.get(String(ex.id).trim());
          }
          if (resolved) {
            ex.title = resolved;
            cellsFilled++; planTouched = true;
          } else {
            stillUnresolved++;
            if (unresolvedSamples.length < 25) {
              unresolvedSamples.push({ plan: plan.name, trainee: plan.trainee_id, libId: libId || '(none)', row: ex.id });
            }
          }
        });
      }
    }

    if (planTouched) {
      plansChanged++;
      if (changedPlanSamples.length < 40) changedPlanSamples.push(`${plan.trainee_id} / ${plan.name} (${plan.id})`);
      if (APPLY) {
        const { error: upErr } = await s.from('plans').update({ data }).eq('id', plan.id);
        if (upErr) { console.error(`UPDATE FAILED ${plan.id}:`, upErr.message); process.exit(1); }
      }
    }
  }

  console.log('\n===== ' + (APPLY ? 'APPLIED' : 'DRY RUN') + ' =====');
  console.log(`Plans with fills: ${plansChanged}`);
  console.log(`Titles filled:    ${cellsFilled}`);
  console.log(`Still unresolved (no title, no matching library id): ${stillUnresolved}`);
  if (changedPlanSamples.length) {
    console.log('\nChanged plans:');
    changedPlanSamples.forEach(p => console.log('  - ' + p));
  }
  if (unresolvedSamples.length) {
    console.log('\nUnresolved samples (title-less, unmatchable exerciseId — likely dynamic/custom):');
    unresolvedSamples.forEach(u => console.log(`  - ${u.trainee} / ${u.plan} :: libId=${u.libId} row=${u.row}`));
  }
  if (!APPLY) console.log('\n(DRY RUN — re-run with --apply to write.)');
  process.exit(0);
})();
