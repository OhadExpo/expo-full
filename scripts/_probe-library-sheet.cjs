const XLSX = require('xlsx');
const wb = XLSX.readFile(process.argv[2]);
console.log('sheets:', wb.SheetNames.join(' | '));
const sh = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
console.log('header:', rows[0].map((c, i) => i + ':' + String(c).slice(0, 22)).join('  '));
const WANT = ['reverse sitting cable', 'iso sitting db shrug', 'db sl depth drop', 'sitting db shrug', 'depth drop'];
const norm = (x) => String(x || '').toLowerCase();
let found = 0;
rows.forEach((r, i) => {
  const line = r.map(norm).join(' ');
  if (WANT.some((w) => line.includes(w))) {
    found++;
    if (found <= 8) console.log(`row ${i + 1}: ` + r.map((c, j) => c === '' ? '' : `[${j}] ${String(c).slice(0, 60)}`).filter(Boolean).join('  '));
  }
});
console.log('matching rows:', found, 'of', rows.length);
