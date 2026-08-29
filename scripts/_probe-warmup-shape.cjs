const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await s.from('plans').select('id,name,data').limit(400);
  const keys = new Map();
  let withWu = 0, wuRows = 0;
  for (const p of plans || []) for (const d of (p.data && p.data.days) || []) {
    for (const k of Object.keys(d)) keys.set(k, (keys.get(k) || 0) + 1);
    const wu = d.warmup || d.warmUp || d.wu;
    if (Array.isArray(wu) && wu.length) { withWu++; wuRows += wu.length; }
  }
  console.log('day-object keys seen:', [...keys.entries()].sort((a,b)=>b[1]-a[1]).map(([k,n])=>k+':'+n).join('  '));
  console.log('days with a warm-up array:', withWu, '| warm-up rows:', wuRows);
})();
