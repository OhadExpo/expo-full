const XLSX = require('xlsx');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', 'roei-sheet.xlsx');
const wb = XLSX.read(FILE, { type: 'file' });
console.log('Sheet names:', wb.SheetNames.length);

const HEADER_RE = /^\s*(warm[-\s]?up|morning routine|חימום|instructions?|notes?|neck exc|bb\s*-\s*barbell|everything else|bb exercises|week\s*\d|rest|day\s+|home routine|date:)/i;
const RX_RE = /^(.+?)\s*\(\s*([^()]+?)\s*\)\s*$/;

const getLink = (ws, r, c) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  const cell = ws[ref];
  return cell?.l?.Target || cell?.l?.target || '';
};

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find first day marker row: col A === '#' and col B non-empty
  let firstDayRow = rows.length;
  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][0]||'').trim() === '#' && String(rows[r][1]||'').trim()) { firstDayRow = r; break; }
  }

  const warmup = [];
  for (let r = 0; r < firstDayRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]||'').trim();
      if (!v) continue;
      if (HEADER_RE.test(v)) continue;
      const m = v.match(RX_RE);
      if (!m) continue;
      const t = m[1].trim();
      const rx = m[2].trim();
      if (!t || !rx) continue;
      // rx must contain a digit or SEC/REP/MIN
      if (!/\d|sec|rep|min/i.test(rx)) continue;
      // avoid rest-rule like "Rest: 2:00-3:30 MIN" — has ":" in title
      if (/[:]/.test(t)) continue;
      // avoid Week/Date labels
      if (/^(week\s|date\s|new\s+gym)/i.test(t)) continue;
      const vid = getLink(ws, r, c);
      warmup.push({ t, rx, vid, _row: r, _col: c });
    }
  }

  console.log('\n=== ' + name + ' (firstDayRow=' + firstDayRow + ', warmups=' + warmup.length + ') ===');
  warmup.forEach(w => console.log('  •', w.t, '—', w.rx, w.vid ? '[vid]' : '', `(r${w._row}c${w._col})`));
  if (warmup.length === 0 && firstDayRow > 0) {
    // dump the header rows so I can see what I missed
    console.log('  (no warmups detected — header rows dump:)');
    for (let r = 0; r < firstDayRow; r++) {
      console.log('    r' + r + ':', (rows[r]||[]).map((v,i) => `[${i}]${String(v||'').slice(0,35)}`).filter(s=>!s.endsWith(']')).join(' | '));
    }
  }
}
