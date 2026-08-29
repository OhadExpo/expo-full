// Of the rows with NO exercise id, how many have a title that matches a library
// entry WITH a video? Those are recoverable without sourcing new footage.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blank = (v) => v == null || String(v).trim() === '';
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const EX = (libRow && libRow.value) || [];
  const byName = new Map();
  for (const e of EX) { const k = norm(e.title || e.name); if (k && !byName.has(k)) byName.set(k, e); }
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data');
  let noEid = 0, nameable = 0, nameableNoVideo = 0, unmatched = 0;
  const examples = [];
  for (const p of plans || []) for (const d of (p.data && p.data.days) || []) {
    const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
    for (const ex of list) {
      const vid = ex.videoUrl !== undefined ? ex.videoUrl : ex.video;
      if (vid !== undefined && !blank(vid)) continue;
      if (ex.exerciseId || ex.eid) continue;
      noEid++;
      const hit = byName.get(norm(ex.title || ex.name));
      if (!hit) { unmatched++; if (examples.length < 8) examples.push(`NOT IN LIBRARY: "${ex.title || ex.name}" (${p.name})`); }
      else if (!blank(hit.videoLink || hit.video)) nameable++;
      else nameableNoVideo++;
    }
  }
  console.log('rows with no exercise id and no video:', noEid);
  console.log('  title matches a library entry WITH a video   :', nameable, '<- recoverable now');
  console.log('  title matches a library entry with NO video  :', nameableNoVideo);
  console.log('  title matches nothing in the library         :', unmatched);
  examples.forEach((e) => console.log('     ' + e));
})();
