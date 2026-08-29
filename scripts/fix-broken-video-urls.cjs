// Fix plan exercise videoUrl overrides that are valid URLs missing the https://
// scheme (so they render nothing / get rejected by safeUrl). Dry by default.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv.includes('--apply');
const isHttp = (u) => /^https?:\/\//i.test(u);
// Looks like a URL missing the scheme (a known video host or a bare domain/path)
const looksUrl = (u) => /^(www\.|youtube\.com|youtu\.be|photos\.google\.com|photos\.app\.goo\.gl|lh3\.googleusercontent\.com|drive\.google\.com|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(u);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data');
  const fixes = [];
  for (const p of plans) {
    let changed = false;
    const days = p.data?.days || [];
    for (const d of days) {
      const exs = d.exercises || d.ex || [];
      for (const ex of exs) {
        const key = ('videoUrl' in ex) ? 'videoUrl' : ('vid' in ex ? 'vid' : null);
        if (!key) continue;
        const v = ex[key];
        if (typeof v === 'string' && v.trim() && !isHttp(v) && looksUrl(v.trim())) {
          const fixed = 'https://' + v.trim();
          fixes.push({ plan: p.name, id: p.id, ex: ex.title || ex.exerciseId || ex.eid, from: v, to: fixed });
          ex[key] = fixed;
          changed = true;
        }
      }
    }
    if (changed && APPLY) {
      const { error } = await s.from('plans').update({ data: p.data, updated_at: new Date().toISOString() }).eq('id', p.id);
      if (error) console.error(`  UPDATE FAILED ${p.id}: ${error.message}`);
    }
  }
  console.log(`Broken video URLs found: ${fixes.length}`);
  fixes.forEach(f => console.log(`  ${f.plan} · ${f.ex}\n    ${f.from}\n    → ${f.to}`));
  console.log(APPLY ? '\n✅ APPLIED' : '\n(dry run — add --apply)');
  process.exit(0);
})();
