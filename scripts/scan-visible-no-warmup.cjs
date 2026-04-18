const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const { data: tr } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const nameFor = id => trainees.find(t => t.id === id)?.name || '?';
  const { data: pv } = await s.from('store').select('value').eq('key', 'expo-portal-vis').maybeSingle();
  const vis = pv?.value || {};

  // Only trainees with email (can actually log in)
  const emailedIds = new Set(trainees.filter(t => t.email).map(t => t.id));
  // Skip curated-override trainees (their hardcoded data takes precedence in portal)
  const curated = ['Ron Yonker', 'Diego Day', 'Omer Sadeh', 'Yuval Barko', 'Shalev'];
  const isCurated = name => curated.some(c => name?.includes(c.split(' ')[0]));

  const visible = plans.filter(p => {
    if (!emailedIds.has(p.traineeId)) return false;
    const name = nameFor(p.traineeId);
    if (isCurated(name)) return false;
    return vis[name + ':' + p.name] !== false;
  });

  const noWarmup = visible.filter(p => !Array.isArray(p.warmup) || p.warmup.length === 0);

  console.log(`=== Non-curated trainees, visible plans, no warmup data ===`);
  console.log(`Total: ${noWarmup.length}/${visible.length}`);
  noWarmup.forEach(p => {
    const name = nameFor(p.traineeId);
    const trainee = trainees.find(t => t.id === p.traineeId);
    console.log(`  ${name.padEnd(20)} ${p.name.padEnd(15)} email=${trainee.email}`);
  });
})().catch(e => console.error(e));
