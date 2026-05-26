// Wipe the demo CENTER tasks seeded by seed-center-tasks-demo.cjs.
// Matches by id prefix 'note_demo_center_'.
const sb = require('@supabase/supabase-js').createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv',
);

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234'
  });
  if (authErr) { console.error('auth failed:', authErr.message); process.exit(1); }
  const { data, error } = await sb.from('coach_notes')
    .delete()
    .like('id', 'note_demo_center_%')
    .select('id');
  if (error) { console.error('delete failed:', error.message); process.exit(1); }
  console.log('Cleared', data?.length || 0, 'demo CENTER tasks.');
})();
