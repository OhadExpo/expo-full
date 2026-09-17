// Three things his roster screenshot shows (15.9):
//
// 1. "ברך R" - the injury side printed as a lone Latin letter inside a Hebrew
//    line. The side is Left/Right/Bilateral and nothing ever translated it, so
//    the medical modal read "ברך · Right · Strain" too. It now has its own
//    word, and the short form keeps the letter only in English.
// 2. The LANDS chip was hard-coded English in a Hebrew zone.
// 3. At phone width the roster is ONE column, so the card's reserved two-line
//    name and two-line status left ~45px of dead air above the footer. The
//    reserves exist to line ten cards up in a grid; with one card per row there
//    is no grid to line up, so on a phone they collapse and the card shrinks to
//    its content.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l, expect = 1) => { const n = s.split(a).length - 1; if (n !== expect) throw new Error(l + ' x' + n); s = s.split(a).join(b); console.log('ok', l, 'x' + n); };

// 1. the side word
rep(`\${inj.side && inj.side !== 'N/A' ? \` \${inj.side[0]}\` : ''}`,
    `\${sideTag(inj.side, tr)}`, 'short side', 2);
rep(`{inj.side && inj.side !== 'N/A' ? \` \${inj.side[0]}\` : ''}`,
    `{sideTag(inj.side, tr)}`, 'board side');

// the helper, next to medText
const anchor = 'const MED_STATUS = {';
if (!s.includes('function sideTag(')) {
  rep(anchor, `// An injury's side is Left / Right / Bilateral. In English the first letter
// is enough ("KNEE R"); in Hebrew a lone Latin letter is noise, so the word
// itself is used - ברך ימין.
function sideTag(side, tr) {
  if (!side || side === 'N/A') return '';
  const w = tr(side);
  return ' ' + (/[\u0590-\u05FF]/.test(w) ? w : side[0]);
}
${anchor}`, 'sideTag helper');
}

// 2. the LANDS chip
rep(`<span aria-hidden="true">✈</span> Lands {dow(t.arrival)} {monDay(t.arrival)}`,
    `<span aria-hidden="true">✈</span> {tr('Lands')} {dow(t.arrival)} {monDay(t.arrival)}`, 'lands chip');

// 3. the card's reserved height, phone-aware
rep(`            height: 162, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', cursor: 'pointer',`,
    `            height: 'var(--rc-h, 162px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', cursor: 'pointer',`, 'card height');
rep(`color: C.tx, marginTop: 3, minHeight: 36, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>`,
    `color: C.tx, marginTop: 3, minHeight: 'var(--rc-name, 36px)', whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>`, 'name reserve');
rep(`gap: 6, marginTop: 4, minWidth: 0, flexWrap: 'wrap', minHeight: 30, alignContent: 'flex-start' }}>`,
    `gap: 6, marginTop: 4, minWidth: 0, flexWrap: 'wrap', minHeight: 'var(--rc-stat, 30px)', alignContent: 'flex-start' }}>`, 'status reserve');
fs.writeFileSync(f, s);

const css = 'src/themes.css';
let c = fs.readFileSync(css, 'utf8');
if (!c.includes('--rc-h')) {
  c += `
/* The roster card reserves two lines for the name and two for the status so a
   GRID of cards lines up. At phone width the grid is one column wide - there is
   nothing to line up with and the reserve is just dead air. */
@media (max-width:620px){
  .bhbc-roster-grid{--rc-h:auto;--rc-name:0px;--rc-stat:0px}
}
`;
  fs.writeFileSync(css, c);
  console.log('ok css');
} else console.log('already css');
