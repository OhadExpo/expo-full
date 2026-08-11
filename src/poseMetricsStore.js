// poseMetricsStore.js — the Bar-Speed Vault.
//
// The camera tools compute bar velocity + ROM live but never kept them, so the
// single fatigue signal that predicts overreaching BEFORE load/RPE/reps ever
// move (Sánchez-Medina velocity-loss) evaporated the moment the panel closed.
// This persists each analysed set's headline metrics keyed by
// (athlete, exercise, date) so the Lineage can plot a per-lift velocity-fatigue
// TREND — the one read no competitor at a solo-trainer price point can offer.
//
// Owner-only trial storage: localStorage, this device. It never writes to
// Supabase or any trainee-visible table (testing-env-first rule). Production
// would promote this to a `pose_metrics` table on the same (clientId, planName,
// dayName, week, eid) join key client_workouts already uses.

import { detectAsymmetry } from './poseInsights';

const KEY = 'expo-pose-metrics';
const exKey = (title) => (title || 'exercise').trim().toLowerCase().replace(/\s+/g, ' ');

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; } catch { return false; /* quota / private mode */ }
}

// Save (or replace, same date) one analysed set's headline metrics.
// analysis = analyzeClip() result. Returns the stored entry, or null if there's
// no real velocity to store (never fabricate a trend point).
export function savePoseMetric({ clientId, exercise, date, analysis }) {
  if (!clientId || !exercise || !analysis) return null;
  const vel = analysis.velocity, rt = analysis.romTempo;
  const bestMean = vel && typeof vel.bestMean === 'number' ? vel.bestMean : null;
  const lossPct = vel && typeof vel.finalLossPct === 'number' ? Math.min(99, Math.max(0, vel.finalLossPct)) : null;
  if (bestMean == null) return null; // no camera-verified velocity → don't store
  const maxRom = rt && typeof rt.maxRom === 'number' ? rt.maxRom : null;
  // Per-joint L/R travel so the injury-watch timeline can trend a *widening*
  // gap across sessions — the read every phone tool leaves on the floor.
  const asym = detectAsymmetry(analysis.jointRom);
  const asymRows = asym ? asym.rows.map((r) => ({ joint: r.joint, pct: r.asymPct, weaker: r.weaker })) : null;
  const entry = {
    date: date || new Date().toISOString(),
    kind: analysis.kind || null,
    reps: analysis.repCount || null,
    bestMean, lossPct, maxRom,
    asymRows: (asymRows && asymRows.length) ? asymRows : null,
  };
  const all = readAll();
  const k = exKey(exercise);
  const client = all[clientId] || (all[clientId] = {});
  const lift = client[k] || (client[k] = { title: exercise, entries: [] });
  lift.title = exercise;
  // replace any entry with the same calendar date (re-analysing one clip)
  const d0 = entry.date.slice(0, 10);
  lift.entries = lift.entries.filter((e) => (e.date || '').slice(0, 10) !== d0);
  lift.entries.push(entry);
  lift.entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // Only report success if it actually persisted — otherwise the UI would flash
  // "Saved to trend" on a device where localStorage is full/blocked and nothing
  // was written.
  return writeAll(all) ? entry : null;
}

// All vaulted lifts for one athlete, richest history first:
//   [{ title, entries:[{date,bestMean,lossPct,maxRom,...}], count, trend }]
// trend = velocity-loss direction across the last entries ('worse'|'better'|'flat').
export function getAthleteVault(clientId) {
  const client = readAll()[clientId];
  if (!client) return [];
  return Object.values(client)
    .map((lift) => {
      const entries = [...(lift.entries || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const losses = entries.map((e) => e.lossPct).filter((x) => typeof x === 'number');
      let trend = 'flat';
      if (losses.length >= 2) {
        const d = losses[losses.length - 1] - losses[0];
        trend = d >= 5 ? 'worse' : d <= -5 ? 'better' : 'flat';
      }
      return { title: lift.title, entries, count: entries.length, trend };
    })
    .filter((l) => l.count > 0)
    .sort((a, b) => b.count - a.count);
}

// Injury-watch: trend each joint's L/R travel gap across EVERY filmed set for
// one athlete, not just the last one. Returns per-joint series ordered worst-
// current-first:
//   { joints:[{ joint, weaker, series:[{date,pct}], current, first, delta,
//               drift:'widening'|'stable'|'closing', flag:bool }],
//     films, worst, anyFlag }
// The market gap this fills: every competitor's L/R read (if any) is one
// session, descriptive. Trending it flags a limb pulling away BEFORE it's pain.
export function getAthleteAsymmetryTrend(clientId) {
  const client = readAll()[clientId];
  if (!client) return { joints: [], films: 0, worst: null, anyFlag: false };
  // Flatten every entry across every lift that measured joint pairs.
  const rows = [];
  const dates = new Set();
  Object.values(client).forEach((lift) => {
    (lift.entries || []).forEach((e) => {
      if (!e.asymRows) return;
      const d = (e.date || '').slice(0, 10);
      dates.add(d);
      e.asymRows.forEach((r) => rows.push({ joint: r.joint, pct: r.pct, weaker: r.weaker, date: d }));
    });
  });
  if (!rows.length) return { joints: [], films: 0, worst: null, anyFlag: false };
  // Group by joint; one point per calendar date (worst screen that day wins).
  const byJoint = {};
  rows.forEach((r) => {
    const g = byJoint[r.joint] || (byJoint[r.joint] = {});
    if (!g[r.date] || r.pct > g[r.date].pct) g[r.date] = { pct: r.pct, weaker: r.weaker };
  });
  const joints = Object.entries(byJoint).map(([joint, byDate]) => {
    const series = Object.entries(byDate)
      .map(([date, v]) => ({ date, pct: v.pct, weaker: v.weaker }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const current = series[series.length - 1].pct;
    const first = series[0].pct;
    const delta = current - first;
    const drift = series.length >= 2 ? (delta >= 5 ? 'widening' : delta <= -5 ? 'closing' : 'stable') : 'stable';
    // Flag = a limb meaningfully behind (≥15% mod/high in detectAsymmetry terms),
    // OR a smaller-but-actively-widening gap that's trending the wrong way.
    const flag = current >= 15 || (current >= 10 && drift === 'widening');
    return { joint, weaker: series[series.length - 1].weaker, series, current, first, delta, drift, flag };
  }).sort((a, b) => (b.flag - a.flag) || (b.current - a.current));
  const worst = joints[0] || null;
  return { joints, films: dates.size, worst, anyFlag: joints.some((j) => j.flag) };
}

export function hasVault(clientId) {
  const c = readAll()[clientId];
  return !!c && Object.keys(c).length > 0;
}
