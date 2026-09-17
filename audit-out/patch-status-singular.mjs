// "the hebrew is plural for every single player" (Ohad, 15.9, the roster tab).
//
// An injury's `status` is the lowercase key - available / limited - and those
// dictionary entries are the COUNT words: "8 זמינים · 2 מוגבלים". One player's
// card printed the count word, so every athlete read as a crowd. The card now
// prints the STATUS word (MED_STATUS.label → זמין / מוגבל), which is what the
// medical board's pills already use.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const a = `{injShort} · {tr(inj.status)}`;
const n = s.split(a).length - 1;
if (n !== 1) throw new Error('status anchor x' + n);
s = s.replace(a, `{injShort} · {tr((MED_STATUS[inj.status] || {}).label || inj.status)}`);
fs.writeFileSync(f, s);
console.log('ok roster card status is singular');
