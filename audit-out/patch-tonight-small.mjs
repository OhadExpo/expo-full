import fs from 'node:fs';
const f = 'scripts/build-tonight.mjs';
let s = fs.readFileSync(f, 'utf8');
const rep = (from, to) => { if (s.split(from).length - 1 !== 1) throw new Error('match count != 1: ' + from.slice(0, 60)); s = s.split(from).join(to); };
rep(`...readPairs('audit-out/pairs/pairs-rt.json')];`, `...readPairs('audit-out/pairs/pairs-rt.json'), ...readPairs('audit-out/pairs/pairs-small.json')];`);
rep(`  'billing-he': ['Billing, in Hebrew',`, `  'dashboard-he': ['The dashboard, in Hebrew', 'Headers, status words, the format and package columns, the All Athletes control and the auto-task bodies: 177 Latin words became 39, and the 39 are athlete and program names.'],
  'sessions-he': ['The gym floor, in Hebrew', 'ON THE FLOOR, CHECKED IN, ADD, FINISH, the check-in button and the done counter: 43 Latin words became 30, and the 30 are exercise names.'],
  'bugs-he': ['Bug reports, in Hebrew', 'The header, the status pills, the refresh button and the empty state: 10 Latin words became 2.'],
  'smart-import-he': ['Smart import, in Hebrew', 'The header, the drop zone, the file buttons and the FILE label: 39 Latin words became 11, and the 11 are file formats.'],
  'calendar-he': ['The calendar, in Hebrew', '43 Latin words became 10.'],
  'intake-he': ['Intake, in Hebrew', 'The counts line, the form-type badges and the unused-links section: 17 Latin words became 8.'],
  'billing-he': ['Billing, in Hebrew',`);
fs.writeFileSync(f, s);
console.log('build-tonight patched');
