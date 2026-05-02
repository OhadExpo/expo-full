// Idempotent: list buckets, create coach-demos as public if missing.
const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: buckets, error: lErr } = await s.storage.listBuckets();
  if (lErr) { console.error('list err:', lErr.message); process.exit(1); }
  console.log('existing buckets:', buckets.map(b => `${b.name}(${b.public?'pub':'priv'})`).join(', '));
  const has = buckets.find(b => b.name === 'coach-demos');
  if (has) {
    console.log('coach-demos already exists, public=' + has.public);
    if (!has.public) {
      const { error } = await s.storage.updateBucket('coach-demos', { public: true });
      if (error) console.error('updateBucket err:', error.message);
      else console.log('flipped to public');
    }
    return;
  }
  const { error } = await s.storage.createBucket('coach-demos', { public: true });
  if (error) {
    console.error('createBucket err:', error.message);
    process.exit(1);
  }
  console.log('created coach-demos (public)');
})();
