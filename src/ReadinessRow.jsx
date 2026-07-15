// Readiness check-in (autoregulation) — shared display + scale helpers.
//
// The athlete fills PAIN / SLEEP / ENERGY before a session (ClientPortal
// check-in step). It's stored on each client_workouts row as
// `autoregulation: { pain, sleep, energy }` (string levels). This module is
// the ONE source of truth for how those levels map to a good→bad colour and
// to a 0..3 quality number, so the per-session row (here), the coach trainee
// page, and the trends graph all read them identically.
import React from 'react';
import { C, FN } from './theme';

// Each scale is ordered WORST → BEST, so the index doubles as a 0..3 quality
// value (3 = best / most ready) for the graph's Y axis.
export const CHECKIN_METRICS = [
  { key: 'pain',   label: 'PAIN',   scale: ['high', 'moderate', 'mild', 'none'] },
  { key: 'sleep',  label: 'SLEEP',  scale: ['poor', 'ok', 'good', 'great'] },
  { key: 'energy', label: 'ENERGY', scale: ['low', 'ok', 'good', 'high'] },
];
const BY_KEY = Object.fromEntries(CHECKIN_METRICS.map(m => [m.key, m]));

// Good → bad ramp (mirrors the check-in screen's RAMP).
const RAMP = ['#35C36A', '#F2CE1E', '#F0862A', '#E23B3B']; // best → worst (yellow/orange/red all distinct)

// 0..3 quality value for a level (3 = best), or null if unknown/blank.
export function checkinQuality(key, val) {
  const m = BY_KEY[key];
  if (!m) return null;
  const q = m.scale.indexOf(String(val || '').toLowerCase());
  return q < 0 ? null : q;
}

// Severity colour for a level (green best → red worst), or null.
export function readinessColor(key, val) {
  const q = checkinQuality(key, val);
  return q == null ? null : RAMP[3 - q];
}

export function hasReadiness(data) {
  return !!(data && (data.pain || data.sleep || data.energy));
}

// Compact PAIN/SLEEP/ENERGY strip. Each present metric shows its label + the
// athlete's level, coloured by severity. Renders nothing when empty.
export default function ReadinessRow({ data, showTitle = false, style }) {
  if (!hasReadiness(data)) return null;
  const items = CHECKIN_METRICS.filter(m => data[m.key]);
  return (
    <div style={{ ...style }}>
      {showTitle && <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 6 }}>READINESS</div>}
      {/* PAIN / SLEEP / ENERGY on a single row below the title — no wrapping, so
          the three metrics always line up together (Ohad). Labels white. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, flexWrap: 'nowrap', overflowX: 'auto', maxWidth: '100%' }}>
        {items.map(m => (
          <span key={m.key} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 8, fontFamily: FN, color: C.tx, letterSpacing: '0.14em', fontWeight: 700 }}>{m.label}</span>
            <span style={{ fontSize: 11, fontFamily: FN, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: readinessColor(m.key, data[m.key]) || C.tx }}>{data[m.key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
