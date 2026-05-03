const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: p } = await s.from('plans').select('*').eq('id', 'plan_tb6bfw9qmoosndn9').maybeSingle();
  console.log(JSON.stringify(p.data, null, 2));
})().catch(e => { console.error(e.message); process.exit(1); });
