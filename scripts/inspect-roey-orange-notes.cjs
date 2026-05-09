// For tr_roey* trainees — surface any exercise that has a non-empty per-plan
// `notes` field. That field renders in orange in the athlete portal under the
// exercise card; if Ohad didn't intentionally type a note, it's stale data
// from an old enrichment script.
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  // Find all Roey-flavored trainees.
  const { data: tRow } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = tRow?.value || [];
  const roeyTs = trainees.filter(t => /roey|רועי/i.test([t.id, t.name, t.fullName, t.email].filter(Boolean).join(' ')));
  for (const t of roeyTs) console.log(`trainee: ${t.id}  name=${t.name || t.fullName}`);

  for (const t of roeyTs) {
    const { data: plans } = await sb.from('plans').select('id,name,active,data').eq('trainee_id', t.id);
    console.log(`\n══ ${t.id} (${plans.length} plans) ══`);
    for (const p of plans) {
      const days = p.data?.days || [];
      let total = 0, withNotes = 0;
      const samples = [];
      for (const d of days) {
        for (const ex of d.exercises || []) {
          total++;
          if (typeof ex.notes === 'string' && ex.notes.trim() !== '') {
            withNotes++;
            if (samples.length < 3) samples.push({ day: d.name, title: ex.title, notes: ex.notes.slice(0, 120) });
          }
        }
      }
      console.log(`  ${p.id}  ${p.name}  active=${p.active}  ex=${total}  withNotes=${withNotes}`);
      for (const s of samples) console.log(`    [${s.day}] ${s.title}  →  ${s.notes.replace(/\n/g, ' ⏎ ')}`);
    }
  }
})();
