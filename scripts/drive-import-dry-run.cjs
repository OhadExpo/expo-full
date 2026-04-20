// Dry-run: for a Drive-downloaded xlsx JSON + trainee_id, parse and diff
// against current Supabase plans. Reports block-level add/skip.
// Usage: node scripts/drive-import-dry-run.cjs <json-file> <trainee_id> [nameLabel]

const { parseSpreadsheet, xlsxBytesFromDriveDownload } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

async function fetchExistingPlanNames(traineeId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/plans?trainee_id=eq.${traineeId}&select=id,name`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  return await r.json();
}

(async () => {
  const [jsonPath, traineeId, label] = process.argv.slice(2);
  if (!jsonPath || !traineeId) { console.error('usage: script <json-file> <trainee_id> [label]'); process.exit(1); }

  const bytes = xlsxBytesFromDriveDownload(jsonPath);
  const { plans, exercises } = parseSpreadsheet(new Uint8Array(bytes));

  const existing = await fetchExistingPlanNames(traineeId);
  const existingNames = new Set(existing.map(p => p.name));

  console.log(`=== ${label || traineeId} ===`);
  console.log(`Drive sheet parsed: ${plans.length} blocks, ${exercises.length} unique exercises\n`);
  console.log(`Current in app (${existing.length} plans):`);
  existing.forEach(p => console.log(`  ∙ ${p.name}  [${p.id}]`));
  console.log();

  const toImport = plans.filter(p => !existingNames.has(p.name));
  const wouldSkip = plans.filter(p => existingNames.has(p.name));

  console.log(`Would IMPORT (${toImport.length}):`);
  toImport.forEach(p => {
    const dayList = p.days.map(d => d.name).join(', ');
    console.log(`  + ${p.name}  (${p.days.length} days: ${dayList})`);
  });
  console.log(`\nWould SKIP - already in app (${wouldSkip.length}):`);
  wouldSkip.forEach(p => console.log(`  = ${p.name}`));

  // Also flag: plans in app with no matching Drive block (potential orphans)
  const driveNames = new Set(plans.map(p => p.name));
  const appOnly = existing.filter(p => !driveNames.has(p.name));
  if (appOnly.length) {
    console.log(`\nIn APP but not in DRIVE (${appOnly.length}):`);
    appOnly.forEach(p => console.log(`  ? ${p.name}  [${p.id}]`));
  }
})();
