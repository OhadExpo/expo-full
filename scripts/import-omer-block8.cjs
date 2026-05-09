// Import Omer Sadeh Block #8 ("omer Block #8.xlsx" in repo root).
// 3 training days (A/B/C) + a 3-exercise warm-up. No supersets in source.
// Reps/sets/tempo are transcribed verbatim from the xlsx; load/rpe stay
// blank for Ohad to fill. Each exercise title is matched against the
// existing exercise library so library-side videoLink + cues are inherited
// (per the videolink-accuracy rule, only EXACT matches are linked — close
// matches stay unlinked, so Ohad never gets a wrong-exercise video).
//
// Run:
//   node scripts/import-omer-block8.cjs        # dry-run with match report
//   node scripts/import-omer-block8.cjs apply  # writes the plan row

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TRAINER_EMAIL = 'ohadyproductions@gmail.com';
const TRAINER_PASSWORD = '1234';

const TRAINEE_ID = 'tr_omer';
const PLAN_NAME = 'Block #8';

const APPLY = process.argv[2] === 'apply';
const uid = (prefix = '') => prefix + crypto.randomBytes(6).toString('hex') + Date.now().toString(36).slice(-4);

// Rest-prescription rule, transcribed verbatim from the Instructions row
// at the top of the xlsx:
//   "BB Exercises + Chinups > Rest: 2:00–3:30 MIN"
//   "Everything Else      > Rest: 1:30–2:30 MIN"
// We use the middle value of each band (180s / 120s). Trap-bar movements
// are barbell variants — covered by the BB bucket.
const restFor = (title) => {
  const t = title.toLowerCase();
  if (
    t.startsWith('bb ') || t.includes(' bb ') || t.startsWith('bb/') ||
    t.startsWith('trap bar ') || t.includes(' trap bar ') ||
    t.includes('chin-up') || t.includes('chinup')
  ) return '180';
  return '120';
};

// ----- block contents (verbatim from xlsx) ---------------------------------

const WARMUP = [
  { t: 'High BW Step-Up',                rx: '1x10 E' },
  { t: 'Plate-Supported Hip Airplane',   rx: '1x10 E' },
  { t: 'ISO Hollow Hold w Leg Switches', rx: '2x15 SEC' },
];

const DAYS = [
  {
    name: 'Day A',
    exercises: [
      { title: 'Depth Landing to Box Landing (4 Way)',     sets: 3, reps: '4 E',                tempo: '' },
      { title: 'Depth Drop SL Snap-Down to Lateral Bound', sets: 3, reps: '1 E',                tempo: '3-Way (L,R, Forward)' },
      { title: 'Elbow-Supported DB Knee Raise',            sets: 3, reps: '8',                  tempo: '' },
      { title: 'Continiuous Overhead Med Ball Throw',      sets: 3, reps: '20',                 tempo: '' },
      { title: 'Contralateral Walking OH DB Lunge',        sets: 2, reps: '5 E + 5 E',          tempo: '' },
      { title: 'Supinated Inverted Row',                   sets: 2, reps: '20',                 tempo: '' },
      { title: 'Banded Crab-POS Raise',                    sets: 2, reps: '20',                 tempo: '1 SEC Dead-Stop' },
      { title: 'Side-Plank POS Hand to Toe',               sets: 2, reps: '15 E',               tempo: '' },
    ],
  },
  {
    name: 'Day B',
    exercises: [
      { title: 'Trap Bar Squat Jump',                              sets: 3, reps: '4',               tempo: '' },
      { title: 'Chest-Supported T-Bar MID-POS Row',                sets: 3, reps: '6',               tempo: '' },
      { title: 'DB Chest Press',                                   sets: 3, reps: '6',               tempo: '' },
      { title: 'Elevated Floating-Heel Banded Hip-Thrust POGO Jump', sets: 2, reps: '12 E',          tempo: '' },
      { title: 'Elevated-Heel DB Goblet Squat',                    sets: 2, reps: '15 SEC to 15 REPs', tempo: 'ISO to REPs' },
      { title: 'SA Bear-POS SCAP PRO-RET',                         sets: 2, reps: '10 E',            tempo: '' },
      { title: 'Laying Elbow-Supported Knee Extension',            sets: 2, reps: '20',              tempo: '' },
    ],
  },
  {
    name: 'Day C',
    exercises: [
      { title: 'Seated Box Jump',                                   sets: 3, reps: '4',     tempo: '' },
      { title: 'Trap Bar Deadlift',                                 sets: 3, reps: '2',     tempo: '' },
      { title: 'VERT Jump to Box Jump',                             sets: 2, reps: '4',     tempo: '' },
      { title: 'Power Chin-Up',                                     sets: 3, reps: '3',     tempo: '' },
      { title: 'ATH-POS SA DB Row',                                 sets: 2, reps: '6 E',   tempo: '' },
      { title: 'Prone-Laying Supinated to Pronated SA DB Y-Raise',  sets: 2, reps: '12 E',  tempo: '4-5 SEC Per REP' },
      { title: 'Machine SL Extension',                              sets: 2, reps: '20 E',  tempo: '' },
      { title: 'GHD SL ABs Sit-Up',                                 sets: 2, reps: '20 E',  tempo: '' },
    ],
  },
];

// ----- title matching ------------------------------------------------------

// PHRASES: known abbreviation expansions used in the source xlsx that appear
// fully spelled out in the library. Only add entries where the meaning is
// unambiguous — never use this layer to bridge real variant differences.
//   - "PRO-RET" / "PRO/RET" → "protraction retraction" (e.g.
//     "SA Bear-POS SCAP PRO-RET" === "SA Bear-POS SCAP Protraction/Retraction")
const PHRASES = [
  [/\bpro[-\/]ret\b/gi, 'protraction retraction'],
];

const norm = (s) => {
  let out = String(s || '')
    .toLowerCase()
    .replace(/[–—]/g, '-');
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out
    .replace(/[^\w\s-+&()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Library uses "Laying" (not "Lying") consistently; keep the same SYN map
// the Yoav importer used so cross-block title-matching stays predictable.
const SYN = { lying: 'laying' };

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

  for (const ex of lib) {
    if (norm(ex.title) === want) return { ex, score: 1.0, kind: 'exact' };
  }
  for (const ex of lib) {
    if (tokenSetKey(ex.title) === wantKey) return { ex, score: 1.0, kind: 'exact' };
  }
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

  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  console.log(`exercise library: ${lib.length} entries`);

  const { data: existing } = await sb.from('plans').select('id,name').eq('trainee_id', TRAINEE_ID);
  if (existing?.some(p => p.name === PLAN_NAME)) {
    console.error(`! ${TRAINEE_ID} already has a plan named "${PLAN_NAME}". Aborting.`);
    process.exit(1);
  }

  const days = DAYS.map((d) => ({
    id: uid(),
    name: d.name,
    exercises: d.exercises.map((row, idx) => {
      const m = findMatch(row.title, lib);
      const linked = m.kind === 'exact' ? m.ex : null;
      return {
        id: uid(),
        exerciseId: linked ? linked.id : '',
        title: row.title,
        sets: String(row.sets ?? ''),
        reps: row.reps ?? '',
        load: '',
        rpe: '',
        tempo: row.tempo ?? '',
        rest: restFor(row.title),
        notes: '',
        order: idx,
        superset: '',
        wk: null,
      };
    }),
  }));

  const planId = uid('pl_');
  const plan = {
    id: planId,
    name: PLAN_NAME,
    trainee_id: TRAINEE_ID,
    phase: '',
    notes: '',
    active: true,
    data: { days, warmup: WARMUP, weeks: 4 },
  };

  let exact = 0, close = 0, none = 0;
  console.log(`\n${PLAN_NAME} — match report:`);
  for (const d of DAYS) {
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
        console.log(`        ≈ ${m.ex?.title} (score=${m.score.toFixed(2)}) — NOT linked (videolink-accuracy rule)`);
      } else {
        none++;
        console.log(`    ✗ ${row.title} — no library match`);
      }
    }
  }
  console.log(`\nsummary: ${exact} exact, ${close} close (unlinked), ${none} unmatched`);
  console.log(`rest distribution: 180s = BB/Trap-Bar/Chinup,  120s = everything else`);

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to insert.');
    process.exit(0);
  }

  const dbRow = {
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
  const { error: pErr } = await sb.from('plans').insert([dbRow]);
  if (pErr) { console.error('insert failed:', pErr); process.exit(1); }
  console.log(`\n✓ inserted plan ${plan.id} (${plan.name}) for ${TRAINEE_ID}.`);
})();
