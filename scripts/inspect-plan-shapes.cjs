const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data');
  console.log('TOTAL PLANS:', plans.length);
  let shapeEx = 0, shapeExercises = 0, shapeBoth = 0, shapeNeither = 0;
  const byTrainee = {};
  plans.forEach(p => {
    const days = p.data?.days || [];
    const hasEx = days.some(d => Array.isArray(d.ex));
    const hasExercises = days.some(d => Array.isArray(d.exercises));
    let shape = 'none';
    if (hasEx && hasExercises) { shape = 'both'; shapeBoth++; }
    else if (hasEx) { shape = 'ex'; shapeEx++; }
    else if (hasExercises) { shape = 'exercises'; shapeExercises++; }
    else { shapeNeither++; }
    byTrainee[p.trainee_id] = byTrainee[p.trainee_id] || { ex: 0, exercises: 0, both: 0, none: 0 };
    byTrainee[p.trainee_id][shape === 'none' ? 'none' : shape]++;
  });
  console.log('Shape counts:');
  console.log('  d.ex only:', shapeEx);
  console.log('  d.exercises only:', shapeExercises);
  console.log('  both:', shapeBoth);
  console.log('  neither/empty:', shapeNeither);
  console.log('\nPer trainee:');
  Object.keys(byTrainee).sort().forEach(t => {
    const v = byTrainee[t];
    console.log(`  ${t.padEnd(25)} ex=${v.ex} exercises=${v.exercises} both=${v.both} none=${v.none}`);
  });
})();
