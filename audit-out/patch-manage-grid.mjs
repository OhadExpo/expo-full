// MANAGE ROSTER, second pass: make the row a GRID so the wrapped line lands
// under the NAME column instead of under the checkbox. "buttons are not ocd
// aligned" - same rule here: every column starts on the same x at every width.
//
// Desktop: [chk] [jersey] [name .....] [position  LANDS date]  - one line.
// Phone  : [chk] [jersey] [name .....]
//          [                position  LANDS date]  - indented to the name.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 6, flexWrap: 'wrap', padding: '9px 12px',`,
    `              <div key={t.id} className="bhbc-manage-row" style={{ padding: '9px 12px',`, 'row is a grid');

rep(`                <span style={{ flex: '1 1 160px', minWidth: 140, fontFamily: FN,`,
    `                <span style={{ minWidth: 0, fontFamily: FN,`, 'name is a grid cell');

rep(`                  <>
                    <span style={{ flex: '0 1 auto', minWidth: 0, marginInlineStart: 'auto', textAlign: 'end', fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(t.position) || ''}</span>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }} title={tr('Landing / arrival date')}>`,
`                  <span className="bhbc-manage-meta">
                    <span style={{ minWidth: 0, fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(t.position) || ''}</span>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }} title={tr('Landing / arrival date')}>`, 'meta opens');

rep(`                    </span>
                  </>
                )}
              </div>`,
`                    </span>
                  </span>
                )}
              </div>`, 'meta closes');
fs.writeFileSync(f, s);

const css = 'src/themes.css';
let c = fs.readFileSync(css, 'utf8');
if (!c.includes('.bhbc-manage-row')) {
  c += `
/* MANAGE ROSTER row: one line on a desktop, two on a phone - and the second
   line starts on the NAME column, not under the checkbox. */
.bhbc-manage-row{display:grid;grid-template-columns:16px 24px minmax(0,1fr) auto;align-items:center;column-gap:10px;row-gap:7px}
.bhbc-manage-meta{display:flex;align-items:center;gap:12px;justify-content:flex-end;min-width:0}
@media (max-width:620px){
  .bhbc-manage-row{grid-template-columns:16px 24px minmax(0,1fr)}
  .bhbc-manage-meta{grid-column:3;justify-content:space-between;gap:8px}
}
`;
  fs.writeFileSync(css, c);
  console.log('ok css');
} else console.log('already css');
