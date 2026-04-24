// Dump all trainee rows so we can see whether to attach to an existing one or create one.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.error('auth:', authErr); process.exit(1); }

  const { data, error } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  if (error) { console.error(error); process.exit(1); }
  const trainees = data?.value || [];
  console.log(`Total trainees: ${trainees.length}\n`);

  for (const t of trainees) {
    console.log(`  id=${t.id.padEnd(28)} name=${(t.name || '').padEnd(20)} email=${JSON.stringify(t.email)}`);
  }

  // Look for any 'ohad' in any field
  console.log('\nAny field containing "ohad":');
  for (const t of trainees) {
    const blob = JSON.stringify(t).toLowerCase();
    if (blob.includes('ohad')) console.log(`  ${t.id} | ${t.name} | email=${JSON.stringify(t.email)}`);
  }

  // Sample: check a couple of client_workouts to see what client_ids appear
  const { data: cw } = await s.from('client_workouts').select('client_id').limit(200);
  const ids = [...new Set((cw || []).map(r => r.client_id))];
  console.log(`\nUnique client_ids in client_workouts (first 200 rows): ${ids.length}`);
  for (const id of ids) {
    if (id.toLowerCase().includes('ohad')) console.log(`  HIT: ${id}`);
  }
})();
