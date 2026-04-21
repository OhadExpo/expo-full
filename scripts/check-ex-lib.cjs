const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const ex = data?.value || [];
  console.log('Library size:', ex.length);
  const want = ['e100','e101','e102','e103','e104','e107','e108','e109','e110','ex_m1752aqfs3pmo7afh8i'];
  for (const id of want) {
    const f = ex.find(e => e.id === id);
    console.log(`  ${id} => ${f ? `"${f.title}" vid=${f.videoLink ? 'Y' : ''}` : 'MISSING'}`);
  }
})();
