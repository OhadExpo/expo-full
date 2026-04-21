const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data } = await s.from('store').select('value').eq('key','expo-portal-vis').maybeSingle();
  const vis = data?.value || {};
  // Yuval Berko entries
  console.log('\n=== Yuval Berko (יובל ברקו) ===');
  Object.entries(vis).filter(([k]) => k.startsWith('יובל ברקו:')).forEach(([k,v]) => console.log(`  ${v===false?'HIDE':'show'}: ${k}`));
  console.log('\n=== Yuval Gotlib (יובל גוטליב) ===');
  Object.entries(vis).filter(([k]) => k.startsWith('יובל גוטליב:')).forEach(([k,v]) => console.log(`  ${v===false?'HIDE':'show'}: ${k}`));
})();
