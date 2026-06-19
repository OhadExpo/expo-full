// Dump the full exercise list for days that contain a corrupt-superset placeholder,
// so we can tell whether the corrupt entry is a spurious "SuperSet:" header row
// (real exercises present → safe to remove) or a lost exercise (→ must fill).
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const CORRUPT_ID = 'ex_rvi8ifq11zsmo8nlmzm';

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: exRows } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = Array.isArray(exRows?.value) ? exRows.value : [];
  const titleById = {}; lib.forEach(e => { titleById[e.id] = e.title || e.t || ''; });

  const target = process.argv[2]; // optional plan id
  const { data: plans } = await sb.from('plans').select('id,name,trainee_id,data');
  let shown = 0;
  for (const p of plans) {
    if (target && p.id !== target) continue;
    const days = p.data?.days || [];
    days.forEach((d, di) => {
      const list = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      const hasCorrupt = list.some(ex => (ex.exerciseId || ex.eid) === CORRUPT_ID);
      if (!hasCorrupt) return;
      if (!target && shown >= 4) return;
      shown++;
      console.log(`\n=== [${p.trainee_id}] ${p.name} (${p.id}) · ${d.name || d.n || 'Day '+(di+1)} ===`);
      list.forEach((ex, xi) => {
        const id = ex.exerciseId || ex.eid || '';
        const title = (ex.title || titleById[id] || '').trim();
        const ss = ex.superset || ex.ss || '';
        const mark = id === CORRUPT_ID ? '  <<< CORRUPT' : '';
        console.log(`  [${xi}] ss=${ss||'-'} id=${id||'∅'} title="${title}"${mark}`);
      });
    });
  }
  process.exit(0);
})();
