// Wide hunt: scan EVERY plan in the plans table (not just Roey's) for any
// per-plan notes/tempo/videoUrl on exercises whose library title matches the 8
// morning-routine exercises by loose tokens. Output everything we find so we
// can hand the surviving gaps to a Drive/online search.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const TARGETS = [
  { idx: 1, label: 'RDL to Baby Squat Stretch',                     re: /(rdl.*baby.*squat|baby.*squat.*stretch)/i },
  { idx: 2, label: 'Squat-POS Alternating Knee to floor',           re: /(squat.*alternating.*knee|squat.*knee.*to.*floor|squatting.*knee.*floor)/i },
  { idx: 3, label: 'SA Crab-POS Raise',                             re: /(\bsa\b.*crab|single[\s-]?arm.*crab|crab[\s-]?pos.*raise)/i },
  { idx: 4, label: 'Prone-Laying Deficit SA Y-Raise',               re: /(prone.*deficit.*y[\s-]?raise|deficit.*sa.*y[\s-]?raise|prone.*sa.*y[\s-]?raise)/i },
  { idx: 5, label: 'ISO Prone-Laying T-Raise',                      re: /(iso.*prone.*t[\s-]?raise|prone.*iso.*t[\s-]?raise|prone.*t[\s-]?raise)/i },
  { idx: 6, label: 'Supine-Laying Deficit External Rotation',       re: /(supine.*deficit.*external|deficit.*supine.*external|supine.*lying.*external.*rotation|supine.*laying.*external.*rotation)/i },
  { idx: 7, label: 'SA Bear-POS SCAP Protraction/Retraction',       re: /(bear[\s-]?pos.*scap|scap.*protract.*retract.*bear|sa.*bear[\s-]?pos.*scap|sa.*scap.*protract|protraction.*retraction)/i },
  { idx: 8, label: 'Wall-Supported Forhead (Occipital) Ball Slide', re: /(wall.*ball.*slide|ball.*slide.*wall|forehead.*slide|occipital.*slide|forehead.*ball|occipital.*ball)/i },
];

(async () => {
  const s = createClient(SB, KEY);
  const { error: aerr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aerr) throw aerr;

  // Load library, build id-list per target
  const { data: row } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = Array.isArray(row?.value) ? row.value : [];
  const byId = Object.fromEntries(lib.map(e => [e.id, e]));

  console.log('LIBRARY SIZE:', lib.length);
  const idsByTarget = TARGETS.map(t => {
    const ids = new Set(lib.filter(e => t.re.test(`${e.title || ''} | ${e.cues || ''}`)).map(e => e.id));
    return { ...t, ids };
  });

  console.log('\nLibrary candidate counts per target:');
  idsByTarget.forEach(t => console.log(`  #${t.idx} ${t.label}  →  ${t.ids.size} library row(s)`));

  // Pull every plan
  const { data: plans, error: perr } = await s.from('plans').select('*');
  if (perr) throw perr;
  console.log(`\nTOTAL PLANS SCANNED: ${plans.length}\n`);

  // For each target: find plan exercises that reference candidate eids and have
  // notes/tempo/videoUrl set
  for (const t of idsByTarget) {
    console.log(`══════════════════════════════════════════════`);
    console.log(`#${t.idx}  ${t.label}`);
    console.log(`──────────────────────────────────────────────`);
    const found = [];
    for (const p of plans) {
      for (const day of (p.data?.days || [])) {
        for (const ex of (day.exercises || [])) {
          const eid = ex.exerciseId || ex.eid;
          if (!t.ids.has(eid)) continue;
          if ((ex.notes && ex.notes.trim()) || (ex.tempo && ex.tempo.trim()) || (ex.videoUrl && ex.videoUrl.trim())) {
            found.push({
              plan: p.name, trainee: p.trainee_id, day: day.name,
              libTitle: byId[eid]?.title || '?',
              eid, notes: ex.notes, tempo: ex.tempo, videoUrl: ex.videoUrl,
            });
          }
        }
      }
    }
    if (!found.length) { console.log('  (no per-plan notes/videos found anywhere)\n'); continue; }
    for (const f of found) {
      console.log(`  · plan: ${f.plan}  · trainee: ${f.trainee}  · ${f.day}`);
      console.log(`      lib: "${f.libTitle}"   eid=${f.eid}`);
      if (f.notes)    console.log(`      notes:    ${f.notes}`);
      if (f.tempo)    console.log(`      tempo:    ${f.tempo}`);
      if (f.videoUrl) console.log(`      videoUrl: ${f.videoUrl}`);
      console.log('');
    }
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
