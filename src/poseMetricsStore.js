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
const median = (arr) => {
  const a = (arr || []).filter((x) => typeof x === 'number' && isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

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
  // A poorly-tracked clip yields unreliable velocity + L/R numbers — never let it
  // become a trend point (one garbage film would fake a velocity spike or a
  // widening injury flag). Refuse it; the UI tells the coach to refilm.
  if (analysis.captureQuality && analysis.captureQuality.grade === 'poor') return null;
  const maxRom = rt && typeof rt.maxRom === 'number' ? rt.maxRom : null;
  // Per-joint L/R travel so the injury-watch timeline can trend a *widening*
  // gap across sessions — the read every phone tool leaves on the floor.
  const asym = detectAsymmetry(analysis.jointRom, exercise);
  const asymRows = (asym && asym.rows.length) ? asym.rows.map((r) => ({ joint: r.joint, pct: r.asymPct, weaker: r.weaker })) : null;
  // Store if the camera got EITHER a real bar velocity OR a usable L/R symmetry
  // read — the injury screen must still cover machine/ROM-only work where there's
  // no clean bar speed. Never store a fully-empty (fabricated) trend point.
  if (bestMean == null && !asymRows) return null;
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
  const dates = new Set();
  const groups = []; // one series per (lift, joint) — NEVER pool across exercises
  Object.values(client).forEach((lift) => {
    // A joint's real ROM differs by movement (squat knee ≠ deadlift knee), so
    // comparing readings only makes sense within the SAME lift. Key by lift+joint.
    const byJointDate = {};
    (lift.entries || []).forEach((e) => {
      if (!e.asymRows) return;
      const d = (e.date || '').slice(0, 10);
      dates.add(d);
      e.asymRows.forEach((r) => {
        const g = byJointDate[r.joint] || (byJointDate[r.joint] = {});
        (g[d] || (g[d] = { pcts: [], weaker: r.weaker })).pcts.push(r.pct);
        g[d].weaker = r.weaker;
      });
    });
    Object.entries(byJointDate).forEach(([joint, byDate]) => {
      // One point per date = the MEDIAN of that day's screens (robust to a single
      // off-angle 2D reading), not the worst — max-of-noise fabricates widening.
      const series = Object.entries(byDate)
        .map(([date, v]) => ({ date, pct: median(v.pcts), weaker: v.weaker }))
        .filter((s) => s.pct != null)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!series.length) return;
      const current = series[series.length - 1].pct;
      const first = series[0].pct;
      const delta = Math.round(current - first);
      // Drift must clear single-session 2D pose noise (±several %). Needs a real
      // multi-session move, and more confidence with fewer points.
      const drift = series.length >= 3 ? (delta >= 8 ? 'widening' : delta <= -8 ? 'closing' : 'stable')
        : series.length === 2 ? (delta >= 10 ? 'widening' : delta <= -10 ? 'closing' : 'stable')
          : 'stable';
      // Flag a TREND, never a lone reading: needs ≥2 filmed sets AND either a
      // large persistent gap or an actively-widening one. One noisy 2D set can't
      // trip a red "screen this joint" claim.
      const flag = series.length >= 2 && (current >= 18 || (current >= 12 && drift === 'widening'));
      groups.push({ joint, lift: lift.title, weaker: series[series.length - 1].weaker, series, current, first, delta, drift, flag, films: series.length });
    });
  });
  if (!groups.length) return { joints: [], films: 0, worst: null, anyFlag: false };
  groups.sort((a, b) => (b.flag - a.flag) || (b.current - a.current));
  return { joints: groups, films: dates.size, worst: groups[0], anyFlag: groups.some((g) => g.flag) };
}

export function hasVault(clientId) {
  const c = readAll()[clientId];
  return !!c && Object.keys(c).length > 0;
}
