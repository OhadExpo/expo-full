// Read the base64-encoded xlsx download saved by the MCP, parse hyperlinks
// from every cell, and emit a JSON map of { exerciseTitle: videoUrl } for
// later use against Yuval's plan.
//
// Usage: node scripts/extract-meakav-hyperlinks.cjs <savedTxtPath> <outJsonPath>
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error('usage: node extract-meakav-hyperlinks.cjs <in.txt> <out.json>');
  process.exit(2);
}

const raw = fs.readFileSync(inPath, 'utf8');
// MCP file is JSON with schema {content, id, mimeType, title}.
const meta = JSON.parse(raw);
const xlsxBuf = Buffer.from(meta.content, 'base64');
const tmpXlsx = path.join(path.dirname(outPath), `_${path.basename(outPath, '.json')}.xlsx`);
fs.writeFileSync(tmpXlsx, xlsxBuf);

const wb = XLSX.readFile(tmpXlsx, { cellHTML: false, cellFormula: false });
const map = {};
for (const sheetName of wb.SheetNames) {
  const sh = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sh['!ref'] || 'A1:A1');
  // For each row, find the column that holds the exercise title (any cell
  // with text), then look at the rest of the row for cells with hyperlinks.
  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowCells = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sh[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      rowCells.push({ c, v: String(cell.v || '').trim(), link: cell.l && cell.l.Target });
    }
    if (!rowCells.length) continue;
    // Find a hyperlink in the row.
    const linked = rowCells.find(x => x.link && /^https?:\/\//i.test(x.link));
    if (!linked) continue;
    // Title = the longest non-empty text cell that's not just a number/short tag.
    const titleCell = rowCells
      .filter(x => x.v && !/^\d+$/.test(x.v) && x.v.length >= 4)
      .sort((a, b) => b.v.length - a.v.length)[0];
    if (!titleCell) continue;
    const t = titleCell.v;
    // Prefer first encountered link per title; don't overwrite.
    if (!map[t]) map[t] = linked.link;
  }
}

fs.writeFileSync(outPath, JSON.stringify({ source: meta.title, count: Object.keys(map).length, map }, null, 2));
fs.unlinkSync(tmpXlsx);
console.log(`${meta.title}: ${Object.keys(map).length} title→url mappings → ${outPath}`);
