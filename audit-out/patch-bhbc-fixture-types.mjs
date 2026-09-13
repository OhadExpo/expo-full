// The zone learns two session kinds the calendar has always had - scrimmage
// and shootaround - and every schedule chip says WHO a game is against and
// WHERE (Ohad 13.9: "game vs who and where at?").
import fs from 'node:fs';
const rep = (f, a, b, l, all = false) => { let s = fs.readFileSync(f, 'utf8'); const n = s.split(a).length - 1; if (all ? n < 1 : n !== 1) throw new Error(l + ' x' + n); fs.writeFileSync(f, all ? s.split(a).join(b) : s.replace(a, b)); console.log('ok', l, 'x' + n); };

const V = 'src/BhbcView.jsx';
rep(V, `const FX_COLOR = { game: ORANGE, practice: '#4E7FCB', lift: '#6C7A93' };
const FX_LABEL = { game: 'Game', practice: 'Practice', lift: 'Weights' };`,
`const FX_COLOR = { game: ORANGE, practice: '#4E7FCB', lift: '#6C7A93', scrimmage: '#C7692A', shootaround: '#5E9BD6' };
const FX_LABEL = { game: 'Game', practice: 'Practice', lift: 'Weights', scrimmage: 'Scrimmage', shootaround: 'Shootaround' };
// "vs Rishon LeZion · HaYovel" / "vs Hapoel Eilat · Begin Arena, Eilat" - the
// line under a game or scrimmage chip. Empty for a session with no opponent.
const fxWhere = (f) => {
  if (!f || (f.type !== 'game' && f.type !== 'scrimmage')) return f && f.location ? f.location : '';
  const parts = [];
  if (f.opponent) parts.push('vs ' + f.opponent);
  if (f.venue) parts.push(f.venue); else if (f.home === true) parts.push('HaYovel, Herzliya');
  return parts.join(' · ');
};`, 'types + fxWhere');

// Month view chip: a second line for games/scrimmages.
rep(V, `            <span style={{ color: FX_COLOR[f.type] || NAVY, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</span>
          </div>
        ))}
        {items.length > 3 && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, paddingInlineStart: 2 }}>+{items.length - 3} more</div>}`,
`            <span style={{ color: FX_COLOR[f.type] || NAVY, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}{fxWhere(f) && (f.type === 'game' || f.type === 'scrimmage') ? <span style={{ display: 'block', color: C.td, fontWeight: 400, fontSize: 9 }} dir="ltr">{fxWhere(f)}</span> : null}</span>
          </div>
        ))}
        {items.length > 3 && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, paddingInlineStart: 2 }}>+{items.length - 3} more</div>}`, 'month chip');

// Week view: the location line already exists; widen it to games/scrimmages.
rep(V, `                    {f.location && <div style={{ fontFamily: FB, fontSize: 9, color: C.tm }}>{f.location}</div>}`,
`                    {fxWhere(f) && <div style={{ fontFamily: FB, fontSize: 9, color: C.tm }} dir="ltr">{fxWhere(f)}</div>}`, 'week chip');

// List view: same.
rep(V, `                  {f.location && <span style={{ fontFamily: FB, fontSize: 10, color: C.tm }}>· {f.location}</span>}`,
`                  {fxWhere(f) && <span style={{ fontFamily: FB, fontSize: 10, color: C.tm }} dir="ltr">· {fxWhere(f)}</span>}`, 'list chip');

// The week header's GAME badge sat at a physical right - wrong edge in Hebrew.
rep(V, `{hasGame && <div style={{ position: 'absolute', top: 5, right: 5, fontFamily: FN`, `{hasGame && <div style={{ position: 'absolute', top: 5, insetInlineEnd: 5, fontFamily: FN`, 'game badge logical');

const H = 'src/bhbcHe.js';
rep(H, `  return { game: 'משחק', practice: 'אימון', lift: 'כוח', __min: 'דק׳' }[kind] ?? en;`,
`  return { game: 'משחק', practice: 'אימון', lift: 'כוח', scrimmage: 'משחק אימון', shootaround: 'שוטאראונד', __min: 'דק׳' }[kind] ?? en;`, 'he labels');
