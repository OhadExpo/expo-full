// MANAGE ROSTER on a phone: "wtf is this mess. full re-design" (Ohad, 15.9).
//
// Measured at 390: the row is one rigid flex line - checkbox, jersey, name,
// a 108px position column, the word LANDS and a date field. The fixed part
// eats ~230px, so the name got ~60 and broke to ONE LETTER PER LINE, and the
// row still ran 700px wide inside a 390px dialog with its own scrollbar.
//
// Now the row wraps as a block: the name keeps a full line (it may never be
// narrower than 140px), and position + landing date drop to a second line,
// pinned to the row's end. On a desktop the whole thing still sits on one
// line, unchanged. The dialog also speaks Hebrew now - it was English inside
// a Hebrew zone.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`        <div style={{ fontFamily: FB, fontSize: 13, color: C.td, marginBottom: 12 }}>
          Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the <span style={{ fontFamily: FN, color: NAVY, fontWeight: 700 }}>BHBC</span> zone.
        </div>`,
`        <div style={{ fontFamily: FB, fontSize: 13, color: C.td, marginBottom: 12 }}>
          {tr('Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the BHBC zone.')}
        </div>`, 'explainer');

rep(`            placeholder="Add a new athlete — full name"`, `            placeholder={tr('Add a new athlete — full name')}`, 'placeholder');
rep(`color: newAthlete.trim() ? '#fff' : undefined }}>+ Add</Btn>`, `color: newAthlete.trim() ? '#fff' : undefined }}>{tr('+ Add')}</Btn>`, 'add button');

rep(`              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',`,
    `              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 6, flexWrap: 'wrap', padding: '9px 12px',`, 'row wraps');

rep(`                <span style={{ flex: '1 1 auto', minWidth: 0, fontFamily: FN, fontSize: 13, fontWeight: on ? 700 : 500, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>`,
    `                <span style={{ flex: '1 1 160px', minWidth: 140, fontFamily: FN, fontSize: 13, fontWeight: on ? 700 : 500, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>`, 'name keeps a line');

rep(`                    <span style={{ flexShrink: 0, width: 108, textAlign: 'end', fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.position || ''}</span>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Landing / arrival date">
                      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>Lands</span>`,
`                    <span style={{ flex: '0 1 auto', minWidth: 0, marginInlineStart: 'auto', textAlign: 'end', fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(t.position) || ''}</span>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }} title={tr('Landing / arrival date')}>
                      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>{tr('Lands')}</span>`, 'position + lands');
fs.writeFileSync(f, s);

// ---- the Hebrew for the dialog ----
const H = 'src/bhbcHe.js';
let h = fs.readFileSync(H, 'utf8');
const keys = [
  ['Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the BHBC zone.',
   'סמן מתאמנים כשייכים לבני הרצליה. הפורטל האישי שלהם לא משתנה — זה רק קובע מי מופיע באזור המועדון.'],
  ['Add a new athlete — full name', 'הוספת מתאמן — שם מלא'],
  ['+ Add', '+ הוספה'],
  ['Lands', 'נוחת'],
  ['Landing / arrival date', 'תאריך נחיתה / הגעה'],
];
const start = h.indexOf('export const HE = {');
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (k) => new RegExp("^\\s*(?:'" + esc(k) + "'|\"" + esc(k) + '")\\s*:', 'm').test(h);
const fresh = keys.filter(([k]) => !has(k));
const nl = h.indexOf('\n', start);
h = h.slice(0, nl + 1) + fresh.map(([k, v]) => `  ${k.includes("'") ? JSON.stringify(k) : `'${k}'`}: '${v}',`).join('\n') + '\n' + h.slice(nl + 1);
fs.writeFileSync(H, h);
console.log('keys added', fresh.length);
