const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data } = await s.from('plans').select('*').eq('id','plan_8cis0opbphkmo7afjj6').maybeSingle();
  console.log(JSON.stringify(data.data, null, 2).slice(0, 4000));
})();
