// Split the Moshe+Dana couple: all 16 existing shared plans are Moshe's, so
// reassign them to tr_moshe_dana__0. Then parse Dana's personal sheet and
// insert her 6 blocks under tr_moshe_dana__1. Exercise library is deduped by
// title against the existing live library.
const { parseSpreadsheet, xlsxBytesFromDriveDownload, uid } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const DANA_DOWNLOAD = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/e042ab0c-8743-4aee-95d5-93d622eb73d3/tool-results/mcp-claude_ai_Google_Drive-download_file_content-1776798781697.txt';
const PARENT = 'tr_moshe_dana';
const MOSHE  = 'tr_moshe_dana__0';
const DANA   = 'tr_moshe_dana__1';

const headers = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

async function loadExercises() {
  const r = await fetch(`${SUPA_URL}/rest/v1/store?key=eq.expo-exercises&select=value`, { headers });
  const j = await r.json();
  return j[0]?.value || [];
}

async function saveExercises(list) {
  const r = await fetch(`${SUPA_URL}/rest/v1/store`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'expo-exercises', value: list }),
  });
  if (r.status >= 300) throw new Error(`save exercises: ${r.status} ${await r.text()}`);
}

async function reassignParentPlans() {
  const q = await fetch(`${SUPA_URL}/rest/v1/plans?trainee_id=eq.${PARENT}&select=id,name`, { headers });
  const rows = await q.json();
  if (rows.length === 0) { console.log('no plans on parent — already moved?'); return 0; }
  const r = await fetch(`${SUPA_URL}/rest/v1/plans?trainee_id=eq.${PARENT}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ trainee_id: MOSHE, updated_at: new Date().toISOString() }),
  });
  if (r.status >= 300) throw new Error(`reassign: ${r.status} ${await r.text()}`);
  const out = await r.json();
  return out.length;
}

async function insertPlans(plans, traineeId) {
  if (plans.length === 0) return [];
  const payload = plans.map(p => ({
    id: p.id,
    name: p.name,
    trainee_id: traineeId,
    phase: p.phase || '',
    notes: p.notes || '',
    active: true,
    data: { days: p.days, warmup: p.warmup || [] },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const r = await fetch(`${SUPA_URL}/rest/v1/plans`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (r.status >= 300) throw new Error(`insert: ${r.status} ${await r.text()}`);
  return await r.json();
}

(async () => {
  const apply = process.argv[2] === '--apply';

  // --- Step 1: preview / reassign parent → Moshe
  const q = await fetch(`${SUPA_URL}/rest/v1/plans?trainee_id=eq.${PARENT}&select=id,name`, { headers });
  const parentRows = await q.json();
  console.log(`parent (${PARENT}) currently has ${parentRows.length} plans:`);
  parentRows.forEach(p => console.log(`  ${p.name}  (${p.id})`));

  // --- Step 2: parse Dana's sheet
  console.log(`\nparsing Dana's sheet (${DANA_DOWNLOAD.split('/').pop()})...`);
  const bytes = xlsxBytesFromDriveDownload(DANA_DOWNLOAD);
  const { plans, exercises } = parseSpreadsheet(new Uint8Array(bytes));
  console.log(`parsed ${plans.length} blocks, ${exercises.length} distinct exercise titles`);
  plans.forEach(p => {
    const ex = p.days.reduce((a,d) => a + (d.ex?.length||0), 0);
    console.log(`  ${p.name.padEnd(20)} ${p.days.length}d ${ex}ex`);
  });

  // --- Step 3: dedup exercises against library, remap eids
  const library = await loadExercises();
  console.log(`\nloaded ${library.length} existing library exercises`);
  const titleToId = {};
  library.forEach(e => { if (e.title) titleToId[e.title.toLowerCase()] = e.id; });
  const remap = {};
  const freshLibrary = [...library];
  let newCount = 0;
  for (const ex of exercises) {
    const key = ex.title.toLowerCase();
    if (titleToId[key]) { remap[ex.id] = titleToId[key]; continue; }
    const newId = 'ex_' + uid();
    titleToId[key] = newId;
    remap[ex.id] = newId;
    freshLibrary.push({ ...ex, id: newId });
    newCount++;
  }
  console.log(`new exercises to add: ${newCount}`);

  const remapped = plans.map(p => ({
    ...p,
    days: p.days.map(d => ({ ...d, ex: d.ex.map(e => ({ ...e, eid: remap[e.eid] || e.eid })) })),
  }));

  // dedup by block name within sheet
  const nameSeen = new Map();
  remapped.forEach((p, i) => nameSeen.set(p.name, i));
  const uniquePlans = remapped.filter((p, i) => nameSeen.get(p.name) === i);
  if (uniquePlans.length !== remapped.length) console.log(`deduped ${remapped.length - uniquePlans.length} same-named blocks`);

  if (!apply) {
    console.log('\nDRY RUN. Re-run with --apply to:');
    console.log(`  1) reassign ${parentRows.length} parent plans → ${MOSHE}`);
    console.log(`  2) insert ${uniquePlans.length} Dana plans → ${DANA}`);
    console.log(`  3) add ${newCount} new exercises to library`);
    return;
  }

  console.log('\n=== APPLYING ===');
  const moved = await reassignParentPlans();
  console.log(`reassigned ${moved} plans to ${MOSHE}`);

  if (newCount > 0) {
    await saveExercises(freshLibrary);
    console.log(`library updated (+${newCount} new, ${freshLibrary.length} total)`);
  }

  const inserted = await insertPlans(uniquePlans, DANA);
  console.log(`inserted ${inserted.length} Dana plans under ${DANA}`);

  console.log('\n=== DONE ===');
})();
