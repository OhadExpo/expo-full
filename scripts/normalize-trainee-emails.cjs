const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { error: aerr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aerr) { console.error('AUTH FAIL', aerr.message); process.exit(1); }
  const { data: row, error } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  if (error || !row) { console.error('READ FAIL', error && error.message); process.exit(1); }
  const trainees = row.value;
  let changed = 0;
  trainees.forEach(t => {
    if (typeof t.email === 'string' && t.email.trim()) {
      console.log('normalizing', t.id, t.name, JSON.stringify(t.email), '-> array');
      t.email = [t.email.trim()];
      changed++;
    }
  });
  if (!changed) { console.log('nothing to normalize'); return; }
  const { error: werr } = await s.from('store').update({ value: trainees }).eq('key','expo-trainees');
  if (werr) { console.error('WRITE FAIL', werr.message); process.exit(1); }
  console.log('updated', changed, 'trainee(s)');
  // verify
  const { data: chk } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  chk.value.filter(t => ['tr_ron','tr_omer'].includes(t.id)).forEach(t => console.log('VERIFY', t.id, JSON.stringify(t.email)));
})().catch(e => { console.error(e); process.exit(1); });
