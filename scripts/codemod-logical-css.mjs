// Physical → logical inline styles across the coach app, so the Hebrew (RTL)
// layout is the exact mirror of the English one instead of "mostly".
//
// Ohad 2026-09-11: "the heb top menu is not ocd" — the top bar was 12px off
// its mirror because of marginRight/marginLeft. probe-rtl-mirror.mjs then
// found the same class of fault on every route (a tasks row 322px off, a
// billing column 49px, an intake row 752px). In LTR these properties render
// identically, so the change is invisible in English and measurable in Hebrew.
//
//   node scripts/codemod-logical-css.mjs --dry   (counts per file)
//   node scripts/codemod-logical-css.mjs         (rewrite)
import fs from 'node:fs';
import path from 'node:path';
const DRY = process.argv.includes('--dry');
// Held at production by his order (athlete portal) or deliberately LTR.
const SKIP = new Set(['ClientPortal.jsx', 'MealLogger.jsx', 'DemoTraineePortal.jsx', 'TrySandbox.jsx']);
const RULES = [
  [/\bmarginLeft\b/g, 'marginInlineStart'],
  [/\bmarginRight\b/g, 'marginInlineEnd'],
  [/\bpaddingLeft\b/g, 'paddingInlineStart'],
  [/\bpaddingRight\b/g, 'paddingInlineEnd'],
  [/\bborderLeft(?=[A-Z\b]|\b)/g, 'borderInlineStart'],
  [/\bborderRight(?=[A-Z\b]|\b)/g, 'borderInlineEnd'],
  [/\btextAlign:\s*'left'/g, "textAlign: 'start'"],
  [/\btextAlign:\s*"left"/g, 'textAlign: "start"'],
  [/\btextAlign:\s*'right'/g, "textAlign: 'end'"],
  [/\btextAlign:\s*"right"/g, 'textAlign: "end"'],
];
const files = fs.readdirSync('src').filter((f) => f.endsWith('.jsx') && !SKIP.has(f));
let total = 0;
const perFile = [];
for (const f of files) {
  const p = path.join('src', f);
  const before = fs.readFileSync(p, 'utf8');
  let after = before; let n = 0;
  for (const [re, to] of RULES) { after = after.replace(re, () => { n++; return to; }); }
  if (n) { perFile.push([f, n]); total += n; if (!DRY) fs.writeFileSync(p, after); }
}
perFile.sort((a, b) => b[1] - a[1]);
for (const [f, n] of perFile) console.log(String(n).padStart(4), f);
console.log(`${total} replacements in ${perFile.length} files${DRY ? ' (dry)' : ''}`);
