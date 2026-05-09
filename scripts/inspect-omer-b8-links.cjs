// Look for cell-level hyperlinks in "omer Block #8.xlsx" — many of Ohad's
// xlsx files attach the canonical YouTube/Drive URL via a cell hyperlink
// (which sheet_to_json doesn't surface).
const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '..', 'omer Block #8.xlsx'), { cellDates: true });
for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  if (!ws['!ref']) continue;
  const r = XLSX.utils.decode_range(ws['!ref']);
  console.log(`\n=== ${sn} (${ws['!ref']}) ===`);
  for (let row = r.s.r; row <= r.e.r; row++) {
    for (let col = r.s.c; col <= r.e.c; col++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell?.l?.Target) {
        const v = String(cell.v ?? '').trim();
        console.log(`  [row ${row + 1}, col ${XLSX.utils.encode_col(col)}] ${v}  →  ${cell.l.Target}`);
      }
    }
  }
}
