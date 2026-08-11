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
  const entry = {
    date: date || new Date().toISOString(),
    kind: analysis.kind || null,
    reps: analysis.repCount || null,
    bestMean, lossPct, maxRom,
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

export function hasVault(clientId) {
  const c = readAll()[clientId];
  return !!c && Object.keys(c).length > 0;
}
