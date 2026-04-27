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
  // Group by stable id — eid for the prescribed exercise, or the swap-in's
  // library id when this session was a swap. Falls back to title only when
  // no id is available (very old workouts, or library-less swap entries).
  // Title is just for display; id drives bucketing.
  const byKey = new Map();
  for (const w of clientWorkouts || []) {
    if (traineeId && w.clientId !== traineeId) continue;
    for (const ex of w.exercises || []) {
      const top = topSetOfWorkoutEx(ex);
      if (!top) continue;
      const wasSwapped = !!ex.substitution;
      const performedTitle = wasSwapped
        ? (ex.substitution.to || ex.title || '?')
        : (ex.title || EX[ex.eid]?.t || '?');
      const stableId = wasSwapped
        ? (ex.substitution.toLibId || `swap:${performedTitle.toLowerCase()}`)
        : (ex.eid || `title:${performedTitle.toLowerCase()}`);
      if (!byKey.has(stableId)) {
        byKey.set(stableId, { id: stableId, title: performedTitle, series: [], swappedFromAny: false });
      }
      const entry = byKey.get(stableId);
      // Update the display title with the most-recent variant — but never
      // downgrade a real title to the '?' placeholder if a later workout
      // happens to have lost its title metadata.
      if (performedTitle !== '?') entry.title = performedTitle;
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
    // Group sessions by planName ("block"). The "current" block is the one
    // containing the most recent session; "previous" is whichever block ran
    // immediately before that. Used by the compare-blocks toggle.
    const blockMap = new Map();
    for (const s of entry.series) {
      const k = s.planName || '?';
      if (!blockMap.has(k)) blockMap.set(k, []);
      blockMap.get(k).push(s);
    }
    const blocks = [...blockMap.entries()].map(([name, list]) => ({
      name,
      list,
      lastDate: list[list.length - 1].date,
    })).sort((a, b) => new Date(a.lastDate) - new Date(b.lastDate));
    const currentBlock = blocks[blocks.length - 1] || null;
    const previousBlock = blocks.length >= 2 ? blocks[blocks.length - 2] : null;
    rows.push({
      id: entry.id,
      title: entry.title,
      series: entry.series,
      sessionCount: entry.series.length,
      allTimePR,
      allTimePRDate: allTimePREntry?.date,
      allTimePRReps: allTimePREntry?.reps ?? null,
      firstLoad, lastLoad, delta, deltaPct,
      lastDate: entry.series[entry.series.length - 1].date,
      swappedAny: entry.swappedFromAny,
      currentBlock, previousBlock,
    });
  }
  // Sort: most-recently-trained first.
  rows.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
  return rows;
}

// Inline SVG sparkline — full-width, scales to its container via viewBox.
// Trend colour: green if last session ≥ first, red if down. PR session
// (max load across the series) gets a highlighted dot.
//
// Two-series mode (`overlay` prop): renders the primary series in C.ac and
// an overlay series in C.tm (dashed). Both share the same y-axis so the
// reader can eyeball block-vs-block delta. Used by the compare-blocks toggle.
function Sparkline({ series, overlay, height = 64, overlayUid }) {
  if (!series || series.length === 0) return null;
  const VW = 200; // virtual width used for viewBox; scales to 100% via CSS
  const VH = height;
  if (series.length === 1 && !overlay) {
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height }}>
        <circle cx={VW / 2} cy={VH / 2} r="4" fill={C.ac} />
      </svg>
    );
  }
  const allLoads = [...series.map(s => s.load), ...(overlay ? overlay.map(s => s.load) : [])];
  const min = Math.min(...allLoads);
  const max = Math.max(...allLoads);
  const range = max - min || 1;
  const pad = 8;
  const W = VW - pad * 2;
  const H = VH - pad * 2;
  const buildPoints = (s) => s.map((p, i) => {
    const x = pad + (s.length === 1 ? W / 2 : (i / (s.length - 1)) * W);
    const y = pad + H - ((p.load - min) / range) * H;
    return [x, y, p.load];
  });
  const buildPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const points = buildPoints(series);
  const path = buildPath(points);
  const trendColor = series[series.length - 1].load >= series[0].load ? C.gn : C.rd;
  const primaryColor = overlay ? C.ac : trendColor;
  const areaPath = `${path} L ${points[points.length - 1][0].toFixed(1)},${(VH - 1).toFixed(1)} L ${points[0][0].toFixed(1)},${(VH - 1).toFixed(1)} Z`;
  const overlayPoints = overlay && overlay.length ? buildPoints(overlay) : null;
  const overlayPath = overlayPoints ? buildPath(overlayPoints) : null;
  const prValue = Math.max(...series.map(s => s.load));
  const gradId = `fv-pr-fill-${overlayUid || 'x'}`;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={primaryColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* Overlay first so it sits behind the current-block line */}
      {overlayPath && (
        <>
          <path d={overlayPath} stroke={C.tm} strokeWidth="1.2" vectorEffect="non-scaling-stroke" fill="none" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          {overlayPoints.map((p, i) => (
            <circle key={`ov-${i}`} cx={p[0]} cy={p[1]} r="1.8" fill={C.tm} opacity="0.7" />
          ))}
        </>
      )}
      <path d={path} stroke={primaryColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        const isPr = !overlay && p[2] === prValue;
        return (
          <circle key={i} cx={p[0]} cy={p[1]}
            r={isLast ? 4 : (isPr ? 3 : 2)}
            fill={isLast ? primaryColor : (isPr ? C.ac : C.tm)} />
        );
      })}
    </svg>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function TraineePRsView({ clientWorkouts, traineeId, header, embedded = false, sortMode: extSortMode }) {
  const [expanded, setExpanded] = useState(null); // exercise title
  const rows = useMemo(() => aggregate(clientWorkouts, traineeId), [clientWorkouts, traineeId]);
  const [filter, setFilter] = useState('');
  const [compareBlocks, setCompareBlocks] = useState(false);
  // Sort mode: 'recent' = most recently trained (default), 'jump' = biggest
  // delta from first → last load. Trainer Records tab can override via prop;
  // trainee portal still defaults to 'recent'.
  const [internalSortMode, setInternalSortMode] = useState(extSortMode || 'recent');
  const sortMode = extSortMode || internalSortMode;
  const filtered = useMemo(() => {
    const s = filter.trim().toLowerCase();
    let r = rows;
    if (s) r = r.filter(x => x.title.toLowerCase().includes(s));
    if (sortMode === 'jump') {
      r = [...r].sort((a, b) => (b.delta || 0) - (a.delta || 0));
    }
    return r;
  }, [rows, filter, sortMode]);
  // Only worth showing the toggle if there's actually >1 block of history.
  const anyHasTwoBlocks = rows.some(r => r.previousBlock);

  const wrapStyle = embedded
    ? { color: C.tx, fontFamily: FB }
    : { background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, maxWidth: 500, margin: '0 auto' };
  const innerStyle = embedded ? { padding: 0 } : { padding: 20 };

  return (
    <div style={wrapStyle}>
      {header}
      <div style={innerStyle}>
        {!embedded && (
          <>
            <h2 style={{ fontFamily: FN, fontSize: 18, margin: '0 0 4px', textAlign: 'center' }}>Records</h2>
            <div style={{ color: C.tm, fontSize: 12, marginBottom: 14, textAlign: 'center' }}>
              Top set per session, by exercise.
            </div>
          </>
        )}

        {rows.length > 5 && (
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search exercise…"
            style={{
              width: '100%', background: C.sf2, border: `0.25px solid ${C.ac}4D`,
              borderRadius: 8, padding: '10px 12px', color: C.tx, fontFamily: FB, fontSize: 14,
              outline: 'none', boxSizing: 'border-box', marginBottom: 14, textAlign: 'center',
            }} />
        )}

        {anyHasTwoBlocks && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <button onClick={() => setCompareBlocks(v => !v)}
              style={{
                background: compareBlocks ? C.acD : 'transparent',
                border: `1px solid ${compareBlocks ? C.ac : C.bd}`,
                color: compareBlocks ? C.ac : C.tm,
                borderRadius: 999, padding: '6px 14px', fontFamily: FN, fontSize: 10,
                fontWeight: 700, letterSpacing: 1.4, cursor: 'pointer',
              }}>
              {compareBlocks ? '✓ COMPARING BLOCKS' : 'COMPARE BLOCKS'}
            </button>
          </div>
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
            const isOpen = expanded === r.id;
            const trendUp = r.delta > 0;
            const trendFlat = r.delta === 0;
            return (
              <div key={r.id} style={{
                background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 12,
                overflow: 'hidden',
              }}>
                <button onClick={() => setExpanded(isOpen ? null : r.id)} aria-expanded={isOpen} style={{
                  width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '14px 14px 12px', textAlign: 'center',
                }}>
                  {/* Title — centered, single line */}
                  <div style={{
                    fontFamily: FB, fontSize: 15, fontWeight: 700, color: C.tx,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={r.title}>{r.title}</div>

                  {/* Sub: PR — single typographic line, all same size */}
                  <div style={{
                    fontFamily: FN, fontSize: 22, fontWeight: 700, color: C.ac,
                    marginTop: 6, lineHeight: 1, letterSpacing: -0.5,
                  }}>
                    {r.allTimePR}<span style={{ fontSize: 13, color: C.tm, fontWeight: 400, marginLeft: 4 }}>kg</span>
                    {r.allTimePRReps > 0 && (
                      <span style={{ fontSize: 13, color: C.tm, fontWeight: 400, marginLeft: 6 }}>× {r.allTimePRReps}</span>
                    )}
                    <span style={{ fontSize: 9, color: C.td, letterSpacing: 2, fontWeight: 700, marginLeft: 8, verticalAlign: 'middle' }}>PR</span>
                  </div>

                  {/* Full-width sparkline below — guaranteed visible.
                      In compareBlocks mode we render the current block as
                      the primary line and overlay the previous block dashed
                      behind it, sharing the same y-axis. */}
                  <div style={{ marginTop: 10 }}>
                    {compareBlocks && r.previousBlock ? (
                      <Sparkline
                        series={r.currentBlock.list}
                        overlay={r.previousBlock.list}
                        overlayUid={`${r.id}-cmp`}
                      />
                    ) : (
                      <Sparkline series={r.series} overlayUid={r.id} />
                    )}
                  </div>
                  {compareBlocks && r.previousBlock && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 6, fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1 }}>
                      <span><span style={{ display: 'inline-block', width: 10, height: 2, background: C.ac, marginRight: 4, verticalAlign: 'middle' }} />{r.currentBlock.name}</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 2, background: C.tm, marginRight: 4, verticalAlign: 'middle', borderTop: `1px dashed ${C.tm}` }} />{r.previousBlock.name}</span>
                    </div>
                  )}

                  {/* Bottom stats row — three equal items, justify-around for symmetry */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
                    marginTop: 8, gap: 8,
                  }}>
                    <div>
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1.2, fontWeight: 700 }}>SESSIONS</div>
                      <div style={{ fontFamily: FN, fontSize: 13, color: C.tx, fontWeight: 700, marginTop: 2 }}>{r.sessionCount}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1.2, fontWeight: 700 }}>Δ FROM FIRST</div>
                      <div style={{
                        fontFamily: FN, fontSize: 13, fontWeight: 700, marginTop: 2,
                        color: trendFlat ? C.tm : (trendUp ? C.gn : C.rd),
                      }}>
                        {trendFlat ? '—' : `${trendUp ? '+' : ''}${r.delta} kg`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1.2, fontWeight: 700 }}>LAST</div>
                      <div style={{ fontFamily: FN, fontSize: 13, color: C.tx, fontWeight: 700, marginTop: 2 }}>{fmtDate(r.lastDate)}</div>
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
