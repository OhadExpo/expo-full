const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = (pr?.value || []).filter(p => p.traineeId === 'tr_roei');
  const { data: er } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const exs = er?.value || [];
  const libById = new Map(exs.map(e => [e.id, e]));

  const sample = plans.find(p => p.name === 'Block #24');
  console.log('plan keys:', Object.keys(sample));
  console.log('day keys:', Object.keys(sample.days[0]));
  const d0 = sample.days[0];
  const arr = d0.exercises || d0.ex || [];
  console.log('exercise array name:', d0.exercises ? 'exercises' : d0.ex ? 'ex' : 'none', '| len:', arr.length);
  console.log('first 3 exercises:', JSON.stringify(arr.slice(0, 3), null, 2));

  // For each unique eid/exerciseId referenced by Roei's plans, check if in library
  const refs = new Set();
  for (const p of plans) for (const d of (p.days||[])) for (const e of (d.exercises||d.ex||[])) {
    const k = e.exerciseId || e.eid || e.id;
    if (k) refs.add(k);
  }
  let hit = 0, miss = 0;
  for (const r of refs) (libById.has(r) ? hit++ : miss++);
  console.log(`\nUnique exercise refs: ${refs.size} | in library: ${hit} | missing: ${miss}`);

  // Show first 10 missing refs with their plan context
  if (miss > 0) {
    const missingIds = [...refs].filter(r => !libById.has(r)).slice(0, 10);
    console.log('First 10 missing refs:', missingIds);
  }
})().catch(e => { console.error(e); process.exit(1); });
