// Deep-inspect col-B cells in the Block #4 sheet — Ohad says the cells
// carry notes (multi-line or rich text) that were lost when reading just
// .v. Dump every available field per cell: v, h, w, r (rich), c (comment).
const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '..', 'Nadav Blachar - Training Program.xlsx'), { cellStyles: true });
const ws = wb.Sheets['Block #4'];
const r = XLSX.utils.decode_range(ws['!ref']);

for (let row = r.s.r; row <= r.e.r; row++) {
  for (let col = r.s.c; col <= r.e.c; col++) {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = ws[addr];
    if (!cell) continue;
    const allKeys = Object.keys(cell);
    // Look for cells with multi-line values OR rich-text
    const v = cell.v;
    const w = cell.w; // formatted text
    const h = cell.h; // HTML
    const r_rich = cell.r; // rich text XML
    const c_comment = cell.c; // comments
    const isMulti = (typeof v === 'string' && v.includes('\n')) ||
                    (typeof w === 'string' && w.includes('\n')) ||
                    !!r_rich || !!c_comment;
    if (isMulti) {
      console.log(`[${addr}] keys=${allKeys.join(',')}`);
      console.log(`  v: ${JSON.stringify(v)}`);
      if (w !== undefined && w !== v) console.log(`  w: ${JSON.stringify(w)}`);
      if (h) console.log(`  h: ${h.slice(0, 300)}`);
      if (r_rich) console.log(`  r: ${typeof r_rich === 'string' ? r_rich.slice(0, 400) : JSON.stringify(r_rich).slice(0, 400)}`);
      if (c_comment) console.log(`  c: ${JSON.stringify(c_comment).slice(0, 400)}`);
    }
  }
}
