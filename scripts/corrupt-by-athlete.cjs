// Group the corrupt-superset placeholder entries by trainee → plan → day,
// machine-readable, so the Drive restore can be worked athlete-by-athlete.
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const CORRUPT_ID = 'ex_rvi8ifq11zsmo8nlmzm';

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await sb.from('plans').select('id,name,trainee_id,data');
  const byTrainee = {};
  for (const p of plans) {
    const days = p.data?.days || [];
    days.forEach((d, di) => {
      const list = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      list.forEach((ex, xi) => {
        if ((ex.exerciseId || ex.eid) === CORRUPT_ID) {
          (byTrainee[p.trainee_id] ||= []).push({ plan: p.name, planId: p.id, day: d.name || d.n || `Day ${di+1}`, idx: xi, ss: ex.superset || ex.ss || '' });
        }
      });
    });
  }
  const summary = Object.entries(byTrainee).map(([t, arr]) => `${t}: ${arr.length}`).sort();
  console.log('CORRUPT entries by trainee:\n' + summary.join('\n'));
  console.log('\nTotal trainees affected:', Object.keys(byTrainee).length);
  console.log('\n--- detail ---');
  for (const [t, arr] of Object.entries(byTrainee)) {
    console.log(`\n[${t}]`);
    arr.forEach(e => console.log(`  ${e.plan} | ${e.day} | idx=${e.idx} ss=${e.ss||'-'}`));
  }
  process.exit(0);
})();
