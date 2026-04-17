const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

// For each orphan plan, find real plans with the same name and compare day/exercise counts
(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const validIds = new Set(trainees.map(t => t.id));
  trainees.forEach(t => { if (t.members?.length === 2) { validIds.add(t.id+'__0'); validIds.add(t.id+'__1'); }});

  const orphans = plans.filter(p => p.traineeId && !validIds.has(p.traineeId));
  const unassigned = plans.filter(p => !p.traineeId);

  const summarize = (p) => {
    const days = (p.days || []).length;
    const ex = (p.days || []).reduce((a,d) => a + (d.exercises?.length || 0), 0);
    return `days=${days} ex=${ex}`;
  };

  // Build a map of name -> plans, for non-orphan/non-unassigned plans only
  const realPlans = plans.filter(p => p.traineeId && validIds.has(p.traineeId));
  const byName = {};
  realPlans.forEach(p => {
    const k = p.name || '(no name)';
    if (!byName[k]) byName[k] = [];
    byName[k].push(p);
  });

  console.log('=== Orphan plans and potential matches ===\n');
  [...orphans, ...unassigned].forEach(o => {
    const ownerLabel = o.traineeId || '(unassigned)';
    console.log(`ORPHAN: "${o.name}" ${summarize(o)}  owner=${ownerLabel}  id=${o.id}`);
    const candidates = byName[o.name] || [];
    if (candidates.length === 0) {
      console.log('  -> NO real plan has this name. Unique.');
    } else {
      candidates.forEach(c => {
        const trainee = trainees.find(t => t.id === c.traineeId || c.traineeId?.startsWith(t.id+'__'));
        console.log(`  -> match on name: "${c.name}" ${summarize(c)}  owner=${c.traineeId} (${trainee?.name || '?'})  id=${c.id}`);
      });
    }
    console.log('');
  });
})().catch(e => console.error(e));
