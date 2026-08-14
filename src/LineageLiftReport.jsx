// LineageLiftReport — the Review-screen per-lift report, rendered on the coach
// Analysis page (TrainingLineageV2) from the STORED pose payload instead of live
// video frames.
//
// The workout Review screen (WorkoutReview -> MovementLab.AnalyzeResult) shows,
// per filmed clip: a bar-speed line with a SPEED/ACCEL toggle + BEST MEAN /
// VELOCITY LOSS + a per-rep table, and a joint-angle degrees-over-time line with
// a joint/side selector + L<->R ROM bars + LARGEST ROM / ROM-COLLAPSED + tempo.
// Those need per-frame series, which the Analysis vault used to discard. Now
// poseLab.buildPoseReport persists a compact (downsampled) payload per set, and
// this module renders the SAME report off it.
//
// Two deliberate departures from AnalyzeResult, both forced by the surface:
//   1. Theme-aware. AnalyzeResult sits on the dark video panel (white text,
//      rgba-white gridlines). The Analysis page is light/dark, so this uses the
//      theme tokens (C.tx/C.tm/C.bd/C.sf2) + literal brand cyan (#39BDFF — C.ac
//      flips to black in light mode), exactly like the Load&Volume / Strength->
//      Power charts already in TrainingLineageV2. Speed = cyan, acceleration =
//      C.pu (purple), degrees = C.gn (green) — matching AnalyzeResult's colors.
//   2. No pinch-zoom / scrub / playhead. Those sync to a <video> element; the
//      Analysis report is static (no player), so the interactive trace becomes a
//      clean read-only chart. Everything else — axes, gridlines, area gradient,
//      per-rep tables, L<->R bars, tempo — matches.
//
// Honest by construction: a series the payload doesn't carry is simply omitted;
// nothing here is fabricated.
import React, { useState, useMemo } from 'react';
import { C, FN } from './theme';
import { isVelocityLossLift } from './poseMetricsStore';

const CY = '#39BDFF';       // brand cyan literal (C.ac -> black in light mode)
const ROM_R = '#7ad0ff';    // lighter cyan for the RIGHT side (matches AnalyzeResult)
const ROM_FLAG = '#ffb454'; // amber L/R asymmetry flag

// ---- shared chart primitive -------------------------------------------------
// A read-only line trace with the TrainingLineageV2 grammar: bright HTML y-axis
// ticks, a stretched (preserveAspectRatio=none) SVG for grid + area + line, an
// area gradient under the line, dashed gridlines. `symmetric` centres the
// domain on 0 with an emphasized zero line (signed speed / acceleration); else
// the domain is zoomed to [min,max] so joint-angle dips read clearly.
let _gidSeq = 0;
function SeriesChart({ pts, color, symmetric, fmtY, header }) {
  const gid = useMemo(() => `llrGrad-${(_gidSeq += 1)}`, []);
  if (!pts || pts.length < 3) {
    return <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.06em', margin: '4px 0 12px' }}>No clean trace in this clip.</div>;
  }
  const W = 320, GH = 118, padT = 14, padB = 8, padX = 6, plotH = GH - padT - padB;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const t0 = xs[0], t1 = xs[xs.length - 1] || (t0 + 1);
  let domLo, domHi;
  if (symmetric) {
    const m = Math.max(0.3, ...ys.map((v) => Math.abs(v)));
    domLo = -m; domHi = m;
  } else {
    const lo = Math.min(...ys), hi = Math.max(...ys), rng = (hi - lo) || 1;
    domLo = lo - rng * 0.14; domHi = hi + rng * 0.16;
  }
  const domR = (domHi - domLo) || 1;
  const gx = (x) => padX + (t1 <= t0 ? (W - 2 * padX) / 2 : ((x - t0) / (t1 - t0)) * (W - 2 * padX));
  const gy = (v) => padT + (1 - (v - domLo) / domR) * plotH;
  const pctY = (v) => `${(gy(v) / GH) * 100}%`;
  const line = pts.map((p) => `${gx(p.x).toFixed(1)},${gy(p.y).toFixed(1)}`).join(' ');
  const baseY = symmetric ? gy(0) : GH - padB;
  const area = `M${gx(t0).toFixed(1)},${baseY.toFixed(1)} L${line.replace(/ /g, ' L')} L${gx(t1).toFixed(1)},${baseY.toFixed(1)} Z`;
  const ticks = symmetric ? [domHi, 0, domLo] : [domHi, (domHi + domLo) / 2, domLo];
  const durSec = (t1 - t0) / 1000;
  return (
    <div style={{ margin: '4px 0 14px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{header}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <div style={{ position: 'relative', width: 34, flexShrink: 0, fontSize: 9, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
          {ticks.map((L, i) => (
            <span key={i} style={{ position: 'absolute', top: pctY(L), right: 0, transform: 'translateY(-50%)', color: C.tx, fontWeight: 700 }}>{fmtY(L)}</span>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, height: GH }}>
          <svg viewBox={`0 0 ${W} ${GH}`} preserveAspectRatio="none" style={{ width: '100%', height: GH, display: 'block', background: C.sf2, border: `1px solid ${C.bd}` }}>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
            </defs>
            {ticks.map((L, i) => <line key={i} x1={0} y1={gy(L)} x2={W} y2={gy(L)} stroke={C.bd} strokeWidth="0.75" strokeDasharray="4" />)}
            {symmetric && <line x1={0} y1={gy(0)} x2={W} y2={gy(0)} stroke={C.tm} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />}
            <path d={area} fill={`url(#${gid})`} />
            <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ position: 'absolute', left: 2, bottom: 2, fontSize: 8, fontWeight: 700, color: C.tm, letterSpacing: '0.08em', pointerEvents: 'none' }}>0.0s</div>
          <div style={{ position: 'absolute', right: 2, bottom: 2, fontSize: 8, fontWeight: 700, color: C.tm, letterSpacing: '0.08em', pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>{durSec.toFixed(1)}s</div>
        </div>
      </div>
    </div>
  );
}

// ---- small shared bits ------------------------------------------------------
function MiniKpi({ label, value, tone }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 120, border: `1px solid ${C.bd}`, background: C.sf2, padding: '9px 11px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: tone || C.tx }}>{value}</div>
      <div style={{ fontSize: 8.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>{label}</div>
    </div>
  );
}
const pillStyle = (sel, col) => ({
  fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 10px',
  borderRadius: 0, cursor: 'pointer', textTransform: 'uppercase',
  border: `1px solid ${sel ? col : C.bd}`, background: sel ? `${col}22` : 'transparent',
  color: sel ? col : C.tm,
});
function Th({ children, right }) {
  return <th style={{ fontFamily: FN, fontSize: 8, letterSpacing: '0.12em', color: C.tm, padding: '6px 4px', borderBottom: `1px solid ${C.bd}`, textAlign: right ? 'right' : 'left', fontWeight: 700 }}>{children}</th>;
}
function Td({ children, right, tone }) {
  return <td style={{ fontFamily: FN, fontSize: 12, fontWeight: 600, padding: '8px 4px', borderBottom: `1px solid ${C.bd}`, textAlign: right ? 'right' : 'left', color: tone || C.tx, fontVariantNumeric: 'tabular-nums' }}>{children}</td>;
}

// ===================== BAR SPEED / velocity report ==========================
export function VelocityReport({ report, title }) {
  const [graph, setGraph] = useState('speed'); // speed | accel
  if (!report) return null;
  const velLoss = isVelocityLossLift(title);
  const speedPts = report.speed && report.speed.series ? report.speed.series.map((p) => ({ x: p.t, y: p.speed })) : null;
  const accelPts = report.accel && report.accel.series ? report.accel.series.map((p) => ({ x: p.t, y: p.accel })) : null;
  const perRep = Array.isArray(report.perRepVel) ? report.perRepVel : [];
  const hasTable = perRep.some(Boolean);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, margin: '2px 0 8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setGraph('speed')} style={pillStyle(graph === 'speed', CY)}>Speed</button>
        <button type="button" onClick={() => setGraph('accel')} style={pillStyle(graph === 'accel', C.pu)}>Acceleration</button>
      </div>
      {graph === 'speed' && (
        <SeriesChart pts={speedPts} color={CY} symmetric fmtY={(v) => v.toFixed(1)}
          header={`Vertical bar (wrist) speed · m/s · +up / -down${report.speed ? ` · peak ${report.speed.peak.toFixed(2)}` : ''}`} />
      )}
      {graph === 'accel' && (
        <SeriesChart pts={accelPts} color={C.pu} symmetric fmtY={(v) => v.toFixed(1)}
          header={`Vertical bar (wrist) acceleration · m/s²${report.accel ? ` · peak ${report.accel.peak.toFixed(2)}` : ''}`} />
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: hasTable ? 10 : 0 }}>
        {report.bestMean != null && <MiniKpi label="Best mean velocity" value={`${report.bestMean.toFixed(2)} m/s`} />}
        {velLoss && report.lossPct != null && (
          <MiniKpi label="Velocity loss (last rep)" value={report.lossPct >= 90 ? '90%+' : `${Math.round(report.lossPct)}%`}
            tone={report.lossPct >= 20 ? C.rd : report.lossPct >= 10 ? C.or : C.gn} />
        )}
      </div>
      {hasTable && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Rep</Th><Th right>Mean m/s</Th><Th right>Peak m/s</Th>{velLoss && <Th right>Loss</Th>}</tr></thead>
          <tbody>
            {perRep.map((r, i) => r && (
              <tr key={i}>
                <Td>{i + 1}</Td>
                <Td right>{r.mean != null ? r.mean.toFixed(2) : '—'}</Td>
                <Td right>{r.peak != null ? r.peak.toFixed(2) : '—'}</Td>
                {velLoss && <Td right tone={r.loss != null && r.loss >= 20 ? C.rd : undefined}>{r.loss == null ? '—' : r.loss >= 90 ? '90%+' : `${Math.round(r.loss)}%`}</Td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ===================== RANGE OF MOTION report ================================
const JOINT_PICKS = [{ abbr: 'SHO', label: 'Shoulder' }, { abbr: 'ELB', label: 'Elbow' }, { abbr: 'HIP', label: 'Hip' }, { abbr: 'KNE', label: 'Knee' }];
const JOINT_GROUPS = [{ key: 'SHO', label: 'Shoulder' }, { key: 'ELB', label: 'Elbow' }, { key: 'HIP', label: 'Hip' }, { key: 'KNE', label: 'Knee' }];

function romRows(jointRom) {
  const byName = {}; (jointRom || []).forEach((j) => { byName[j.name] = j; });
  return JOINT_GROUPS.map((g) => {
    const L = byName[`L ${g.key}`], R = byName[`R ${g.key}`];
    if (!L && !R) return null;
    const lr = L ? L.romDeg : null, rr = R ? R.romDeg : null;
    const delta = (lr != null && rr != null && Math.max(lr, rr) > 0) ? Math.round((Math.abs(lr - rr) / Math.max(lr, rr)) * 100) : null;
    return { ...g, lr, rr, delta };
  }).filter(Boolean);
}
function JointRomBars({ jointRom }) {
  const rows = romRows(jointRom);
  if (!rows.length) return null;
  const maxRom = Math.max(1, ...rows.flatMap((r) => [r.lr || 0, r.rr || 0]));
  return (
    <div style={{ margin: '4px 0 16px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>Joint ROM · in-plane °</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontFamily: FN, fontSize: 8, color: C.tm, letterSpacing: '0.12em', marginBottom: 10 }}>
        <span>◄ LEFT</span><span style={{ opacity: 0.4 }}>·</span><span>RIGHT ►</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: CY, width: 34, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.lr != null ? `${r.lr}°` : '—'}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <div style={{ flex: 1, height: 14, position: 'relative', background: C.sf2 }}>
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(r.lr || 0) / maxRom * 100}%`, background: CY }} />
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: CY, opacity: 0.5 }} />
              <div style={{ flex: 1, height: 14, position: 'relative', background: C.sf2 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(r.rr || 0) / maxRom * 100}%`, background: ROM_R }} />
              </div>
            </div>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: ROM_R, width: 34, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.rr != null ? `${r.rr}°` : '—'}</span>
          </div>
          <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: C.tm, marginTop: 4, textTransform: 'uppercase' }}>
            {r.label}{r.delta != null && r.delta > 10 ? <span style={{ color: ROM_FLAG }}> · Δ{r.delta}%</span> : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function TempoBars({ perRep }) {
  const reps = (perRep || []).filter(Boolean);
  if (!reps.length) return null;
  const maxT = Math.max(...reps.map((r) => (r.ecc || 0) + (r.pause || 0) + (r.con || 0))) || 1;
  const seg = (val, color, key) => (val > 0
    ? <div key={key} title={`${key} ${val.toFixed(1)}s`} style={{ width: `${(val / maxT) * 100}%`, background: color }} />
    : null);
  const Legend = ({ color, label }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: 8, color: C.tm, letterSpacing: '0.1em' }}>
      <span style={{ width: 9, height: 9, background: color }} />{label}
    </span>
  );
  return (
    <div style={{ margin: '6px 0 16px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Tempo · ecc / pause / con per rep</div>
      {reps.map((x, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, width: 16 }}>{i + 1}</div>
          <div style={{ flex: 1, display: 'flex', height: 12, background: C.sf2 }}>
            {seg(x.ecc, CY, 'ecc')}{seg(x.pause, C.tm, 'pause')}{seg(x.con, C.gn, 'con')}
          </div>
          <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{((x.ecc || 0) + (x.pause || 0) + (x.con || 0)).toFixed(1)}s</div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
        <Legend color={CY} label="ECC" /><Legend color={C.tm} label="PAUSE" /><Legend color={C.gn} label="CON" />
      </div>
    </div>
  );
}

export function RomReport({ report }) {
  const angles = report && report.angles ? report.angles : null;
  const availJoints = useMemo(() => {
    if (!angles) return [];
    return JOINT_PICKS.filter((j) => angles[`L ${j.abbr}`] || angles[`R ${j.abbr}`]);
  }, [angles]);
  const primary = (report && report.primaryJoint) || (availJoints[0] && availJoints[0].abbr) || 'KNE';
  const [jointAbbr, setJointAbbr] = useState(primary);
  const [side, setSide] = useState('L');
  if (!report) return null;
  const chan = angles ? (angles[`${side} ${jointAbbr}`] || angles[`${side === 'L' ? 'R' : 'L'} ${jointAbbr}`]) : null;
  const anglePts = chan && chan.series ? chan.series.map((p) => ({ x: p.t, y: p.angle })) : null;
  const jointLabel = (JOINT_PICKS.find((j) => j.abbr === jointAbbr) || {}).label || jointAbbr;
  const perRep = Array.isArray(report.perRepRom) ? report.perRepRom : [];
  const hasTable = perRep.some(Boolean);
  return (
    <div>
      <SeriesChart pts={anglePts} color={C.gn} fmtY={(v) => `${Math.round(v)}°`}
        header={`${side} ${jointLabel} angle · degrees over time · reps = the dips${chan ? ` · peak ${Math.round(chan.peak)}°` : ''}`} />
      {availJoints.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {availJoints.map((j) => (
            <button key={j.abbr} type="button" onClick={() => setJointAbbr(j.abbr)} style={pillStyle(jointAbbr === j.abbr, C.gn)}>{j.label}</button>
          ))}
          <span style={{ width: 1, height: 16, background: C.bd, margin: '0 4px' }} />
          {['L', 'R'].map((s) => (
            <button key={s} type="button" onClick={() => setSide(s)} style={pillStyle(side === s, C.gn)}>{s}</button>
          ))}
        </div>
      )}
      {report.jointRom && report.jointRom.length > 0 && <JointRomBars jointRom={report.jointRom} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {report.maxRom != null && <MiniKpi label={`Largest ${jointLabel} ROM`} value={`${Math.round(report.maxRom)}°`} />}
        {report.collapsedCount > 0 && <MiniKpi label="ROM-collapsed reps" value={String(report.collapsedCount)} tone={C.or} />}
      </div>
      <TempoBars perRep={perRep} />
      {hasTable && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Rep</Th><Th right>ROM</Th><Th right>Ecc s</Th><Th right>Pause</Th><Th right>Con s</Th></tr></thead>
          <tbody>
            {perRep.map((x, i) => x && (
              <tr key={i}>
                <Td>{i + 1}</Td>
                <Td right tone={x.collapsed ? C.or : undefined}>{x.rom != null ? `${Math.round(x.rom)}° (${x.romPct}%)` : '—'}</Td>
                <Td right>{x.ecc != null ? x.ecc.toFixed(1) : '—'}</Td>
                <Td right>{x.pause != null ? x.pause.toFixed(1) : '—'}</Td>
                <Td right>{x.con != null ? x.con.toFixed(1) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
