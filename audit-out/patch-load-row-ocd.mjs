// J9 - "buttons are not ocd aligned, injuries can be a third row if it doesn't
// stretch the vertical size of the box since we have space".
//
// Two faults, measured at 390:
//
// 1. The phone rules address the row's children by POSITION (nth-child). The
//    row only renders ACWR and 7-day when the squad has load data; with no RPE
//    anywhere - which is the state the club is in right now - every child after
//    the name shifts one place left. So `nth-child(4)` hid the AVAILABILITY
//    button instead of 7-day, and the actions cell landed in the availability
//    area: that is why the board shows no availability control at all and the
//    MED button sits at a different x in every row. They are addressed by NAME
//    now, so the rules hold whichever columns exist.
// 2. Even addressed correctly the last track was `max-content`, and each row is
//    its OWN grid - so the track was as wide as that row's own text ("14D · 1
//    בספט'" vs "3D · 12 בספט'") and the button drifted with it. The track is a
//    fixed width, so the load chip and the MED button share one column edge
//    down the whole board.
//
// And the injury gets its own line under the position instead of being crammed
// beside it. The name block was already two lines tall (the name wraps), so the
// third line costs nothing: the row-gap and the bottom padding give it back.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                  {hasLoad && <Sparkline series={series} />}`,
    `                <div data-lbl="actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                  {hasLoad && <Sparkline series={series} />}`, 'actions cell named');

rep(`                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{tr(t.position) || '—'}{injShort ? ' ·' : ''}</span>`,
    `                      <div className="bhbc-pos-inj" style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, whiteSpace: 'nowrap' }}>
                        <span data-pos style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{tr(t.position) || '—'}{injShort ? ' ·' : ''}</span>`, 'position/injury named');
fs.writeFileSync(f, s);

const cssFile = 'src/themes.css';
let c = fs.readFileSync(cssFile, 'utf8');
const oldBlock = `  .bhbc-load-row > *:nth-child(1) { grid-area: jersey; }
  .bhbc-load-row > *:nth-child(2) { grid-area: name; min-width: 0; overflow-wrap: anywhere; }
  .bhbc-load-row > *:nth-child(3) { grid-area: acwr; }
  /* 7d and readiness are READING data — they stay on the athlete's own card
     rather than crushing the row down to nothing. */
  .bhbc-load-row > *:nth-child(4),
  .bhbc-load-row > *:nth-child(6) { display: none !important; }
  .bhbc-load-row > *:nth-child(5) { grid-area: avail; }`;
const newBlock = `  .bhbc-load-row > *:nth-child(1) { grid-area: jersey; }
  .bhbc-load-row > *:nth-child(2) { grid-area: name; min-width: 0; overflow-wrap: anywhere; }
  /* BY NAME, not by position: ACWR and 7-day only exist when the squad has load
     data, and when they do not every later child shifts one place and the
     position rules hide the wrong cell. */
  .bhbc-load-row > [data-lbl="ACWR"],
  .bhbc-load-row > [data-lbl="last lift"] { grid-area: acwr; justify-self: end; }
  /* 7d and readiness are READING data — they stay on the athlete's own card
     rather than crushing the row down to nothing. */
  .bhbc-load-row > [data-lbl="7-day"],
  .bhbc-load-row > [data-lbl="Readiness"] { display: none !important; }
  .bhbc-load-row > [data-lbl="Availability"] { grid-area: avail; }
  /* One line per fact: the position, then the injury under it. The name block
     already wraps to two lines, so this costs no height — the row gap and the
     bottom padding below pay for it. */
  .bhbc-pos-inj { display: block !important; }
  .bhbc-pos-inj > [data-pos]::after { content: ''; }
  .bhbc-pos-inj > * { display: block; }`;
if (c.includes(oldBlock)) { c = c.replace(oldBlock, newBlock); console.log('ok css children by name'); }
else if (c.includes('[data-lbl="Availability"]')) console.log('already css');
else throw new Error('css block not found');

const oldTail = `  .bhbc-load-row { grid-template-columns: 28px minmax(0, 1fr) max-content !important; }
  .bhbc-load-row > *:nth-child(7) { grid-area: med; justify-self: end; width: max-content; max-width: 96px; }`;
const newTail = `  /* A FIXED last track. It was max-content, and every row is its own grid, so
     the track was as wide as that row's own text and the MED button underneath
     it moved a few pixels every line. Fixed = one column edge down the board. */
  .bhbc-load-row { grid-template-columns: 28px minmax(0, 1fr) 96px !important; row-gap: 6px !important; padding-bottom: 8px !important; }
  .bhbc-load-row > [data-lbl="actions"] { grid-area: med; justify-self: end; width: max-content; max-width: 96px; }`;
if (c.includes(oldTail)) { c = c.replace(oldTail, newTail); console.log('ok css fixed track'); }
else if (c.includes('[data-lbl="actions"]')) console.log('already tail');
else throw new Error('tail block not found');
fs.writeFileSync(cssFile, c);
