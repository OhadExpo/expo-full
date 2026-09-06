// What is actually IN his availability sheet - row by row, note by note.
// Printed as structure, not as a dump: the point is to design against it.
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'audit-out/bhbc-sheet';
const parse = (csv) => {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (q) {
      if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
};

for (const f of (process.env.TABS || 'February,September').split(',')) {
  const p = path.join(DIR, f + '.csv');
  if (!fs.existsSync(p)) { console.log('missing ' + p); continue; }
  const rows = parse(fs.readFileSync(p, 'utf8'));
  const w = Math.max(...rows.map((r) => r.length));
  console.log('\n================ ' + f + '  ' + rows.length + ' rows x ' + w + ' cols ================');

  // The label column: whatever sits in column D (index 3) is the row's name.
  rows.forEach((r, i) => {
    const label = (r[3] || '').replace(/\s+/g, ' ').trim();
    const filled = r.filter((c) => (c || '').trim()).length;
    const sample = r.slice(4).filter((c) => (c || '').trim()).slice(0, 4).map((c) => c.replace(/\s+/g, ' ').trim().slice(0, 26));
    const left = (r[0] || '').replace(/\s+/g, ' ').trim().slice(0, 26);
    const name = (r[1] || '').replace(/\s+/g, ' ').trim().slice(0, 22);
    console.log(
      String(i).padStart(2) + ' | ' + left.padEnd(26) + ' | ' + name.padEnd(22) + ' | ' + label.slice(0, 24).padEnd(24)
      + ' | ' + String(filled).padStart(3) + ' filled | ' + sample.join(' ~ ')
    );
  });

  // Every note that was actually typed, so the note lanes are not guessed at.
  const notes = [];
  rows.forEach((r, i) => {
    r.forEach((c, j) => {
      const v = (c || '').trim();
      if (v.length > 6 && /[a-zA-Z֐-׿]/.test(v) && j > 3 && !/^(Basketball|Early|Late|Double|OFF|Warm|Q[1-4]|Low|Moderate|High|Very|Practice|Player|Min|Day)/i.test(v)) {
        notes.push(`r${i} c${j}: ${v.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    });
  });
  console.log('--- typed notes (' + notes.length + ') ---');
  for (const n of notes.slice(0, 24)) console.log('    ' + n);
}
