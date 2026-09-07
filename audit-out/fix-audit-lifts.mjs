// The audit's lift-total expectation moved from 72 to 76 with the four lifts of 2026-09-07.
import fs from 'node:fs';
const f = 'scripts/audit-handoff.mjs';
let s = fs.readFileSync(f, 'utf8');
const bad = String.raw`['lift sessions', /\b72\b/],`;
const good = String.raw`['lift sessions', /\b76\b/],`;
const n = s.split(bad).length - 1;
if (n !== 1) { console.log('pattern count: ' + n + ' (already: ' + s.includes(good) + ')'); process.exit(n === 0 && s.includes(good) ? 0 : 1); }
fs.writeFileSync(f, s.split(bad).join(good));
console.log('audit expects 76 lift sessions in the document');
