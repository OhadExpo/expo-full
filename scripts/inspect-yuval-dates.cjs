const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data } = await s.from('plans').select('id,name,created_at').eq('trainee_id','tr_yuval').order('created_at',{ascending:false});
  data.forEach(p => console.log(`${p.created_at} | ${p.name}`));
})();
