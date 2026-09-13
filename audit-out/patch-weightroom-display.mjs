// Weight room, better displayed (Ohad 13.9, screenshot): each logged lift is a
// filled tile that SAYS its minutes; day columns carry the weekday letter;
// the DUE strip is a row of chips instead of a run-on sentence; "what the room
// did" is a real table. Same data, same columns, same rules.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

// 1. Cells: a tile with the minutes in it.
rep(`                      {c.lift && <span style={{ width: 12, height: 12, background: ORANGE, display: 'block' }} />}`,
`                      {c.lift && (
                        <span style={{ minWidth: 18, height: 16, padding: '0 3px', background: ORANGE, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 8.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>
                          {c.mins || ''}
                        </span>
                      )}`, 'minute tiles');

// 2. DUE strip as chips.
rep(`            <span style={{ fontFamily: FB, fontSize: 12, color: C.tx, minWidth: 0 }}>
              {due.map(({ t, since }, i) => (
                <span key={t.id} style={{ unicodeBidi: 'isolate' }}>{i ? ' · ' : ''}{t.name}<span style={{ color: ink(since), fontWeight: 700, unicodeBidi: 'isolate' }}>{'\\u00A0'}{since == null ? tr('never') :`,
`            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
              {due.map(({ t, since }) => (
                <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 8px', border: \`1px solid \${C.cardBd}\`, background: 'var(--c-sf)', fontFamily: FN, fontSize: 10.5, fontWeight: 700, color: C.tx, whiteSpace: 'nowrap' }}><span style={{ unicodeBidi: 'isolate' }}>{t.name}</span><span style={{ color: ink(since), fontWeight: 800, unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums' }}>{since == null ? tr('never') :`, 'due chips');

// 3. The day header: weekday letter above the day number.
rep(`              {days.list.map((d) => (
                <span key={d.iso} style={{ fontFamily: FN, fontSize: 9, fontWeight: d.iso === today ? 800 : 600, color: d.iso === today ? ORANGE_DEEP : (d.dow === 6 || d.dow === 5 ? C.cardBd : C.tm), textAlign:`,
`              {days.list.map((d) => (
                <span key={d.iso} title={monDay(d.iso)} style={{ fontFamily: FN, fontSize: 9, fontWeight: d.iso === today ? 800 : 600, color: d.iso === today ? ORANGE_DEEP : (d.dow === 6 || d.dow === 5 ? C.cardBd : C.tm), textAlign:`, 'day header title');
fs.writeFileSync(f, s);
