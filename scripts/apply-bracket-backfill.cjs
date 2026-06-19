// Backfill exercise identity from the bracketed note. Yuval Gotlib's and
// Neta's imported plans have rows with no usable exerciseId and no title, but
// the real name sits in the note as "[BB Back Squat]". Recover it: set the
// library exerciseId when the name matches, and always set the title so the
// row stops rendering as "Exercise N".
//
//   node scripts/apply-bracket-backfill.cjs         # dry run
//   node scripts/apply-bracket-backfill.cjs apply   # write
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv[2] === 'apply';
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow.value || [];
  const libIds = new Set(lib.map(e => e.id));
  const libByNorm = new Map(lib.map(e => [norm(e.title || e.t || ''), e.id]));
  const { data: plans } = await sb.from('plans').select('id,name,trainee_id,data');

  let plansChanged = 0, fixed = 0, linked = 0, titled = 0;
  for (const p of plans) {
    const days = p.data?.days || [];
    let touched = false;
    for (const d of days) {
      const isNew = Array.isArray(d.exercises);
      const arr = isNew ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      for (const e of arr) {
        const id = e.exerciseId || e.eid || '';
        const title = (e.title || '').trim();
        if ((id && libIds.has(id)) || title) continue; // already resolvable
        const note = (e.notes || e.n || '').trim();
        const m = note.match(/^\[(.+?)\]$/);
        if (!m) continue;
        const name = m[1].trim();
        const libId = libByNorm.get(norm(name));
        // always set the title (self-describing fallback); set the library id
        // when the name matches a library exercise.
        e.title = name;
        if (libId) { if (isNew) e.exerciseId = libId; else e.eid = libId; linked++; }
        else titled++;
        fixed++; touched = true;
        if (!APPLY) console.log(`  ${p.name} | ${name} ${libId ? '→ ' + libId : '(title only)'}`);
      }
    }
    if (touched) {
      plansChanged++;
      if (APPLY) {
        const { error } = await sb.from('plans').update({ data: p.data }).eq('id', p.id);
        console.log(error ? `✗ ${p.name}: ${error.message}` : `✓ ${p.name}`);
      }
    }
  }
  console.log(`\n──── ${APPLY ? 'APPLIED' : 'DRY RUN'} ────`);
  console.log(`plans changed: ${plansChanged}`);
  console.log(`rows fixed: ${fixed}  (linked to library: ${linked}, title-only: ${titled})`);
  process.exit(0);
})();
