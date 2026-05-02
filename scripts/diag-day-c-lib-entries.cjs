const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: er } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const exs = er?.value || [];

  // Print full records for the two failing IDs vs one succeeding one
  const ids = ['ex_14ff50179c25rzng','ex_0bdv0xckmnxqyj3f','ex_81edbf655447rzng','ex_cd146e345131rzng','ex_053rqom9mnxqyj3f','ex_ykd9j8xrmnxqyj3f'];
  ids.forEach(id => {
    const e = exs.find(x => x.id === id);
    console.log(`\n${id}`, JSON.stringify(e, null, 2));
  });

  // Look for duplicates by title — maybe the title appears more than once (orphan + new)
  ['Depth Drop SL Snap-Down to Lateral Bound','Tall-Kneeling Over-Head MED-Ball Fake Slam'].forEach(t => {
    const dups = exs.filter(e => (e.title||'').trim() === t);
    console.log(`\nDups for "${t}": ${dups.length}`);
    dups.forEach(d => console.log(`  ${d.id}  videoLink=${d.videoLink?'Y':'-'}`));
  });
})();
