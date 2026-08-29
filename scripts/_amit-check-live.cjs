// Does each video actually exist? oEmbed returns 404 for dead, private or
// removed videos, so this is a real reachability check rather than a URL shape.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await s.from('plans').select('data').eq('trainee_id', 'tr_bh_4djtfei1ly3');
  const rows = [];
  for (const p of plans) (p.data.days || []).forEach((d, di) => {
    const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
    list.forEach((ex, xi) => rows.push({ d: di + 1, i: xi + 1, t: ex.title || ex.name || '', v: ex.videoUrl != null ? ex.videoUrl : ex.video }));
  });
  let ok = 0; const dead = [];
  for (const r of rows) {
    try {
      const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(r.v));
      if (res.status === 200) ok++; else dead.push(`day${r.d}#${r.i} HTTP ${res.status} "${r.t}" ${r.v}`);
    } catch (e) { dead.push(`day${r.d}#${r.i} FETCH FAIL "${r.t}"`); }
  }
  console.log(`playable: ${ok}/${rows.length}`);
  dead.forEach((d) => console.log('  DEAD ' + d));
})();
