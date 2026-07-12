// Check-in (readiness) trends graph — PAIN / SLEEP / ENERGY plotted over the
// athlete's logged sessions, one metric at a time. Extracted from the athlete
// portal's trends view so the coach's trainee page shows the IDENTICAL graph
// (Ohad: "graphs like we have on the athlete portal"). Reads the shared
// ReadinessRow helpers so quality (0..3, 3 = best) and severity colours match
// the per-session rows exactly.
//
// Props:
//   workouts — array of rows carrying { autoregulation, date, week }. Rows
//              without readiness are ignored. Coach-logged rows (no check-in)
//              simply don't appear.
import React, { useState } from 'react';
import { C, FN } from './theme';
import { CHECKIN_METRICS, checkinQuality, readinessColor, hasReadiness } from './ReadinessRow';

export default function CheckinTrends({ workouts = [] }) {
  // Default to a metric that actually has data, so the graph never opens on an
  // empty state when the athlete logged e.g. SLEEP/ENERGY but never PAIN
  // (the section is shown whenever ANY metric has data). Prefer a metric with a
  // plottable trend (>=2 points), then any-data, then PAIN.
  const [chkMetric, setChkMetric] = useState(() => {
    const withData = (min) => CHECKIN_METRICS.find(m =>
      (workouts || []).filter(w => checkinQuality(m.key, w.autoregulation?.[m.key]) != null).length >= min);
    return (withData(2) || withData(1) || CHECKIN_METRICS[0]).key;
  });
  const metric = CHECKIN_METRICS.find(m => m.key === chkMetric) || CHECKIN_METRICS[0];

  // X axis = every check-in session, oldest → newest, so all three metric
  // graphs span the same width even if one metric was skipped on some day.
  const sessions = (workouts || [])
    .filter(w => hasReadiness(w.autoregulation))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const chkData = sessions.map((w, i) => ({
    i, date: w.date, week: w.week,
    q: checkinQuality(metric.key, w.autoregulation?.[metric.key]),
    raw: w.autoregulation?.[metric.key],
  }));
  const valid = chkData.filter(d => d.q != null);
  const W = Math.max(sessions.length * 60, 300);
  const yOf = q => 10 + ((3 - q) / 3) * 130; // q=3 (best) at top
  const first = valid[0], last = valid[valid.length - 1];
  const dir = valid.length >= 2 ? (last.q > first.q ? 'up' : last.q < first.q ? 'down' : 'flat') : 'flat';

  return (
    <div>
      {/* Metric toggle — bordered segmented strip, active = cyan border + inset rail + tint. */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', marginBottom: 12 }}>
        {CHECKIN_METRICS.map(m => (
          <button key={m.key} onClick={() => setChkMetric(m.key)}
            style={{ flex: 1, height: 32, boxSizing: 'border-box', padding: 0, borderRadius: 0, border: `1px solid ${chkMetric === m.key ? C.ac : C.cardBd}`, boxShadow: chkMetric === m.key ? `inset 0 2px 0 0 ${C.ac}` : 'none', background: chkMetric === m.key ? 'rgba(57,189,255,0.12)' : 'transparent', color: chkMetric === m.key ? C.ac : C.tm, fontFamily: FN, fontSize: 11, fontWeight: chkMetric === m.key ? 700 : 600, letterSpacing: '0.06em', cursor: 'pointer', transition: 'color .15s, background .15s, border-color .15s' }}>{m.label}</button>
        ))}
      </div>
      {valid.length < 2 ? (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 32, textAlign: 'center', color: C.td }}>
          <div style={{ fontSize: 13 }}>At least 2 check-ins needed to see the {metric.label.toLowerCase()} trend</div>
        </div>
      ) : (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: 14 }}>
          <div style={{ fontSize: 10, fontFamily: FN, color: C.ac, letterSpacing: '0.15em', fontWeight: 700, marginBottom: 10 }}>{metric.label} TREND</div>
          <svg viewBox={`0 -10 ${W} 185`} style={{ width: '100%', height: 185 }}>
            {[3, 2, 1, 0].map(L => {
              const y = yOf(L);
              return <g key={L}>
                <line x1="52" y1={y} x2={W - 10} y2={y} stroke={C.bd} strokeWidth="0.5" strokeDasharray="4" />
                <text x="48" y={y + 3} fill={C.tm} fontSize="8" fontFamily={FN} textAnchor="end">{metric.scale[L].toUpperCase()}</text>
              </g>;
            })}
            <polyline fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              points={valid.map(d => `${60 + d.i * 50},${yOf(d.q)}`).join(' ')} />
            {chkData.map((d) => {
              const x = 60 + d.i * 50;
              return <g key={d.i}>
                {d.q != null && <circle cx={x} cy={yOf(d.q)} r="3.5" fill={readinessColor(metric.key, d.raw) || C.ac} />}
                <text x={x} y={152} fill={C.tm} fontSize="8" fontFamily={FN} textAnchor="middle">W{d.week || '?'}</text>
                <text x={x} y={163} fill={C.tm} fontSize="7" fontFamily={FN} textAnchor="middle">{new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</text>
              </g>;
            })}
          </svg>
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            <div style={{ flex: 1, border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '11px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, fontFamily: FN, color: C.tm, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 6 }}>LATEST</div>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: FN, lineHeight: 1, textTransform: 'uppercase', color: readinessColor(metric.key, last.raw) || C.tx }}>{last.raw}</div>
            </div>
            <div style={{ flex: 1, border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '11px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, fontFamily: FN, color: C.tm, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 6 }}>TREND</div>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: FN, lineHeight: 1, color: dir === 'up' ? C.gn : dir === 'down' ? '#E23B3B' : C.tm }}>{dir === 'up' ? 'BETTER' : dir === 'down' ? 'WORSE' : 'SAME'}</div>
            </div>
            <div style={{ flex: 1, border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '11px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, fontFamily: FN, color: C.tm, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 6 }}>CHECK-INS</div>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: FN, lineHeight: 1, color: C.tx }}>{valid.length}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
