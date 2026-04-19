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
  const isVisible = (p) => vis[nameFor(p.traineeId) + ':' + p.name] !== false;

  const hasWu = plans.filter(p => Array.isArray(p.warmup) && p.warmup.length > 0);
  console.log('=== Plans WITH populated warmup (' + hasWu.length + ') ===');
  hasWu.forEach(p => {
    const v = isVisible(p) ? 'VIS' : 'hid';
    console.log(`  [${v}] ${nameFor(p.traineeId).padEnd(25)} ${p.name.padEnd(25)} wu=${p.warmup.length}`);
  });

  // Visible plans without warmup - these are the portal UX gap
  const visNoWu = plans.filter(p => isVisible(p) && (!Array.isArray(p.warmup) || p.warmup.length === 0));
  console.log('\n=== VISIBLE plans WITHOUT warmup (client sees no warmup card) ===');
  console.log('Total:', visNoWu.length);
  visNoWu.slice(0, 15).forEach(p => {
    console.log(`  ${nameFor(p.traineeId).padEnd(25)} ${p.name.padEnd(25)} ${p.id}`);
  });
  if (visNoWu.length > 15) console.log('  ... and ' + (visNoWu.length - 15) + ' more');
})().catch(e => console.error(e));
