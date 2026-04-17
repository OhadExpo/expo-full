import React, { useMemo, useState } from 'react';
import { C, FN, FB } from './theme';

// Compute top-set load per session for one exercise
// Returns array of { date, topLoad, topReps, avgRpe } sorted chronologically
function computeSessionSeries(workouts, exerciseId) {
  const series = [];
  workouts.forEach(w => {
    if (w.status !== 'completed') return;
    const exInstances = (w.exercises || []).filter(e => e.exerciseId === exerciseId);
    if (exInstances.length === 0) return;
    // Flatten all completed sets across instances of this exercise in this session
    const sets = [];
    exInstances.forEach(ex => (ex.sets || []).forEach(s => {
      if (!s.completed) return;
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

function Sparkline({ series, width = 200, height = 48 }) {
  if (series.length < 2) return null;
  const loads = series.map(s => s.topLoad);
  const min = Math.min(...loads);
  const max = Math.max(...loads);
  const range = max - min || 1;
  const pad = 4;
  const W = width - pad * 2;
  const H = height - pad * 2;
  const points = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * W;
    const y = pad + H - ((s.topLoad - min) / range) * H;
    return [x, y];
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const lastColor = series[series.length - 1].topLoad >= series[0].topLoad ? C.gn : C.rd;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={path} stroke={lastColor} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === points.length - 1 ? 3 : 1.8} fill={i === points.length - 1 ? lastColor : C.tm} />
      ))}
    </svg>
  );
}

export default function OverloadChart({ workouts, exercises }) {
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'progress'

  // Build per-exercise aggregate
  const exerciseStats = useMemo(() => {
    const byExId = new Map();
    workouts.forEach(w => {
      if (w.status !== 'completed') return;
      (w.exercises || []).forEach(ex => {
        if (!ex.exerciseId) return;
        if (!byExId.has(ex.exerciseId)) byExId.set(ex.exerciseId, true);
      });
    });
    const rows = [];
    for (const exId of byExId.keys()) {
      const series = computeSessionSeries(workouts, exId);
      if (series.length === 0) continue;
      const exMeta = exercises.find(e => e.id === exId);
      const title = exMeta?.title || '(unknown exercise)';
      const firstLoad = series[0].topLoad;
      const lastLoad = series[series.length - 1].topLoad;
      const deltaTotal = lastLoad - firstLoad;
      const deltaPct = firstLoad > 0 ? Math.round((deltaTotal / firstLoad) * 100) : 0;
      const lastDate = series[series.length - 1].date;
      rows.push({ exId, title, series, firstLoad, lastLoad, deltaTotal, deltaPct, lastDate, sessionCount: series.length });
    }
    return rows;
  }, [workouts, exercises]);

  const sorted = useMemo(() => {
    const arr = [...exerciseStats];
    if (sortBy === 'recent') arr.sort((a,b) => new Date(b.lastDate) - new Date(a.lastDate));
    else arr.sort((a,b) => b.deltaPct - a.deltaPct);
    return arr;
  }, [exerciseStats, sortBy]);

  if (exerciseStats.length === 0) {
    return (
      <div style={{ color: C.td, fontSize: 13, padding: 20, textAlign: 'center', background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10 }}>
        Progressive overload tracking will appear here once this client completes workouts with logged loads.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setSortBy('recent')} style={{ background: sortBy === 'recent' ? C.acD : C.sf2, border: `1px solid ${sortBy === 'recent' ? C.ac + '60' : C.bd}`, borderRadius: 6, padding: '4px 10px', color: sortBy === 'recent' ? C.ac : C.tm, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 600 }}>↕ RECENT</button>
        <button onClick={() => setSortBy('progress')} style={{ background: sortBy === 'progress' ? C.acD : C.sf2, border: `1px solid ${sortBy === 'progress' ? C.ac + '60' : C.bd}`, borderRadius: 6, padding: '4px 10px', color: sortBy === 'progress' ? C.ac : C.tm, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 600 }}>↕ PROGRESS</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
        {sorted.map(row => {
          const deltaColor = row.deltaTotal > 0 ? C.gn : row.deltaTotal < 0 ? C.rd : C.td;
          const deltaSign = row.deltaTotal > 0 ? '+' : '';
          return (
            <div key={row.exId} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.tx, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</div>
                  <div style={{ fontSize: 11, color: C.td, marginTop: 2, fontFamily: FN }}>{row.sessionCount} session{row.sessionCount === 1 ? '' : 's'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontFamily: FN, fontWeight: 700, color: C.tx }}>{row.lastLoad}kg</div>
                  <div style={{ fontSize: 10, fontFamily: FN, color: deltaColor }}>{deltaSign}{row.deltaTotal}kg ({deltaSign}{row.deltaPct}%)</div>
                </div>
              </div>
              <Sparkline series={row.series} width={300} height={48} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
