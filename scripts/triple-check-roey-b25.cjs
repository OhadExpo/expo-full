// Strict end-to-end verifier for Roey Block #25.
// Cross-references PDF expectations against live Supabase state.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_tb6bfw9qmoosndn9';

// What the PDF says, in order, per day. Title matching is loose (substring).
const EXPECTED = {
  'Day A - Morning Routine': [
    'RDL to Baby Squat Stretch',
    'Squatting Alternating Knee To Floor',         // PDF: "Squat-POS Alternating Knee to floor"
    'SA Crab-POS Raise',
    'Prone-Laying Deficit SA Y-Raise',
    'ISO Prone-Laying T-Raise',
    'Supine-Laying Deficit External Rotation',
    'SA Bear-POS SCAP Protraction/Retraction',
    'Wall-Supported Forhead (Occipital) Ball Slide',
  ],
  'Day B': [
    'Standing Rotational OHP MED-Ball Slam',
    'Fake Slam',                                    // PDF: "Standing Rotational OHP MED-Ball Fake-Slam"
    'Hand-Assisted Unilateral DB Shrimp Squat',
    'BB Larsen Press',
    'SA Cable Pulldown',                            // PDF: "Pronated SA Cable Pulldown"
    'Tall-Kneeling DB OHP',                         // PDF: "Tall-Kneeling Pronated DB OHP"
    'Tall-Kneeling (Bench) Hand-Supported SA DB Row',
    'Prone-Laying Supinated to Pronated DB Y-Raise',
    'Declined-Laying Leg-Raise',
  ],
  'Day C': [
    'FFESS to Standing to Lunge POGO Jump',
    'FFESS to Lunge POGO Jump',
    'Deficit/Low-Handles Trap-Bar Deadlift',        // PDF: "Deficit\\Low-Handles Trap-Bar DL"
    'ISO Chest-Supported Wide-Pronated DB Row',
    'Seated Cable Facepull',                        // PDF: "Sitted Cable Facepull"
    'ISO BB Bench Press',
    'Machine Chest Press',
    'Contralateral Walking OH DB Lunge',
    'Hollow-POS Clams',
  ],
};

const isHebrew = (s) => /[֐-׿]/.test(s || '');

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const [{ data: row }, { data: plan }] = await Promise.all([
    s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle(),
    s.from('plans').select('*').eq('id', PLAN_ID).maybeSingle(),
  ]);
  const lib = Array.isArray(row?.value) ? row.value : [];
  const byId = Object.fromEntries(lib.map(e => [e.id, e]));

  let pass = 0, fail = 0;
  const FAIL = (msg) => { console.log('  ✗ FAIL: ' + msg); fail++; };
  const OK   = (msg) => { console.log('  ✓ ' + msg); pass++; };

  // 1. Plan exists, is active, has 3 days in correct order with correct names
  console.log('\n══ PLAN STRUCTURE ══');
  if (!plan) return FAIL('plan not found');
  plan.active ? OK('plan is active') : FAIL('plan not active');
  plan.trainee_id === 'tr_roei' ? OK('trainee_id = tr_roei') : FAIL(`trainee_id = ${plan.trainee_id}`);
  plan.name === 'Block #25' ? OK(`name = "${plan.name}"`) : FAIL(`name = "${plan.name}"`);
  const dayNames = (plan.data?.days || []).map(d => d.name);
  const expectedNames = ['Day A - Morning Routine', 'Day B', 'Day C'];
  JSON.stringify(dayNames) === JSON.stringify(expectedNames)
    ? OK(`day order: ${dayNames.join(' | ')}`)
    : FAIL(`day order WRONG: got ${dayNames.join(' | ')}`);

  // 2. Each day's exercise count + ordered title check
  for (const day of (plan.data?.days || [])) {
    console.log(`\n══ ${day.name} ══`);
    const exp = EXPECTED[day.name];
    if (!exp) { FAIL(`no expectations for "${day.name}"`); continue; }
    day.exercises.length === exp.length
      ? OK(`exercise count = ${exp.length}`)
      : FAIL(`exercise count: got ${day.exercises.length}, expected ${exp.length}`);

    // Per-exercise checks
    const sorted = [...day.exercises].sort((a, b) => a.order - b.order);
    sorted.forEach((ex, i) => {
      const e = byId[ex.exerciseId];
      if (!e) return FAIL(`#${i + 1} (${ex.exerciseId}) NOT IN LIBRARY`);
      const title = e.title || '';
      const expectFrag = exp[i];
      const titleMatch = title.toLowerCase().includes(expectFrag.toLowerCase()) ||
                         expectFrag.toLowerCase().split(' ').every(w => title.toLowerCase().includes(w));
      titleMatch
        ? OK(`#${i + 1} title contains "${expectFrag}" → "${title}"`)
        : FAIL(`#${i + 1} title MISMATCH: expected ~"${expectFrag}", got "${title}"`);

      const hasVid = !!(e.videoLink || e.videoUrl);
      hasVid ? OK(`#${i + 1} has video`) : FAIL(`#${i + 1} NO VIDEO`);

      const cues = e.cues || '';
      if (!cues) FAIL(`#${i + 1} NO CUES`);
      else if (!isHebrew(cues)) FAIL(`#${i + 1} CUES NOT HEBREW: "${cues.slice(0, 60)}…"`);
      else OK(`#${i + 1} cues are Hebrew (${cues.length} chars)`);

      // Per-exercise schema sanity
      if (typeof ex.order !== 'number') FAIL(`#${i + 1} order is not a number: ${ex.order}`);
      if (!ex.id || !ex.id.startsWith('pe_')) FAIL(`#${i + 1} bad pe id: ${ex.id}`);
    });
  }

  // 3. No regression: ensure other Roey plans still intact (sanity: count check)
  console.log('\n══ NO-REGRESSION SANITY ══');
  const { data: roeiPlans } = await s.from('plans').select('id, name, active').eq('trainee_id', 'tr_roei');
  roeiPlans.length === 25 ? OK(`Roey plan count = 25 (unchanged)`) : FAIL(`Roey plan count = ${roeiPlans.length}, expected 25`);

  // 4. Library size sanity (started 1460 → +7 new + later just patches = should be 1467)
  console.log(`library entries: ${lib.length}`);
  lib.length === 1467 ? OK('library = 1467 (1460 base + 7 new for morning routine)') : FAIL(`library = ${lib.length}, expected 1467`);

  // 5. Confirm the 7 new lib entries exist
  const NEW_IDS = [
    'ex_roeb25m_rdl_baby_sq', 'ex_roeb25m_sa_crab_raise', 'ex_roeb25m_prone_def_sa_y',
    'ex_roeb25m_iso_prone_t', 'ex_roeb25m_supine_def_er', 'ex_roeb25m_sa_bear_scap',
    'ex_roeb25m_wall_ball_slide',
  ];
  for (const id of NEW_IDS) {
    byId[id] ? OK(`new lib entry ${id} present`) : FAIL(`new lib entry ${id} MISSING`);
  }

  console.log(`\n══ TOTALS ══`);
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
