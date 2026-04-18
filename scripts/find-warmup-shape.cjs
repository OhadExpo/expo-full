const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
(async () => {
  // Find plans with non-empty warmup (plan-level or day-level)
  const { data: rows } = await s.from('plans').select('id,name,trainee_id,data');
  const withPlanWarmup = rows.filter(r => Array.isArray(r.data?.warmup) && r.data.warmup.length > 0);
  const withDayWarmup = rows.filter(r => (r.data?.days || []).some(d => Array.isArray(d.warmup) && d.warmup.length > 0));
  console.log('plans with plan-level warmup[] populated:', withPlanWarmup.length);
  withPlanWarmup.slice(0, 3).forEach(r => {
    console.log('  ', r.id, r.name, 'trainee=' + r.trainee_id);
    console.log('    warmup sample:', JSON.stringify(r.data.warmup[0], null, 2));
  });
  console.log('\nplans with day-level warmup[] populated:', withDayWarmup.length);
  withDayWarmup.slice(0, 3).forEach(r => {
    console.log('  ', r.id, r.name, 'trainee=' + r.trainee_id);
    const firstDayWithWu = r.data.days.find(d => Array.isArray(d.warmup) && d.warmup.length > 0);
    console.log('    day warmup sample:', JSON.stringify(firstDayWithWu.warmup[0], null, 2));
  });
})().catch(e => console.error(e));
