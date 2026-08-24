// Which athlete has a stored form video, and what email do they sign in with?
// Needed to verify from the REAL seat whether signing works for an athlete
// before the storage buckets are flipped private. Read-only.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (error) { console.log('AUTH FAIL', error.message); process.exit(1); }

  const cw = await s.from('client_workouts').select('client_id,form_videos').not('form_videos', 'is', null).limit(120);
  const withVid = new Map();
  for (const r of (cw.data || [])) {
    const fv = r.form_videos;
    const vals = Array.isArray(fv) ? fv : Object.values(fv || {});
    for (const v of vals) {
      if (v && v.cloudUrl) { withVid.set(r.client_id, (withVid.get(r.client_id) || 0) + 1); }
    }
  }
  const { data: tRow } = await s.from('store').select('value').eq('key', 'expo-trainees').single();
  const trainees = (tRow && tRow.value) || [];
  const byId = new Map(trainees.map((t) => [t.id, t]));

  console.log('athletes holding stored form videos:');
  for (const [id, n] of [...withVid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    const base = String(id).split('__')[0];
    const t = byId.get(id) || byId.get(base);
    const email = t ? String(t.email || '').split(/[,;\s]+/).filter(Boolean)[0] : null;
    console.log(`  ${String(id).padEnd(22)} clips=${String(n).padStart(3)}  ${t ? t.name : '(no trainee row)'}  ${email || '(no email)'}`);
  }
})();
