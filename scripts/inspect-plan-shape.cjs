const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
(async () => {
  // Confirm Amit's ID and check an existing Amit plan structure
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const amit = trainees.find(t => t.id === 'tr_amit');
  console.log('AMIT RECORD:', JSON.stringify(amit, null, 2));

  // Check how plans are stored - look at an existing imported plan to match format
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const amitBlock16 = plans.find(p => p.traineeId === 'tr_amit' && p.name === 'Block #16');
  console.log('\nAMIT BLOCK #16 (existing):');
  console.log('  id:', amitBlock16?.id);
  console.log('  name:', amitBlock16?.name);
  console.log('  traineeId:', amitBlock16?.traineeId);
  console.log('  phase:', amitBlock16?.phase);
  console.log('  days:', amitBlock16?.days?.length);
  console.log('  first day structure:', JSON.stringify(amitBlock16?.days?.[0], null, 2).substring(0, 1500));

  // Also check plans table row-per-plan shape
  const { data: rows } = await s.from('plans').select('*').eq('id', amitBlock16?.id).limit(1);
  console.log('\nAMIT BLOCK #16 plans table row:', rows?.[0] ? Object.keys(rows[0]) : 'not in plans table');

  // Check portal-vis keys to see the format Amit needs for visibility
  const { data: pv } = await s.from('store').select('value').eq('key','expo-portal-vis').maybeSingle();
  const vis = pv?.value || {};
  const amitKeys = Object.keys(vis).filter(k => k.startsWith(amit?.name || 'X'));
  console.log('\nAMIT PORTAL-VIS keys:', amitKeys);

  // Check an imported plan structure (any trainee) for reference
  const sampleImport = plans.find(p => p.id?.startsWith('imp_'));
  console.log('\nSAMPLE imp_ plan exercise shape:', JSON.stringify(sampleImport?.days?.[0]?.exercises?.[0], null, 2));
})().catch(e => console.error(e));
