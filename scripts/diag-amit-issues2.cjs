const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  // 1. Inspect plan row shape
  const { data: planRow } = await s.from('plans').select('*').eq('id', 'plan_p0wg562756mo91eomv').maybeSingle();
  console.log('Block #17 plans-table row keys:', Object.keys(planRow || {}));
  console.log('data keys:', Object.keys(planRow?.data || {}));
  const days = planRow?.data?.days || [];
  days.forEach(d => {
    console.log(`\n## ${d.name} keys:`, Object.keys(d));
    const exes = d.exercises || d.ex || [];
    console.log(`   exercises array len: ${exes.length}`);
    exes.forEach((ex, i) => console.log(`   ${i+1}. "${ex.title||ex.t||'(empty)'}" eid=${ex.exerciseId||ex.eid||'-'} sets=${ex.sets} reps=${ex.reps||ex.rx||'-'} order=${ex.order}`));
  });

  // 2. Day C workout — exercises 1 & 3 placeholder titles
  console.log('\n========= AMIT DAY C WORKOUT (most recent) =========');
  const { data: cw } = await s.from('client_workouts').select('*')
    .eq('client_id', 'tr_amit').eq('day_name', 'Day C')
    .order('date', { ascending: false }).limit(5);
  (cw||[]).forEach(w => {
    console.log(`\n${w.date} | ${w.plan_name} W${w.week} ${w.day_name} id=${w.id}`);
    (w.exercises || []).forEach((ex, i) => {
      console.log(`  ${i+1}. title="${ex.title}" eid=${ex.eid||ex.exerciseId||'-'} sets=${(ex.sets||[]).length}/${ex.prescribed||'?'} prescribed="${ex.prescribed}"`);
    });
  });

  // 3. Same plan from store blob — does it match plans table?
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plansBlob = pr?.value || [];
  const b17Blob = plansBlob.find(p => p.id === 'plan_p0wg562756mo91eomv');
  console.log('\nstore blob has Block #17?', !!b17Blob);
  if (b17Blob) {
    console.log('blob days:', b17Blob.days?.length);
    b17Blob.days?.forEach(d => {
      console.log(`\n## blob ${d.name}:`);
      (d.exercises || []).forEach((ex, i) => console.log(`  ${i+1}. "${ex.title}" eid=${ex.exerciseId||'-'} sets=${ex.sets}`));
    });
  }
})().catch(e => console.error('FATAL', e));
