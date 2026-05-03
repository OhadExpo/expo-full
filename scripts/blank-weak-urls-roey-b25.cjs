// Blank the 8 videoLink values I picked on my own that are weak/wrong matches
// for Roey's Block #25. Better to have an empty field than mislead with a
// wrong-variant or unrelated demo. Ohad will film/link his own.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

// All 8 URLs I added on my own that DON'T accurately match the exercise.
// (The 5 inherited from Ohad's existing library entries are accurate and stay.)
const BLANK_THESE = [
  'ex_roeb25m_rdl_baby_sq',           // b-reddy article, not a video, only half the movement
  'ex_roeb25m_iso_prone_t',           // ACE article shows dynamic IYTW, not the ISO hold
  'ex_roeb25m_wall_ball_slide',       // closest match but emphasizes ISO, not the chin slide
  'ex_bwsxl6v1moosndn8',              // Shrimp Squat: BW variant linked, not DB-loaded variant
  'ex_ticwpojtmoosndn8',              // Sup-to-Pro Y-Raise: linked vid is ISO SA, wrong variant
  'ex_34r9xg3amnxqyj3e',              // FFESS to Stand to Lunge POGO: linked vid is Deep-Squat POGO
  'e37',                              // FFESS to Lunge POGO: same wrong-variant issue
  'ex_qlu45eypmoosndn9',              // Hollow-POS Clams: linked vid is a generic POGO tutorial
];

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: row, error } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  if (error) throw error;
  const lib = Array.isArray(row?.value) ? row.value : [];

  let blanked = 0;
  const updated = lib.map(e => {
    if (!BLANK_THESE.includes(e.id)) return e;
    blanked++;
    return { ...e, videoLink: '' };
  });
  console.log(`blanked videoLink on ${blanked} entries`);
  const { error: uerr } = await s.from('store').upsert({ key: 'expo-exercises', value: updated });
  if (uerr) throw uerr;
  console.log('✓ library updated');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
