// Keys for the last English on the Hebrew review and billing screens.
import fs from 'node:fs';
const f = 'src/i18n.js';
let s = fs.readFileSync(f, 'utf8');
const anchor = `  "Compare with…": 'השווה עם…',`;
if (s.split(anchor).length !== 2) throw new Error('anchor');
const add = [['REVIEW →', 'בדיקה ←'], ['VIEW →', 'הצג ←'], ['pending', 'ממתינות'], ['days', 'ימים']];
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fresh = add.filter(([k]) => !new RegExp(`^\\s*["']?${esc(k)}["']?\\s*:`, 'm').test(s));
s = s.replace(anchor, anchor + '\n' + fresh.map(([k, v]) => `  "${k}": '${v}',`).join('\n'));
fs.writeFileSync(f, s);
console.log('added', fresh.map(([k]) => k).join(', ') || 'nothing (all present)');
