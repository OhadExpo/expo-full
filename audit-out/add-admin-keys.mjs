// Keys for the last English on the Hebrew exercises, waitlist and intake screens.
import fs from 'node:fs';
const f = 'src/i18n.js';
let s = fs.readFileSync(f, 'utf8');
const anchor = `  "Compare with…": 'השווה עם…',`;
if (s.split(anchor).length !== 2) throw new Error('anchor');
const add = [
  ['Unclassified', 'בלי סיווג'], ['No video', 'בלי וידאו'],
  ['— resolution/movement/position blank', '— רזולוציה / תנועה / מנח ריקים'], ['Classify at scale →', 'סיווג המוני ←'],
  ['of', 'מתוך'], ['— refine the search, or', '— תצמצם את החיפוש, או'],
  ['uncontacted', 'בלי קשר'], ['gate at', 'שער ב-'], ['serious signups', 'הרשמות רציניות'], ['✓ DONE', '✓ בוצע'],
];
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fresh = add.filter(([k]) => !new RegExp(`^\\s*["']?${esc(k)}["']?\\s*:`, 'mi').test(s));
s = s.replace(anchor, anchor + '\n' + fresh.map(([k, v]) => `  "${k}": '${v}',`).join('\n'));
fs.writeFileSync(f, s);
console.log('added', fresh.map(([k]) => k).join(', ') || 'nothing');
