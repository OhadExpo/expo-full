// Investigate: "Amit Block #16" and "Roey Block #24" imported under wrong trainee IDs
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  // Find any plan named like "Block #16" or "Block #24" and show its trainee
  const { data } = await s.from('plans').select('id,name,trainee_id,created_at').or('name.ilike.%Block #16%,name.ilike.%Block #24%');
  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const traineeById = {};
  (tr?.value || []).forEach(t => traineeById[t.id] = t.name);
  console.log('Plans named Block #16 or Block #24:\n');
  data.sort((a,b) => a.name.localeCompare(b.name) || a.trainee_id.localeCompare(b.trainee_id)).forEach(p => {
    console.log(`  ${p.id} | "${p.name}" | trainee=${p.trainee_id} (${traineeById[p.trainee_id.replace(/__\d+$/,'')] || '?'})`);
  });
})();
