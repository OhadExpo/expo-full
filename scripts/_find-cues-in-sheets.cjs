// Ohad: "find it in google drive/other programs". Search every exported sheet
// for the three exercises that have no cue anywhere in the database, and print
// the whole row so any note/tempo/cue cell next to the name is visible.
const XLSX = require('xlsx');
const fs = require('fs'), path = require('path');
const DIR = process.argv[2];
const WANT = ['Reverse Sitting Cable Over-Head Tricep Extension', 'ISO Sitting DB Shrug', 'DB SL Depth Drop'];
const norm = (x) => String(x == null ? '' : x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const targets = WANT.map(norm);

const hits = new Map(WANT.map((w) => [w, []]));
for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.xlsx'))) {
  let wb;
  try { wb = XLSX.readFile(path.join(DIR, f)); } catch { continue; }
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    rows.forEach((row, ri) => {
      row.forEach((cell) => {
        const n = norm(cell);
        const i = targets.indexOf(n);
        if (i < 0) return;
        const cells = row.map((c) => String(c).trim()).filter((c) => c !== '');
        hits.get(WANT[i]).push(`${f} :: ${sn} :: row ${ri + 1} :: ${cells.join(' | ')}`);
      });
    });
  }
}
for (const [w, list] of hits) {
  console.log(`\n=== ${w} — ${list.length} row(s) ===`);
  [...new Set(list)].slice(0, 6).forEach((l) => console.log('  ' + l));
}
