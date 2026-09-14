// The render half of J10: the chips row, then month groups.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

// the chips, under the FULL HISTORY strip
rep(`          {activity.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 431, overflowY: 'auto',
              border: \`1px solid \${C.cardBd}\`, borderRadius: 0 }}>`,
`          {activity.length > 4 && kindChips.length > 1 && (
            <div className="bhbc-hist-chips" style={{ display: 'flex', gap: 6, padding: '8px 9px', borderBottom: \`1px solid \${C.cardBd}\`, overflowX: 'auto' }}>
              {['all', ...kindChips].map((k) => {
                const on = histKind === k;
                return (
                  <button key={k} onClick={() => setHistKind(k)} className="bhbc-ghost-btn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, boxSizing: 'border-box', flexShrink: 0, padding: '0 9px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', borderRadius: 0, background: on ? NAVY : 'transparent', color: on ? '#fff' : C.tm, border: \`1px solid \${on ? NAVY : C.cardBd}\` }}>
                    {tr(k === 'all' ? 'All' : KIND_LABEL[k])}
                    <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{k === 'all' ? activity.length : kindCount[k]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {activity.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 431, overflowY: 'auto',
              border: \`1px solid \${C.cardBd}\`, borderRadius: 0 }}>
              {monthKeys.map((m, mi) => {
                const group = byMonth[m];
                const open = monthOpenAt(m, mi);
                const d0 = parseISO(m + '-01');
                return (
                  <React.Fragment key={m}>
                    {/* The month header stays put while its own rows scroll under
                        it, so you always know where you are in a long season. */}
                    <button onClick={() => setMonthOpen((p) => ({ ...p, [m]: !open }))}
                      style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '7px 9px', minHeight: 33, flexShrink: 0, cursor: 'pointer', borderRadius: 0, textAlign: 'start', background: NAVY_DEEP, color: '#fff', border: 'none', borderBottom: \`1px solid \${C.cardBd}\` }}>
                      <span aria-hidden="true" style={{ fontFamily: FN, fontSize: 9, opacity: 0.8, width: 10, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
                      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{monFor(d0.getMonth(), MON[d0.getMonth()])} {d0.getFullYear()}</span>
                      <span style={{ marginInlineStart: 'auto', fontFamily: FN, fontSize: 10, color: ORANGE, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{monthSummary(group)}</span>
                    </button>
                    {open && group.map((a, i) => (`, 'chips + month header');

// the row body now belongs to the group
rep(`              {activity.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', minHeight: 33, flexShrink: 0, boxSizing: 'border-box',
                  borderBottom: i < activity.length - 1 ? \`1px solid \${C.cardBd}\` : 'none', fontFamily: FN, fontSize: 12 }}>`,
`                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', minHeight: 33, flexShrink: 0, boxSizing: 'border-box',
                  borderBottom: i < group.length - 1 ? \`1px solid \${C.cardBd}\` : 'none', fontFamily: FN, fontSize: 12 }}>`, 'row opens in group');

// and the close
rep(`                  {a.load != null && <span style={{ marginInlineStart: a.sess && onEditSession ? 8 : 'auto', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', fontWeight: 700, flexShrink: 0 }}>{Math.round(a.load)}</span>}
                </div>
              ))}
            </div>
          ) : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '6px 0' }}>No history logged yet.</div>}`,
`                  {a.load != null && <span style={{ marginInlineStart: a.sess && onEditSession ? 8 : 'auto', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', fontWeight: 700, flexShrink: 0 }}>{Math.round(a.load)}</span>}
                </div>
                    ))}
                  </React.Fragment>
                );
              })}
              {!shownActivity.length && <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '10px 9px' }}>{tr('Nothing of this kind yet.')}</div>}
            </div>
          ) : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '6px 0' }}>{tr('No history logged yet.')}</div>}`, 'group close');
fs.writeFileSync(f, s);
