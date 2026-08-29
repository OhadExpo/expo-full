// Repair: fill videoUrl on Amit Gershon's copied program from the exercise
// library. The rows resolve fine on the COACH seat (they carry a valid
// exerciseId) but the athlete cannot read `expo-exercises`, so with no
// per-row videoUrl the athlete sees nothing.
//
// Only fills where videoUrl is UNDEFINED. An explicit '' means "no video for
// this program" and is left alone. Backs the row up first.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const PLAN_ID = 'pl_czpgs9z9mt8kh0cw';
const APPLY = process.argv.includes('--apply');
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key','expo-exercises').single();
  const byId = new Map((libRow.value||[]).map(e => [e.id, e]));
  const { data: p } = await s.from('plans').select('*').eq('id', PLAN_ID).single();
  if (!p) { console.log('plan not found'); process.exit(1); }

  const backup = `scripts/_backup-amit-${PLAN_ID}-${new Date().toISOString().slice(0,10)}.json`;
  fs.writeFileSync(backup, JSON.stringify(p, null, 2));
  console.log('backup written:', backup);

  const data = JSON.parse(JSON.stringify(p.data));
  let filled = 0, already = 0, noVideo = 0, explicitBlank = 0;
  for (const d of (data.days || [])) {
    for (const ex of (d.exercises || d.ex || [])) {
      if (ex.videoUrl === '') { explicitBlank++; continue; }
      if (ex.videoUrl) { already++; continue; }
      const eid = ex.exerciseId || ex.eid || '';
      const lib = eid ? byId.get(eid) : null;
      const url = lib && (lib.videoLink || lib.video);
      if (url) { ex.videoUrl = url; filled++; } else { noVideo++; }
    }
  }
  console.log(`filled=${filled} alreadyHad=${already} explicitlyBlank=${explicitBlank} libraryHasNoVideo=${noVideo}`);
  if (!APPLY) { console.log('DRY RUN — pass --apply to write'); process.exit(0); }
  const { error } = await s.from('plans').update({ data }).eq('id', PLAN_ID);
  if (error) { console.log('WRITE FAILED:', error.message); process.exit(1); }
  const { data: after } = await s.from('plans').select('data').eq('id', PLAN_ID).single();
  let n=0, wv=0;
  for (const d of (after.data.days||[])) for (const ex of (d.exercises||d.ex||[])) { n++; if (ex.videoUrl) wv++; }
  console.log(`VERIFIED FROM DB: ${wv} of ${n} exercises now carry a videoUrl`);
  process.exit(0);
})();
