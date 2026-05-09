// What's still missing a *video URL* (not cue note) on Omer Block #8?
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: planRow } = await sb.from('plans').select('data').eq('id', 'pl_3a55ef962099rwed').maybeSingle();
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const libById = new Map(lib.map(L => [L.id, L]));

  for (const d of planRow.data.days || []) {
    console.log(`\n${d.name}:`);
    for (const ex of d.exercises) {
      const linked = ex.exerciseId ? libById.get(ex.exerciseId) : null;
      const libUrl = linked?.videoLink || '';
      const planUrl = (typeof ex.videoUrl === 'string' && ex.videoUrl) || '';
      const haveUrl = !!(libUrl || planUrl);
      const tag = haveUrl
        ? (planUrl ? `[plan]${planUrl.slice(0, 70)}` : `[lib]${libUrl.slice(0, 70)}`)
        : '✗ NO URL';
      console.log(`  ${haveUrl ? '✓' : '✗'} ${ex.title}  ${tag}`);
    }
  }
})();
