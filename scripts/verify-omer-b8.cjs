// Verify Block #8 made it into Supabase and looks structurally sane.
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await sb.from('plans').select('id,name,active,trainee_id,data,created_at').eq('trainee_id', 'tr_omer').order('created_at');
  console.log(`tr_omer plans (${plans.length}):`);
  for (const p of plans) console.log(`  - ${p.id}  ${p.name}  active=${p.active}  ${p.created_at}`);

  const b8 = plans.find(p => p.name === 'Block #8');
  if (!b8) { console.error('Block #8 not found!'); process.exit(1); }
  console.log(`\nBlock #8 (${b8.id}):`);
  console.log(`  warmup: ${b8.data.warmup.length} items`);
  for (const w of b8.data.warmup) console.log(`    - ${w.t}  (${w.rx})`);
  console.log(`  weeks: ${b8.data.weeks}`);
  console.log(`  days: ${b8.data.days.length}`);
  for (const d of b8.data.days) {
    const linked = d.exercises.filter(e => e.exerciseId).length;
    console.log(`    ${d.name}: ${d.exercises.length} exercises (${linked} linked)`);
    for (const e of d.exercises) {
      console.log(`      ${e.order + 1}. [${e.exerciseId ? '✓' : ' '}] ${e.title}  ${e.sets}x${e.reps}  rest=${e.rest}s${e.tempo ? `  tempo=${e.tempo}` : ''}`);
    }
  }
})();
