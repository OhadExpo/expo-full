// One-shot fix script:
// 1. Set Roey's email to array ["roeyh@hotmail.com","roeycy@gmail.com"]
// 2. Replace Block #17 exercise entries with video-linked titles using the hyperlinks from Ohad's sheet
// 3. Replace Block #17 warmup entries with {t, rx, vid}
// 4. Backfill library entries (add videoLink to existing, create missing ones)

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
const APPLY = process.argv[2] === 'apply';
const uid = () => crypto.randomBytes(6).toString('hex') + Date.now().toString(36).slice(-4);

// ============= BLOCK #17 VIDEO MAP (pulled from xlsx hyperlinks) =============
const EXERCISE_VIDEOS = {
  "DB Squat POGO Jump": "https://www.youtube.com/shorts/j5dLjYJL0ag",
  "DB Squat Jump": "https://www.youtube.com/shorts/LE2WYrSEyZI",
  "BB Pendlay Row": "https://www.youtube.com/shorts/IhiF9i9s8NI",
  "Hand-Release to Power Push-Up": "https://www.youtube.com/shorts/Q0O7BWiQ1FE",
  "Continious Power SL Hip-Thrust": "https://www.youtube.com/shorts/dwNigaxVq4g",
  "Alternating DB Chest Press": "https://www.youtube.com/watch?v=MM4oFyRYeqg",
  "Half-Kneeling SA Cable Row": "https://www.youtube.com/watch?v=4QDCC2gU5_E",
  "Short-Lever ABs Sit-Up": "https://www.youtube.com/shorts/EvAup1z42-s",
  "Deep-Squat POGO Jump": "https://www.youtube.com/shorts/NE2Ctrd2fsY",
  "Standing VERT Jump to SL Landing": "https://www.youtube.com/watch?v=PNHkYbSd49w",
  "Continious SL VERT Jump to SL Snap-Down": "https://photos.app.goo.gl/e8YpU45PvYc5D51e9",
  "BB/DB Jefferson DL": "https://www.youtube.com/watch?v=7GBBkA60Yu8",
  "SA Cable Pulldown": "https://www.youtube.com/watch?v=bCjRRJ2lI8Y",
  "Machine Chest-Supported Row": "https://www.youtube.com/watch?v=7oqpWiwSjtY",
  "Machine Leg Extension": "https://www.youtube.com/shorts/fP6uMgfwqOA",
  "ISO GHD AB Sit-Up w 90° Twist": "https://www.youtube.com/watch?v=p1bpeNYhUKc",
  "Depth Drop SL Snap-Down to Lateral Bound": "https://www.youtube.com/watch?v=3mrLL7yzMnA",
  "B-Stance DB Fast ECC DL": "https://www.youtube.com/watch?v=tAvwbyE2nWc",
  "Tall-Kneeling Over-Head MED-Ball Fake Slam": "https://www.youtube.com/watch?v=mXCBGe88CvI",
  "Standing MED-Ball Lateral Fake Toss": "https://www.youtube.com/shorts/HZRyu5Whf7A",
  "Walking DB Lunge": "https://www.youtube.com/watch?v=VG12H7tYnZ8",
  "Wide-Pronated HOZ Cable Row": "https://www.youtube.com/watch?v=mNqH5_a-trw",
  "Dead-Bug POS DB Pullover": "https://www.youtube.com/watch?v=Wg2Z2hYxB0c",
  "ISO Pronated Dead-Hang Leg Raise": "https://www.youtube.com/watch?v=Ri9unVtgUK8"
};

const WARMUP_VIDEOS = {
  "Plate-Supported Hip Airplane": "https://www.youtube.com/shorts/a8as1ZMwLsE",
  "BW Step-Down": "https://www.youtube.com/watch?v=SZXOPRVP1Oc",
  "Alternating Supinated to Pronated Dead Hang": "https://www.youtube.com/shorts/g3JI-qmE0Io"
};

console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN ===');
console.log('');

(async () => {
  // ==== A. Set Roey's emails ====
  console.log('--- A. Roey email ---');
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const roey = trainees.find(t => t.id === 'tr_roei');
  console.log('  Before:', JSON.stringify(roey?.email));
  const newEmail = ["roeyh@hotmail.com", "roeycy@gmail.com"];

  // ==== B. Update Block #17 exercise + warmup ====
  console.log('\n--- B. Block #17 exercise videos ---');
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const b17Idx = plans.findIndex(p => p.traineeId === 'tr_amit' && p.name === 'Block #17');
  if (b17Idx < 0) { console.error('Block #17 not found'); process.exit(1); }
  const b17 = plans[b17Idx];

  // ==== C. Library backfill ====
  console.log('\n--- C. Exercise library backfill ---');
  const { data: er } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const exs = er?.value || [];
  const byTitle = {};
  exs.forEach(e => { if (e.title) byTitle[e.title.toLowerCase().trim()] = e; });

  // For each Block #17 exercise, determine library action
  let libToUpdate = [];
  let libToCreate = [];
  let libAlreadyGood = 0;

  Object.entries(EXERCISE_VIDEOS).forEach(([title, vid]) => {
    const existing = byTitle[title.toLowerCase().trim()];
    if (!existing) {
      libToCreate.push({ title, vid });
    } else if (!existing.videoLink) {
      libToUpdate.push({ id: existing.id, title, vid });
    } else {
      libAlreadyGood++;
    }
  });

  console.log('  Lib already has video:', libAlreadyGood);
  console.log('  Lib entries needing video URL set:', libToUpdate.length);
  libToUpdate.forEach(l => console.log('    -', l.title, '(id=' + l.id + ')'));
  console.log('  Lib entries to CREATE:', libToCreate.length);
  libToCreate.forEach(l => console.log('    +', l.title));

  // ==== D. Rebuild Block #17 exercises with exerciseId linked ====
  // First, apply the library changes to a simulated updated library, then link Block #17 to it
  console.log('\n--- D. Block #17 exercises — linking to library ---');

  // Plan the updated library (what it will look like AFTER our changes)
  const updatedLib = exs.map(e => ({ ...e }));
  // Update existing
  libToUpdate.forEach(l => {
    const rec = updatedLib.find(e => e.id === l.id);
    if (rec) rec.videoLink = l.vid;
  });
  // Add new
  libToCreate.forEach(l => {
    updatedLib.push({
      id: 'ex_' + uid(),
      title: l.title,
      videoLink: l.vid,
      category: '', resistanceType: '', bodyPosition: '', movementType: '',
      movementPattern: '', laterality: '',
      primaryMuscles: '', secondaryMuscles: '', primaryJoints: '', jointMovements: '',
      cues: '', notes: ''
    });
  });

  const updatedByTitle = {};
  updatedLib.forEach(e => { if (e.title) updatedByTitle[e.title.toLowerCase().trim()] = e; });

  // Rebuild Block #17 with exerciseId linked
  const rebuildDay = (day) => ({
    ...day,
    exercises: day.exercises.map(ex => {
      const lib = updatedByTitle[ex.title.toLowerCase().trim()];
      return { ...ex, exerciseId: lib?.id || '' };
    })
  });

  const newB17 = {
    ...b17,
    days: b17.days.map(rebuildDay),
    warmup: Object.entries(WARMUP_VIDEOS).map(([t, vid]) => {
      // Preserve the rx value from existing warmup if present
      const existingWu = (b17.warmup || []).find(w => w.t === t);
      return {
        t,
        rx: existingWu?.rx || '1x10 E',
        vid
      };
    }),
  };

  // Sanity-check: every Block #17 exercise should now have a linked id
  const unlinked = [];
  newB17.days.forEach(d => d.exercises.forEach(ex => {
    if (!ex.exerciseId) unlinked.push(ex.title);
  }));
  console.log('  Exercises with linked exerciseId: ' + (24 - unlinked.length) + '/24');
  if (unlinked.length) console.log('  UNLINKED (problem):', unlinked);

  console.log('\n  Warmup after update:');
  newB17.warmup.forEach(w => console.log('    •', w.t, '→', w.rx, '|', w.vid));

  if (!APPLY) { console.log('\n(dry run — rerun with "apply")'); return; }

  // ==== EXECUTE ====
  console.log('\n=== EXECUTING ===');

  // 1. Update exercise library
  const { error: eLib } = await s.from('store').update({ value: updatedLib }).eq('key', 'expo-exercises');
  if (eLib) throw eLib;
  console.log('✓ Exercise library updated:', updatedLib.length, 'entries (was', exs.length + ')');

  // 2. Update Block #17 in store blob
  plans[b17Idx] = newB17;
  const { error: ePlan } = await s.from('store').update({ value: plans }).eq('key', 'expo-plans');
  if (ePlan) throw ePlan;
  console.log('✓ Block #17 blob updated');

  // 3. Update Block #17 in plans table
  const { error: ePlanTbl } = await s.from('plans').update({
    data: { days: newB17.days, warmup: newB17.warmup }
  }).eq('id', newB17.id);
  if (ePlanTbl) console.log('  WARN plans table:', ePlanTbl.message);
  else console.log('✓ Block #17 plans table updated');

  // 4. Set Roey's email
  const newTrainees = trainees.map(t =>
    t.id === 'tr_roei' ? { ...t, email: newEmail } : t
  );
  const { error: eT } = await s.from('store').update({ value: newTrainees }).eq('key', 'expo-trainees');
  if (eT) throw eT;
  console.log('✓ Roey email set to', JSON.stringify(newEmail));

  console.log('\nDone.');
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
