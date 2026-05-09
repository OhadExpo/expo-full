// After patch-omer-b8-notes.cjs, list exercises that STILL have no Hebrew
// cue note set. These are candidates to fill from Drive (מעקבים sheets +
// any other shared docs).
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: planRow } = await sb.from('plans').select('id,name,trainee_id,data').eq('id', 'pl_3a55ef962099rwed').maybeSingle();
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const libById = new Map(lib.map(L => [L.id, L]));

  console.log(`plan ${planRow.name} (${planRow.id})`);
  for (const d of planRow.data.days || []) {
    console.log(`\n${d.name}:`);
    for (const ex of d.exercises) {
      const linked = ex.exerciseId ? libById.get(ex.exerciseId) : null;
      const libCues = linked?.cues || '';
      const hasNote = !!(typeof ex.notes === 'string' && ex.notes.trim());
      const hasLibCues = !!libCues;
      if (hasNote || hasLibCues) {
        console.log(`  ✓ ${ex.title}  ${hasNote ? '[plan-note]' : ''}${hasLibCues ? '[lib-cues]' : ''}`);
      } else {
        console.log(`  ✗ ${ex.title}  — NO note AND no library cues  (eid=${ex.exerciseId || '—'})`);
      }
    }
  }
})();
