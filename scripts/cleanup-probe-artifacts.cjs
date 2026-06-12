// Remove MY diagnostic artifacts from form-videos (NOT client videos).
// Targets: tr_diego/{diag-*,size-probe*,policy-test*,verify*,canary-upload-probe*},
// and the _probe/ folder. Leaves t4/t5/_lib ALONE — those are unknown-origin
// and may be real client clips under a wrong id; Ohad decides on those.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { error: aerr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aerr) { console.error('AUTH FAIL', aerr.message); process.exit(1); }
  const isProbe = n => /^(diag-|size-probe|policy-test|verify|canary-upload-probe)/.test(n);
  let removed = 0;
  for (const folder of ['tr_diego', '_probe']) {
    const { data: files } = await s.storage.from('form-videos').list(folder, { limit: 200 });
    const targets = (files || [])
      .filter(f => folder === '_probe' ? true : isProbe(f.name))
      .map(f => `${folder}/${f.name}`);
    if (targets.length) {
      const { error } = await s.storage.from('form-videos').remove(targets);
      if (error) console.error('remove fail', folder, error.message);
      else { removed += targets.length; console.log('removed:', targets.join(', ')); }
    }
  }
  console.log('total removed:', removed);
})().catch(e => { console.error(e); process.exit(1); });
