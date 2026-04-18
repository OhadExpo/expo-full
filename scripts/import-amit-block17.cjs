const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
const APPLY = process.argv[2] === 'apply';

const uid = () => crypto.randomBytes(6).toString('hex') + Date.now().toString(36).slice(-4);

const TRAINEE_ID = 'tr_amit';
const TRAINEE_NAME = 'עמית יהודאי';
const PLAN_NAME = 'Block #17';
const PLAN_ID = 'pl_' + uid();

// Rest prescription rule (from CSV Instructions row)
// BB exercises + Chinups → 180s (2:00-3:30 MIN middle)
// Everything else → 120s (1:30-2:30 MIN middle)
const restFor = (title) => {
  const t = title.toLowerCase();
  if (t.startsWith('bb ') || t.includes(' bb ') || t.startsWith('bb/') || t.includes('chin-up') || t.includes('chinup')) return '180';
  return '120';
};

// Day A (8 exercises)
const dayA = {
  id: uid(),
  name: 'Day A',
  exercises: [
    { title: 'DB Squat POGO Jump', sets: 3, reps: '6', tempo: '', notes: '' },
    { title: 'DB Squat Jump', sets: 3, reps: '6', tempo: '', notes: '' },
    { title: 'BB Pendlay Row', sets: 3, reps: '4', tempo: '', notes: '' },
    { title: 'Hand-Release to Power Push-Up', sets: 3, reps: '6', tempo: '', notes: '' },
    { title: 'Continious Power SL Hip-Thrust', sets: 2, reps: '10 E', tempo: '', notes: '' },
    { title: 'Alternating DB Chest Press', sets: 2, reps: '10 E', tempo: '', notes: '' },
    { title: 'Half-Kneeling SA Cable Row', sets: 3, reps: '12 E', tempo: '', notes: '' },
    { title: 'Short-Lever ABs Sit-Up', sets: 3, reps: '15 SEC to 10 REPs', tempo: 'ISO to REPs', notes: '' },
  ]
};

// Day B (8 exercises)
const dayB = {
  id: uid(),
  name: 'Day B',
  exercises: [
    { title: 'Deep-Squat POGO Jump', sets: 2, reps: '10 SEC', tempo: '', notes: '' },
    { title: 'Standing VERT Jump to SL Landing', sets: 2, reps: '3 E', tempo: '', notes: '' },
    { title: 'Continious SL VERT Jump to SL Snap-Down', sets: 2, reps: '4 + 4 E', tempo: '', notes: '' },
    { title: 'BB/DB Jefferson DL', sets: 3, reps: '5', tempo: '8-10 SEC Per REP', notes: '' },
    { title: 'SA Cable Pulldown', sets: 4, reps: '8 E', tempo: '3-4 SEC ECC', notes: '' },
    { title: 'Machine Chest-Supported Row', sets: 2, reps: '20', tempo: '3-4 SEC ECC', notes: '' },
    { title: 'Machine Leg Extension', sets: 3, reps: '15', tempo: '', notes: '' },
    { title: 'ISO GHD AB Sit-Up w 90° Twist', sets: 3, reps: '6 E', tempo: '', notes: '' },
  ]
};

// Day C (8 exercises, last one has weekly progression)
const dayC = {
  id: uid(),
  name: 'Day C',
  exercises: [
    { title: 'Depth Drop SL Snap-Down to Lateral Bound', sets: 3, reps: '4 x 2 E', tempo: '3-Way (L,R, Forward)', notes: '' },
    { title: 'B-Stance DB Fast ECC DL', sets: 3, reps: '4 E', tempo: '', notes: '' },
    { title: 'Tall-Kneeling Over-Head MED-Ball Fake Slam', sets: 2, reps: '8', tempo: '', notes: '' },
    { title: 'Standing MED-Ball Lateral Fake Toss', sets: 2, reps: '6 E', tempo: '', notes: '' },
    { title: 'Walking DB Lunge', sets: 2, reps: '10 E', tempo: '', notes: '' },
    { title: 'Wide-Pronated HOZ Cable Row', sets: 3, reps: '12', tempo: '', notes: '' },
    { title: 'Dead-Bug POS DB Pullover', sets: 3, reps: '12', tempo: '1 SEC Dead-Stop', notes: '' },
    { title: 'ISO Pronated Dead-Hang Leg Raise', sets: 2, reps: '25 SEC', tempo: '', notes: 'W1: 25 SEC · W2: 35 SEC · W3: 45 SEC · W4: 1 Set × 60 SEC' },
  ]
};

// Apply exercise-id + rest + order + superset + load + rpe to every exercise
const wrapExercises = (day) => ({
  ...day,
  exercises: day.exercises.map((ex, i) => ({
    id: uid(),
    order: i,
    exerciseId: '',
    rpe: '',
    load: '',
    rest: restFor(ex.title),
    sets: ex.sets,
    reps: ex.reps,
    tempo: ex.tempo,
    notes: ex.notes,
    title: ex.title,
    superset: '',
    wk: null,
  })),
});

const days = [wrapExercises(dayA), wrapExercises(dayB), wrapExercises(dayC)];

const warmupText = [
  'Plate-Supported Hip Airplane (1×10 E)',
  'BW Step-Down (1×10 E)',
  'Alternating Supinated to Pronated Dead Hang (1× 4 + 4)',
].join(' · ');

const planNotes = [
  'WARM-UP: ' + warmupText,
  'REST: BB exercises + Chin-ups → 2:00-3:30 MIN · Everything else → 1:30-2:30 MIN',
  'WEEKLY STRUCTURE: Day A · Rest · Day B · Rest · Day C · 2 Rest Days (repeat weekly)',
  '4-WEEK BLOCK: Progressive overload on Day C #8 (ISO Dead-Hang Leg Raise): W1=25SEC, W2=35SEC, W3=45SEC, W4=1×60SEC',
  'BW check weekly.',
].join('\n');

const plan = {
  id: PLAN_ID,
  name: PLAN_NAME,
  traineeId: TRAINEE_ID,
  phase: 'Power/Strength',
  notes: planNotes,
  active: true,
  createdAt: new Date().toISOString(),
  days,
  warmup: [],
};

console.log('='.repeat(60));
console.log(APPLY ? 'APPLY MODE' : 'DRY RUN');
console.log('='.repeat(60));
console.log('Plan ID:', plan.id);
console.log('Trainee:', TRAINEE_NAME, '(' + TRAINEE_ID + ')');
console.log('Name:', plan.name);
console.log('Phase:', plan.phase);
console.log('Days:', days.length);
console.log('Total exercises:', days.reduce((a, d) => a + d.exercises.length, 0));
console.log('');
days.forEach(d => {
  console.log(`--- ${d.name} (${d.exercises.length} exercises) ---`);
  d.exercises.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.title}  ${e.sets}×${e.reps}${e.tempo ? ' · tempo: ' + e.tempo : ''}${e.notes ? ' · note: ' + e.notes : ''}  rest=${e.rest}s`);
  });
  console.log('');
});

if (!APPLY) { console.log('(dry run - rerun with "apply")'); return; }

(async () => {
  // 1. Append to store.expo-plans blob
  const { data: pr } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const plans = pr?.value || [];
  // Safety: check no Block #17 already exists for Amit
  const existing = plans.find(p => p.traineeId === TRAINEE_ID && p.name === PLAN_NAME);
  if (existing) {
    console.error('ABORT: Block #17 already exists for Amit. Id=' + existing.id);
    process.exit(1);
  }
  const newPlans = [...plans, plan];
  const { error: e1 } = await s.from('store').update({ value: newPlans }).eq('key', 'expo-plans');
  if (e1) throw e1;
  console.log('✓ Added to store.expo-plans (' + newPlans.length + ' plans total)');

  // 2. Insert into plans table (row-per-plan)
  const { error: e2 } = await s.from('plans').insert({
    id: plan.id,
    name: plan.name,
    trainee_id: plan.traineeId,
    phase: plan.phase,
    notes: plan.notes,
    data: { days: plan.days, warmup: plan.warmup },
    created_at: plan.createdAt,
  });
  if (e2) {
    console.log('  WARN plans table insert failed:', e2.message);
  } else {
    console.log('✓ Inserted into plans table (row-per-plan)');
  }

  // 3. Portal visibility: show Block #17, hide Block #16
  const { data: pv } = await s.from('store').select('value').eq('key', 'expo-portal-vis').maybeSingle();
  const vis = pv?.value || {};
  const visKey17 = `${TRAINEE_NAME}:${PLAN_NAME}`;
  const visKey16 = `${TRAINEE_NAME}:Block #16`;
  vis[visKey17] = true;
  vis[visKey16] = false;
  const { error: e3 } = await s.from('store').update({ value: vis }).eq('key', 'expo-portal-vis');
  if (e3) {
    // No row yet - insert
    const { error: e3b } = await s.from('store').insert({ key: 'expo-portal-vis', value: vis });
    if (e3b) throw e3b;
    console.log('✓ Inserted expo-portal-vis with Block #17 visible, Block #16 hidden');
  } else {
    console.log('✓ Updated expo-portal-vis: Block #17 visible, Block #16 hidden');
  }

  console.log('\nDone.');
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
