const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  const { error: sErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (sErr) { console.error(sErr); process.exit(1); }

  const { data } = await s.from('client_workouts').select('*')
    .eq('clientId', 'tr_amit')
    .order('date', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    console.log('No client_workouts rows for tr_amit');
    // Fall back to store blob approach
    const { data: st } = await s.from('store').select('value').eq('key', 'expo-client-workouts').maybeSingle();
    const list = (st?.value || []).filter(w => w.clientId === 'tr_amit');
    console.log(`Store blob has ${list.length} tr_amit workouts`);
    for (const w of list.slice(0, 5)) {
      const fvs = (w.formVideos || []).map((fv, i) => ({ idx: i, has: !!fv?.has, cloud: !!fv?.cloudUrl, url: fv?.cloudUrl, ex: w.exercises?.[i]?.title, reps: w.exercises?.[i]?.sets?.length }));
      console.log(`\n${w.date} | ${w.planName} W${w.week} ${w.dayName}`);
      fvs.filter(f => f.cloud).forEach(f => console.log(`  ex${f.idx}: "${f.ex}" sets=${f.reps}`));
      fvs.filter(f => f.cloud).forEach(f => console.log(`    ${f.url}`));
    }
    return;
  }

  console.log(`${data.length} workouts found (table rows)`);
  for (const w of data) {
    console.log(`${w.date} ${w.planName} W${w.week} ${w.dayName}`);
    const fvs = w.formVideos || w.form_videos;
    (fvs || []).forEach((fv, i) => {
      if (fv?.cloudUrl) {
        console.log(`  ex${i}: "${w.exercises?.[i]?.title}" → ${fv.cloudUrl}`);
      }
    });
  }
})();
