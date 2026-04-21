// Remove junk "header" rows that got parsed as exercises from every plan.
// Matches by library eid of the known junk entries, not by title, so that
// any renaming of the library entries doesn't break the scrub.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

// Known junk library entries (parse artifacts from xlsx import)
const JUNK_EIDS = new Set([
  'ex_m1752aqfs3pmo7afh8i', // "Super Set:" — xlsx superset label row
  'ex_okht1wt94dcmo7afjnq', // "Notes" — xlsx notes header row
]);
// Extra safety net: titles that shouldn't ever be exercises
const JUNK_TITLE_RX = /^(super\s*set\s*:?|exercise|name|notes?|warm[- ]?up|instructions?|rest|off|week\s*\d+|date:?)$/i;

(async () => {
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data,updated_at');
  const { data: libStore } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const lib = libStore?.value || [];
  const titleById = {};
  lib.forEach(e => titleById[e.id] = e.title);

  let plansTouched = 0, rowsRemoved = 0;
  const writes = [];

  for (const p of plans) {
    let changed = false;
    const days = (p.data?.days || []).map(d => {
      const listKey = Array.isArray(d.exercises) ? 'exercises' : (Array.isArray(d.ex) ? 'ex' : null);
      if (!listKey) return d;
      const cleaned = d[listKey].filter(e => {
        const id = e.exerciseId || e.eid;
        const title = (e.title || titleById[id] || '').trim();
        const junk = (id && JUNK_EIDS.has(id)) || JUNK_TITLE_RX.test(title);
        if (junk) { rowsRemoved++; changed = true; return false; }
        return true;
      });
      return { ...d, [listKey]: cleaned };
    });
    if (changed) {
      plansTouched++;
      writes.push({ id: p.id, data: { ...p.data, days }, updated_at: new Date().toISOString() });
    }
  }

  console.log(`Would remove ${rowsRemoved} junk rows from ${plansTouched} plans.`);
  if (process.argv[2] !== '--apply') {
    console.log('Dry run. Re-run with --apply to write.');
    return;
  }

  console.log('\nWriting...');
  for (const w of writes) {
    const { error } = await s.from('plans').update({ data: w.data, updated_at: w.updated_at }).eq('id', w.id);
    if (error) { console.error(`  ERROR ${w.id}: ${error.message}`); process.exit(1); }
  }
  console.log(`Done. Updated ${writes.length} plans.`);
})();
