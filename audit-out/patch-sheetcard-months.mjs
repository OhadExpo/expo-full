// RevenueSheetCard: (1) a month row expands to the payments behind its roster
// estimate - who paid, when, how much, by which method; (2) a health line for
// the history itself: revisions covered, the newest one, when it was last
// harvested (from revenue_cell_history).
import fs from 'node:fs';
const f = 'src/RevenueSheetCard.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

// --- data: history health ---
rep(`  const [months, setMonths] = useState(null);
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, e] = await Promise.all([
        supabase.from('revenue_month_total').select('*').order('month', { ascending: false }),
        supabase.from('revenue_sheet_event').select('*').in('event_kind', ['payment', 'card_start', 'session', 'rate_change'])
          .order('event_date', { ascending: false }).limit(5000),
      ]);
      if (!alive) return;
      // An RLS refusal and an empty table look the same here, and both mean
      // "show nothing" rather than an error the coach can act on.
      setMonths(m.data || []);
      setEvents(e.data || []);
    })();
    return () => { alive = false; };
  }, []);
  return { months, events };`,
`  const [months, setMonths] = useState(null);
  const [events, setEvents] = useState(null);
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, e, newest, count] = await Promise.all([
        supabase.from('revenue_month_total').select('*').order('month', { ascending: false }),
        supabase.from('revenue_sheet_event').select('*').in('event_kind', ['payment', 'card_start', 'session', 'rate_change'])
          .order('event_date', { ascending: false }).limit(5000),
        supabase.from('revenue_cell_history').select('rev,rev_time,imported_at').order('rev', { ascending: false }).limit(1),
        supabase.from('revenue_cell_history').select('rev', { count: 'exact', head: true }),
      ]);
      if (!alive) return;
      // An RLS refusal and an empty table look the same here, and both mean
      // "show nothing" rather than an error the coach can act on.
      setMonths(m.data || []);
      setEvents(e.data || []);
      const top = newest.data && newest.data[0];
      setHealth(top ? { newestRev: top.rev, newestTime: top.rev_time, harvestedAt: top.imported_at, cells: count.count || 0 } : null);
    })();
    return () => { alive = false; };
  }, []);
  return { months, events, health };`, 'health fetch');

rep(`  const { months, events } = useSheetRevenue();
  const [open, setOpen] = useState(null);`,
`  const { months, events, health } = useSheetRevenue();
  const [open, setOpen] = useState(null);
  const [openMonth, setOpenMonth] = useState(null);`, 'state');

// --- header: health line ---
rep(`            {byMonth.length} {byMonth.length === 1 ? tt('month') : tt('months')} · {clients.length} {tt('clients')} · {totalPayments} {tt('payments')} · {totalSessions} {tt('sessions counted')}
          </span>
        </div>
      </RefinedHeaderStrip>`,
`            {byMonth.length} {byMonth.length === 1 ? tt('month') : tt('months')} · {clients.length} {tt('clients')} · {totalPayments} {tt('payments')} · {totalSessions} {tt('sessions counted')}
          </span>
        </div>
      </RefinedHeaderStrip>
      {health && (
        <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.04em', marginBottom: 12 }}>
          {tt('History')}: {health.cells.toLocaleString()} {tt('cells')} · {tt('newest revision')} r{health.newestRev}{health.newestTime ? ' · ' + fmtNumericDate(health.newestTime) : ''} · {tt('last harvested')} {fmtNumericDate(health.harvestedAt)}
        </div>
      )}`, 'health line');

// --- month rows expand ---
rep(`                return (
                  <tr key={g.month}>
                    <td style={{ ...td, fontFamily: FN, fontSize: 12, letterSpacing: '0.04em' }}>{monthLabel(g.month)}</td>`,
`                const isOpenM = openMonth === g.month;
                const monthPays = (events || []).filter((e) => e.event_kind === 'payment' && String(e.event_date).slice(0, 7) === g.month.slice(0, 7)).sort((a, b) => (a.event_date < b.event_date ? 1 : -1));
                return (
                  <React.Fragment key={g.month}>
                  <tr onClick={() => setOpenMonth(isOpenM ? null : g.month)} style={{ cursor: 'pointer', background: isOpenM ? 'rgba(57,189,255,0.06)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: FN, fontSize: 12, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 14, color: C.ac, fontSize: 10 }}>{isOpenM ? '▾' : '▸'}</span>{monthLabel(g.month)}</td>`, 'month row open');

rep(`                    <td style={{ ...td, textAlign: 'end', color: C.tm }} dir="ltr">{g.other ? ILS(g.other) : '—'}</td>
                  </tr>
                );
              })}`,
`                    <td style={{ ...td, textAlign: 'end', color: C.tm }} dir="ltr">{g.other ? ILS(g.other) : '—'}</td>
                  </tr>
                  {isOpenM && (
                    <tr>
                      <td colSpan={10} style={{ padding: '4px 10px 12px 24px', borderBottom: \`1px solid \${C.divider || C.cardBd}\` }}>
                        {monthPays.length === 0 ? (
                          <div style={{ fontFamily: FB, fontSize: 12, color: C.td }}>{tt('The roster recorded no payment dated this month.')}</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>
                              <th style={th}>{tt('Client')}</th><th style={th}>{tt('Paid on')}</th><th style={th}>{tt('Rate')}</th><th style={th}>{tt('Cycle')}</th>
                              <th style={{ ...th, textAlign: 'end' }}>{tt('Estimated')}</th><th style={th}>{tt('Method')}</th>
                            </tr></thead>
                            <tbody>
                              {monthPays.map((p) => (
                                <tr key={p.id}>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', fontWeight: 600 }}><bdi>{p.client_name}</bdi></td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px' }} dir="ltr">{fmtNumericDate(p.event_date)}</td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', color: C.tm }}><bdi>{p.rate_text || '—'}</bdi></td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', color: C.tm }}><bdi>{p.counter_before || '—'}</bdi></td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', textAlign: 'end', fontWeight: 700, color: p.amount_est == null ? C.td : C.tx }} dir="ltr">{p.amount_est == null ? '—' : ILS(p.amount_est)}</td>
                                  <td style={{ ...td, fontSize: 12, padding: '5px 10px', fontFamily: FN, fontSize: 10, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: CONF_COLOR[p.confidence] || C.td, marginInlineEnd: 6, verticalAlign: 'middle' }} />
                                    {tt(METHOD_LABEL[p.amount_method] || p.amount_method || 'no amount')}{p.unpaid ? <span style={{ color: C.rd }}> · {tt('marked unpaid')}</span> : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}`, 'month detail');
fs.writeFileSync(f, s);
