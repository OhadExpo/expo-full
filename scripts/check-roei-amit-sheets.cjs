const XLSX = require('xlsx');
const fs = require('fs');
for (const f of ['roei.xlsx','sheets/roei.xlsx']) {
  if (!fs.existsSync(f)) continue;
  const wb = XLSX.read(fs.readFileSync(f));
  console.log(`${f} tabs:`);
  wb.SheetNames.forEach(n => console.log(`  "${n}"`));
}
