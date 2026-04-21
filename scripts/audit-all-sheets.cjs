// For each trainee with a cached Drive download, parse the xlsx, list every
// block the sheet contains, and diff against what's in Supabase plans. Flags:
//  - sheet blocks missing from DB (never imported)
//  - DB blocks missing from sheet (stale / wrong client)
//  - name mismatches (same block number, different label)
const XLSX = require('xlsx');
const { xlsxBytesFromDriveDownload } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const DL = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/36257d02-e4fa-4503-95b1-a8ee1c334cbd/tool-results/';

const SHEETS = [
  { trainee: 'tr_ayelet',           label: 'Ayelet',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694533251.txt' },
  { trainee: 'tr_diego',            label: 'Diego',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694696050.txt' },
  { trainee: 'tr_amit',             label: 'Amit',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694829076.txt' },
  { trainee: 'tr_ron',              label: 'Ron',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694832116.txt' },
  { trainee: 'tr_roei',             label: 'Roei',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694836550.txt' },
  { trainee: 'tr_yuval',            label: 'Yuval B.',   file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694843223.txt' },
  { trainee: 'tr_omer',             label: 'Omer',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694836825.txt' },
  { trainee: 'tr_tal',              label: 'Tal',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694843050.txt' },
  { trainee: 'tr_shalev',           label: 'Shalev',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694842737.txt' },
  { trainee: 'tr_ylc4i7edmnxqyj3j', label: 'Ohad',       file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694846479.txt' },
  { trainee: 'tr_moshe_dana__0',    label: 'Moshe',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694852389.txt' },
  { trainee: 'tr_neta_tom__1',      label: 'Tom',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694852401.txt' },
  { trainee: 'tr_miya_hilk__1',     label: 'Hilik',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694853649.txt' },
  { trainee: 'tr_miya_hilk__0',     label: 'Mia',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694855544.txt' },
];

const headers = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

const normalize = (s) => (s || '').toLowerCase().replace(/[#\s\-:]+/g, '').replace(/[^\w֐-׿]/g, '');

(async () => {
  // load all plans
  const r = await fetch(`${SUPA_URL}/rest/v1/plans?select=id,name,trainee_id`, { headers });
  const plans = await r.json();
  const byTid = {};
  for (const p of plans) (byTid[p.trainee_id] = byTid[p.trainee_id] || []).push(p);

  for (const s of SHEETS) {
    console.log(`\n=== ${s.label} (${s.trainee}) ===`);
    let wb;
    try {
      const bytes = xlsxBytesFromDriveDownload(DL + s.file);
      wb = XLSX.read(new Uint8Array(bytes), { type: 'array' });
    } catch (e) {
      console.log(`  ERROR reading xlsx: ${e.message}`);
      continue;
    }
    const sheetTabs = wb.SheetNames.filter(n => {
      // skip empty / non-block tabs
      const ws = wb.Sheets[n];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      return rows.some(r => String(r[0] || '').trim() === '#' && String(r[1] || '').trim());
    });
    const dbPlans = byTid[s.trainee] || [];
    const sheetNorm = sheetTabs.map(t => ({ raw: t, key: normalize(t) }));
    const dbNorm    = dbPlans.map(p =>  ({ raw: p.name, id: p.id, key: normalize(p.name) }));

    console.log(`  sheet tabs: ${sheetTabs.length}   db plans: ${dbPlans.length}`);

    // tabs with no matching DB plan
    const missingInDb = sheetNorm.filter(t => !dbNorm.some(d => d.key === t.key || d.key.includes(t.key) || t.key.includes(d.key)));
    const missingInSheet = dbNorm.filter(d => !sheetNorm.some(t => t.key === d.key || t.key.includes(d.key) || d.key.includes(t.key)));

    if (missingInDb.length) { console.log(`  MISSING FROM DB (${missingInDb.length}):`); missingInDb.forEach(t => console.log(`    - ${t.raw}`)); }
    if (missingInSheet.length) { console.log(`  EXTRA IN DB (${missingInSheet.length}):`); missingInSheet.forEach(d => console.log(`    - ${d.raw}  (${d.id})`)); }
    if (!missingInDb.length && !missingInSheet.length) console.log('  ✓ matched');
  }
})();
