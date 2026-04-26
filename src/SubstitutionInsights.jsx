// SubstitutionInsights: trainer-side widget that aggregates substitution data
// from client workouts and surfaces patterns ("Lat Pulldown swapped 3x →
// Pull-Up 2x · Cable Row 1x"). Tells the trainer which prescribed exercises
// keep getting swapped out — strong signal that a template should be revised
// (the equipment is bottlenecking, the original move doesn't fit the
// trainee's setup, etc.).
//
// Substitution data is captured in src/ClientPortal.jsx finish() at workout
// completion — see the `substitution` field on each exercise entry. This
// widget reads-only.

import React, { useMemo, useState } from 'react';
import { C, FN, FB } from './theme';

function aggregate(clientWorkouts, traineesById) {
  // Walk every workout's exercises, collect substitutions, group by `from`.
  const byFrom = new Map();
  let totalSubs = 0;
  let totalWorkouts = 0;
  for (const w of clientWorkouts || []) {
    let workoutHadSub = false;
    for (const ex of w.exercises || []) {
      const sub = ex.substitution;
      if (!sub || !sub.from) continue;
      workoutHadSub = true;
      totalSubs++;
      const key = sub.from;
      if (!byFrom.has(key)) byFrom.set(key, { from: key, total: 0, alternates: new Map(), trainees: new Set() });
      const entry = byFrom.get(key);
      entry.total++;
      entry.trainees.add(w.clientId || 'unknown');
      const altKey = sub.to || '?';
      entry.alternates.set(altKey, (entry.alternates.get(altKey) || 0) + 1);
    }
    if (workoutHadSub) totalWorkouts++;
  }
  // Sort: most-substituted first.
  const rows = Array.from(byFrom.values()).map(r => ({
    from: r.from,
    total: r.total,
    traineeCount: r.trainees.size,
    alternates: Array.from(r.alternates.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([title, n]) => ({ title, n })),
  })).sort((a, b) => b.total - a.total);
  return { rows, totalSubs, totalWorkouts };
}

export default function SubstitutionInsights({ clientWorkouts, trainees }) {
  const [expanded, setExpanded] = useState(false);
  const traineesById = useMemo(() => {
    const m = new Map();
    for (const t of trainees || []) m.set(t.id, t);
    return m;
  }, [trainees]);
  const { rows, totalSubs, totalWorkouts } = useMemo(
    () => aggregate(clientWorkouts || [], traineesById),
    [clientWorkouts, traineesById],
  );

  // Empty state — keep it short, tucked at the top so it doesn't dominate.
  if (rows.length === 0) {
    return (
      <div style={{
        background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 10,
        padding: '10px 14px', marginBottom: 14,
        fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 0.8,
        textAlign: 'center',
      }}>
        ⇄ NO SUBSTITUTIONS LOGGED YET — trainees on template plans can swap exercises mid-session.
      </div>
    );
  }

  const top3 = rows.slice(0, 3);
  const more = rows.length - top3.length;

  return (
    <div style={{
      background: C.sf, border: `1px solid ${C.ac}40`, borderRadius: 12,
      padding: 12, marginBottom: 14,
    }}>
      {/* Header: stats + expand/collapse */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <div style={{
          fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1.5, fontWeight: 700,
        }}>
          ⇄ SUBSTITUTION INSIGHTS · {totalSubs} swap{totalSubs === 1 ? '' : 's'} in {totalWorkouts} workout{totalWorkouts === 1 ? '' : 's'}
        </div>
        <div style={{ color: C.td, fontSize: 11 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Summary line — always visible, top swap */}
      {!expanded && top3[0] && (
        <div style={{
          marginTop: 8, fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5,
          textAlign: 'center',
        }}>
          Most-swapped: <span style={{ color: C.tx, fontWeight: 700 }}>{top3[0].from}</span>
          {' '}({top3[0].total}×){' → '}
          <span style={{ color: C.ac }}>{top3[0].alternates[0]?.title || '?'}</span>
          {top3[0].alternates.length > 1 && <span style={{ color: C.td, fontSize: 11 }}> +{top3[0].alternates.length - 1} other{top3[0].alternates.length - 1 === 1 ? '' : 's'}</span>}
          {more > 0 && <span style={{ color: C.td, fontSize: 11, marginLeft: 8 }}>· tap for {more} more</span>}
        </div>
      )}

      {/* Expanded: full list */}
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {rows.map((r, i) => (
            <div key={r.from} style={{
              padding: '10px 0',
              borderTop: i > 0 ? `1px solid ${C.bd}` : 'none',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                gap: 8, marginBottom: 4,
              }}>
                <div style={{
                  fontFamily: FB, fontSize: 13, fontWeight: 700, color: C.tx, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={r.from}>{r.from}</div>
                <div style={{
                  fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1, fontWeight: 700, flex: '0 0 auto',
                }}>{r.total}× · {r.traineeCount} trainee{r.traineeCount === 1 ? '' : 's'}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {r.alternates.map((a) => (
                  <span key={a.title} style={{
                    background: C.acD, border: `1px solid ${C.ac}30`, borderRadius: 999,
                    padding: '2px 8px', fontFamily: FN, fontSize: 10, color: C.ac,
                    letterSpacing: 0.5, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 220,
                  }} title={a.title}>
                    → {a.title} ({a.n})
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div style={{
            marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.bd}`,
            fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 0.8,
            textAlign: 'center', lineHeight: 1.6,
          }}>
            Substitutions are recorded when trainees on template plans swap an exercise mid-session. Repeat swaps on the same prescribed exercise are a strong signal that the template should be revised.
          </div>
        </div>
      )}
    </div>
  );
}
