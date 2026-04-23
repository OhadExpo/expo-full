const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { error: sErr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (sErr) { console.error(sErr); process.exit(1); }

  const { data: plans } = await s.from('plans')
    .select('id,name,active,created_at,data')
    .eq('trainee_id', 'tr_amit')
    .order('created_at', { ascending: false });

  console.log(`Amit now has ${plans.length} plans:`);
  plans.forEach(p => {
    const days = p.data?.days?.length || 0;
    const ex = (p.data?.days || []).reduce((a, d) => a + (d.ex || []).length, 0);
    const wu = p.data?.warmup?.length || 0;
    console.log(`  "${p.name}"  days=${days} ex=${ex} warmup=${wu}`);
  });

  const { data: visStore } = await s.from('store').select('value').eq('key', 'expo-portal-vis').maybeSingle();
  const vis = visStore?.value || {};
  const amitKeys = Object.keys(vis).filter(k => k.startsWith('עמית יהודאי:'));
  console.log(`\nPortal-vis for Amit (${amitKeys.length} keys):`);
  amitKeys.sort().forEach(k => console.log(`  ${k} = ${vis[k]}`));
})();
