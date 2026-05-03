// Check whether Block #25 Day A/B exercise IDs resolve to library entries.
// Helps me understand how smart-import handled new exercises.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const [{ data: row }, { data: p }] = await Promise.all([
    s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle(),
    s.from('plans').select('*').eq('id', 'plan_tb6bfw9qmoosndn9').maybeSingle(),
  ]);
  const lib = Array.isArray(row?.value) ? row.value : [];
  const byId = Object.fromEntries(lib.map(e => [e.id, e]));
  for (const day of (p.data?.days || [])) {
    console.log(`\n── ${day.name} ──`);
    for (const ex of (day.exercises || [])) {
      const e = byId[ex.exerciseId];
      console.log(`  ${ex.order + 1}. eid=${ex.exerciseId} → ${e ? `"${e.title}"` : '⚠ NOT IN LIBRARY'}`);
      if (e?.videoLink) console.log(`        video: ${e.videoLink}`);
    }
  }
})().catch(e => { console.error(e.message); process.exit(1); });
