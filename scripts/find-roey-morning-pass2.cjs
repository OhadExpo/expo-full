// Tighter search: each query string must literally appear in title or cues.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const QUERIES = [
  { label: '#1 baby squat',           re: /baby[\s-]?squat/i },
  { label: '#1 rdl + stretch',        re: /rdl.*stretch|stretch.*rdl/i },
  { label: '#2 squat-pos alt knee',   re: /squat[\s-]?pos.*alt|squat.*alternating.*knee/i },
  { label: '#3 SA crab',              re: /\bsa\b.*crab|crab.*\bsa\b|single[\s-]?arm.*crab/i },
  { label: '#4 deficit y',            re: /deficit.*y[\s-]?raise|y[\s-]?raise.*deficit/i },
  { label: '#4 prone-laying SA Y',    re: /prone.*sa.*y[\s-]?raise|prone.*single[\s-]?arm.*y/i },
  { label: '#5 ISO prone T-raise',    re: /iso.*prone.*t[\s-]?raise|prone.*iso.*t[\s-]?raise|iso.*t[\s-]?raise/i },
  { label: '#5 prone T-raise',        re: /prone.*t[\s-]?raise/i },
  { label: '#6a supine deficit ER',   re: /supine.*deficit.*external|deficit.*supine.*external/i },
  { label: '#6b bear scap',           re: /bear.*scap|scap.*bear/i },
  { label: '#6b SA bear protraction', re: /\bsa\b.*bear|bear.*\bsa\b.*protract|protraction.*retraction/i },
  { label: '#7a wall ball slide',     re: /wall.*ball.*slide|ball.*slide.*wall|forehead.*slide|occipital/i },
  { label: '#7a wall slide',          re: /wall[\s-]?slide/i },
];

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: row } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = Array.isArray(row?.value) ? row.value : [];

  for (const q of QUERIES) {
    console.log(`\n══ ${q.label}  (${q.re}) ══`);
    const hits = lib.filter(e => q.re.test(`${e.title || ''} | ${e.cues || ''}`));
    if (!hits.length) { console.log('  (none)'); continue; }
    for (const e of hits.slice(0, 8)) {
      console.log(`  · ${e.title}`);
      console.log(`      id: ${e.id}`);
      if (e.cues)      console.log(`      cues:  ${e.cues}`);
      if (e.videoLink) console.log(`      video: ${e.videoLink}`);
      else if (e.videoUrl) console.log(`      video: ${e.videoUrl}`);
    }
  }

  // Also: scan all of Roey's past plans for exercise IDs whose titles match our targets,
  // because Ohad sometimes adds per-plan notes that the library doesn't carry.
  console.log('\n\n══════════════════════════════════════════════');
  console.log('SCAN ROEY PLANS FOR PER-PLAN NOTES ON THESE EIDS');
  console.log('══════════════════════════════════════════════');

  const { data: plans } = await s.from('plans').select('*').eq('trainee_id', 'tr_roei');
  const byId = Object.fromEntries(lib.map(e => [e.id, e]));

  // Build set of "interesting" titles
  const titleHits = new Set();
  const interestingPatterns = [
    /baby[\s-]?squat/i,
    /squat[\s-]?pos.*knee/i, /squatting.*knee.*floor/i,
    /\bsa\b.*crab|crab.*\bsa\b|crab[\s-]?pos.*raise/i,
    /prone.*y[\s-]?raise|y[\s-]?raise/i,
    /prone.*t[\s-]?raise|t[\s-]?raise/i,
    /supine.*external|external.*rotation/i,
    /bear[\s-]?pos.*scap|scap.*protract|protraction.*retract/i,
    /wall.*ball.*slide|wall[\s-]?slide|occipital|forehead/i,
  ];
  for (const e of lib) {
    for (const p of interestingPatterns) {
      if (p.test(e.title || '')) { titleHits.add(e.id); break; }
    }
  }
  console.log('library ids of interest:', titleHits.size);

  // Walk plans, collect any exercises whose eid is in titleHits and which carry per-plan notes
  const seen = new Map(); // key: eid|note
  for (const p of plans) {
    for (const day of (p.data?.days || [])) {
      for (const ex of (day.exercises || [])) {
        if (titleHits.has(ex.eid) && (ex.notes || ex.tempo)) {
          const key = `${ex.eid}|${ex.notes || ''}|${ex.tempo || ''}`;
          if (!seen.has(key)) {
            seen.set(key, { plan: p.name, day: day.name, ex, title: byId[ex.eid]?.title || '?' });
          }
        }
      }
    }
  }
  for (const v of seen.values()) {
    console.log(`\n  · ${v.title}  (eid=${v.ex.eid})`);
    console.log(`      plan:  ${v.plan} / ${v.day}`);
    if (v.ex.notes) console.log(`      notes: ${v.ex.notes}`);
    if (v.ex.tempo) console.log(`      tempo: ${v.ex.tempo}`);
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
