const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  console.log('TOTAL TRAINEES:', trainees.length);
  console.log('\nAll trainees with id, name, email:');
  trainees.forEach(t => {
    console.log('  ' + (t.id || '?').padEnd(25) + ' | ' + (t.name || '?').padEnd(25) + ' | ' + JSON.stringify(t.email || ''));
  });
})().catch(e => console.error(e));
