// The login button says כניסה when the language is Hebrew (2026-09-07), and
// every probe that sets LANG_APP=he before the first document would otherwise
// stare at a button it cannot name. One literal, everywhere.
import fs from 'node:fs';
const files = [
  ...fs.readdirSync('scripts').filter((f) => f.endsWith('.mjs')).map((f) => 'scripts/' + f),
  ...fs.readdirSync('scripts/lib').filter((f) => f.endsWith('.mjs')).map((f) => 'scripts/lib/' + f),
  ...fs.readdirSync('audit-out').filter((f) => f.endsWith('.mjs')).map((f) => 'audit-out/' + f),
];
const FROM = String.raw`/^\s*(sign\s*in|כניסה)\s*$/i`;
const TO = String.raw`/^\s*(sign\s*in|כניסה)\s*$/i`;
let n = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (!s.includes(FROM)) continue;
  fs.writeFileSync(f, s.split(FROM).join(TO));
  n++;
}
console.log(`sign-in regex updated in ${n} files`);
