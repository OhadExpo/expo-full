// The canonical library sheet carries a "Coaching Notes" column. Look for the
// three exercises across all six GEM sheets, exact first, then near-miss.
const XLSX = require('xlsx');
const wb = XLSX.readFile(process.argv[2]);
const WANT = ['Reverse Sitting Cable Over-Head Tricep Extension', 'ISO Sitting DB Shrug', 'DB SL Depth Drop'];
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const targets = WANT.map(norm);
const words = (s) => new Set(norm(s).split(' ').filter(Boolean));
const overlap = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(A.size, B.size); };

const all = [];
for (const sn of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
  const hdr = rows[0].map((c) => String(c).trim());
  const noteCol = hdr.findIndex((h) => /coaching note/i.test(h));
  rows.slice(1).forEach((r) => {
    const name = String(r[0] || '').trim();
    if (name) all.push({ sheet: sn, name, note: noteCol >= 0 ? String(r[noteCol] || '').trim() : '' });
  });
}
console.log('library rows with a name:', all.length, '| with a coaching note:', all.filter((r) => r.note).length);
for (let i = 0; i < WANT.length; i++) {
  const exact = all.find((r) => norm(r.name) === targets[i]);
  console.log(`\n=== ${WANT[i]} ===`);
  if (exact) { console.log(`  EXACT in ${exact.sheet}: note = ${exact.note ? JSON.stringify(exact.note) : 'EMPTY'}`); continue; }
  const near = all.map((r) => ({ ...r, s: overlap(r.name, WANT[i]) })).sort((a, b) => b.s - a.s).slice(0, 3);
  console.log('  no exact match. closest:');
  near.forEach((n) => console.log(`   ${(n.s * 100).toFixed(0)}%  ${n.name}  [${n.sheet}]  note: ${n.note ? JSON.stringify(n.note.slice(0, 90)) : 'EMPTY'}`));
}
