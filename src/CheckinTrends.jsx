// Check-in (readiness) trends graph — PAIN / SLEEP / ENERGY plotted over the
// athlete's logged sessions, one metric at a time. Shared by the athlete portal
// AND the coach trainee page so both show the IDENTICAL graph (Ohad). Reads the
// shared ReadinessRow helpers so quality (0..3, 3 = best) and severity colours
// match the per-session rows exactly.
//
// The chart fills its container width the same way BWChart does: geometry
// (area + line) lives in an SVG with preserveAspectRatio="none" so it stretches
// edge-to-edge, while the dots and the axis labels are HTML overlays (kept out
// of the SVG so they stay round / unstretched). This is what fixes the graph
// rendering tiny-and-centred inside the wide coach card.
//
// Props:
//   workouts — array of rows carrying { autoregulation, date, week }. Rows
//              without readiness are ignored.
import React, { useState } from 'react';
import { C, FN } from './theme';
import { CHECKIN_METRICS, checkinQuality, readinessColor, hasReadiness } from './ReadinessRow';

const AC = '#39BDFF'; // brand cyan literal — C.ac resolves to black in light mode

export default function CheckinTrends({ workouts = [] }) {
  // Default to a metric that actually has data, so the graph never opens on an
  // empty state when the athlete logged e.g. SLEEP/ENERGY but never PAIN.
  const [chkMetric, setChkMetric] = useState(() => {
    const withData = (min) => CHECKIN_METRICS.find(m =>
      (workouts || []).filter(w => checkinQuality(m.key, w.autoregulation?.[m.key]) != null).length >= min);
    return (withData(2) || withData(1) || CHECKIN_METRICS[0]).key;
  });
  const metric = CHECKIN_METRICS.find(m => m.key === chkMetric) || CHECKIN_METRICS[0];

  // X axis = every check-in session, oldest → newest (all three metric graphs
  // span the same points even if one metric was skipped on some day).
  const sessions = (workouts || [])
    // Require a valid date too (adversarial-QA #10): a check-in with no/invalid
    // date otherwise plots an "Invalid Date" axis tick and NaN-sorts into the
    // wrong slot, which can flip the trend line.
    .filter(w => hasReadiness(w.autoregulation) && w.date && !Number.isNaN(new Date(w.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const chkData = sessions.map((w, i) => ({
    i, date: w.date, week: w.week,
    q: checkinQuality(metric.key, w.autoregulation?.[metric.key]),
    raw: w.autoregulation?.[metric.key],
  }));
  const valid = chkData.filter(d => d.q != null);
  const first = valid[0], last = valid[valid.length - 1];
  const dir = valid.length >= 2 ? (last.q > first.q ? 'up' : last.q < first.q ? 'down' : 'flat') : 'flat';

  // ── chart geometry (viewBox units; stretched horizontally to fill width) ──
  const W = 800, H = 150, PAD_X = 34, PAD_TOP = 12, PAD_BOTTOM = 30;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const yOf = q => PAD_TOP + ((3 - q) / 3) * plotH;      // q=3 (best) at top
  const n = chkData.length;
  const xOf = i => (n <= 1 ? W / 2 : PAD_X + i * ((W - PAD_X * 2) / (n - 1)));
  const linePts = valid.map(d => `${xOf(d.i).toFixed(1)},${yOf(d.q).toFixed(1)}`).join(' ');
  const areaPath = valid.length >= 2
    ? `M${xOf(valid[0].i).toFixed(1)},${(H - PAD_BOTTOM)} L${linePts.replace(/ /g, ' L')} L${xOf(valid[valid.length - 1].i).toFixed(1)},${(H - PAD_BOTTOM)} Z`
    : '';
  const pctX = i => `${(xOf(i) / W) * 100}%`;

  return (
    // Cap the width so on the wide coach card the chart reads as a comfortable
    // trend graph — wider than the old tiny-centred render, but not stretched
    // edge-to-edge across ~1400px where a handful of points looked too sparse
    // (Ohad: "wider … but that was way too wide"). On the narrow athlete portal
    // (~500px) the cap is inert.
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Metric toggle — bordered segmented strip, active = cyan border + inset rail + tint. */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', marginBottom: 12 }}>
        {CHECKIN_METRICS.map(m => (
          <button key={m.key} onClick={() => setChkMetric(m.key)}
            style={{ flex: 1, height: 32, boxSizing: 'border-box', padding: 0, borderRadius: 0, border: `1px solid ${chkMetric === m.key ? C.ac : 'var(--c-ghostBd)'}`, boxShadow: chkMetric === m.key ? `inset 0 2px 0 0 ${C.ac}` : 'none', background: chkMetric === m.key ? 'rgba(57,189,255,0.12)' : 'transparent', color: chkMetric === m.key ? C.ac : C.tm, fontFamily: FN, fontSize: 11, fontWeight: chkMetric === m.key ? 700 : 600, letterSpacing: '0.06em', cursor: 'pointer', transition: 'color .15s, background .15s, border-color .15s' }}>{m.label}</button>
        ))}
      </div>
      {valid.length < 2 ? (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 32, textAlign: 'center', color: C.td }}>
          <div style={{ fontSize: 13 }}>At least 2 check-ins needed to see the {metric.label.toLowerCase()} trend</div>
        </div>
      ) : (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: 14 }}>
          <div style={{ fontSize: 10, fontFamily: FN, color: C.ac, letterSpacing: '0.15em', fontWeight: 700, marginBottom: 10 }}>{metric.label} TREND</div>
          {/* Chart: full-width SVG geometry + HTML overlays for round dots and labels. */}
          <div style={{ position: 'relative', width: '100%', height: H }}>
            {/* Y category labels — a fixed 46px left gutter, right-aligned, so the
                graph geometry sits to their RIGHT and never covers the words (Ohad). */}
            {[3, 2, 1, 0].map(L => (
              <div key={L} style={{ position: 'absolute', left: 0, top: yOf(L) - 4, width: 46, fontSize: 8, fontFamily: FN, color: C.tm, letterSpacing: '0.02em', lineHeight: 1, pointerEvents: 'none', textAlign: 'right' }}>{metric.scale[L].toUpperCase()}</div>
            ))}
            {/* Chart content, offset right of the gutter; svg + dots + x-labels
                all share this box so they stay aligned with each other. */}
            <div style={{ position: 'absolute', left: 52, right: 4, top: 0, bottom: 0 }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chkAreaGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={AC} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={AC} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[3, 2, 1, 0].map(L => <line key={L} x1={0} y1={yOf(L)} x2={W} y2={yOf(L)} stroke={C.bd} strokeWidth="0.75" strokeDasharray="4" />)}
                {areaPath && <path d={areaPath} fill="url(#chkAreaGrad)" />}
                <polyline fill="none" stroke={AC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={linePts} />
              </svg>
              {/* Round severity-coloured dots (HTML so they stay circular). */}
              {chkData.map(d => d.q != null && (
                <div key={d.i} title={String(d.raw || '').toUpperCase()} style={{ position: 'absolute', left: pctX(d.i), top: yOf(d.q), width: 9, height: 9, borderRadius: '50%', background: readinessColor(metric.key, d.raw) || C.ac, transform: 'translate(-50%,-50%)', boxShadow: `0 0 0 2px var(--c-sf)`, pointerEvents: 'none' }} />
              ))}
              {/* X labels (week + date). */}
              {chkData.map(d => (
                <div key={d.i} style={{ position: 'absolute', left: pctX(d.i), bottom: 0, transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 8, fontFamily: FN, color: C.tm, lineHeight: 1.2 }}>W{d.week || '?'}</div>
                  <div style={{ fontSize: 7, fontFamily: FN, color: C.td, lineHeight: 1.2 }}>{new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Summary tiles. */}
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
