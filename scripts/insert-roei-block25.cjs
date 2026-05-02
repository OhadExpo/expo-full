// Insert Roei Block #25 from PDF.
// - Adds 7 new entries to expo-exercises library (titles only; videoLink/cues empty for Ohad to fill).
// - Inserts new plan row with 18 exercises across 2 days; sets/reps left empty for Ohad to fill.
//
// Usage:
//   node scripts/insert-roei-block25.cjs            # dry-run (prints plan + library diff, NO writes)
//   node scripts/insert-roei-block25.cjs --commit   # writes both
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const s = createClient(SB, 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const COMMIT = process.argv.includes('--commit');

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// --- Match decisions ---
// EXISTING: { existingEid: 'eid' }    NEW: { newTitle: '...' }
const day1 = [
  { newTitle: 'Standing Rotational OHP MED-Ball Slam' },                // 1
  { existingEid: 'ex_jba6g9hgk7kmo7afevm' },                              // 2 = Standing MED-Ball Rotational OHP "Fake Slam"
  { newTitle: 'Hand-Assisted Unilateral DB Shrimp Squat' },              // 3
  { existingEid: 'ex_gmn4zkn0acmo7afevm' },                              // 4 = BB Larsen Press
  { existingEid: 'e61' },                                                // 5 = SA Cable Pulldown (pronated implicit)
  { existingEid: 'ex_d8yxfmm21mhmo7afevn', superset: 'A' },              // 6a = Tall-Kneeling DB OHP (pronated implicit)
  { newTitle: 'Tall-Kneeling (Bench) Hand-Supported SA DB Row', superset: 'A' }, // 6b
  { newTitle: 'Prone-Laying Supinated to Pronated DB Y-Raise', superset: 'B' },  // 7a
  { newTitle: 'Declined-Laying Leg-Raise', superset: 'B' },              // 7b
];
const day2 = [
  { existingEid: 'ex_34r9xg3amnxqyj3e' },                                // 1 = FFESS to Standing to Lunge POGO Jump
  { existingEid: 'e37' },                                                // 2 = FFESS to Lunge POGO Jump
  { existingEid: 'ex_aiqevttcg7umobz1x89' },                             // 3 = Deficit/Low-Handles Trap-Bar Deadlift
  { existingEid: 'e222' },                                               // 4 = ISO Chest-Supported Wide-Pronated DB Row
  { existingEid: 'ex_d4vfns0625pmo7afevm' },                             // 5 = Seated Cable Facepull (Sitted = Seated)
  { existingEid: 'e221', superset: 'A' },                                // 6a = ISO BB Bench Press
  { existingEid: 'ex_7x4piwm6opmmo91d9mm', superset: 'A' },              // 6b = Machine Chest Press
  { newTitle: 'Contralateral Walking OH DB Lunge', superset: 'B' },      // 7a
  { newTitle: 'Hollow-POS Clams', superset: 'B' },                       // 7b
];

function emptyExerciseEntry(title) {
  return {
    id: 'ex_' + uid(),
    title,
    videoLink: '',
    cues: '',
    notes: '',
    category: '',
    resistanceType: '',
    movementPattern: '',
    laterality: '',
    primaryMuscles: '',
    secondaryMuscles: '',
    primaryJoints: '',
    jointMovements: '',
    bodyPosition: '',
    movementType: '',
  };
}

function planExercise({ exerciseId, superset, order }) {
  return {
    id: 'pe_' + uid(),
    exerciseId,
    sets: 3,        // default; Ohad fills exact value later
    reps: '',       // empty placeholder
    load: '',
    rpe: '',
    tempo: '',
    rest: '90',
    notes: '',
    order,
    superset: superset || '',
    wk: null,
    wkS: null,
  };
}

(async () => {
  const auth = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (auth.error) throw new Error('auth failed: ' + auth.error.message);

  // 1) Load library
  const { data: row, error: libErr } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  if (libErr) throw new Error('library read failed: ' + libErr.message);
  const lib = row?.value || [];
  console.log('library size before:', lib.length);

  // 2) Resolve eids — create new entries for newTitle items
  const newEntries = [];
  function resolve(item) {
    if (item.existingEid) {
      const found = lib.find(e => e.id === item.existingEid);
      if (!found) throw new Error('existing eid not found: ' + item.existingEid);
      return { eid: found.id, title: found.title };
    }
    if (item.newTitle) {
      const entry = emptyExerciseEntry(item.newTitle);
      newEntries.push(entry);
      return { eid: entry.id, title: entry.title, isNew: true };
    }
    throw new Error('item has neither existingEid nor newTitle');
  }
  function buildDay(name, items) {
    const exercises = items.map((it, i) => {
      const r = resolve(it);
      return { ...planExercise({ exerciseId: r.eid, superset: it.superset, order: i }), _displayTitle: r.title, _isNew: r.isNew };
    });
    return { id: 'pd_' + uid(), name, exercises };
  }

  const dA = buildDay('Day A', day1);
  const dB = buildDay('Day B', day2);

  // 3) Print plan summary
  console.log('\n===== Plan summary =====');
  for (const d of [dA, dB]) {
    console.log(`\n${d.name}:`);
    d.exercises.forEach((ex, i) => {
      const ssTag = ex.superset ? `[${ex.superset}]` : '   ';
      const newTag = ex._isNew ? '  *NEW LIB*' : '';
      console.log(`  ${i + 1} ${ssTag} ${ex._displayTitle}${newTag}  (eid=${ex.exerciseId})`);
    });
  }
  console.log(`\nNew library entries to add: ${newEntries.length}`);
  for (const e of newEntries) console.log(`  + ${e.id}  ${e.title}`);

  // strip helper fields before save
  for (const d of [dA, dB]) for (const ex of d.exercises) { delete ex._displayTitle; delete ex._isNew; }

  // 4) Build plan row
  const plan = {
    id: 'plan_' + uid(),
    name: 'Block #25',
    trainee_id: 'tr_roei',
    phase: '',
    notes: '',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_template_purchase: false,
    data: {
      days: [dA, dB],
      warmup: [],
      weeks: 4,
      isTemplatePurchase: false,
    },
  };
  console.log('\nPlan row id:', plan.id);

  if (!COMMIT) {
    console.log('\nDRY RUN — no writes. Re-run with --commit to apply.');
    return;
  }

  // 5) Append new library entries + upsert
  if (newEntries.length > 0) {
    const nextLib = [...lib, ...newEntries];
    const { error: e1 } = await s.from('store').upsert({
      key: 'expo-exercises',
      value: nextLib,
      updated_at: new Date().toISOString(),
    });
    if (e1) throw new Error('library write failed: ' + e1.message);
    console.log('library size after:', nextLib.length);
  }

  // 6) Insert plan row
  const { error: e2 } = await s.from('plans').upsert(plan);
  if (e2) throw new Error('plan upsert failed: ' + e2.message);
  console.log('inserted plan:', plan.id);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
