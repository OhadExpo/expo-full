// Resolve the right trainee row for Omer Sadeh + list his existing plans.
const { createClient } = require('@supabase/supabase-js');
const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

(async () => {
  const sb = createClient(SUPA_URL, SUPA_KEY);
  const { error: aErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (aErr) { console.error('auth failed:', aErr); process.exit(1); }

  const { data: row } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = row?.value || [];
  const matches = trainees.filter(t => /omer|עומר|סדה/i.test([t.id, t.name, t.fullName, t.email].filter(Boolean).join(' ')));
  console.log('candidate trainees:');
  for (const t of matches) {
    console.log('  -', t.id, '|', t.name || t.fullName, '| email:', t.email);
  }

  for (const t of matches) {
    const { data: plans } = await sb.from('plans').select('id,name,active,created_at,trainee_id').eq('trainee_id', t.id).order('created_at');
    console.log(`\nplans for ${t.id} (${(plans || []).length}):`);
    for (const p of plans || []) console.log('  -', p.id, '|', p.name, '| active:', p.active, '|', p.created_at);
  }
})();
