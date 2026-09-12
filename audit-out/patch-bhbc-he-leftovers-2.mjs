// Second pass on the physio's Hebrew club zone: the month calendar's weekday
// row, the add-session type options, and the "The 2026-27 season not started"
// line that put an English article in front of a Hebrew sentence.
import fs from 'node:fs';
const V = 'src/BhbcView.jsx';
let s = fs.readFileSync(V, 'utf8');
const rep = (from, to, label) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error((label || from.slice(0, 50)) + ' ×' + n); s = s.replace(from, to); console.log('ok', label || from.slice(0, 50)); };

rep("import { bhbcT, BhbcLangCtx, useT, useHe, setBhbcDateLang, dowFor, monDayFor, monFor, fxLabelFor } from './bhbcHe';",
    "import { bhbcT, BhbcLangCtx, useT, useHe, setBhbcDateLang, dowFor, dowIdxFor, monDayFor, monFor, fxLabelFor } from './bhbcHe';", 'import dowIdxFor');
rep("          {DOW.map((d) => <div key={d} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, textAlign: 'center', padding: '4px 0' }}>{d}</div>)}",
    "          {DOW.map((d, i) => <div key={d} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, textAlign: 'center', padding: '4px 0' }}>{dowIdxFor(i, d)}</div>)}", 'month weekday row');
rep("{['Practice', 'Game', 'Lift', 'Shootaround', 'Conditioning', 'Recovery'].map((o) => <option key={o} value={o}>{o}</option>)}",
    "{['Practice', 'Game', 'Lift', 'Shootaround', 'Conditioning', 'Recovery'].map((o) => <option key={o} value={o}>{tr(o)}</option>)}", 'session type options');
rep("padding: '2px 2px 14px' }}>The {currentSeason} {tr('season not started')}</div>",
    "padding: '2px 2px 14px' }}>{tr('The {season} season has not started yet.').replace('{season}', currentSeason)}</div>", 'season not started');
fs.writeFileSync(V, s);

const H = 'src/bhbcHe.js';
let h = fs.readFileSync(H, 'utf8');
const anchor = "export const dowFor = (d, en) => (_dateLang === 'he' ? DOW_HE[d.getDay()] : en);\n";
if (!h.includes(anchor)) throw new Error('dowFor anchor');
h = h.replace(anchor, anchor + "// The same by weekday index, for a header row that is not a date.\nexport const dowIdxFor = (i, en) => (_dateLang === 'he' ? DOW_HE[i] : en);\n");
const keys = [
  ['Lift', 'כוח'], ['Shootaround', 'שוטאראונד'], ['Conditioning', 'קונדישן'], ['Recovery', 'התאוששות'],
  ['The {season} season has not started yet.', 'עונת {season} עוד לא נפתחה — נתוני הקבוצה יופיעו כאן אחרי המשחק הראשון.'],
];
const start = h.indexOf('export const HE = {');
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (k) => new RegExp("^\\s*(?:'" + esc(k) + "'|\"" + esc(k) + '"|' + esc(k) + ')\\s*:', 'm').test(h);
const fresh = keys.filter(([k]) => !has(k));
const nl = h.indexOf('\n', start);
h = h.slice(0, nl + 1) + fresh.map(([k, v]) => `  '${k}': '${v}',`).join('\n') + '\n' + h.slice(nl + 1);
fs.writeFileSync(H, h);
console.log('keys added', fresh.length, fresh.map(([k]) => k).join(' | '));
