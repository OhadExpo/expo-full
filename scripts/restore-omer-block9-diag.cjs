// EMERGENCY diagnostic — find Omer Sadeh, list his plans, confirm Block #9 gone,
// and locate recovery sources (client_workouts logged against Block #9).
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const s = createClient(SB, ANON);

(async () => {
  const { error: aErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aErr) { console.error('AUTH FAILED:', aErr.message); process.exit(1); }

  // 1. Find Omer in the trainees store
  const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').single();
  const trainees = trRow?.value || [];
  const omer = trainees.filter(t => /עומר|omer|sadeh|שדה/i.test(JSON.stringify(t.name || '') + (t.members ? JSON.stringify(t.members) : '')));
  console.log('=== OMER MATCHES ===');
  omer.forEach(t => console.log(`  id=${t.id}  name=${t.name}`));

  for (const t of omer) {
    // 2. List ALL plans for this trainee (current state)
    const { data: plans } = await s.from('plans').select('id,name,trainee_id,created_at,updated_at').eq('trainee_id', t.id).order('created_at');
    console.log(`\n=== PLANS for ${t.name} (${t.id}) — ${plans?.length || 0} ===`);
    (plans || []).forEach(p => console.log(`  ${p.name}  [${p.id}]  upd=${p.updated_at}`));
    const has9 = (plans || []).some(p => /block\s*#?\s*9\b/i.test(p.name));
    console.log(`  >>> Block #9 present? ${has9}`);

    // 3. client_workouts logged against Block #9 (recovery source)
    const { data: cw } = await s.from('client_workouts').select('id,plan_name,day_name,week,date,exercises').eq('client_id', t.id);
    const cw9 = (cw || []).filter(w => /block\s*#?\s*9\b|#9\b/i.test(w.plan_name || ''));
    console.log(`  client_workouts total=${cw?.length||0}, against Block#9=${cw9.length}`);
    cw9.forEach(w => console.log(`     CW: plan="${w.plan_name}" day="${w.day_name}" wk=${w.week} date=${w.date} ex=${(w.exercises||[]).length}`));
  }
  process.exit(0);
})();
