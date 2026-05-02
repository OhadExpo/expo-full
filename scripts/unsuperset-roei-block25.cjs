const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const s = createClient(SB, 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const PLAN_ID = 'plan_tb6bfw9qmoosndn9';
const COMMIT = process.argv.includes('--commit');

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plan } = await s.from('plans').select('*').eq('id', PLAN_ID).single();
  let stripped = 0;
  for (const d of plan.data.days) {
    for (const ex of d.exercises) {
      if (ex.superset) { ex.superset = ''; stripped++; }
    }
  }
  console.log('stripped supersets:', stripped);
  for (const d of plan.data.days) {
    console.log(`\n${d.name}:`);
    d.exercises.forEach((ex, i) => console.log(`  ${i+1}  ss=${ex.superset||'-'}  ${ex.exerciseId}`));
  }
  if (!COMMIT) { console.log('\nDRY RUN — re-run with --commit'); return; }
  plan.updated_at = new Date().toISOString();
  const { error } = await s.from('plans').upsert(plan);
  if (error) throw new Error(error.message);
  console.log('\nupdated plan', plan.id);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
