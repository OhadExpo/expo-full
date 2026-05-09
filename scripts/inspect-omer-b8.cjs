// Dump every sheet of "omer Block #8.xlsx" so we can transcribe the block.
const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '..', 'omer Block #8.xlsx'), { cellDates: true });
console.log('sheets:', wb.SheetNames);
for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  const ref = ws['!ref'];
  console.log(`\n=== ${sn} (${ref}) ===`);
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  aoa.forEach((row, i) => {
    const cells = row.map(c => (c === '' ? '' : String(c)));
    if (cells.some(c => c !== '')) console.log(String(i).padStart(3, ' '), '|', cells.join(' | '));
  });
}
