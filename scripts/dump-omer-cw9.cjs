const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: cw } = await s.from('client_workouts').select('*').eq('client_id', 'tr_omer');
  const cw9 = (cw || []).filter(w => /block\s*#?\s*9\b|#9\b/i.test(w.plan_name || ''));
  // pick the most complete instance per day
  const byDay = {};
  for (const w of cw9) {
    const k = w.day_name;
    if (!byDay[k] || (w.exercises||[]).length > (byDay[k].exercises||[]).length || new Date(w.date) > new Date(byDay[k].date)) byDay[k] = w;
  }
  for (const [day, w] of Object.entries(byDay)) {
    console.log(`\n===== ${day} (wk${w.week}, ${w.date}) =====`);
    (w.exercises || []).forEach((ex, i) => {
      console.log(`[${i}] ${JSON.stringify(ex)}`);
    });
  }
  process.exit(0);
})();
