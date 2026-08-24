// Does client_workouts have a plan_id column? Read-only probe.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.log('AUTH FAIL', authErr.message); process.exit(1); }

  const probe = await s.from('client_workouts').select('id,plan_id').limit(1);
  if (probe.error) {
    console.log('plan_id: NOT PRESENT ->', probe.error.message);
  } else {
    console.log('plan_id: PRESENT. sample:', JSON.stringify(probe.data));
  }

  const cols = await s.from('client_workouts').select('*').limit(1);
  if (!cols.error && cols.data && cols.data[0]) {
    console.log('\nactual columns:', Object.keys(cols.data[0]).join(', '));
  } else if (cols.error) {
    console.log('column probe failed:', cols.error.message);
  } else {
    console.log('\nno rows to infer columns from');
  }
})();
