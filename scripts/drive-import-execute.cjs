// Full redo: for each trainee with a Drive sheet, DELETE all existing plans
// then INSERT fresh ones parsed from the Drive xlsx. Exercises are deduped
// against the live expo-exercises library by title (new ones appended).
const { parseSpreadsheet, xlsxBytesFromDriveDownload, uid } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const DL_DIR = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/36257d02-e4fa-4503-95b1-a8ee1c334cbd/tool-results/';

const SHEETS = [
  { trainee: 'tr_ayelet',          label: 'Ayelet',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694533251.txt' },
  { trainee: 'tr_diego',           label: 'Diego',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694696050.txt' },
  { trainee: 'tr_amit',            label: 'Amit',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694829076.txt' },
  { trainee: 'tr_ron',             label: 'Ron',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694832116.txt' },
  { trainee: 'tr_roei',            label: 'Roei',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694836550.txt' },
  { trainee: 'tr_yuval',           label: 'Yuval B.',   file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694843223.txt' },
  { trainee: 'tr_omer',            label: 'Omer',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694836825.txt' },
  { trainee: 'tr_tal',             label: 'Tal',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694843050.txt' },
  { trainee: 'tr_shalev',          label: 'Shalev',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694842737.txt' },
  { trainee: 'tr_ylc4i7edmnxqyj3j',label: 'Ohad',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694846479.txt' },
  { trainee: 'tr_moshe_dana__0',   label: 'Moshe',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694852389.txt' },
  { trainee: 'tr_moshe_dana__1',   label: 'Dana',       file: 'dana-1776798781697.txt' },
  { trainee: 'tr_neta_tom__1',     label: 'Tom',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694852401.txt' },
  { trainee: 'tr_miya_hilk__1',    label: 'Hilik',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694853649.txt' },
  { trainee: 'tr_miya_hilk__0',    label: 'Mia',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694855544.txt' },
];

const headers = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

async function getExistingExercises() {
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

async function deleteTraineePlans(traineeId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/plans?trainee_id=eq.${traineeId}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=representation' },
  });
  if (r.status >= 300) throw new Error(`delete ${traineeId}: ${r.status} ${await r.text()}`);
  return await r.json();
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
  if (r.status >= 300) throw new Error(`insert plans: ${r.status} ${await r.text()}`);
  return await r.json();
}

(async () => {
  console.log('Loading existing exercises library...');
  const libraryEx = await getExistingExercises();
  console.log(`  ${libraryEx.length} existing exercises\n`);
  const titleToId = {};
  libraryEx.forEach(e => { if (e.title) titleToId[e.title.toLowerCase()] = e.id; });

  const totals = { deleted: 0, inserted: 0, newExercises: 0, errors: [] };
  const freshLibrary = [...libraryEx];

  for (const s of SHEETS) {
    try {
      console.log(`--- ${s.label} (${s.trainee}) ---`);
      const bytes = xlsxBytesFromDriveDownload(DL_DIR + s.file);
      const { plans, exercises } = parseSpreadsheet(new Uint8Array(bytes));
      console.log(`  parsed ${plans.length} blocks, ${exercises.length} exercise entries`);

      // Dedup exercise library: for each Drive ex, if title exists in library -> reuse id.
      // Otherwise generate new id and append. Build local remap: driveEid -> finalEid.
      const remap = {};
      for (const ex of exercises) {
        const key = ex.title.toLowerCase();
        if (titleToId[key]) {
          remap[ex.id] = titleToId[key];
        } else {
          const newId = 'ex_' + uid();
          titleToId[key] = newId;
          remap[ex.id] = newId;
          freshLibrary.push({ ...ex, id: newId });
          totals.newExercises++;
        }
      }
      // Apply remap to each plan's day exercises
      const planData = plans.map(p => ({
        ...p,
        days: p.days.map(d => ({
          ...d,
          ex: d.ex.map(e => ({ ...e, eid: remap[e.eid] || e.eid })),
        })),
      }));

      // Dedup block names within trainee: if two blocks share exact name, keep the last (rightmost tab)
      const nameSeen = new Map();
      planData.forEach((p, i) => nameSeen.set(p.name, i));
      const uniquePlans = planData.filter((p, i) => nameSeen.get(p.name) === i);
      if (uniquePlans.length !== planData.length) {
        console.log(`  deduped ${planData.length - uniquePlans.length} same-named blocks`);
      }

      const deleted = await deleteTraineePlans(s.trainee);
      console.log(`  deleted ${deleted.length} existing plans`);
      totals.deleted += deleted.length;

      const inserted = await insertPlans(uniquePlans, s.trainee);
      console.log(`  inserted ${inserted.length} fresh plans`);
      totals.inserted += inserted.length;
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      totals.errors.push({ trainee: s.label, error: e.message });
    }
  }

  if (totals.newExercises > 0) {
    console.log(`\nUpdating exercise library (+${totals.newExercises} new exercises, ${freshLibrary.length} total)...`);
    await saveExercises(freshLibrary);
    console.log('  library saved.');
  }

  console.log('\n=== DONE ===');
  console.log(`deleted: ${totals.deleted}, inserted: ${totals.inserted}, new exercises: ${totals.newExercises}, errors: ${totals.errors.length}`);
  if (totals.errors.length) { console.log('errors:'); totals.errors.forEach(e => console.log('  ' + e.trainee + ': ' + e.error)); }
})();
