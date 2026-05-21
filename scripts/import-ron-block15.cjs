// Import Ron Yonker Block #15 from the latest "מעקב - רון יונקר.xlsx".
//
// Spec:
//   - 3 days (A/B/C). Day A 8 ex, Day B 8 ex, Day C 5 ex.
//   - 3 warmups carried at the plan level.
//   - Per-week reps live in columns I/J/K (Week 1/2/3 variants).
//   - One xlsx cell-hyperlink (Day A #8 → YouTube URL).
//   - No per-exercise notes in this sheet.
//
// Title matching → library (videoLink + cues come along). For titles
// the library doesn't have, harvest URLs Ohad has used in earlier Ron
// plans (or any plan in the DB) for the same exercise — never substitute
// a different exercise's URL.
//
// Run with no args for dry-run; pass `apply` to write.

const crypto = require('crypto');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const APPLY = process.argv[2] === 'apply';

const uid = (prefix) => prefix + crypto.randomBytes(6).toString('hex') + Date.now().toString(36).slice(-4);

// Verbatim transcription from the sheet, plus the one explicit hyperlink.
// Per-week reps captured as wk array so the trainee portal renders the
// right number for the current week.
const BLOCK = {
  blockName: 'Block #15',
  warmup: [
    { t: 'Plate-Supported Hip-Airplane', rx: '1 set' },
    { t: 'Bear-Position SCAP PRO/RET', rx: '1 set' },
    { t: 'Alternating Supinated to Pronated', rx: '1 set' },
  ],
  days: [
    {
      name: 'Day A',
      exercises: [
        { title: 'DB Squat POGO Jump',          ss: '', sets: 3, reps: '8' },
        { title: 'DB Squat Jump',               ss: '', sets: 2, reps: '6' },
        { title: 'BB Pendlay Row',              ss: '', sets: 3, reps: '>', wk: ['5','5','4','4'] },
        { title: 'Seated BB OHP',               ss: '', sets: 3, reps: '8' },
        { title: 'Continious Power SL Hip-Thrust', ss: '', sets: 2, reps: '10 E' },
        { title: 'Tall-Kneeling (Bench) Hand-Supported SA DB Row', ss: '', sets: 2, reps: '10 E' },
        { title: 'Alternating DB Chest Press',  ss: '', sets: 2, reps: '10 E' },
        { title: 'ISO Pronated Pull-Up + Knee Raise', ss: '', sets: 3, reps: '12-15 SEC',
          // Only explicit URL in the xlsx (col-D hyperlink on Day A #8).
          rowUrl: 'https://www.youtube.com/watch?v=9JDG4i1Mco8' },
      ],
    },
    {
      name: 'Day B',
      exercises: [
        { title: 'Continious SL VERT Jump to SL Snap-Down', ss: '', sets: 2, reps: '>', wk: ['5 E','5 E','4 E','4 E'] },
        { title: 'Standing MED-Ball Lateral Fake Toss', ss: '', sets: 3, reps: '5 E' },
        { title: 'Depth Drop SL Snap-Down to Lateral Bound', ss: '', sets: 3, reps: '2 x 2 E' },
        { title: 'B-Stance DB Fast ECC DL', ss: '', sets: 2, reps: '>', wk: ['8 E','8 E','6 E','6 E'] },
        { title: 'BB Squat',                    ss: '', sets: 3, reps: '>', wk: ['4','4','3','3'] },
        { title: 'Dead-Bug BB Bench Press',     ss: '', sets: 3, reps: '>', wk: ['8','8','6','6'] },
        { title: 'Chin-Up (to 90°)',            ss: '', sets: 3, reps: '>', wk: ['3','3','3','3'] },
        { title: 'BW High Step-Up',             ss: '', sets: 2, reps: '12 E' },
      ],
    },
    {
      name: 'Day C',
      exercises: [
        { title: 'A Single-Switch',             ss: '', sets: 2, reps: '5m' },
        { title: 'A Double-Switch',             ss: '', sets: 2, reps: '5m E' },
        { title: 'A-Switch Double-Skip',        ss: '', sets: 2, reps: '15m' },
        { title: 'B-Switch Double-Skip',        ss: '', sets: 2, reps: '15m' },
        { title: '10m Sprint',                  ss: '', sets: 1, reps: '>', wk: ['4','6','8','10'] },
      ],
    },
  ],
};

const norm = (s) => String(s || '').toLowerCase().replace(/[–—]/g, '-').replace(/[^\w\s\-+&()/]/g, ' ').replace(/\s+/g, ' ').trim();
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(t => t === 'lying' ? 'laying' : t);
const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');
function findMatch(title, lib) {
  const wantKey = tokenSetKey(title);
  for (const ex of lib) if (norm(ex.title) === norm(title)) return { ex, kind: 'exact' };
  for (const ex of lib) if (tokenSetKey(ex.title) === wantKey) return { ex, kind: 'exact' };
  return { ex: null, kind: 'none' };
}

(async () => {
  const sb = createClient(SUPA_URL, SUPA_KEY);
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  // Sanity — don't double-insert.
  const { data: existing } = await sb.from('plans').select('id,name').eq('trainee_id', 'tr_ron');
  if (existing?.some(p => p.name === BLOCK.blockName)) {
    console.error(`tr_ron already has "${BLOCK.blockName}". Aborting.`);
    process.exit(1);
  }

  // Library + harvest map (every URL Ohad has set elsewhere keyed by eid + title).
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const { data: allPlans } = await sb.from('plans').select('id, trainee_id, name, data');
  const libById = Object.fromEntries(lib.map(e => [e.id, e]));
  const harvestByEid = new Map();
  const harvestByTitle = new Map();
  for (const p of allPlans || []) {
    for (const d of (p.data?.days || [])) {
      for (const ex of (d.exercises || d.ex || [])) {
        const raw = ex.videoUrl ?? ex.vid;
        if (!raw || typeof raw !== 'string' || raw.startsWith('blob:') || raw.startsWith('data:')) continue;
        const u = raw.replace(/&amp;/g, '&').trim();
        const eid = ex.exerciseId || ex.eid;
        const t = (ex.title || libById[eid]?.title || '').trim().toLowerCase();
        if (eid) { harvestByEid.set(eid, harvestByEid.get(eid) || new Map()); harvestByEid.get(eid).set(u, (harvestByEid.get(eid).get(u) || 0) + 1); }
        if (t)   { harvestByTitle.set(t, harvestByTitle.get(t) || new Map()); harvestByTitle.get(t).set(u, (harvestByTitle.get(t).get(u) || 0) + 1); }
      }
    }
  }
  const topUrl = (m) => { if (!m) return null; let best = null, n = 0; for (const [u, c] of m.entries()) if (c > n) { best = u; n = c; } return best; };

  // Build days payload.
  const planId = uid('pl_');
  const days = BLOCK.days.map(d => ({
    id: uid(''),
    name: d.name,
    exercises: d.exercises.map((row, i) => {
      const m = findMatch(row.title, lib);
      const linked = m.kind === 'exact' ? m.ex : null;
      const libVid = linked?.videoLink || '';
      const harvested = topUrl(harvestByEid.get(linked?.id)) || topUrl(harvestByTitle.get(row.title.toLowerCase()));
      // Precedence: explicit xlsx hyperlink > library videoLink > harvest > none.
      // We only set videoUrl on the row when the source is xlsx OR harvest —
      // library videoLink flows through the EX fallback in ClientPortal,
      // no need to duplicate it on the row.
      const rowVideoUrl = row.rowUrl || (!libVid && harvested ? harvested : null);
      const out = {
        id: uid(''),
        exerciseId: linked ? linked.id : '',
        title: row.title,
        sets: row.sets,
        reps: row.reps,
        load: '',
        rpe: '',
        tempo: '',
        rest: '',
        notes: '',
        order: i,
        superset: row.ss || '',
        wk: row.wk || null,
        wkS: null,
      };
      if (rowVideoUrl) out.videoUrl = rowVideoUrl;
      return out;
    }),
  }));

  const plan = {
    id: planId,
    name: BLOCK.blockName,
    trainee_id: 'tr_ron',
    phase: '',
    notes: '',
    active: true,
    data: { days, warmup: BLOCK.warmup, weeks: 4 },
  };

  // Match report.
  let exact = 0, none = 0, vidCovered = 0, vidGap = 0;
  console.log(`\n${BLOCK.blockName} match report:`);
  for (let di = 0; di < BLOCK.days.length; di++) {
    const d = BLOCK.days[di];
    console.log(`\n  ${d.name}:`);
    for (let i = 0; i < d.exercises.length; i++) {
      const row = d.exercises[i];
      const m = findMatch(row.title, lib);
      const linked = m.kind === 'exact' ? m.ex : null;
      const libVid = linked?.videoLink || '';
      const harvested = topUrl(harvestByEid.get(linked?.id)) || topUrl(harvestByTitle.get(row.title.toLowerCase()));
      const finalVid = row.rowUrl || libVid || harvested || '';
      const src = row.rowUrl ? 'xlsx' : libVid ? 'lib' : harvested ? 'harvest' : 'NONE';
      if (m.kind === 'exact') exact++; else none++;
      if (finalVid) vidCovered++; else vidGap++;
      console.log(`    ${m.kind === 'exact' ? '✓' : '✗'} ${row.title}${m.kind === 'exact' ? ` (${linked.id})` : ''} · video=[${src}] ${finalVid ? finalVid.slice(0, 60) : '(none)'}`);
    }
  }
  console.log(`\nsummary: ${exact} matched, ${none} unmatched · ${vidCovered} with video, ${vidGap} without`);

  if (!APPLY) { console.log('\n[DRY RUN] — re-run with `apply` to insert.'); return; }
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
  const { error } = await sb.from('plans').insert([row]);
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  console.log(`\n✓ inserted ${plan.id} (${plan.name}) for tr_ron`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
