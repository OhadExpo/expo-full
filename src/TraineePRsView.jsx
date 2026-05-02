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

import React, { useMemo, useState, useRef, useEffect } from 'react';
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

// Picker-style Records view: athlete or coach picks a logged exercise from
// a dropdown, sees the all-time PR (heaviest weight × reps achieved at that
// weight) front-and-center, then a per-session history beneath it. The
// dropdown only contains exercises this athlete has actually logged with a
// numeric load — empty list ⇒ empty state, not a stub.
export default function TraineePRsView({ clientWorkouts, traineeId, header, embedded = false }) {
  const rows = useMemo(() => aggregate(clientWorkouts, traineeId), [clientWorkouts, traineeId]);
  const options = useMemo(() => rows.slice().sort((a, b) => a.title.localeCompare(b.title)), [rows]);
  const [pickedId, setPickedId] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  // Auto-select first option when rows arrive (or after data refresh swaps
  // the option list) so the visitor lands on a real PR card immediately.
  useMemo(() => {
    if (options.length === 0) { if (pickedId) setPickedId(null); return; }
    if (!pickedId || !options.some(o => o.id === pickedId)) {
      setPickedId(options[0].id);
    }
  }, [options]);
  const picked = options.find(o => o.id === pickedId);
  // Substring filter — case-insensitive, matches anywhere in title.
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(o => o.title.toLowerCase().includes(q)) : options;
  // Close picker on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  // Reset highlight when filtered list changes so we never point past the end.
  useEffect(() => { setHighlight(0); }, [q, open]);
  const choose = (id) => {
    setPickedId(id); setOpen(false); setQuery('');
  };

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
              Pick an exercise — see the heaviest weight you've lifted on it and how many reps you hit at that weight.
            </div>
          </>
        )}

        {rows.length === 0 ? (
          <div style={{ background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 12, padding: 30, textAlign: 'center' }}>
            <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 1.5, marginBottom: 8 }}>NO RECORDS YET</div>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
              Log a few sessions with weights and your records will show up here.
            </div>
          </div>
        ) : (
          <>
            {/* Exercise picker — search-as-you-type combobox over only the
                exercises this athlete has logged a top set for. */}
            <div ref={wrapRef} style={{ marginBottom: 14, position: 'relative' }}>
              <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>EXERCISE</div>
              <input
                value={open ? query : (picked ? `${picked.title} (${picked.sessionCount} session${picked.sessionCount === 1 ? '' : 's'})` : '')}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => { setOpen(true); setQuery(''); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
                  else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) choose(filtered[highlight].id); }
                  else if (e.key === 'Escape') { setOpen(false); setQuery(''); e.target.blur(); }
                }}
                placeholder="Search an exercise…"
                style={{
                  width: '100%', background: C.sf,
                  border: `0.25px solid ${open ? C.ac : `${C.ac}4D`}`,
                  borderRadius: 8, padding: '12px 14px', color: C.tx,
                  fontFamily: FB, fontSize: 15, fontWeight: 600,
                  outline: 'none', boxSizing: 'border-box', cursor: 'text',
                }}
              />
              {open && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 8,
                  maxHeight: 280, overflowY: 'auto', zIndex: 20,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
                }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '12px 14px', color: C.td, fontSize: 13, textAlign: 'center' }}>
                      No matches — try a different word.
                    </div>
                  ) : filtered.map((o, i) => (
                    <div key={o.id}
                      onMouseDown={e => { e.preventDefault(); choose(o.id); }}
                      onMouseEnter={() => setHighlight(i)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer',
                        background: i === highlight ? `${C.ac}18` : (o.id === pickedId ? `${C.ac}0a` : 'transparent'),
                        borderBottom: i < filtered.length - 1 ? `1px solid ${C.bd}22` : 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                      }}>
                      <span style={{ color: C.tx, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</span>
                      <span style={{ fontFamily: FN, color: C.td, fontSize: 10, flexShrink: 0 }}>
                        {o.sessionCount} session{o.sessionCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {picked && (
              <>
                {/* PR hero card */}
                <div style={{
                  background: C.sf, border: `0.25px solid ${C.ac}`, borderRadius: 12,
                  padding: '20px 18px', textAlign: 'center', marginBottom: 14,
                  boxShadow: `0 0 0 1px ${C.ac}26`,
                }}>
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>ALL-TIME PR</div>
                  <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 36, color: C.ac, letterSpacing: -0.5, lineHeight: 1 }}>
                    {picked.allTimePR}<span style={{ fontSize: 18, color: C.tm, fontWeight: 400, marginLeft: 4 }}>kg</span>
                    {picked.allTimePRReps > 0 && (
                      <span style={{ fontSize: 18, color: C.tm, fontWeight: 400, marginLeft: 8 }}>× {picked.allTimePRReps}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 700, marginTop: 10 }}>
                    {fmtDate(picked.allTimePRDate)}
                  </div>
                  {picked.swappedAny && (
                    <div style={{ marginTop: 10, fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 0.8 }}>
                      Includes sessions from mid-session swaps.
                    </div>
                  )}
                </div>

                {/* Session history */}
                <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>
                  SESSION HISTORY · {picked.sessionCount} ENTR{picked.sessionCount === 1 ? 'Y' : 'IES'}
                </div>
                <div style={{ background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px 60px', padding: '8px 12px', borderBottom: `1px solid ${C.bd}` }}>
                    {['DATE', 'WEIGHT', 'REPS', 'RPE'].map(h => (
                      <div key={h} style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1, textAlign: 'center', fontWeight: 700 }}>{h}</div>
                    ))}
                  </div>
                  {picked.series.slice().reverse().map((s, i, arr) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr 80px 60px 60px',
                      padding: '8px 12px', alignItems: 'center',
                      borderBottom: i < arr.length - 1 ? `1px solid ${C.bd}22` : 'none',
                      background: s.load === picked.allTimePR ? `${C.ac}10` : 'transparent',
                    }}>
                      <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, textAlign: 'center' }}>
                        {fmtDate(s.date)}
                        {s.week ? <span style={{ color: C.td, marginLeft: 4 }}>W{s.week}</span> : null}
                      </div>
                      <div style={{
                        fontFamily: FN, fontSize: 13, color: s.load === picked.allTimePR ? C.ac : C.tx,
                        fontWeight: s.load === picked.allTimePR ? 700 : 600, textAlign: 'center',
                      }}>
                        {s.load}<span style={{ fontSize: 10, color: C.tm, marginLeft: 1 }}>kg</span>
                        {s.load === picked.allTimePR && (
                          <span style={{ fontFamily: FN, fontSize: 9, color: C.ac, marginLeft: 4, letterSpacing: 0.5, fontWeight: 700 }}>PR</span>
                        )}
                      </div>
                      <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, textAlign: 'center' }}>{s.reps || '—'}</div>
                      <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, textAlign: 'center' }}>{s.rpe ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
