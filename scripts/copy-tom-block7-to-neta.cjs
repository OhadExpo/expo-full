// Neta and Tom share programs. Tom's Block #7 (tr_neta_tom__1) is intact;
// Neta's Block #7 (tr_neta_tom__0) has 6 broken rows with blank id+title.
// Replace Neta's Block #7 data payload with Tom's, preserving her plan id
// and trainee_id.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data,phase,notes')
    .in('trainee_id', ['tr_neta_tom__0','tr_neta_tom__1'])
    .eq('name', 'Block #7');
  const tomPlan = plans.find(p => p.trainee_id === 'tr_neta_tom__1');
  const netaPlan = plans.find(p => p.trainee_id === 'tr_neta_tom__0');
  if (!tomPlan || !netaPlan) { console.error('missing plans', plans); process.exit(1); }
  console.log(`Tom's Block #7  (${tomPlan.id}): ${(tomPlan.data?.days||[]).length} days, ${(tomPlan.data?.days||[]).reduce((a,d)=>a+((d.exercises||d.ex||[]).length),0)} ex`);
  console.log(`Neta's Block #7 (${netaPlan.id}): ${(netaPlan.data?.days||[]).length} days, ${(netaPlan.data?.days||[]).reduce((a,d)=>a+((d.exercises||d.ex||[]).length),0)} ex (BROKEN)`);

  if (process.argv[2] !== '--apply') { console.log('\nDry run. Re-run with --apply.'); return; }

  const { error } = await s.from('plans').update({
    data: tomPlan.data,
    phase: tomPlan.phase || netaPlan.phase,
    notes: tomPlan.notes || netaPlan.notes,
    updated_at: new Date().toISOString(),
  }).eq('id', netaPlan.id);
  if (error) { console.error(error); process.exit(1); }
  console.log(`\nDone. Neta's Block #7 now mirrors Tom's.`);
})();
