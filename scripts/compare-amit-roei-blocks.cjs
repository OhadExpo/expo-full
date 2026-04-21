const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const ids = ['plan_3du2kw4by1gmo7afdol','plan_gwa5sdc55lbmo7afh51','plan_x5u138ri9qmo7afh4x'];
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data').in('id', ids);
  const { data: libStore } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const lib = libStore?.value || [];
  const titleOf = id => (lib.find(e => e.id === id) || {}).title || id;
  for (const p of plans) {
    console.log(`\n=== ${p.trainee_id} / ${p.name} (${p.id}) ===`);
    (p.data?.days || []).forEach((d, di) => {
      const list = d.exercises || d.ex || [];
      console.log(`  Day ${di+1} "${d.name}" — ${list.length} ex`);
      list.slice(0, 5).forEach((e, ei) => {
        const id = e.exerciseId || e.eid;
        const t = e.title || titleOf(id);
        console.log(`    [${ei+1}] ${t}`);
      });
    });
  }
})();
