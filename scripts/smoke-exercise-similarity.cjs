// Smoke test for src/exerciseSimilarity.js against the real Supabase exercise
// library. Lets Ohad validate the scoring before any UI lands in ClientPortal.
//
// Usage:
//   node scripts/smoke-exercise-similarity.cjs                → top-5 alternates for each of 6 representative exercises
//   node scripts/smoke-exercise-similarity.cjs "lat pulldown" → top-5 alternates for the exercise whose title contains the substring
//
// Requires Supabase auth (per memory reference_scripts_trainer_auth.md).

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Re-implement the scorer here as a CommonJS copy of src/exerciseSimilarity.js
// so the script doesn't need an ESM loader. Keep the two in lockstep — if
// the algorithm changes there, mirror it here, or convert to a shared file.
const TOKEN_RE = /[\s,/&·;]+/;
function tokens(value) {
  if (!value) return [];
  return String(value).toLowerCase().split(TOKEN_RE).filter(Boolean);
}
function overlapCount(a, b) {
  if (!a || !b) return 0;
  const ta = tokens(a);
  if (ta.length === 0) return 0;
  const tb = new Set(tokens(b));
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}
const MOVEMENT_HINTS = ['squat','deadlift','press','bench','row','pulldown','pull-up','pullup','chinup','chin-up','curl','extension','fly','flye','raise','shrug','thrust','lunge','split','step-up','stepup','rdl','good morning','rotation','pallof','carry','farmer','dip','push-up','pushup','face pull','pullover','kickback','crunch','sit-up','situp','plank','hip thrust','glute bridge'];
const BODYPART_HINTS = {
  leg:      ['leg','squat','lunge','split-squat','split squat','pistol','sissy'],
  hamstring:['hamstring','rdl','romanian','good morning','glute-ham','leg curl'],
  glute:    ['glute','hip thrust','thrust','bridge','kickback','abduction'],
  calf:     ['calf','tibialis'],
  chest:    ['bench','chest','fly','flye','push-up','pushup','dip','incline','decline'],
  back:     ['row','pulldown','pull-up','pullup','chin','pullover','lat'],
  shoulder: ['press','shoulder','overhead','ohp','lateral','rear delt','face pull','shrug','raise','arnold'],
  arm:      ['curl','tricep','bicep','kickback','extension'],
  core:     ['plank','crunch','sit-up','situp','pallof','rotation','abs','oblique','dead-bug','dead bug'],
};
const BODYPART_PRIORITY = ['leg','hamstring','glute','calf','chest','back','shoulder','arm','core'];
const EQUIPMENT_HINTS = ['bb','barbell','db','dumbbell','kb','kettlebell','cable','machine','smith','band','banded','bodyweight','bw','sled','trx','ring','sandbag','medball','medicine ball'];
function findHints(title, hints) { const t=(title||'').toLowerCase(); const f=new Set(); for (const h of hints) if (t.includes(h)) f.add(h); return f; }
function detectBodyParts(title) {
  const t=(title||'').toLowerCase(); const f=new Set();
  for (const part of BODYPART_PRIORITY) {
    for (const hint of BODYPART_HINTS[part]) { if (t.includes(hint)) { f.add(part); break; } }
  }
  return f;
}
function setOverlap(a,b){let n=0;for(const x of a)if(b.has(x))n++;return n;}
function setDifference(a,b){let n=0;for(const x of a)if(!b.has(x))n++;return n;}
function scoreSimilarity(target, candidate) {
  if (!target || !candidate) return 0;
  if (target.id === candidate.id) return -Infinity;
  if (!candidate.title) return 0;
  let s = 0;
  let classSignal = false;
  if (target.movementPattern && candidate.movementPattern === target.movementPattern) { s += 40; classSignal = true; }
  if (target.category && candidate.category === target.category) { s += 20; classSignal = true; }
  if (target.movementType && candidate.movementType === target.movementType) { s += 15; classSignal = true; }
  if (target.resistanceType && candidate.resistanceType
      && candidate.resistanceType !== target.resistanceType) { s += 15; classSignal = true; }
  if (target.bodyPosition && candidate.bodyPosition === target.bodyPosition) { s += 10; classSignal = true; }
  if (target.laterality && candidate.laterality === target.laterality) { s += 10; classSignal = true; }
  if (target.primaryMuscles) {
    const m = overlapCount(target.primaryMuscles, candidate.primaryMuscles);
    if (m > 0) { s += m * 10; classSignal = true; }
  }
  if (target.secondaryMuscles) s += overlapCount(target.secondaryMuscles, candidate.secondaryMuscles) * 5;
  if (target.jointMovements && candidate.jointMovements === target.jointMovements) { s += 5; classSignal = true; }
  const tMove = findHints(target.title, MOVEMENT_HINTS);
  const cMove = findHints(candidate.title, MOVEMENT_HINTS);
  const tEquip = findHints(target.title, EQUIPMENT_HINTS);
  const cEquip = findHints(candidate.title, EQUIPMENT_HINTS);
  const tBody = detectBodyParts(target.title);
  const cBody = detectBodyParts(candidate.title);
  const bodyOverlap = setOverlap(tBody, cBody);
  if (tBody.size > 0 && bodyOverlap === 0) return 0;
  s += bodyOverlap * 30;
  s += Math.min(50, setOverlap(tMove, cMove) * 25);
  s += Math.min(20, setDifference(cEquip, tEquip) * 10);
  if (!classSignal && setOverlap(tMove, cMove) === 0 && bodyOverlap === 0) return 0;
  return s;
}
function findAlternates(target, library, n = 5) {
  if (!target || !Array.isArray(library)) return [];
  const scored = [];
  for (const ex of library) {
    const sc = scoreSimilarity(target, ex);
    if (sc > 0) scored.push({ exercise: ex, score: sc });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

(async () => {
  const sb = createClient(
    'https://gtcbfglttoiyfsnfbhdy.supabase.co',
    'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv',
  );
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (authErr) { console.error('auth:', authErr.message); process.exit(1); }

  const { data: store, error } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  if (error) { console.error('fetch:', error.message); process.exit(1); }
  const library = store?.value || [];
  console.log(`Library: ${library.length} exercises\n`);

  const wantQuery = process.argv[2]?.toLowerCase();
  const samples = wantQuery
    ? library.filter(e => (e.title || '').toLowerCase().includes(wantQuery)).slice(0, 1)
    // Default: pick representative exercises across patterns + equipment.
    : [
        'lat pulldown', 'bench press', 'romanian deadlift', 'leg press',
        'cable row', 'back squat',
      ].map(q => library.find(e => (e.title || '').toLowerCase().includes(q))).filter(Boolean);

  if (samples.length === 0) {
    console.error(`No exercise matched "${wantQuery}". Try a broader substring.`);
    process.exit(2);
  }

  for (const target of samples) {
    console.log(`\n──────────────────────────────────────────────────────────────`);
    console.log(`TARGET: ${target.title}`);
    console.log(`  pattern=${target.movementPattern || '—'}  cat=${target.category || '—'}  type=${target.movementType || '—'}  resist=${target.resistanceType || '—'}  pos=${target.bodyPosition || '—'}`);
    console.log(`  primary=${target.primaryMuscles || '—'}  secondary=${target.secondaryMuscles || '—'}`);
    const alts = findAlternates(target, library, 5);
    if (alts.length === 0) {
      console.log('  → no alternates scored > 0');
      continue;
    }
    console.log('  Top 5 alternates:');
    for (const { exercise: e, score } of alts) {
      console.log(`    [${String(score).padStart(3)}]  ${e.title}`);
      console.log(`            ${e.movementPattern || '—'} | ${e.resistanceType || '—'} | ${e.primaryMuscles || '—'}`);
    }
  }
})();
