// Keys for the review-detail and athlete-detail screens + three editor words
// a coach says differently (undo/redo/tempo).
import fs from 'node:fs';
const f = 'src/i18n.js';
let s = fs.readFileSync(f, 'utf8');
const anchor = `  "Compare with…": 'השווה עם…',`;
if (s.split(anchor).length !== 2) throw new Error('anchor');
const add = [['MARK REVIEWED', 'סמן כנבדק'], ['SKIP', 'דלג'], ['COMMENT AT PLAYHEAD', 'תגובה בנקודה הזאת'], ['Δ from first', 'Δ מהראשונה']];
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fresh = add.filter(([k]) => !new RegExp(`^\\s*["']?${esc(k)}["']?\\s*:`, 'mi').test(s));
s = s.replace(anchor, anchor + '\n' + fresh.map(([k, v]) => `  "${k}": '${v}',`).join('\n'));
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('once: ' + a); s = s.replace(a, b); };
rep("UNDO: 'ביטול פעולה'", "UNDO: 'בטל'");
rep("REDO: 'ביצוע מחדש'", "REDO: 'בצע שוב'");
rep("TEMPO: 'קצב'", "TEMPO: 'טמפו'");
fs.writeFileSync(f, s);
console.log('added', fresh.map(([k]) => k).join(', '), '+ undo/redo/tempo');
