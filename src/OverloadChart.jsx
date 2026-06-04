import React, { useMemo, useState } from 'react';
import { C, FN, FB } from './theme';

// Compute top-set load per session for one exercise
// Returns array of { date, topLoad, topReps, avgRpe } sorted chronologically
// Workouts come from two sources with different field shapes:
//   • trainer in-person workouts table — ex.exerciseId, set.completed, w.status
//   • athlete portal logs (clientWorkouts) — ex.eid, set.done, no w.status
// Read both shapes so online clients (who log in their portal) aren't shown
// an empty overload section while their loads sit right there in Records.
const exKey = (e) => e.exerciseId || e.eid;
const setDone = (s) => s.completed || s.done;
function computeSessionSeries(workouts, exerciseId) {
  const series = [];
  workouts.forEach(w => {
    // No w.status gate — portal logs have no status; the in-person source is
    // already pre-filtered to completed by the caller.
    const exInstances = (w.exercises || []).filter(e => exKey(e) === exerciseId);
    if (exInstances.length === 0) return;
    // Flatten all completed sets across instances of this exercise in this session
    const sets = [];
    exInstances.forEach(ex => (ex.sets || []).forEach(s => {
      if (!setDone(s)) return;
      const load = parseFloat(s.load);
      if (!isFinite(load) || load <= 0) return;
      sets.push({ load, reps: parseFloat(s.reps) || 0, rpe: parseFloat(s.rpe) || null });
    }));
    if (sets.length === 0) return;
    // Top set = max load (ties broken by max reps)
    const top = sets.reduce((a, b) => b.load > a.load || (b.load === a.load && b.reps > a.reps) ? b : a);
    const rpes = sets.map(s => s.rpe).filter(r => r != null);
    const avgRpe = rpes.length > 0 ? rpes.reduce((a,b)=>a+b, 0) / rpes.length : null;
    series.push({
      date: w.completedAt || w.date,
      topLoad: top.load,
      topReps: top.reps,
      avgRpe,
    });
  });
  return series.sort((a,b) => new Date(a.date) - new Date(b.date));
}

// Trend is classified on the RECENT window (last top-set vs the one ~3 sessions
// back) so a lift that climbed early but has plateaued reads as a stall NOW —
// which is the thing a coach wants to catch — instead of being hidden behind a
// big all-time gain. ±2.5% is the flat band.
const FLAT_BAND = 2.5;
function recentTrend(series) {
  if (series.length < 2) return { dir: 'new', pct: 0, deltaKg: 0 };
  const last = series[series.length - 1].topLoad;
  const ref = series[Math.max(0, series.length - 3)].topLoad;
  const deltaKg = +(last - ref).toFixed(1);
  const pct = ref > 0 ? Math.round((deltaKg / ref) * 100) : 0;
  const dir = pct > FLAT_BAND ? 'up' : pct < -FLAT_BAND ? 'down' : 'flat';
  return { dir, pct, deltaKg };
}

const TREND_COLOR = { up: C.gn, down: C.rd, flat: C.tm, new: C.td };
const TREND_ARROW = { up: '↑', down: '↓', flat: '→', new: '·' };

function Sparkline({ series, width = 96, height = 28 }) {
  if (series.length < 2) return <span style={{ color: C.td, fontSize: 11, fontFamily: FN }}>—</span>;
  const loads = series.map(s => s.topLoad);
  const min = Math.min(...loads);
  const max = Math.max(...loads);
  const range = max - min || 1;
  const pad = 3;
  const W = width - pad * 2;
  const H = height - pad * 2;
  const points = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * W;
    const y = pad + H - ((s.topLoad - min) / range) * H;
    return [x, y];
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const color = TREND_COLOR[recentTrend(series).dir] || C.tm;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2.6} fill={color} />
    </svg>
  );
}

const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return ''; }
};

export default function OverloadChart({ workouts, exercises }) {
  const [query, setQuery] = useState('');
  const [trendFilter, setTrendFilter] = useState('all'); // all | up | flat | down
  const [sort, setSort] = useState({ key: 'recent', dir: -1 }); // recent|delta|load|sess|name
  const [expanded, setExpanded] = useState(null);

  // Build per-exercise aggregate
  const stats = useMemo(() => {
    const byExId = new Map();
    workouts.forEach(w => {
      (w.exercises || []).forEach(ex => {
        const exId = exKey(ex);
        if (!exId) return;
        if (!byExId.has(exId)) byExId.set(exId, ex.title || null);
        else if (!byExId.get(exId) && ex.title) byExId.set(exId, ex.title);
      });
    });
    const rows = [];
    for (const exId of byExId.keys()) {
      const series = computeSessionSeries(workouts, exId);
      if (series.length === 0) continue;
      const exMeta = exercises.find(e => e.id === exId);
      const title = exMeta?.title || byExId.get(exId) || '(unknown exercise)';
      const t = recentTrend(series);
      rows.push({
        exId, title, series,
        lastLoad: series[series.length - 1].topLoad,
        lastDate: series[series.length - 1].date,
        sessionCount: series.length,
        trend: t.dir, deltaPct: t.pct, deltaKg: t.deltaKg,
      });
    }
    return rows;
  }, [workouts, exercises]);

  const counts = useMemo(() => {
    const c = { all: stats.length, up: 0, flat: 0, down: 0 };
    stats.forEach(r => { if (c[r.trend] != null) c[r.trend]++; });
    return c;
  }, [stats]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = stats.filter(r =>
      (trendFilter === 'all' || r.trend === trendFilter) &&
      (!q || r.title.toLowerCase().includes(q))
    );
    const cmp = {
      recent: (a, b) => new Date(a.lastDate) - new Date(b.lastDate),
      delta:  (a, b) => a.deltaPct - b.deltaPct,
      load:   (a, b) => a.lastLoad - b.lastLoad,
      sess:   (a, b) => a.sessionCount - b.sessionCount,
      name:   (a, b) => a.title.localeCompare(b.title),
    }[sort.key] || (() => 0);
    arr.sort((a, b) => cmp(a, b) * sort.dir);
    return arr;
  }, [stats, query, trendFilter, sort]);

  if (stats.length === 0) {
    return (
      <div style={{ color: C.tm, fontSize: 13, padding: 20, textAlign: 'center', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
        Progressive overload tracking will appear here once this client completes workouts with logged loads.
      </div>
    );
  }

  const setSortKey = (key) => setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'name' ? 1 : -1 });
  const arrow = (key) => sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : '';

  const chip = (key, label) => {
    const on = trendFilter === key;
    const col = key === 'all' ? C.ac : TREND_COLOR[key];
    return (
      <button onClick={() => setTrendFilter(key)} style={{
        background: 'var(--c-sf)', border: `${on ? '1px' : '0.25px'} solid ${on ? col : C.cardBd}`,
        borderRadius: 0, padding: '5px 10px', color: on ? col : C.tm, cursor: 'pointer',
        fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', whiteSpace: 'nowrap',
      }}>{label} {counts[key]}</button>
    );
  };

  const th = (key, label, align = 'left') => (
    <th onClick={() => setSortKey(key)} style={{
      textAlign: align, padding: '8px 10px', cursor: 'pointer', userSelect: 'none',
      fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
      color: sort.key === key ? C.ac : C.td, whiteSpace: 'nowrap',
      borderBottom: `1px solid ${C.cardBd}`,
    }}>{label}{arrow(key)}</th>
  );

  return (
    <div>
      {/* Controls — search + trend filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍  search exercise"
          style={{ flex: '1 1 200px', minWidth: 160, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '7px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 5 }}>
          {chip('all', 'ALL')}{chip('up', '↑')}{chip('flat', '→')}{chip('down', '↓')}
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              {th('name', 'EXERCISE')}
              {th('load', 'LAST', 'right')}
              {th('delta', 'Δ RECENT', 'right')}
              <th style={{ padding: '8px 10px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.td, borderBottom: `1px solid ${C.cardBd}` }}>TREND</th>
              {th('sess', 'SESS', 'right')}
              {th('recent', 'LAST DATE', 'right')}
            </tr>
          </thead>
          <tbody>
            {view.map(row => {
              const open = expanded === row.exId;
              const tc = TREND_COLOR[row.trend];
              return (
                <React.Fragment key={row.exId}>
                  <tr onClick={() => setExpanded(open ? null : row.exId)}
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${C.cardBd}`, background: open ? 'var(--c-rowHover, transparent)' : 'transparent' }}>
                    <td style={{ padding: '9px 10px', fontSize: 13, color: C.tx, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: C.td, marginRight: 6, fontSize: 10 }}>{open ? '▾' : '▸'}</span>{row.title}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx }}>{row.lastLoad}kg</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 12, fontWeight: 700, color: tc, whiteSpace: 'nowrap' }}>
                      {TREND_ARROW[row.trend]} {row.trend === 'new' ? 'new' : `${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%`}
                    </td>
                    <td style={{ padding: '4px 10px' }}><Sparkline series={row.series} /></td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 12, color: C.tm }}>{row.sessionCount}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 11, color: C.tm, whiteSpace: 'nowrap' }}>{fmtDate(row.lastDate)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} style={{ padding: '4px 10px 12px 30px', background: 'var(--c-rowHover, transparent)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {[...row.series].reverse().map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 14, fontFamily: FN, fontSize: 12, color: C.tm, alignItems: 'baseline' }}>
                              <span style={{ width: 60, color: C.td }}>{fmtDate(s.date)}</span>
                              <span style={{ color: C.tx, fontWeight: 700 }}>{s.topLoad}kg</span>
                              <span>× {s.topReps || '—'}</span>
                              <span style={{ color: C.td }}>{s.avgRpe != null ? `RPE ${s.avgRpe.toFixed(1)}` : ''}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {view.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: C.tm, fontSize: 13 }}>No exercises match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
