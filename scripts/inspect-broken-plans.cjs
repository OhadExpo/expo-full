const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data } = await s.from('plans').select('id,name,trainee_id,data').in('trainee_id', ['tr_neta_tom__0','tr_yuval_gotlib']).eq('active', true);
  for (const p of data) {
    if (!/Block #7|Block #22/.test(p.name)) continue;
    console.log(`\n=== ${p.trainee_id} / ${p.name} ===`);
    (p.data?.days || []).forEach((d, di) => {
      const list = d.exercises || d.ex || [];
      console.log(`Day ${di+1} "${d.name}" — ${list.length} items`);
      list.forEach((e, ei) => {
        const id = e.exerciseId || e.eid || '(none)';
        const title = e.title || '(none)';
        console.log(`  [${ei+1}] id=${id.padEnd(25)} title="${title}" sets=${e.sets ?? e.s} reps=${e.reps ?? e.r}`);
      });
    });
  }
})();
