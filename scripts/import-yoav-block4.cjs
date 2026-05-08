// Import Yoav Shamri Block #4 (1-page handwritten PDF dropped in repo root).
// Source: "יואב שמרי - בלוק #4.pdf" — 2 training days + Days 2-3 rest banner.
// Reps/sets/tempo/load are intentionally blank (per source — Ohad fills the
// programming side himself). Each exercise title is matched against the
// existing exercise library so library-side videoLink + cues are inherited
// (the per-plan ex.videoUrl override is left undefined → ClientPortal +
// PlanEditor render the library URL via the existing fallback path).
//
// Run:
//   node scripts/import-yoav-block4.cjs        # dry run, prints match report
//   node scripts/import-yoav-block4.cjs apply  # writes the plan row

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TRAINER_EMAIL = 'ohadyproductions@gmail.com';
const TRAINER_PASSWORD = '1234';

const APPLY = process.argv[2] === 'apply';
const uid = (prefix) => prefix + crypto.randomBytes(6).toString('hex') + Date.now().toString(36).slice(-4);

// Block #4 contents — transcribed verbatim from the handwritten PDF.
// `ss` = superset letter (xlsx-style "6a"/"6b" → both "A"; "7a"/"7b" → "B").
// Per repo convention: capture the GROUP number (mod-5 starting at A) so
// 6a/6b → A, 7a/7b → B. Singletons (1..5) get no superset.
const BLOCK4 = {
  blockName: 'Block #4',
  warmup: [
    { t: 'SA Bear-POS', rx: '2 sets' },
    { t: 'SCAP PRO/RET', rx: '2 sets' },
  ],
  days: [
    {
      name: 'Day 1',
      exercises: [
        { title: 'Depth Landing to Box Landing (4-Way)', ss: '' },
        { title: 'BB Lunge', ss: '' },
        { title: 'Push-Up Tantrum', ss: '' },
        { title: 'Floating Heel DB Goblet Squat', ss: '' },
        { title: 'DB Arnold Chest Press', ss: '' },
        { title: 'Wide-Pronated Pull-Up + ISO Knee Raise', ss: 'A' },
        { title: 'Power SL Hip Thrust & High Catch', ss: 'A' },
        { title: 'Lying Elbow-Supported Knee Extension', ss: 'B' },
      ],
    },
    {
      name: 'Day 2',
      exercises: [
        { title: 'SL Box Jump to SL Landing', ss: '' },
        { title: 'SL Lateral Snap-Down to Lateral Bound (Back to Box)', ss: '' },
        { title: 'BB SLDL', ss: '' },
        { title: 'Seated (No Back-Support) MID-POS DB OHP', ss: '' },
        { title: 'BW Step Down', ss: '' },
        { title: 'Push-Up POS SA DB Row', ss: 'A' },
        { title: 'Declined Lying GHD ABs Sit-Up w 90° ROT', ss: 'A' },
        { title: 'Dead-Bug POS DB Shoulder Internal-External Rotation', ss: 'B' },
      ],
    },
  ],
};

// ----- title matching ------------------------------------------------------

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[–—]/g, '-')   // en/em dash → hyphen
  .replace(/[^\w\s-+&()/]/g, ' ')    // strip most punctuation
  .replace(/\s+/g, ' ')
  .trim();

// Common transliteration synonyms — the library uses some Hebrew→English
// forms inconsistently. "Laying" appears throughout the library while
// the PDFs Ohad writes use "Lying" (the more standard English). They
// always refer to the same body position.
const SYN = { lying: 'laying' };

// Tighter "tokens" — strip ALL punctuation including hyphens so
// "4-Way" === "4 Way" and "Hip-Thrust" === "Hip Thrust" tokenize the
// same. The exercise library has both forms scattered throughout
// (likely a source-of-truth artifact), so being tolerant about word
// boundaries is the correct call here. Word ORDER is also handled
// downstream by token-set equality, which catches cases like
// "SA DB Row" vs "DB SA Row".
const tok = (s) => norm(s)
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean)
  .map(t => SYN[t] || t);

const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');

function jaccard(aTok, bTok) {
  const A = new Set(aTok); const B = new Set(bTok);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function findMatch(title, lib) {
  const want = norm(title);
  const wantTok = tok(title);
  const wantKey = tokenSetKey(title);

  // 1) Exact normalized title match.
  for (const ex of lib) {
    if (norm(ex.title) === want) return { ex, score: 1.0, kind: 'exact' };
  }

  // 2) Token-set match (identical token bag, ignoring punctuation/order).
  //    These are the same exercise in practice — e.g. "4-Way" vs "4 Way",
  //    "Step Down" vs "Step-Down", "SA DB Row" vs "DB SA Row".
  for (const ex of lib) {
    if (tokenSetKey(ex.title) === wantKey) return { ex, score: 1.0, kind: 'exact' };
  }

  // 3) Best fuzzy by Jaccard. Used only for the report — videoLink/cues
  //    are NOT inherited from fuzzy matches (videolink-accuracy rule).
  let best = null; let bestScore = 0;
  for (const ex of lib) {
    const s = jaccard(wantTok, tok(ex.title));
    if (s > bestScore) { bestScore = s; best = ex; }
  }
  return { ex: best, score: bestScore, kind: bestScore >= 0.7 ? 'close' : 'none' };
}

// ---------------------------------------------------------------------------

(async () => {
  const sb = createClient(SUPA_URL, SUPA_KEY);
  console.log('signing in as trainer…');
  const { error: aErr } = await sb.auth.signInWithPassword({ email: TRAINER_EMAIL, password: TRAINER_PASSWORD });
  if (aErr) { console.error('auth failed:', aErr); process.exit(1); }

  // Pull the exercise library for title matching.
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  console.log(`exercise library: ${lib.length} entries`);

  // Sanity check — make sure tr_yoav doesn't already have Block #4.
  const { data: existing } = await sb.from('plans').select('id,name').eq('trainee_id', 'tr_yoav');
  if (existing?.some(p => p.name === BLOCK4.blockName)) {
    console.error(`! tr_yoav already has a plan named "${BLOCK4.blockName}". Aborting.`);
    process.exit(1);
  }

  // Build the days payload, matching each exercise to the library.
  const days = BLOCK4.days.map((d) => ({
    id: uid(''),
    name: d.name,
    exercises: d.exercises.map((row, idx) => {
      const m = findMatch(row.title, lib);
      const linked = m.kind === 'exact' ? m.ex : null;
      return {
        id: uid(''),
        exerciseId: linked ? linked.id : '',
        title: row.title,                // freeform title (renders even when unlinked)
        sets: '',                        // blank — coach fills
        reps: '',
        load: '',
        rpe: '',
        tempo: '',
        rest: '',
        notes: '',                       // empty → falls through to library cues at render time
        order: idx,
        superset: row.ss || '',
        wk: null,
        // Leave videoUrl undefined when we have a library link — the editor +
        // ClientPortal will display the library's videoLink. For unmatched
        // titles we also leave it undefined (no close-family substitution).
      };
    }),
  }));

  // Build the plan row.
  const plan = {
    id: uid('pl_'),
    name: BLOCK4.blockName,
    trainee_id: 'tr_yoav',
    phase: '',
    notes: '',
    active: true,
    data: { days, warmup: BLOCK4.warmup, weeks: 4 },
  };

  // ----- print match report -----
  let exact = 0, close = 0, none = 0;
  console.log(`\n${BLOCK4.blockName} — match report:`);
  for (const d of BLOCK4.days) {
    console.log(`\n  ${d.name}:`);
    for (const row of d.exercises) {
      const m = findMatch(row.title, lib);
      if (m.kind === 'exact') {
        exact++;
        console.log(`    ✓ ${row.title}`);
        console.log(`        → ${m.ex.title} (${m.ex.id}) videoLink=${m.ex.videoLink ? 'yes' : 'no'} cues=${m.ex.cues ? 'yes' : 'no'}`);
      } else if (m.kind === 'close') {
        close++;
        console.log(`    ~ ${row.title}`);
        console.log(`        ≈ ${m.ex?.title} (score=${m.score.toFixed(2)}) — NOT linked (per videolink-accuracy rule)`);
      } else {
        none++;
        console.log(`    ✗ ${row.title} — no library match`);
      }
    }
  }
  console.log(`\nsummary: ${exact} exact, ${close} close (unlinked), ${none} unmatched`);

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to insert.');
    process.exit(0);
  }

  const row = {
    id: plan.id,
    name: plan.name,
    trainee_id: plan.trainee_id,
    phase: plan.phase,
    notes: plan.notes,
    active: plan.active,
    data: plan.data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: pErr } = await sb.from('plans').insert([row]);
  if (pErr) { console.error('insert failed:', pErr); process.exit(1); }
  console.log(`\n✓ inserted plan ${plan.id} (${plan.name}) for tr_yoav.`);
})();
