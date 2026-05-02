const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: cw } = await s.from('client_workouts').select('*')
    .eq('client_id', 'tr_amit')
    .order('date', { ascending: false }).limit(5);
  (cw||[]).forEach(w => {
    console.log(`\n${w.date} | ${w.plan_name} W${w.week} ${w.day_name}`);
    (w.exercises || []).forEach((ex, i) => {
      const flagged = (ex.eid||'').startsWith('dyn_') || /^Exercise \d+$/.test(ex.title);
      console.log(`  ${i+1}. ${flagged?'⚠ ':'  '}title="${ex.title}" eid=${ex.eid||ex.exerciseId||'-'}`);
    });
  });
})();
