const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const trainees = tr?.value || [];
  const plans = pr?.value || [];
  for (const t of trainees) {
    const mine = plans.filter(p => p.traineeId === t.id);
    const imp = mine.filter(p => String(p.id||'').startsWith('imp_'));
    if (mine.length === 0) continue;
    console.log(`${t.id}  |  ${t.name}  |  ${mine.length} plans, ${imp.length} imp_*`);
  }
})();
