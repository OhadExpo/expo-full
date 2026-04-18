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
  const isVisible = (p) => {
    const tName = nameFor(p.traineeId);
    const key = tName + ':' + p.name;
    return vis[key] !== false;
  };

  // Warmup-in-notes pattern: notes contains "warm-up" or "warmup" keyword
  const suspect = plans.filter(p => {
    const n = (p.notes || '').toLowerCase();
    const hasWarmupKeyword = /warm-?up/.test(n);
    const emptyWarmupField = !Array.isArray(p.warmup) || p.warmup.length === 0;
    return hasWarmupKeyword && emptyWarmupField;
  });

  console.log('=== Plans with warmup-keyword in notes AND empty warmup field ===');
  console.log('Total:', suspect.length);
  suspect.forEach(p => {
    const v = isVisible(p) ? 'VIS' : 'hid';
    console.log(`  [${v}] ${nameFor(p.traineeId).padEnd(25)} ${p.name.padEnd(18)} ${p.id}`);
    console.log(`    notes excerpt: ${(p.notes || '').replace(/\n/g, ' | ').substring(0, 120)}`);
  });

  // How many visible vs hidden
  const visCount = suspect.filter(isVisible).length;
  console.log(`\nBreakdown: ${visCount} visible on portal, ${suspect.length - visCount} hidden`);

  // Also: how many plans have ANY warmup field populated for baseline
  const hasWu = plans.filter(p => Array.isArray(p.warmup) && p.warmup.length > 0);
  console.log(`\nBaseline: ${hasWu.length}/${plans.length} plans have populated warmup field`);
})().catch(e => console.error(e));
