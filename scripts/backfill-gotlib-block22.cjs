// Backfill Yuval Gotlib's Block #22 from the source xlsx. The DB row has the
// right name but the days contain rows with blank title and blank exerciseId
// (18 of 29 broken in the audit). We replace its data payload entirely with
// the parsed sheet content, going through the same core parser the other
// drive imports use — so it ends up in the d.ex shape that the portal now
// handles.
const { createClient } = require('@supabase/supabase-js');
const { parseSingleSheet } = require('./drive-import-core.cjs');
const XLSX = require('xlsx');
const fs = require('fs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const s = createClient(SUPA_URL, SUPA_KEY);

(async () => {
  const wb = XLSX.read(fs.readFileSync('sheets/yuval_gotlib.xlsx'));
  const targetTab = 'Block #22 - GPP II (MAV II)';
  if (!wb.SheetNames.includes(targetTab)) { console.error('tab not found:', targetTab); process.exit(1); }
  const parsed = parseSingleSheet(wb.Sheets[targetTab], targetTab);
  console.log(`Parsed ${parsed.days.length} days, ${parsed.exercises.length} exercises, ${parsed.warmup.length} warmups from "${targetTab}".`);

  // Remap parsed-sheet eids (freshly-generated in the parser) onto library ids
  // by title. Append any titles not yet in the library.
  const { data: libStore } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const lib = [...(libStore?.value || [])];
  const titleToId = {};
  lib.forEach(e => { if (e.title) titleToId[e.title.toLowerCase()] = e.id; });

  const remap = {};
  let appended = 0;
  for (const ex of parsed.exercises) {
    const key = ex.title.toLowerCase();
    if (titleToId[key]) {
      remap[ex.id] = titleToId[key];
    } else {
      titleToId[key] = ex.id;
      lib.push(ex);
      appended++;
    }
  }
  console.log(`Appended ${appended} new exercises to library (was ${(libStore?.value || []).length}, now ${lib.length}).`);

  const remappedDays = parsed.days.map(d => ({
    ...d,
    ex: d.ex.map(e => ({ ...e, eid: remap[e.eid] || e.eid })),
  }));

  // Find target plan
  const { data: planRows } = await s.from('plans').select('id,name,trainee_id').eq('trainee_id','tr_yuval_gotlib').ilike('name','Block #22%');
  if (planRows.length !== 1) { console.error('Expected 1 plan, got', planRows.length, planRows); process.exit(1); }
  const planId = planRows[0].id;
  console.log(`Target plan: ${planId} "${planRows[0].name}"`);

  if (process.argv[2] !== '--apply') {
    console.log('\nDry run. Re-run with --apply to overwrite.');
    console.log('\nParsed day summary:');
    remappedDays.forEach((d, di) => console.log(`  Day ${di+1} "${d.name}" — ${d.ex.length} ex`));
    return;
  }

  // Write: library first (may append), then plan data
  if (appended > 0) {
    const { error: libErr } = await s.from('store').upsert({ key: 'expo-exercises', value: lib });
    if (libErr) { console.error('lib write error:', libErr); process.exit(1); }
  }

  const newData = { days: remappedDays, warmup: parsed.warmup || [] };
  const { error } = await s.from('plans').update({ data: newData, updated_at: new Date().toISOString() }).eq('id', planId);
  if (error) { console.error('plan write error:', error); process.exit(1); }

  console.log(`\nDone. Block #22 rebuilt: ${remappedDays.length} days, ${remappedDays.reduce((a,d)=>a+d.ex.length,0)} exercises, ${(parsed.warmup||[]).length} warmups.`);
})();
