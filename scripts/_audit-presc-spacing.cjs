// The athlete's prescription line broke because the source had a space before a
// comma ("5x1 , 30 sec rest"). Where else does that pattern live in the data?
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const ODD = [
  [/\s+,/, 'space before a comma'],
  [/\(\s+/, 'space after an opening bracket'],
  [/\s+\)/, 'space before a closing bracket'],
  [/,{2,}/, 'double comma'],
  [/\s{2,}/, 'double space'],
];
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data');
  const hits = new Map();
  let rows = 0;
  for (const p of plans || []) for (const d of (p.data && p.data.days) || []) {
    const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
    for (const ex of list) {
      rows++;
      for (const field of ['reps', 'r', 'sets', 's', 'tempo', 'notes', 'n', 'title']) {
        const v = ex[field];
        if (typeof v !== 'string' || !v.trim()) continue;
        for (const [re, why] of ODD) {
          if (re.test(v)) {
            const k = why;
            if (!hits.has(k)) hits.set(k, []);
            hits.get(k).push(`${p.name} :: ${field}=${JSON.stringify(v.slice(0, 44))}`);
          }
        }
      }
    }
  }
  console.log('exercise rows scanned:', rows);
  for (const [why, list] of hits) {
    console.log(`\n${why}: ${list.length}`);
    [...new Set(list)].slice(0, 4).forEach((l) => console.log('   ' + l));
  }
  if (!hits.size) console.log('no odd spacing found');
})();
