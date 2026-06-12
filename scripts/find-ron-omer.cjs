const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { error: aerr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aerr) { console.error('AUTH FAIL', aerr.message); process.exit(1); }
  const { data: tr, error } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  if (error) { console.error('READ FAIL', error.message); process.exit(1); }
  const trainees = tr?.value || [];
  console.log('TOTAL TRAINEES:', trainees.length);
  const needle = /ron|yonker|omer|sadeh|יונקר|רון|עומר|שדה/i;
  trainees.forEach(t => {
    const hay = JSON.stringify({ id: t.id, name: t.name, email: t.email, phone: t.phone });
    if (needle.test(hay)) console.log('MATCH:', hay);
  });
  console.log('\n--- all emails ---');
  trainees.forEach(t => {
    const emails = Array.isArray(t.email) ? t.email : (t.email ? [t.email] : []);
    if (emails.length) console.log((t.name||t.id).padEnd(28), JSON.stringify(emails));
  });
})().catch(e => { console.error(e); process.exit(1); });
