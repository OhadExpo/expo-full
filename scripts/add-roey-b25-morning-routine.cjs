// Hybrid plan for Roey Block #25 morning routine.
//   #2  → reuse existing library eid (Squatting Alternating Knee To Floor).
//   #3, #4, #6a, #6b → create NEW library entries with exact PDF titles,
//                       copying cues + videoLink from closest existing match.
//   #1, #5, #7a → create NEW library entries with no video yet (no match).
//
// Plan changes:
//   - Insert "Day A — Morning Routine" at index 0 with all 8 exercises.
//   - Rename existing days: Day A → Day B, Day B → Day C.
//
// All seven new library entries reference IDs scoped to this op so re-runs
// are idempotent (script checks before adding).

const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_tb6bfw9qmoosndn9';

const NEW_DAY_ID = 'pd_roeb25_morning';
const PE_ID = (i) => `pe_roeb25_morn_${i}`;

// --- Library entries to add (id stable for idempotency) ---
const NEW_LIB = [
  {
    id: 'ex_roeb25m_rdl_baby_sq',
    title: 'RDL to Baby Squat Stretch',
    cues: '',
    videoLink: '',
  },
  {
    // PDF "SA Crab-POS Raise" — single-arm variant of e225 (bilateral). Reuse cues/video.
    id: 'ex_roeb25m_sa_crab_raise',
    title: 'SA Crab-POS Raise',
    cues: 'שב על הרצפה. יד אחת מתחת לכתף. עקבים בלבד על הרצפה. תרים את האגן עד שאתה בקו ישר, מהברך עד הכתפיים, כמו בהיפ-טראסט. יד אחת בכל פעם.',
    videoLink: 'https://www.youtube.com/shorts/HRN5DJKrVL0',
  },
  {
    // PDF "Prone-Laying Deficit SA Y-Raise" — Deficit variant of e3002 (ISO version).
    id: 'ex_roeb25m_prone_def_sa_y',
    title: 'Prone-Laying Deficit SA Y-Raise',
    cues: 'Lay on belly on a bench/elevated surface so the arm can drop below body level. Raise only one arm in Y position. Thumb points to ceiling. Full ROM through the deficit.',
    videoLink: 'https://www.youtube.com/shorts/UqTdjV17_ss',
  },
  {
    id: 'ex_roeb25m_iso_prone_t',
    title: 'ISO Prone-Laying T-Raise',
    cues: '',
    videoLink: '',
  },
  {
    // PDF "Supine-Laying Deficit External Rotation" — Deficit variant of e226.
    id: 'ex_roeb25m_supine_def_er',
    title: 'Supine-Laying Deficit External Rotation',
    cues: 'שכב על הגב, ידיים על משטח מורם כדי לאפשר טווח מתחת לקו הגוף. ברכיים מעל הפופיק. המרפקים הם הציר, לא זזים. שורש כף היד והמרפקים מגיעים אל הרצפה ומתחת.',
    videoLink: 'https://www.youtube.com/shorts/daMOhhSFhZE',
  },
  {
    // PDF "SA Bear-POS SCAP Protraction/Retraction" — Bear position variant of ex_m3el3c8fu2mo7afh8i.
    id: 'ex_roeb25m_sa_bear_scap',
    title: 'SA Bear-POS SCAP Protraction/Retraction',
    cues: 'Bear stance: knees off the floor, shins parallel to ground, locked elbows. Shift weight to one arm. 1) Retract and lower the working scap. 2) Protract and raise it. Keep hips square.',
    videoLink: 'https://www.youtube.com/watch?v=SIhtxKpyucw',
  },
  {
    id: 'ex_roeb25m_wall_ball_slide',
    title: 'Wall-Supported Forhead (Occipital) Ball Slide',
    cues: '',
    videoLink: '',
  },
];

// --- Morning routine ordered list. eid resolved per the (C) hybrid plan. ---
const MORNING = [
  { eid: 'ex_roeb25m_rdl_baby_sq' },
  { eid: 'ex_oxp5e58csgqmo7afloe' }, // existing: Squatting Alternating Knee To Floor
  { eid: 'ex_roeb25m_sa_crab_raise' },
  { eid: 'ex_roeb25m_prone_def_sa_y' },
  { eid: 'ex_roeb25m_iso_prone_t' },
  { eid: 'ex_roeb25m_supine_def_er' },
  { eid: 'ex_roeb25m_sa_bear_scap' },
  { eid: 'ex_roeb25m_wall_ball_slide' },
];

(async () => {
  const s = createClient(SB, KEY);
  const { error: aerr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (aerr) throw new Error('auth: ' + aerr.message);

  // ----- 1. Library: add the 7 new entries (idempotent) -----
  const { data: row, error: rerr } = await s
    .from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  if (rerr) throw rerr;
  const lib = Array.isArray(row?.value) ? row.value : [];
  const haveIds = new Set(lib.map(e => e.id));
  const toAdd = NEW_LIB.filter(e => !haveIds.has(e.id));
  console.log(`Library: existing=${lib.length}  new to add=${toAdd.length}`);

  if (toAdd.length) {
    const updated = lib.concat(toAdd.map(e => ({
      ...e,
      // keep the rest of the schema minimal — Ohad classifies later
      category: '',
      movementPattern: '',
      bodyPosition: '',
      resistanceType: '',
      movementType: '',
      laterality: '',
    })));
    const { error: uerr } = await s.from('store').upsert({ key: 'expo-exercises', value: updated });
    if (uerr) throw uerr;
    console.log('  ✓ library updated');
  } else {
    console.log('  (all new lib entries already present — skipping library write)');
  }

  // ----- 2. Plan: rebuild days -----
  const { data: plan, error: perr } = await s.from('plans').select('*').eq('id', PLAN_ID).maybeSingle();
  if (perr) throw perr;
  if (!plan) throw new Error('plan not found');

  const days = plan.data?.days || [];
  const existingMorning = days.find(d => d.id === NEW_DAY_ID);
  if (existingMorning) {
    console.log('Plan already has morning-routine day — aborting to avoid duplicate.');
    process.exit(0);
  }

  // Build new morning day
  const morningDay = {
    id: NEW_DAY_ID,
    name: 'Day A - Morning Routine',
    exercises: MORNING.map((m, i) => ({
      id: PE_ID(i),
      wk: null,
      rpe: '',
      wkS: null,
      load: '',
      reps: '',
      rest: '',
      sets: '',
      notes: '',
      order: i,
      tempo: '',
      superset: '',
      exerciseId: m.eid,
    })),
  };

  // Rename existing Day A → Day B, Day B → Day C
  const renamed = days.map(d => {
    if (d.name === 'Day A') return { ...d, name: 'Day B' };
    if (d.name === 'Day B') return { ...d, name: 'Day C' };
    return d;
  });

  const newDays = [morningDay, ...renamed];
  console.log('\nNew day order:');
  newDays.forEach((d, i) => console.log(`  [${i}] ${d.name}  (${d.exercises.length} exercises)`));

  const newData = { ...plan.data, days: newDays };
  const { error: uperr } = await s
    .from('plans')
    .update({ data: newData })
    .eq('id', PLAN_ID);
  if (uperr) throw uperr;
  console.log('\n✓ Plan updated.');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
