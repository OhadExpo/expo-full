const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const ids = ['tr_yuval','tr_yuval__0','tr_yuval__1'];
  const { data: plans, error } = await s.from('plans').select('id,name,phase,notes,active,created_at,trainee_id,data').in('trainee_id', ids);
  if (error) { console.error(error); process.exit(1); }
  console.log('PLANS for Yuval Berko (tr_yuval):', plans.length);
  for (const p of plans) {
    const dayCount = (p.data?.days || []).length;
    const wuCount = (p.data?.warmup || []).length;
    const exTot = (p.data?.days || []).reduce((s,d)=>s+(d.exercises||[]).length,0);
    const exWithTitle = (p.data?.days || []).reduce((s,d)=>s+(d.exercises||[]).filter(e=>e.title && e.title.trim()).length,0);
    const exWithId = (p.data?.days || []).reduce((s,d)=>s+(d.exercises||[]).filter(e=>e.exerciseId).length,0);
    console.log(`  - ${p.id} | "${p.name}" | active=${p.active} | trainee_id=${p.trainee_id} | days=${dayCount} warmup=${wuCount} ex=${exTot} ex-with-title=${exWithTitle} ex-with-id=${exWithId}`);
  }

  // Also dump first day of comeback block to see exercise shape
  const cb = plans.find(p => /comeback/i.test(p.name || ''));
  if (cb) {
    console.log('\n=== COMEBACK BLOCK FULL DUMP ===');
    console.log('Name:', cb.name);
    console.log('Phase:', cb.phase);
    console.log('Notes:', cb.notes);
    console.log('Active:', cb.active);
    console.log('Days:', (cb.data?.days || []).length);
    console.log('Warmup count:', (cb.data?.warmup || []).length);
    (cb.data?.days || []).forEach((d,di) => {
      console.log(`\nDAY ${di+1}: "${d.name}" (${(d.exercises||[]).length} exercises)`);
      (d.exercises||[]).slice(0,8).forEach((ex,ei) => {
        console.log(`  [${ei+1}] id=${ex.exerciseId||'-'} | title="${ex.title||''}" | sets=${ex.sets} reps=${ex.reps} tempo=${ex.tempo||''} ss=${ex.superset||''}`);
      });
    });
  }
})().catch(e => console.error(e));
