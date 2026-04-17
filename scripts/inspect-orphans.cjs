const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const validIds = new Set(trainees.map(t => t.id));
  // Also accept couple sub-IDs
  trainees.forEach(t => {
    if (t.members && t.members.length === 2) {
      validIds.add(t.id + '__0');
      validIds.add(t.id + '__1');
    }
  });
  validIds.add('');
  validIds.add(null);
  validIds.add(undefined);

  const orphans = plans.filter(p => !validIds.has(p.traineeId));
  const byOrphan = {};
  orphans.forEach(p => {
    const k = p.traineeId || '(no traineeId)';
    if (!byOrphan[k]) byOrphan[k] = [];
    byOrphan[k].push(p);
  });

  console.log('Total plans:', plans.length);
  console.log('Orphan plans:', orphans.length);
  console.log('');
  for (const k of Object.keys(byOrphan)) {
    console.log('=== orphan traineeId: ' + k + ' (' + byOrphan[k].length + ' plans) ===');
    byOrphan[k].forEach(p => {
      const exCount = (p.days || []).reduce((a,d) => a + (d.exercises?.length || 0), 0);
      const created = p.createdAt ? p.createdAt.slice(0,10) : '?';
      const days = (p.days || []).length;
      console.log('  id=' + p.id + '  name="' + (p.name||'(no name)') + '"  created=' + created + '  days=' + days + '  exercises=' + exCount);
    });
    console.log('');
  }

  // Also show unassigned
  const unassigned = plans.filter(p => !p.traineeId);
  console.log('=== plans with no traineeId at all: ' + unassigned.length + ' ===');
  unassigned.forEach(p => {
    const exCount = (p.days || []).reduce((a,d) => a + (d.exercises?.length || 0), 0);
    const created = p.createdAt ? p.createdAt.slice(0,10) : '?';
    const days = (p.days || []).length;
    console.log('  id=' + p.id + '  name="' + (p.name||'(no name)') + '"  created=' + created + '  days=' + days + '  exercises=' + exCount);
  });
})().catch(e => console.error(e));
