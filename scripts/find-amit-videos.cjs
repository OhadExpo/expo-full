const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  // Amit's workouts are in the client_workouts table (RLS: trainer bypass)
  const { data, error } = await s.from('client_workouts')
    .select('client_id,date,plan_name,week,day_name,exercises,form_videos')
    .eq('client_id', 'tr_amit')
    .order('date', { ascending: false })
    .limit(20);
  if (error) { console.error(error); process.exit(1); }
  console.log(`Got ${data.length} rows`);

  const recent = data.filter(w => (w.form_videos || []).some(fv => fv?.cloudUrl));
  console.log(`${recent.length} have form videos with cloud URLs\n`);

  for (const w of recent.slice(0, 3)) {
    console.log(`${w.date} | ${w.plan_name} W${w.week} ${w.day_name}`);
    (w.form_videos || []).forEach((fv, i) => {
      if (fv?.cloudUrl) {
        const ex = w.exercises?.[i];
        const setsArr = ex?.sets || [];
        console.log(`  ex${i}: "${ex?.title}"  sets=${setsArr.length}  prescribed=${ex?.prescribed}`);
        console.log(`    url: ${fv.cloudUrl}`);
      }
    });
    console.log();
  }
})();
