// TraineePRsView: per-exercise progression chart for the trainee portal.
// Sits between "BW Graph" and "History" in the bottom-tab strip.
//
// Reads from clientWorkouts (the trainee's own portal-logged sessions, not
// the trainer's in-person workouts table). Aggregates max load × top-set
// reps per exercise per session, then renders a grid of sparkline cards.
// Tap a card to expand into a full per-session breakdown.
//
// Substitutions are honoured — if an exercise was swapped (ex.substitution
// is set on the workout entry), it counts toward the swap-in's series, not
// the prescribed eid's. That way a trainee who did "Pull-Up" instead of
// "Lat Pulldown" sees their pull-up loads on the pull-up card.

import React, { useMemo, useState } from 'react';
import { C, FN, FB } from './theme';
import { EX } from './exerciseData';

function topSetOfWorkoutEx(ex) {
  // ex.sets[] from the trainee log — { reps, load, rpe, done }
  // We only count completed sets with a numeric positive load.
  const candidates = (ex.sets || [])
    .filter(s => s.done && s.load !== '' && s.load != null)
    .map(s => ({ load: parseFloat(s.load) || 0, reps: parseFloat(s.reps) || 0, rpe: parseFloat(s.rpe) || null }))
    .filter(s => s.load > 0);
  if (candidates.length === 0) return null;
  // Top set = max load, ties broken by max reps.
  return candidates.reduce((a, b) => b.load > a.load || (b.load === a.load && b.reps > a.reps) ? b : a);
}

function aggregate(clientWorkouts, traineeId) {
  // For each exercise key (the ACTUAL title performed — substituted if
  // swapped), build a chronological series of top-set load + reps.
  const byKey = new Map();
  for (const w of clientWorkouts || []) {
    if (traineeId && w.clientId !== traineeId) continue;
    for (const ex of w.exercises || []) {
      const top = topSetOfWorkoutEx(ex);
      if (!top) continue;
      const wasSwapped = !!ex.substitution;
      const performedTitle = wasSwapped ? ex.substitution.to : (ex.title || EX[ex.eid]?.t || '?');
      const key = performedTitle;
      if (!byKey.has(key)) {
        byKey.set(key, { title: performedTitle, series: [], swappedFromAny: false });
      }
      const entry = byKey.get(key);
      if (wasSwapped) entry.swappedFromAny = true;
      entry.series.push({
        date: w.date,
        load: top.load,
        reps: top.reps,
        rpe: top.rpe,
        planName: w.planName,
        week: w.week,
        wasSwapped,
        prescribedFrom: wasSwapped ? ex.substitution.from : null,
      });
    }
  }
  // Build summary rows: title, full series, all-time PR, recent PR, last
  // date, session count, delta vs first session.
  const rows = [];
  for (const entry of byKey.values()) {
    entry.series.sort((a, b) => new Date(a.date) - new Date(b.date));
    if (entry.series.length === 0) continue;
    const loads = entry.series.map(s => s.load);
    const allTimePR = Math.max(...loads);
    const allTimePREntry = entry.series.find(s => s.load === allTimePR);
    const firstLoad = entry.series[0].load;
    const lastLoad = entry.series[entry.series.length - 1].load;
    const delta = lastLoad - firstLoad;
    const deltaPct = firstLoad > 0 ? Math.round((delta / firstLoad) * 100) : 0;
    rows.push({
      title: entry.title,
      series: entry.series,
      sessionCount: entry.series.length,
      allTimePR,
      allTimePRDate: allTimePREntry?.date,
      allTimePRReps: allTimePREntry?.reps || null,
      firstLoad, lastLoad, delta, deltaPct,
      lastDate: entry.series[entry.series.length - 1].date,
      swappedAny: entry.swappedFromAny,
    });
  }
  // Sort: most-recently-trained first.
  rows.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
  return rows;
}

// Inline SVG sparkline — load over time. Last point gets a larger dot,
// coloured green if the line trends up vs the first session, red if down.
function Sparkline({ series, width = 220, height = 44 }) {
  if (!series || series.length === 0) return null;
  if (series.length === 1) {
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <circle cx={width / 2} cy={height / 2} r="3" fill={C.ac} />
      </svg>
    );
  }
  const loads = series.map(s => s.load);
  const min = Math.min(...loads);
  const max = Math.max(...loads);
  const range = max - min || 1;
  const pad = 4;
  const W = width - pad * 2;
  const H = height - pad * 2;
  const points = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * W;
    const y = pad + H - ((s.load - min) / range) * H;
    return [x, y];
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const trendColor = series[series.length - 1].load >= series[0].load ? C.gn : C.rd;
  return (
    <svg width={width} height={height} style={{ display: 'block', width: '100%' }}>
      <path d={path} stroke={trendColor} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === points.length - 1 ? 3 : 1.6}
          fill={i === points.length - 1 ? trendColor : C.tm} />
      ))}
    </svg>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function TraineePRsView({ clientWorkouts, traineeId, header }) {
  const [expanded, setExpanded] = useState(null); // exercise title
  const rows = useMemo(() => aggregate(clientWorkouts, traineeId), [clientWorkouts, traineeId]);
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const s = filter.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => r.title.toLowerCase().includes(s));
  }, [rows, filter]);

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
      {header}
      <div style={{ padding: 20 }}>
        <h2 style={{ fontFamily: FN, fontSize: 18, margin: '0 0 4px', textAlign: 'center' }}>Records</h2>
        <div style={{ color: C.tm, fontSize: 12, marginBottom: 14, textAlign: 'center' }}>
          Top set per session, by exercise.
        </div>

        {rows.length > 5 && (
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search exercise…"
            style={{
              width: '100%', background: C.sf2, border: `0.25px solid ${C.ac}4D`,
              borderRadius: 8, padding: '10px 12px', color: C.tx, fontFamily: FB, fontSize: 14,
              outline: 'none', boxSizing: 'border-box', marginBottom: 14, textAlign: 'center',
            }} />
        )}

        {rows.length === 0 && (
          <div style={{ background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 12, padding: 30, textAlign: 'center' }}>
            <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 1.5, marginBottom: 8 }}>NO RECORDS YET</div>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
              Log a few sessions with weights and your top-set progression for each exercise will show up here.
            </div>
          </div>
        )}

        {filtered.length === 0 && rows.length > 0 && (
          <div style={{ textAlign: 'center', color: C.td, fontFamily: FN, fontSize: 12, padding: 20 }}>
            No exercises match "{filter}".
          </div>
        )}

        {/* Grid of cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((r) => {
            const isOpen = expanded === r.title;
            const trendUp = r.delta > 0;
            const trendFlat = r.delta === 0;
            return (
              <div key={r.title} style={{
                background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 12,
                overflow: 'hidden',
              }}>
                <button onClick={() => setExpanded(isOpen ? null : r.title)} style={{
                  width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '12px 14px', textAlign: 'left',
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: 8, marginBottom: 6,
                  }}>
                    <div style={{
                      fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx,
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={r.title}>{r.title}</div>
                    <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 0.5, flex: '0 0 auto' }}>
                      {r.sessionCount}× · {fmtDate(r.lastDate)}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    {/* PR */}
                    <div style={{ flex: '0 0 auto' }}>
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1.2, fontWeight: 700 }}>
                        PR
                      </div>
                      <div style={{ fontFamily: FN, fontSize: 18, color: C.ac, fontWeight: 700, lineHeight: 1 }}>
                        {r.allTimePR}
                        <span style={{ fontSize: 10, color: C.tm, marginLeft: 3 }}>kg</span>
                      </div>
                      {r.allTimePRReps > 0 && (
                        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 0.5 }}>
                          ×{r.allTimePRReps}
                        </div>
                      )}
                    </div>
                    {/* Sparkline */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Sparkline series={r.series} />
                    </div>
                    {/* Δ */}
                    <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1.2, fontWeight: 700 }}>
                        Δ
                      </div>
                      <div style={{
                        fontFamily: FN, fontSize: 13, fontWeight: 700, lineHeight: 1,
                        color: trendFlat ? C.tm : (trendUp ? C.gn : C.rd),
                      }}>
                        {trendUp ? '+' : ''}{r.delta} <span style={{ fontSize: 9, color: C.tm }}>kg</span>
                      </div>
                      {r.deltaPct !== 0 && (
                        <div style={{ fontFamily: FN, fontSize: 9, color: trendFlat ? C.tm : (trendUp ? C.gn : C.rd), letterSpacing: 0.5 }}>
                          {trendUp ? '+' : ''}{r.deltaPct}%
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded session-by-session breakdown */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${C.bd}`, padding: '10px 14px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 50px 50px', gap: 4, marginBottom: 6 }}>
                      {['DATE', 'TOP SET', 'REPS', 'RPE'].map(h => (
                        <div key={h} style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1, textAlign: 'center' }}>{h}</div>
                      ))}
                    </div>
                    {r.series.slice().reverse().map((s, i) => (
                      <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '1fr 70px 50px 50px', gap: 4,
                        padding: '4px 0', alignItems: 'center',
                        borderBottom: i < r.series.length - 1 ? `1px solid ${C.bd}22` : 'none',
                      }}>
                        <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, textAlign: 'center' }}>
                          {fmtDate(s.date)}
                          {s.week ? <span style={{ color: C.td, marginLeft: 4 }}>W{s.week}</span> : null}
                        </div>
                        <div style={{
                          fontFamily: FN, fontSize: 13, color: s.load === r.allTimePR ? C.ac : C.tx,
                          fontWeight: s.load === r.allTimePR ? 700 : 600, textAlign: 'center',
                        }}>
                          {s.load}<span style={{ fontSize: 10, color: C.tm }}>kg</span>
                          {s.load === r.allTimePR && (
                            <span style={{ fontFamily: FN, fontSize: 9, color: C.ac, marginLeft: 4, letterSpacing: 0.5 }}>PR</span>
                          )}
                        </div>
                        <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, textAlign: 'center' }}>{s.reps || '—'}</div>
                        <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, textAlign: 'center' }}>{s.rpe ?? '—'}</div>
                      </div>
                    ))}
                    {r.swappedAny && (
                      <div style={{
                        marginTop: 8, fontFamily: FN, fontSize: 9, color: C.td,
                        letterSpacing: 0.8, textAlign: 'center',
                      }}>
                        Some sessions came from a mid-session swap.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
