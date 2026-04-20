// Runs dry-run against every trainee with a downloaded Drive sheet.
const { parseSpreadsheet, xlsxBytesFromDriveDownload } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const DL_DIR = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/36257d02-e4fa-4503-95b1-a8ee1c334cbd/tool-results/';

const SHEETS = [
  { trainee: 'tr_ayelet',       label: 'Ayelet',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694533251.txt' },
  { trainee: 'tr_diego',        label: 'Diego',           file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694696050.txt' },
  { trainee: 'tr_amit',         label: 'Amit',            file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694829076.txt' },
  { trainee: 'tr_ron',          label: 'Ron',             file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694832116.txt' },
  { trainee: 'tr_roei',         label: 'Roei',            file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694836550.txt' },
  { trainee: 'tr_yuval',        label: 'Yuval Berko',     file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694843223.txt' },
  { trainee: 'tr_omer',         label: 'Omer',            file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694836825.txt' },
  { trainee: 'tr_tal',          label: 'Tal',             file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694843050.txt' },
  { trainee: 'tr_shalev',       label: 'Shalev',          file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694842737.txt' },
  { trainee: 'tr_ylc4i7edmnxqyj3j', label: 'Ohad',        file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694846479.txt' },
  { trainee: 'tr_moshe_dana',   label: 'Moshe+Dana',      file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694852389.txt' },
  { trainee: 'tr_neta_tom__1',  label: 'Tom',             file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694852401.txt' },
  { trainee: 'tr_miya_hilk__1', label: 'Hilik',           file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694853649.txt' },
  { trainee: 'tr_miya_hilk__0', label: 'Mia',             file: 'mcp-claude_ai_Google_Drive-download_file_content-1776694855544.txt' },
];

async function fetchExistingPlanNames(traineeId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/plans?trainee_id=eq.${traineeId}&select=id,name`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  return await r.json();
}

(async () => {
  let totalImport = 0, totalSkip = 0, totalAppOnly = 0;
  const summary = [];
  for (const s of SHEETS) {
    try {
      const bytes = xlsxBytesFromDriveDownload(DL_DIR + s.file);
      const { plans, exercises } = parseSpreadsheet(new Uint8Array(bytes));
      const existing = await fetchExistingPlanNames(s.trainee);
      const existingNames = new Set(existing.map(p => p.name));
      const toImport = plans.filter(p => !existingNames.has(p.name));
      const driveNames = new Set(plans.map(p => p.name));
      const appOnly = existing.filter(p => !driveNames.has(p.name));
      summary.push({ ...s, driveCount: plans.length, exCount: exercises.length, importCount: toImport.length, skipCount: plans.length - toImport.length, appOnly: appOnly.length, toImportNames: toImport.map(p => p.name), appOnlyNames: appOnly.map(p => p.name) });
      totalImport += toImport.length;
      totalSkip += (plans.length - toImport.length);
      totalAppOnly += appOnly.length;
    } catch (e) {
      summary.push({ ...s, error: e.message });
    }
  }

  console.log('=== DRY-RUN SUMMARY ===\n');
  console.log('TRAINEE'.padEnd(16) + 'DRIVE  IMPORT  SKIP  APP-ONLY');
  summary.forEach(s => {
    if (s.error) { console.log(`${s.label.padEnd(16)} ERROR: ${s.error}`); return; }
    console.log(`${s.label.padEnd(16)}${String(s.driveCount).padStart(5)}${String(s.importCount).padStart(8)}${String(s.skipCount).padStart(6)}${String(s.appOnly).padStart(10)}`);
  });
  console.log('\nTOTALS — import: ' + totalImport + ', skip: ' + totalSkip + ', app-only (unmatched): ' + totalAppOnly);

  console.log('\n=== DETAILS PER TRAINEE ===');
  summary.forEach(s => {
    if (s.error) return;
    console.log(`\n${s.label} (${s.trainee})`);
    if (s.toImportNames.length) console.log('  + ' + s.toImportNames.join('\n  + '));
    if (s.appOnlyNames.length) console.log('  ? app-only: ' + s.appOnlyNames.join(', '));
  });
})();
