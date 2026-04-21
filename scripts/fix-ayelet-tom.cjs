// Ayelet fix (revised after parser-bug discovery):
//  - Two DB rows labelled "(" and "[" are actually Block #5 and Block #7,
//    just parsed with cell-A0 instead of tab name → rename.
//  - Three tabs (#18, #17, #15) duplicated Block #16's A0 header in the
//    source sheet → parser emitted them all as "Block #16" → we walk tabs
//    by name, find the 3 missing from DB, import with correct names.
//  - Block #2 naming: sheet tab is "Block #2 - VOL I", DB is "Block #2 - High VOL".
//    Rename DB row to match sheet.
// Tom fix: DB "IDF" exercise eids resolve to the Thailand tab's 15 banded
// travel exercises. Rename "IDF" → "Thailand".
const XLSX = require('xlsx');
const { parseSingleSheet, xlsxBytesFromDriveDownload, uid } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const DL = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/36257d02-e4fa-4503-95b1-a8ee1c334cbd/tool-results/';
const AYELET_FILE = 'mcp-claude_ai_Google_Drive-download_file_content-1776694533251.txt';

const headers = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

const TOM_IDF_ID = 'plan_b3jvzutt1qemo7afq2h';
const AYELET_RENAMES = [
  { id: 'plan_8y5z4zqzn6mo7afccy', old: '(', next: 'Block #5 - 2RM' },
  { id: 'plan_3lidv2frhogmo7afcct', old: '[', next: 'Block #7 - GPP III' },
  { id: 'plan_g2xewvu1j8fmo7afcd6', old: 'Block #2 - High VOL', next: 'Block #2 - VOL I' },
];
const MISSING_TABS = ['Block #15', 'Block #17', 'Block #18'];

async function loadLibrary() {
  const r = await fetch(`${SUPA_URL}/rest/v1/store?key=eq.expo-exercises&select=value`, { headers });
  const j = await r.json();
  return j[0]?.value || [];
}
async function saveLibrary(list) {
  const r = await fetch(`${SUPA_URL}/rest/v1/store`, {
    method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'expo-exercises', value: list }),
  });
  if (r.status >= 300) throw new Error(`save lib: ${r.status} ${await r.text()}`);
}

(async () => {
  const apply = process.argv[2] === '--apply';

  // --- TOM rename
  console.log('=== Tom: rename IDF → Thailand ===');
  if (apply) {
    const r = await fetch(`${SUPA_URL}/rest/v1/plans?id=eq.${TOM_IDF_ID}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ name: 'Thailand', updated_at: new Date().toISOString() }),
    });
    const out = await r.json();
    console.log('  renamed:', out[0]?.name);
  } else {
    console.log('  (dry) PATCH', TOM_IDF_ID, '→ Thailand');
  }

  // --- AYELET renames
  console.log('\n=== Ayelet: rename misparsed blocks ===');
  for (const r of AYELET_RENAMES) {
    if (apply) {
      const res = await fetch(`${SUPA_URL}/rest/v1/plans?id=eq.${r.id}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ name: r.next, updated_at: new Date().toISOString() }),
      });
      const o = await res.json();
      console.log(`  "${r.old}" → "${o[0]?.name}"`);
    } else {
      console.log(`  (dry) "${r.old}" → "${r.next}"`);
    }
  }

  // --- AYELET import missing tabs by walking wb.SheetNames
  console.log('\n=== Ayelet: import missing blocks (by tab name) ===');
  const bytes = xlsxBytesFromDriveDownload(DL + AYELET_FILE);
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  const newPlans = [];
  const allExercises = [];
  const exTitleMap = {};
  for (const tabName of wb.SheetNames) {
    if (!MISSING_TABS.includes(tabName)) continue;
    const parsed = parseSingleSheet(wb.Sheets[tabName], tabName);
    if (!parsed.days.length) { console.log(`  skip empty tab: ${tabName}`); continue; }
    // dedup exercise titles within this import
    for (const ex of parsed.exercises) {
      if (!exTitleMap[ex.title]) { exTitleMap[ex.title] = ex.id; allExercises.push(ex); }
    }
    const remappedDays = parsed.days.map(d => ({
      ...d,
      ex: d.ex.map(e => {
        const orig = parsed.exercises.find(x => x.id === e.eid);
        return { ...e, eid: orig ? exTitleMap[orig.title] : e.eid };
      }),
    }));
    newPlans.push({ id: 'plan_' + uid(), name: tabName, phase: '', warmup: parsed.warmup, days: remappedDays });
    const exCount = remappedDays.reduce((a,d) => a + d.ex.length, 0);
    console.log(`  ${tabName}: ${remappedDays.length}d ${exCount}ex`);
  }

  // Dedup against library
  const library = await loadLibrary();
  const titleToId = {};
  library.forEach(e => { if (e.title) titleToId[e.title.toLowerCase()] = e.id; });
  const remap = {};
  const freshLibrary = [...library];
  let newCount = 0;
  for (const ex of allExercises) {
    const key = ex.title.toLowerCase();
    if (titleToId[key]) { remap[ex.id] = titleToId[key]; continue; }
    const newId = 'ex_' + uid();
    titleToId[key] = newId;
    remap[ex.id] = newId;
    freshLibrary.push({ ...ex, id: newId });
    newCount++;
  }
  const finalPlans = newPlans.map(p => ({
    ...p,
    days: p.days.map(d => ({ ...d, ex: d.ex.map(e => ({ ...e, eid: remap[e.eid] || e.eid })) })),
  }));

  if (!apply) {
    console.log(`\n(dry) would add ${newCount} library exercises and insert ${finalPlans.length} Ayelet plans`);
    return;
  }

  if (newCount > 0) {
    await saveLibrary(freshLibrary);
    console.log(`  library: +${newCount} new, ${freshLibrary.length} total`);
  }
  const payload = finalPlans.map(p => ({
    id: p.id, name: p.name, trainee_id: 'tr_ayelet',
    phase: p.phase || '', notes: p.notes || '', active: true,
    data: { days: p.days, warmup: p.warmup || [] },
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }));
  const r = await fetch(`${SUPA_URL}/rest/v1/plans`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (r.status >= 300) throw new Error(`insert: ${r.status} ${await r.text()}`);
  const ins = await r.json();
  console.log(`  inserted ${ins.length} plans`);

  console.log('\n=== DONE ===');
})();
