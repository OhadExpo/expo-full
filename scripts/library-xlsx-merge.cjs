// Add-only merge of the canonical xlsx taxonomy into expo-exercises (store key).
//   - Match xlsx row -> expo exercise by normalized title.
//   - Fill ONLY blank taxonomy fields. Never overwrite an existing value.
//   - NEVER touch cues or videoLink (and the xlsx has no notes/urls anyway).
//   - Dry-run by default; pass --apply to write back.
// Run: node scripts/library-xlsx-merge.cjs [--apply]
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const XLSX_JSON = 'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\claude\\C--Users-Administrator-Desktop-expo-full\\33c126c1-1fa5-49fc-8867-e401ddbc6e30\\scratchpad\\xlsx_library.json';

// taxonomy fields we may fill (cues/videoLink/notes intentionally excluded)
const FIELDS = ['resistanceType', 'bodyPosition', 'movementType', 'primaryJoints',
                'jointMovements', 'primaryMuscles', 'secondaryMuscles', 'laterality'];
const APPLY = process.argv.includes('--apply');

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
// token-set key: same words regardless of order / hyphenation / punctuation.
// High-confidence "same exercise" only when the EXACT word set matches — a
// different grip/tempo/position qualifier is a different token, so it won't merge.
const tset = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: row, error } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  if (error) throw error;
  const exercises = row.value;
  if (!Array.isArray(exercises)) throw new Error('expo-exercises is not an array');

  const xlsx = JSON.parse(fs.readFileSync(XLSX_JSON, 'utf8')); // { normName: {name, ...fields} }

  // index expo by normalized title AND by token-set key (exact-first fallback)
  const byName = new Map(), byTset = new Map();
  for (const ex of exercises) {
    const k = norm(ex.title);
    if (k && !byName.has(k)) byName.set(k, ex);
    const t = tset(ex.title);
    if (t && !byTset.has(t)) byTset.set(t, ex);
  }
  const lookup = (name) => byName.get(norm(name)) || byTset.get(tset(name)) || null;

  const fill = Object.fromEntries(FIELDS.map(f => [f, 0]));
  let matched = 0, changedExercises = 0;
  const unmatched = [];
  // safety snapshot: cues + videoLink of every exercise, to prove none change
  const before = exercises.map(e => ({ cues: e.cues, videoLink: e.videoLink, notes: e.notes }));

  for (const [k, rec] of Object.entries(xlsx)) {
    const ex = lookup(rec.name);
    if (!ex) { unmatched.push(rec.name); continue; }
    matched++;
    let touched = false;
    for (const f of FIELDS) {
      if (!blank(rec[f]) && blank(ex[f])) {
        ex[f] = rec[f];
        fill[f]++;
        touched = true;
      }
    }
    if (touched) changedExercises++;
  }

  // integrity check: cues/videoLink/notes must be byte-identical
  let violations = 0;
  exercises.forEach((e, i) => {
    if (e.cues !== before[i].cues || e.videoLink !== before[i].videoLink || e.notes !== before[i].notes) violations++;
  });

  console.log('=== expo-exercises add-only merge (%s) ===', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('expo library size      :', exercises.length);
  console.log('xlsx unique exercises  :', Object.keys(xlsx).length);
  console.log('matched by title       :', matched);
  console.log('unmatched (xlsx only)  :', unmatched.length);
  console.log('exercises modified     :', changedExercises);
  console.log('fields filled (blanks) :', JSON.stringify(fill, null, 0));
  console.log('cues/videoLink/notes changed:', violations, violations ? '!!! ABORT' : '(none — safe)');
  console.log('--- sample unmatched (first 25) ---');
  console.log(unmatched.slice(0, 25).join('\n'));
  fs.writeFileSync(XLSX_JSON.replace('xlsx_library.json', 'merge_unmatched.txt'), unmatched.join('\n'), 'utf8');

  if (violations) { console.log('Refusing to write: cues/urls would change.'); process.exit(1); }

  if (APPLY) {
    if (changedExercises === 0) { console.log('Nothing to write.'); process.exit(0); }
    const { error: werr } = await s.from('store').upsert({ key: 'expo-exercises', value: exercises });
    if (werr) throw werr;
    console.log('\n*** WROTE expo-exercises: %d exercises enriched ***', changedExercises);
  } else {
    console.log('\n(dry-run — no write. Re-run with --apply to commit.)');
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
