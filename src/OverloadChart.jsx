import React, { useMemo, useState } from 'react';
import { C, FN, FB } from './theme';

// Progressive Overload — one searchable/sortable table of every lift the
// athlete has logged loads on. Each row collapses to a one-line trend summary;
// clicking it expands the lift's full story (all-time PR · trend chart · stats ·
// session history with PR badges) — the merged "Records" deep-dive.
//
// Workouts come from two sources with different field shapes:
//   • trainer in-person workouts table — ex.exerciseId, set.completed, w.status
//   • athlete portal logs (clientWorkouts) — ex.eid, set.done, no w.status
// Read both so online clients (who log in their portal) and in-person athletes
// share one progression view.
const exKey = (e) => e.exerciseId || e.eid;
const setDone = (s) => s.completed || s.done;
function computeSessionSeries(workouts, exerciseId) {
  const series = [];
  workouts.forEach(w => {
    const exInstances = (w.exercises || []).filter(e => exKey(e) === exerciseId);
    if (exInstances.length === 0) return;
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
    const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
    series.push({
      date: w.completedAt || w.date,
      topLoad: top.load,
      topReps: top.reps,
      avgRpe,
      planName: w.planName || null, // block context (portal logs carry it)
      week: w.week ?? null,
    });
  });
  return series.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Trend is classified on the RECENT window (last top-set vs the one ~3 sessions
// back) so a lift that climbed early but has plateaued reads as a stall NOW —
// which is the thing a coach wants to catch. ±2.5% is the flat band.
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

const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  catch { return ''; }
};
const blockAbbrev = (name) => {
  if (!name) return '';
  const m = name.match(/#(\d+)/);
  return m ? 'B' + m[1] : name.slice(0, 6);
};

// Compact area trend chart for the expanded detail. Plots each session's
// top-set load; PR session dot highlighted, trend-coloured line + fill.
function TrendChart({ series }) {
  if (series.length < 2) return null;
  // Proportions matched to the Bodyweight chart (800×128 rendered at 128px) so
  // the non-uniform stretch is mild and the point dots stay round, not blobs.
  const VW = 800, VH = 128, pad = 12;
  const loads = series.map(s => s.topLoad);
  const min = Math.min(...loads), max = Math.max(...loads);
  const range = max - min || 1;
  const prVal = max;
  const W = VW - pad * 2, H = VH - pad * 2;
  const pts = series.map((s, i) => [
    pad + (i / (series.length - 1)) * W,
    pad + H - ((s.topLoad - min) / range) * H,
    s.topLoad,
  ]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)},${VH - 1} L ${pts[0][0].toFixed(1)},${VH - 1} Z`;
  const dir = recentTrend(series).dir;
  const color = TREND_COLOR[dir] || C.ac;
  const gid = `ovl-fill`;
  // A flat/stale lift (no real progression) or a 2-session lift is a near-flat
  // line — don't spend 128px of vertical space on it (Ohad). Shrink to a compact
  // strip; a genuinely climbing/dropping lift keeps the full-height chart.
  const chartH = (dir === 'flat' || series.length < 3) ? 46 : 128;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: chartH }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* One dot per session, styled exactly like the Bodyweight chart: r=3 with
          a background-colour ring so each point reads as a crisp dot (Ohad). */}
      {pts.map((p, i) => {
        const isPr = p[2] === prVal;
        return <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={isPr ? C.ac : color} stroke={C.bg} strokeWidth="1.5" />;
      })}
    </svg>
  );
}

function StatInline({ label, value, color }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <span style={{ fontFamily: FN, fontSize: 8, color: C.tm, letterSpacing: '0.14em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, color: color || C.tx }}>{value}</span>
    </span>
  );
}

// The expanded lift detail — all-time PR + trend chart + stats + session
// history, styled to match the table (FN labels, hairline rules, PR chips).
function LiftDetail({ row }) {
  const allDelta = +(row.lastLoad - row.series[0].topLoad).toFixed(1);
  return (
    <div style={{ padding: '14px 16px 18px 30px' }}>
      {/* PR + inline stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px', alignItems: 'flex-end', marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: FN, fontSize: 8, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 2 }}>ALL-TIME PR</span>
          <span style={{ fontFamily: FB, fontSize: 22, fontWeight: 800, color: C.ac, lineHeight: 1 }}>
            {row.allTimePR}
            <span style={{ fontSize: 12, color: C.tm, fontWeight: 400, marginLeft: 4 }}>kg{row.allTimePRReps ? ` × ${row.allTimePRReps}` : ''}</span>
            <span style={{ fontSize: 11, color: C.tm, fontWeight: 400, marginLeft: 10, fontFamily: FN }}>{fmtDate(row.allTimePRDate)}</span>
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <StatInline label="LATEST" value={`${row.lastLoad}kg`} />
        <StatInline label="Δ ALL-TIME" value={`${allDelta > 0 ? '+' : ''}${allDelta}kg`} color={allDelta >= 0 ? C.gn : C.rd} />
        <StatInline label="SESSIONS" value={row.sessionCount} />
      </div>
      <TrendChart series={row.series} />
      {/* Session history — newest first, PR row badged */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: FN, fontSize: 8, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>SESSION HISTORY</div>
        {[...row.series].reverse().map((s, i) => {
          const isPR = s.topLoad === row.allTimePR;
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '70px 70px 1fr auto', gap: 12, alignItems: 'center',
              padding: '6px 0', fontFamily: FN, fontSize: 12,
              borderTop: i > 0 ? `1px solid ${C.cardBd}` : 'none',
            }}>
              <span style={{ color: C.td }}>{fmtDate(s.date)}</span>
              <span style={{ color: C.tm, fontSize: 10 }}>{s.planName ? `${blockAbbrev(s.planName)}${s.week ? `·W${s.week}` : ''}` : ''}</span>
              <span style={{ color: C.tx, fontWeight: 700 }}>{s.topLoad}kg <span style={{ color: C.tm, fontWeight: 400 }}>× {s.topReps || '—'}</span></span>
              <span style={{ textAlign: 'right', color: C.td, whiteSpace: 'nowrap' }}>
                {s.avgRpe != null ? `RPE ${s.avgRpe.toFixed(1)}` : ''}
                {isPR && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, marginLeft: 8, fontSize: 9, color: C.ac, border: `1px solid ${C.ac}`, padding: '2px 5px', fontWeight: 700, letterSpacing: '0.08em' }}>PR</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OverloadChart({ workouts, exercises }) {
  const [query, setQuery] = useState('');
  const [trendFilter, setTrendFilter] = useState('all'); // all | up | flat | down
  const [sort, setSort] = useState({ key: 'recent', dir: -1 }); // recent|delta|load|sess|name
  const [expanded, setExpanded] = useState(null);

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
      const allTimePR = Math.max(...series.map(s => s.topLoad));
      const prEntry = series.find(s => s.topLoad === allTimePR);
      rows.push({
        exId, title, series,
        lastLoad: series[series.length - 1].topLoad,
        lastDate: series[series.length - 1].date,
        sessionCount: series.length,
        trend: t.dir, deltaPct: t.pct, deltaKg: t.deltaKg,
        allTimePR, allTimePRReps: prEntry?.topReps ?? null, allTimePRDate: prEntry?.date,
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
        // Same box height as the search input in the same row (Ohad: "search box
        // must not be bigger than the ALL box"). height + border-box → exactly equal.
        borderRadius: 0, height: 30, boxSizing: 'border-box', padding: '0 10px', color: on ? col : C.tm, cursor: 'pointer',
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="search exercise"
          style={{ flex: '1 1 200px', minWidth: 160, height: 30, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 5 }}>
          {chip('all', 'ALL')}{chip('up', '↑')}{chip('flat', '→')}{chip('down', '↓')}
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              {th('name', 'EXERCISE')}
              {th('load', 'LAST', 'right')}
              {th('delta', 'Δ RECENT', 'right')}
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
                      <span style={{ color: open ? C.ac : C.td, marginRight: 6, fontSize: 10 }}>{open ? '▾' : '▸'}</span>{row.title}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx }}>{row.lastLoad}kg</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 12, fontWeight: 700, color: tc, whiteSpace: 'nowrap' }}>
                      {TREND_ARROW[row.trend]} {row.trend === 'new' ? 'new' : `${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%`}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 12, color: C.tm }}>{row.sessionCount}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: FN, fontSize: 11, color: C.tm, whiteSpace: 'nowrap' }}>{fmtDate(row.lastDate)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0, background: 'var(--c-rowHover, transparent)', borderBottom: `1px solid ${C.cardBd}` }}>
                        <LiftDetail row={row} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {view.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: C.tm, fontSize: 13 }}>No exercises match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
