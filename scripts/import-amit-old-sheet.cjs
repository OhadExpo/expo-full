// Append the OLD "מעקב עמית יהודאי (ישן)" sheet (Block #1–#12) to Amit's existing
// Supabase plans (which currently hold Block #13–#17 from the current sheet).
//
// Safety properties:
//  - Append-only. Does NOT delete or touch plans #13–#17.
//  - Authenticates as trainer (ohadyproductions@gmail.com / 1234) so RLS permits the writes.
//  - Uses the shared drive-import-core parser, then rewrites each plan's `name` to the
//    full A1 title when A1 starts with "Block #" (works around Excel's 31-char tab-name
//    truncation). For tabs where A1 is corrupted (#2='l', #6='fes'), falls back to the
//    tab name — per Ohad 2026-04-24, "leave as is" for both.
//  - Exercises: dedup by lowercase title against the current expo-exercises library;
//    appends only titles not already present.
//  - Portal visibility: sets vis[TRAINEE_NAME:<new plan name>] = false for all 12 imports
//    so the current Block #17 stays the only visible one on the client portal.
//
// Run `node scripts/import-amit-old-sheet.cjs` for a dry run.
// Run `node scripts/import-amit-old-sheet.cjs --apply` to write to Supabase.

const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const { parseSpreadsheet, uid } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TRAINER_EMAIL = 'ohadyproductions@gmail.com';
const TRAINER_PW = '1234';
const XLSX_PATH = 'C:/Users/Administrator/Downloads/מעקב עמית יהודאי (ישן).xlsx';
const TRAINEE_ID = 'tr_amit';
const TRAINEE_NAME = 'עמית יהודאי';

// Name cleanup: the xlsx parser uses sheetName as the plan name, but Excel truncates
// tab names at 31 chars. A1 usually has the full original title. Walk the workbook
// ourselves to recover A1-when-valid.
function buildNameMap() {
  const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { type: 'buffer' });
  const map = {};
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const a1 = ws['A1'] && String(ws['A1'].v || '').trim();
    const full = /^Block\s*#\d/i.test(a1 || '') ? a1 : sn;
    map[sn] = full;
  }
  return map;
}

(async () => {
  const apply = process.argv.includes('--apply');

  // Parse xlsx
  const bytes = fs.readFileSync(XLSX_PATH);
  const { plans, exercises } = parseSpreadsheet(new Uint8Array(bytes));
  const nameMap = buildNameMap();
  // Rewrite names: tab-name → full A1 title (when A1 is a Block # title)
  plans.forEach(p => { if (nameMap[p.name]) p.name = nameMap[p.name]; });

  console.log(`Parsed ${plans.length} blocks, ${exercises.length} unique exercise rows.\n`);
  console.log('Final plan names after A1 recovery:');
  plans.forEach(p => {
    const ec = p.days.reduce((a, d) => a + d.ex.length, 0);
    console.log(`  "${p.name}" — ${p.days.length} days, ${ec} ex, warmup=${p.warmup.length}`);
  });

  // Auth as trainer so RLS permits reads + writes
  const s = createClient(SUPA_URL, SUPA_KEY);
  const { error: sErr } = await s.auth.signInWithPassword({ email: TRAINER_EMAIL, password: TRAINER_PW });
  if (sErr) { console.error('signin failed:', sErr.message); process.exit(1); }

  // Verify no name collision with Amit's current plans
  const { data: existing, error: pErr } = await s.from('plans')
    .select('name').eq('trainee_id', TRAINEE_ID);
  if (pErr) { console.error('plans select error:', pErr); process.exit(1); }
  const existingNames = new Set(existing.map(p => p.name));
  const collisions = plans.filter(p => existingNames.has(p.name));
  if (collisions.length) {
    console.error(`\n⚠ Name collisions with existing Amit plans — aborting:`);
    collisions.forEach(p => console.error(`   "${p.name}"`));
    process.exit(1);
  }
  console.log(`\nExisting Amit plans: ${existing.length} (no name collisions with the 12 imports).`);

  // Merge into exercise library
  const { data: libStore } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = [...(libStore?.value || [])];
  const titleToId = {};
  lib.forEach(e => { if (e.title) titleToId[e.title.toLowerCase()] = e.id; });
  const remap = {};
  let appended = 0;
  for (const ex of exercises) {
    const key = (ex.title || '').toLowerCase();
    if (!key) continue;
    if (titleToId[key]) { remap[ex.id] = titleToId[key]; }
    else { const newId = 'ex_' + uid(); titleToId[key] = newId; remap[ex.id] = newId; lib.push({ ...ex, id: newId }); appended++; }
  }
  console.log(`Exercise library: ${(libStore?.value || []).length} existing → +${appended} new = ${lib.length}.`);

  // Rewrite plan exercise eids to point at library ids
  const remappedPlans = plans.map(p => ({
    ...p,
    days: p.days.map(d => ({ ...d, ex: d.ex.map(e => ({ ...e, eid: remap[e.eid] || e.eid })) })),
  }));

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write to Supabase.');
    return;
  }

  // Write library (if anything appended)
  if (appended > 0) {
    const { error: lErr } = await s.from('store').upsert({ key: 'expo-exercises', value: lib });
    if (lErr) { console.error('lib write error:', lErr); process.exit(1); }
    console.log(`Library updated: +${appended} new exercises.`);
  }

  // Insert the 12 new plans
  const now = new Date().toISOString();
  const payload = remappedPlans.map(p => ({
    id: 'plan_' + uid(),
    name: p.name,
    trainee_id: TRAINEE_ID,
    phase: p.phase || '',
    notes: p.notes || '',
    active: true,
    data: { days: p.days, warmup: p.warmup || [] },
    created_at: now,
    updated_at: now,
  }));
  const { data: inserted, error: iErr } = await s.from('plans').insert(payload).select('id,name');
  if (iErr) { console.error('insert error:', iErr); process.exit(1); }
  console.log(`\nInserted ${inserted.length} plans for ${TRAINEE_ID}.`);

  // Portal visibility: hide all 12 new plans so only the current Block #17 stays visible
  const { data: visStore } = await s.from('store').select('value').eq('key', 'expo-portal-vis').maybeSingle();
  const vis = { ...(visStore?.value || {}) };
  for (const p of remappedPlans) vis[`${TRAINEE_NAME}:${p.name}`] = false;
  const { error: vErr } = await s.from('store').upsert({ key: 'expo-portal-vis', value: vis });
  if (vErr) { console.error('vis write error:', vErr); process.exit(1); }
  console.log(`Portal visibility: hid all 12 new blocks (current Block #17 stays the only visible one).`);

  console.log('\nDone.');
})();
