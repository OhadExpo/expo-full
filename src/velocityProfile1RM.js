// velocityProfile1RM.js — estimate a true 1RM from the phone via load-velocity
// profiling, WITHOUT a max test.
//
// From a lift's filmed submax sets across sessions (load + mean concentric bar
// velocity) fit the load-velocity line — velocity falls ~linearly with load — and
// extrapolate to the lift's Minimal Velocity Threshold (MVT ≈ the bar speed at a
// true 1RM). Grounded in the VBT literature (Jovanović & Flanagan 2014, "Researched
// applications of velocity based strength training"; González-Badillo & Sánchez-
// Medina 2010). The market gap: elite VBT hardware (GymAware/Vitruve, $300–2000)
// does LV profiling; no phone-camera tool does — and the Bar-Speed vault already
// stores the (load, velocity) points this needs, keyed (client, exercise, date).
//
// Pure functions, no UI. Honest thin/invalid states — never fabricates a number.

// Minimal Velocity Threshold (m/s) — the mean concentric velocity AT a 1RM, by
// movement family. Approximate literature values; individual, so the UI should
// label the estimate as a tracked trend, not a tested max.
const MVT = { squat: 0.30, bench: 0.17, deadlift: 0.15, ohp: 0.19, pull: 0.23, default: 0.25 };

export function mvtForLift(title) {
  const t = (title || '').toLowerCase();
  if (/deadlift|\bdl\b|rdl|hinge|good[-\s]?morning|hip[-\s]?thrust/.test(t)) return MVT.deadlift;
  if (/bench|chest\s*press|push[-\s]?up|\bdip\b/.test(t)) return MVT.bench;
  if (/ohp|overhead|shoulder\s*press|military/.test(t)) return MVT.ohp;
  if (/\brow\b|pull[-\s]?up|chin|pulldown|\blat\b/.test(t)) return MVT.pull;
  if (/squat|lunge|split|rfess|bulgarian|leg\s*press|step[-\s]?up/.test(t)) return MVT.squat;
  return MVT.default;
}

// points: [{ load, velocity }] — filmed submax sets (load kg, mean concentric m/s).
// mvt:    minimal velocity threshold for this lift (from mvtForLift).
export function velocityProfile1RM(points, mvt) {
  const m = (typeof mvt === 'number' && mvt > 0) ? mvt : MVT.default;
  const raw = (points || []).filter((p) => p && typeof p.load === 'number' && p.load > 0 && typeof p.velocity === 'number' && p.velocity > 0);
  // The LV profile is one point per LOAD, not per set — average velocity across
  // sets at the same load (e.g. filmed on different dates) so a repeated load can't
  // outweigh the fit, and per-set noise at each load cancels. Standard LV practice.
  const byLoad = new Map();
  for (const p of raw) { if (!byLoad.has(p.load)) byLoad.set(p.load, []); byLoad.get(p.load).push(p.velocity); }
  const pts = [...byLoad.entries()].map(([load, vs]) => ({ load, velocity: vs.reduce((a, b) => a + b, 0) / vs.length }));
  const loads = pts.map((p) => p.load);
  // Need ≥2 DISTINCT loads to fit a line — a single load can't define a slope.
  if (loads.length < 2) return { state: 'thin', have: loads.length, need: 2, points: raw.length };
  // Least-squares: velocity = a + b·load. Slope b (m/s per kg) should be NEGATIVE.
  const n = pts.length;
  const mLoad = pts.reduce((s, p) => s + p.load, 0) / n;
  const mVel = pts.reduce((s, p) => s + p.velocity, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.load - mLoad) * (p.velocity - mVel); den += (p.load - mLoad) ** 2; }
  const b = den ? num / den : 0;
  const a = mVel - b * mLoad;
  // A valid profile has velocity FALLING with load. If it rises/flat, the data is
  // too noisy or mixed to profile — refuse rather than fabricate a 1RM.
  if (b >= -1e-6) return { state: 'invalid', reason: "velocity doesn't fall with load — film cleaner submax sets across a load range" };
  // 1RM = the load where predicted velocity meets the MVT: m = a + b·L → L = (m−a)/b.
  const oneRM = (m - a) / b;
  // An estimate at/below the heaviest load he already lifted is nonsense.
  const maxLoad = Math.max(...loads);
  if (!(oneRM > maxLoad)) return { state: 'invalid', reason: 'estimate is at/below a load he already lifted — needs lighter submax points for a clean extrapolation' };
  // R² — goodness of the linear fit → confidence.
  const ssTot = pts.reduce((s, p) => s + (p.velocity - mVel) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.velocity - (a + b * p.load)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return {
    state: 'ok',
    oneRM: Math.round(oneRM),
    r2: Math.round(r2 * 100) / 100,
    loads: loads.length,
    points: raw.length,
    mvt: m,
    // Confidence needs a real load spread AND a tight fit — 2 loads with a perfect
    // line is still only medium (VBT profiling wants 3–4 loads for a trusted number).
    confidence: (loads.length >= 3 && r2 >= 0.9) ? 'high' : (r2 >= 0.75) ? 'medium' : 'low',
  };
}
