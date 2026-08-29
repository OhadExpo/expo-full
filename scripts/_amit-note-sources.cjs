// The 3 rows with no note: does a note for the SAME exercise exist anywhere
// else — another athlete's plan row, or the library? Ohad writes the cues; this
// only looks for something he has already written.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blank = (v) => v == null || String(v).trim() === '';
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const WANT = ['Reverse Sitting Cable Over-Head Tricep Extension', 'ISO Sitting DB Shrug', 'DB SL Depth Drop'].map(norm);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: lib } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  for (const e of (lib.value || [])) {
    if (WANT.includes(norm(e.title || e.name))) {
      console.log(`LIBRARY "${e.title || e.name}" cues=${blank(e.cues) ? 'EMPTY' : JSON.stringify(String(e.cues).slice(0, 70))} video=${blank(e.videoLink || e.video) ? 'none' : 'yes'}`);
    }
  }
  const { data: plans } = await s.from('plans').select('name,trainee_id,data');
  const found = new Map();
  for (const p of plans || []) for (const d of (p.data && p.data.days) || []) {
    const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
    for (const ex of list) {
      const k = norm(ex.title || ex.name);
      if (!WANT.includes(k)) continue;
      const note = ex.notes != null ? ex.notes : ex.n;
      if (!blank(note)) {
        if (!found.has(k)) found.set(k, []);
        found.get(k).push(`${p.name} (${p.trainee_id}): ${String(note).slice(0, 90)}`);
      }
    }
  }
  console.log('\n--- notes written on other plan rows ---');
  for (const w of WANT) {
    const hits = found.get(w) || [];
    console.log(`"${w}": ${hits.length} row(s) with a note`);
    hits.slice(0, 2).forEach((h) => console.log('    ' + h));
  }
})();
