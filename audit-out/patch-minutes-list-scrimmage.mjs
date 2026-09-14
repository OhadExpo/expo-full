// Two defects the re-shot games tab showed:
//
// 1. The minutes list only looked at type === 'game'. The 3.9 fixture is what
//    the club calendar calls it - a SCRIMMAGE - so the game whose box score he
//    photographed vanished from the one list that records minutes, nine
//    players' minutes already in the store. A scrimmage costs a player exactly
//    the same minutes as a game; it belongs in the list, labelled for what it is.
// 2. A fixture with no opponent printed the word "Opponent" as if that were a
//    club. An unknown opponent is unknown - the row says so instead.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`    .filter((f) => f && f.type === 'game' && f.date && f.date <= today)`,
    `    .filter((f) => f && (f.type === 'game' || f.type === 'scrimmage') && f.date && f.date <= today)`, 'scrimmages count');

rep(`              {'  '}{g.opponent ? tr('vs') + ' ' + g.opponent : tr('Game')}`,
    `              {'  '}{g.opponent ? tr('vs') + ' ' + g.opponent : tr(FX_LABEL[g.type] || 'Game')}
              {g.type === 'scrimmage' && <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, marginInlineStart: 8 }}>{tr('Scrimmage')}</span>}`, 'label the kind');

rep(`    home: f.home === false ? (f.opponent || 'Opponent') : 'Bnei Herzliya',
    away: f.home === false ? 'Bnei Herzliya' : (f.opponent || 'Opponent'),`,
    `    home: f.home === false ? (f.opponent || 'TBD') : 'Bnei Herzliya',
    away: f.home === false ? 'Bnei Herzliya' : (f.opponent || 'TBD'),`, 'unknown opponent is TBD');
fs.writeFileSync(f, s);
