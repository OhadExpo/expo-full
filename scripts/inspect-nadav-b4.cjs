// Dump every sheet of "Nadav Blachar - Training Program.xlsx" with cell-level
// hyperlinks (column D usually carries the canonical YouTube URL per
// exercise — sheet_to_json hides those, parse cell.l.Target).
const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '..', 'Nadav Blachar - Training Program.xlsx'), { cellDates: true });
console.log('sheets:', wb.SheetNames);
for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  if (!ws['!ref']) continue;
  console.log(`\n=== ${sn} (${ws['!ref']}) ===`);
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  aoa.forEach((row, i) => {
    const cells = row.map(c => (c === '' ? '' : String(c)));
    if (cells.some(c => c !== '')) console.log(String(i).padStart(3, ' '), '|', cells.join(' | '));
  });
  console.log('  -- hyperlinks --');
  const r = XLSX.utils.decode_range(ws['!ref']);
  for (let row = r.s.r; row <= r.e.r; row++) {
    for (let col = r.s.c; col <= r.e.c; col++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell?.l?.Target) {
        const v = String(cell.v ?? '').trim();
        console.log(`  [r${row + 1} ${XLSX.utils.encode_col(col)}] "${v}" → ${cell.l.Target}`);
      }
    }
  }
}
