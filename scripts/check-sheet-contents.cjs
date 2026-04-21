// Check if source xlsx files contain the blocks we need to backfill:
// - neta.xlsx / tom_ronen.xlsx — Block #7
// - yuval_gotlib.xlsx — Block #22
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = [
  'sheets/neta.xlsx',
  'sheets/tom_ronen.xlsx',
  'sheets/yuval_gotlib.xlsx',
];

for (const f of files) {
  const full = path.resolve(f);
  if (!fs.existsSync(full)) { console.log(`SKIP ${f} (not found)`); continue; }
  const wb = XLSX.read(fs.readFileSync(full));
  console.log(`\n${f} — tabs:`);
  wb.SheetNames.forEach(n => console.log(`  "${n}"`));
}
