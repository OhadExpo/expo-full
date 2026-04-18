const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const amitPlans = plans.filter(p => p.traineeId === 'tr_amit');

  console.log('=== AMIT PLANS (' + amitPlans.length + ') ===');
  amitPlans.forEach(p => console.log(`  ${p.id}  name="${p.name}"  days=${p.days?.length}  ex=${(p.days||[]).reduce((a,d)=>a+(d.exercises?.length||0),0)}`));

  const { data: pv } = await s.from('store').select('value').eq('key','expo-portal-vis').maybeSingle();
  const vis = pv?.value || {};
  const amitKeys = Object.entries(vis).filter(([k]) => k.startsWith('עמית'));
  console.log('\n=== AMIT PORTAL-VIS ENTRIES ===');
  amitKeys.forEach(([k, v]) => console.log(`  ${k} => ${v}`));

  console.log('\n=== SIMULATED PORTAL VIEW for Amit ===');
  amitPlans.forEach(p => {
    const key = 'עמית יהודאי:' + p.name;
    const isVis = vis[key] !== false;
    console.log(`  ${p.name}: ${isVis ? '👁️  VISIBLE' : '🚫 hidden'}`);
  });

  // Double-check the new plan's structure is complete
  const block17 = plans.find(p => p.traineeId === 'tr_amit' && p.name === 'Block #17');
  if (block17) {
    console.log('\n=== BLOCK #17 INTEGRITY CHECK ===');
    console.log('  id:', block17.id);
    console.log('  phase:', block17.phase);
    console.log('  createdAt:', block17.createdAt);
    console.log('  notes chars:', block17.notes?.length);
    console.log('  notes first line:', block17.notes?.split('\n')[0]);
    block17.days.forEach((d, i) => {
      const setsTotal = d.exercises.reduce((a, e) => a + (parseInt(e.sets) || 0), 0);
      const tempoCount = d.exercises.filter(e => e.tempo).length;
      console.log(`  ${d.name}: ${d.exercises.length} ex, ${setsTotal} total sets, ${tempoCount} with tempo`);
    });

    // Check for any empty titles (critical integrity)
    const badEx = [];
    block17.days.forEach(d => d.exercises.forEach(e => { if (!e.title?.trim()) badEx.push(`${d.name} #${e.order}`); }));
    console.log('  empty titles:', badEx.length === 0 ? 'none ✓' : badEx.join(', '));
  }
})().catch(e => console.error(e));
