// Add the compare-mode keys next to "Compare with…" in the HE dictionary.
import fs from 'node:fs';
const f = 'src/i18n.js';
let s = fs.readFileSync(f, 'utf8');
const anchor = `  "Compare with…": 'השווה עם…',`;
if (s.split(anchor).length !== 2) throw new Error('anchor');
const add = [
  ['COMPARE', 'השוואה'], ['FORM VS DEMO', 'ביצוע מול דמו'], ['PLAY BOTH', 'נגן שניהם'], ['PAUSE', 'עצור'],
  ['LOOP', 'לולאה'], ['SYNC', 'סנכרן'],
  ['other video from this client:', 'סרטון נוסף של המתאמן:'], ['other videos from this client:', 'סרטונים נוספים של המתאמן:'],
];
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [k] of add) if (new RegExp(`^\\s*["']?${esc(k)}["']?\\s*:`, 'm').test(s)) throw new Error('dup ' + k);
s = s.replace(anchor, anchor + '\n' + add.map(([k, v]) => `  "${k}": '${v}',`).join('\n'));
fs.writeFileSync(f, s);
console.log('added', add.length);
