// The 528 rows an athlete sees no video for: WHY, and which exercises drive it.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blank = (v) => v == null || String(v).trim() === '';
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const LIB = new Map(((libRow && libRow.value) || []).map((e) => [e.id, e]));
  const { data: plans } = await s.from('plans').select('name,trainee_id,data');
  let noEid = 0, eidNotInLib = 0, libNoVideo = 0, explicitNone = 0;
  const byExercise = new Map();
  for (const p of plans || []) for (const d of (p.data && p.data.days) || []) {
    const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
    for (const ex of list) {
      const vid = ex.videoUrl !== undefined ? ex.videoUrl : ex.video;
      if (vid !== undefined && !blank(vid)) continue;          // has a real override
      if (vid === '' ) { explicitNone++; continue; }            // coach said "no video here"
      const eid = ex.exerciseId || ex.eid;
      const le = eid ? LIB.get(eid) : null;
      const libUrl = le && (le.videoLink || le.video);
      if (!blank(libUrl)) continue;                            // athlete sees the library video
      const title = ex.title || ex.name || '(untitled)';
      if (!eid) noEid++;
      else if (!le) eidNotInLib++;
      else libNoVideo++;
      byExercise.set(title, (byExercise.get(title) || 0) + 1);
    }
  }
  console.log('WHY the athlete sees no video:');
  console.log('  library entry exists but has NO video :', libNoVideo);
  console.log('  row has an eid not present in library :', eidNotInLib);
  console.log('  row has NO exercise id at all         :', noEid);
  console.log('  coach explicitly set "no video"       :', explicitNone, '(not a gap)');
  const top = [...byExercise.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`\ndistinct exercises involved: ${byExercise.size}`);
  console.log('worst offenders (rows they would fix):');
  top.forEach(([t, n]) => console.log(`  ${String(n).padStart(3)}  ${t}`));
})();
