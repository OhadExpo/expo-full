// The history rows spoke English inside a Hebrew modal: "PRACTICE · 120 MIN",
// "GYM · 30 MIN", "BODYWEIGHT 92 KG". The labels are built as template strings
// in JS, so no JSX gate ever saw them. They are composed through tr now, and
// the filter chips get their own words (a chip is a CATEGORY - אימונים, not
// אימון).
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep("const KIND_LABEL = { game: 'Games', practice: 'Practice', gym: 'Gym', note: 'Notes', other: 'Other' };",
    "const KIND_LABEL = { game: 'Games', practice: 'Practices', gym: 'Weight room', note: 'Notes', other: 'Other' };", 'chip words');

rep("label: s.rpe == null ? `${s.start ? s.start + ' · ' : ''}${kindLabel(s.type)} · ${s.min ? s.min + ' min' : 'attended'}${s.note ? ' · ' + s.note : ''}` : `${s.start ? s.start + ' · ' : ''}${s.type} ${s.min} min @ RPE ${s.rpe}${s.note ? ' · ' + s.note : ''}`",
    "label: s.rpe == null ? `${s.start ? s.start + ' · ' : ''}${tr(kindLabel(s.type))} · ${s.min ? s.min + ' ' + tr('min') : tr('attended')}${s.note ? ' · ' + s.note : ''}` : `${s.start ? s.start + ' · ' : ''}${tr(s.type)} ${s.min} ${tr('min')} @ RPE ${s.rpe}${s.note ? ' · ' + s.note : ''}`", 'session label');

rep("label: `Gym · ${nEx} lift${nEx === 1 ? '' : 's'}, ${nSets} set${nSets === 1 ? '' : 's'}`",
    "label: `${tr('Gym')} · ${nEx} ${tr(nEx === 1 ? 'lift' : 'lifts')}, ${nSets} ${tr(nSets === 1 ? 'set' : 'sets')}`", 'workout label');
rep("label: `Bodyweight ${kg} kg`", "label: `${tr('Bodyweight')} ${kg} ${tr('kg')}`", 'bw label');
rep("label: `Availability · ${AVAIL[code].label}`", "label: `${tr('Availability')} · ${tr(AVAIL[code].label)}`", 'avail label');
rep("label: `Note — ${n}`", "label: `${tr('Note')} — ${n}`", 'note label');
fs.writeFileSync(f, s);

const H = 'src/bhbcHe.js';
let h = fs.readFileSync(H, 'utf8');
const add = [['All', 'הכול'], ['Practices', 'אימונים'], ['Weight room', 'חדר כוח'], ['Other', 'אחר'],
  ['attended', 'נכח'], ['lift', 'תרגיל'], ['lifts', 'תרגילים'], ['set', 'סט'], ['sets', 'סטים'],
  ['Bodyweight', 'משקל גוף'], ['kg', 'ק"ג'], ['Note', 'הערה']];
const i = h.indexOf('export const HE = {');
const nl = h.indexOf('\n', i) + 1;
const fresh = add.filter(([k]) => !new RegExp("^\s*(?:'" + k.replace(/[.*+?^${}()|[\]\]/g, '\$&') + "'|" + (/^[A-Za-z_$][\w$]*$/.test(k) ? k : '\0') + ")\s*:", 'm').test(h));
h = h.slice(0, nl) + fresh.map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`).join('\n') + '\n' + h.slice(nl);
fs.writeFileSync(H, h);
console.log('he keys', fresh.length, fresh.map((x) => x[0]).join(','));
