const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: p } = await s.from('plans').select('data').eq('id', 'pl_t7582oqqmr0cjblm4870').single();
  // library for video/title resolution
  const { data: exRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = new Map((exRow?.value || []).map(e => [e.id, e]));
  let blanks = 0, inLib = 0;
  for (const d of p.data.days) {
    console.log(`\n${d.name}:`);
    for (const ex of d.exercises) {
      const libHit = lib.get(ex.exerciseId);
      if (libHit) inLib++;
      const name = ex.title || libHit?.title || '';
      if (!name.trim()) blanks++;
      console.log(`  ${ex.sets}x${ex.reps}  ${name}${libHit ? '' : '  (custom title only)'}`);
    }
  }
  console.log(`\nblanks=${blanks}  in-library=${inLib}/24`);
  process.exit(0);
})();
