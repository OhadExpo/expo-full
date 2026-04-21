// Full re-import of Ayelet with the column-autodetect parser fix. Old imports
// read the week-1 log as sets and week-2 log as reps because the parser had
// hardcoded column positions 4/5/6 that only match Tom-style sheets, not
// Ayelet-style (#|name|Sets|Reps|Tempo|...).
// Also uses wb.SheetNames as block names (overriding cell-A0) to avoid the
// same-named-tab and `(` / `[` junk-name issues.
const XLSX = require('xlsx');
const { parseSingleSheet, xlsxBytesFromDriveDownload, uid } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const DL = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/36257d02-e4fa-4503-95b1-a8ee1c334cbd/tool-results/';
const AYELET_FILE = 'mcp-claude_ai_Google_Drive-download_file_content-1776694533251.txt';
const TRAINEE = 'tr_ayelet';
const headers = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

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
  const bytes = xlsxBytesFromDriveDownload(DL + AYELET_FILE);
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' });

  const plans = [];
  const allExercises = [];
  const exTitleMap = {};
  for (const tabName of wb.SheetNames) {
    const ws = wb.Sheets[tabName];
    const parsed = parseSingleSheet(ws, tabName);
    if (!parsed.days.length) continue;
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
    plans.push({ id: 'plan_' + uid(), name: tabName, phase: '', warmup: parsed.warmup, days: remappedDays });
  }

  console.log(`parsed ${plans.length} blocks from sheet:`);
  plans.forEach(p => {
    const ex = p.days.reduce((a,d) => a + d.ex.length, 0);
    console.log(`  ${p.name.padEnd(30)} ${p.days.length}d ${ex}ex`);
  });

  // dedup against library
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
  const finalPlans = plans.map(p => ({
    ...p,
    days: p.days.map(d => ({ ...d, ex: d.ex.map(e => ({ ...e, eid: remap[e.eid] || e.eid })) })),
  }));

  if (!apply) {
    console.log(`\n(dry) would DELETE all ${TRAINEE} plans, add ${newCount} library exercises, INSERT ${finalPlans.length} plans`);
    return;
  }

  // preserve portalVis keys (they're keyed by trainee name + block name, so tab-name alignment stays)
  const r1 = await fetch(`${SUPA_URL}/rest/v1/plans?trainee_id=eq.${TRAINEE}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' }});
  const deleted = await r1.json();
  console.log(`deleted ${deleted.length} existing Ayelet plans`);

  if (newCount > 0) { await saveLibrary(freshLibrary); console.log(`library: +${newCount} new, ${freshLibrary.length} total`); }

  const payload = finalPlans.map(p => ({
    id: p.id, name: p.name, trainee_id: TRAINEE,
    phase: '', notes: '', active: true,
    data: { days: p.days, warmup: p.warmup || [] },
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }));
  const r2 = await fetch(`${SUPA_URL}/rest/v1/plans`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(payload)});
  if (r2.status >= 300) throw new Error(`insert: ${r2.status} ${await r2.text()}`);
  const ins = await r2.json();
  console.log(`inserted ${ins.length} fresh plans`);
})();
