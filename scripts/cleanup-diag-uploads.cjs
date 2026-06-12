const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { error: aerr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aerr) { console.error('AUTH FAIL', aerr.message); process.exit(1); }
  const { data: files, error } = await s.storage.from('form-videos').list('tr_diego');
  if (error) { console.error('LIST FAIL', error.message); process.exit(1); }
  const diag = (files || []).filter(f => f.name.startsWith('diag-'));
  if (!diag.length) { console.log('no diag files'); return; }
  const paths = diag.map(f => 'tr_diego/' + f.name);
  const { error: derr } = await s.storage.from('form-videos').remove(paths);
  console.log(derr ? 'DELETE FAIL ' + derr.message : 'deleted: ' + paths.join(', '));
})().catch(e => { console.error(e); process.exit(1); });
