const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: er } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const exs = er?.value || [];
  console.log('library size:', exs.length);
  ['ex_14ff50179c25rzng','ex_0bdv0xckmnxqyj3f','ex_81edbf655447rzng','ex_cd146e345131rzng','ex_053rqom9mnxqyj3f','ex_ykd9j8xrmnxqyj3f','ex_14ff50179c25rzng']
    .forEach(id => {
      const e = exs.find(x => x.id === id);
      console.log(`  ${id}: ${e ? '"'+e.title+'" videoLink='+(e.videoLink?'Y':'-') : 'NOT FOUND'}`);
    });

  // Also look in the plans table (canonical) for Day C ex array — show full
  const { data: planRow } = await s.from('plans').select('*').eq('id','plan_p0wg562756mo91eomv').maybeSingle();
  const dayC = planRow.data.days.find(d => d.name === 'Day C');
  console.log('\nDay C raw ex entries:');
  dayC.ex.forEach((e, i) => console.log(`  ${i+1}.`, JSON.stringify(e)));
})();
