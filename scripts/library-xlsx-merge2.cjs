// Corrected enrichment for the 75 xlsx-matched exercises: put taxonomy in the
// fields the ExercisesView table/filters actually read, and map the xlsx's own
// vocabulary onto the app enums (Dumbbell/Kettlebell -> Dumbbell, etc.) so the
// columns AND the filter dropdowns work. Overwrites ONLY the 75's taxonomy
// fields (a correction of a prior wrong-field write) — NEVER touches cues,
// videoLink, or notes. Dry-run by default; --apply to write.
//   node scripts/library-xlsx-merge2.cjs [--apply]
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const XLSX = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Desktop-expo-full/33c126c1-1fa5-49fc-8867-e401ddbc6e30/scratchpad/xlsx_library.json';
const APPLY = process.argv.includes('--apply');

const norm = (x) => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase();
const tset = (x) => norm(x).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

// xlsx resistance vocabulary -> app RESISTANCE_TYPES enum
const RES_MAP = {
  'bodyweight': 'Bodyweight', 'barbell': 'Barbell', 'swiss barbell': 'Barbell',
  'safety squat barbell': 'Barbell', 'dumbbell/kettlebell': 'Dumbbell',
  'dumbbell (incl. kb)': 'Dumbbell', 'band (resisted)': 'Band', 'band (assisted)': 'Band',
  'machine': 'Machine', 'smith machine': 'Machine', 'cable': 'Cable',
  'medicine/slam ball': 'Medicine Ball',
};
// xlsx body-position ("Kneeling (Floor)") -> app BODY_POSITIONS (strip parenthetical, map)
const BODY_MAP = { 'standing': 'Standing', 'seated': 'Seated', 'supine': 'Supine',
  'prone': 'Prone', 'kneeling': 'Kneeling', 'half-kneeling': 'Half-Kneeling',
  'tall-kneeling': 'Kneeling', 'quadruped': 'Quadruped', 'side-lying': 'Side-Lying',
  'side lying': 'Side-Lying', 'hanging': 'Hanging' };
// xlsx "Movement Type" -> app MOVEMENT_PATTERNS (prefix rules); '' = leave blank (blank > wrong)
function patternOf(mt) {
  const s = norm(mt);
  if (!s) return '';
  if (/\(isolation\)/.test(s)) return 'Isolation';   // leg extension / curl etc. — not a squat/hinge
  if (s.startsWith('horizontal push')) return 'Horizontal Push';
  if (s.startsWith('incline push')) return 'Horizontal Push';
  if (s.startsWith('vertical push')) return 'Vertical Push';
  if (s.startsWith('horizontal pull')) return 'Horizontal Pull';
  if (s.startsWith('vertical pull')) return 'Vertical Pull';
  if (s.startsWith('lower body push')) return 'Squat';
  if (s.startsWith('lower body pull')) return 'Hip Hinge';
  if (s.startsWith('lower body control')) return 'Squat';
  if (s === 'carry') return 'Carry/Loaded Locomotion';
  return ''; // Throw / Toss / Slam etc. — no clean pattern, leave blank
}
// primary muscle -> app CATEGORIES
function categoryOf(muscles) {
  const s = norm(muscles);
  if (!s) return '';
  if (/pectoral/.test(s)) return 'Chest';
  if (/deltoid|rotator cuff|supraspinatus|infraspinatus|subscapularis/.test(s)) return 'Shoulders';
  if (/latissimus|\blat\b|trapezius|rhomboid|erector|teres|spinae/.test(s)) return 'Back';
  if (/bicep|tricep|brachi|forearm|wrist/.test(s)) return 'Arms';
  if (/rectus abdominis|oblique|transvers|abdominal|\bcore\b/.test(s)) return 'Core';
  if (/gluteus|glute/.test(s)) return 'Glutes';
  if (/quadricep|hamstring|adductor|abductor|gastroc|soleus|\bcalf\b|\bquad\b|tibialis|hip flexor/.test(s)) return 'Legs';
  return '';
}
const bodyOf = (bp) => { const base = norm(bp).replace(/\s*\(.*?\)\s*/g, '').trim(); return BODY_MAP[base] || ''; };
const resOf = (r) => RES_MAP[norm(r)] || '';

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: row, error } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  if (error) throw error;
  const lib = row.value;
  const xlsx = JSON.parse(fs.readFileSync(XLSX, 'utf8'));

  // index xlsx by norm + tset
  const xByNorm = new Map(), xByTset = new Map();
  for (const r of Object.values(xlsx)) { const n = norm(r.name); if (!xByNorm.has(n)) xByNorm.set(n, r); const t = tset(r.name); if (!xByTset.has(t)) xByTset.set(t, r); }
  const lookup = (title) => xByNorm.get(norm(title)) || xByTset.get(tset(title)) || null;

  const before = lib.map(e => ({ cues: e.cues, videoLink: e.videoLink, notes: e.notes }));
  let matched = 0; const setCount = { category: 0, resistanceType: 0, bodyPosition: 0, movementType: 0, movementPattern: 0, laterality: 0, primaryMuscles: 0 };
  const unmappedRes = new Set(), unmappedBody = new Set(), noPattern = new Set();

  for (const ex of lib) {
    const x = lookup(ex.title);
    if (!x) continue;
    matched++;
    const set = (f, v) => { if (!blank(v)) { ex[f] = v; setCount[f]++; } };
    const res = resOf(x.resistanceType); if (x.resistanceType && !res) unmappedRes.add(x.resistanceType);
    const body = bodyOf(x.bodyPosition); if (x.bodyPosition && !body) unmappedBody.add(x.bodyPosition);
    const pat = patternOf(x.movementType); if (x.movementType && !pat) noPattern.add(x.movementType);
    set('resistanceType', res || x.resistanceType);   // enum where mapped, else raw (still displays)
    set('bodyPosition', body || x.bodyPosition);
    set('movementType', x.movementType);               // keep the rich raw value
    set('movementPattern', pat);                        // enum for the PATTERN column/filter
    set('primaryMuscles', x.primaryMuscles);
    set('secondaryMuscles', x.secondaryMuscles);
    set('primaryJoints', x.primaryJoints);
    set('jointMovements', x.jointMovements);
    if (x.laterality) set('laterality', x.laterality);
    set('category', categoryOf(x.primaryMuscles));
  }

  let violations = 0;
  lib.forEach((e, i) => { if (e.cues !== before[i].cues || e.videoLink !== before[i].videoLink || e.notes !== before[i].notes) violations++; });

  console.log('=== corrected enrichment (%s) ===', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('matched (75 expected):', matched);
  console.log('fields set:', JSON.stringify(setCount));
  console.log('cues/videoLink/notes changed:', violations, violations ? '!!! ABORT' : '(none — safe)');
  console.log('resistance values with NO enum map (kept raw):', [...unmappedRes]);
  console.log('body-position values with NO enum map (kept raw):', [...unmappedBody]);
  console.log('movementType with NO pattern (left blank):', [...noPattern]);
  if (violations) process.exit(1);

  if (APPLY) {
    const { error: werr } = await s.from('store').upsert({ key: 'expo-exercises', value: lib });
    if (werr) throw werr;
    console.log('\n*** WROTE — %d exercises corrected ***', matched);
  } else {
    console.log('\n(dry-run — re-run with --apply)');
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
