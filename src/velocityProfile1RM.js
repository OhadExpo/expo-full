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
const MVT = { squat: 0.30, bench: 0.17, deadlift: 0.15, ohp: 0.19, pull: 0.23, hipthrust: 0.30, default: 0.25 };

export function mvtForLift(title) {
  const t = (title || '').toLowerCase();
  // Hip thrust / glute bridge is a SHORT-ROM, fast-even-near-max glute push — its
  // bar velocity at a true 1RM is well above a deadlift's. Grouping it with the
  // deadlift (0.15) gave it the table's lowest MVT, which OVER-estimates the 1RM
  // (the dangerous direction) and was being shown at HIGH confidence (2nd
  // adversarial review, finding #1). Treat it as a fast lower-body push (~0.30).
  // Checked BEFORE the deadlift/hinge branch so it can't fall through to 0.15.
  if (/hip[-\s]?thrust|glute[-\s]?bridge/.test(t)) return MVT.hipthrust;
  if (/deadlift|\bdl\b|rdl|hinge|good[-\s]?morning/.test(t)) return MVT.deadlift;
  if (/bench|chest\s*press|push[-\s]?up|\bdip\b/.test(t)) return MVT.bench;
  // Squat/lunge family BEFORE the overhead branch: "Overhead Squat" / "Overhead
  // Reverse Lunge" must read as a squat pattern (MVT 0.30), not an OHP (0.19) —
  // a too-low MVT over-estimates the 1RM (the dangerous direction) and was being
  // shown as HIGH confidence. Plain "Overhead Press" has no squat/lunge token, so
  // it still falls through to the OHP branch below.
  if (/squat|lunge|split|rfess|bulgarian|leg\s*press|step[-\s]?up/.test(t)) return MVT.squat;
  if (/ohp|overhead|shoulder\s*press|military/.test(t)) return MVT.ohp;
  if (/\brow\b|pull[-\s]?up|chin|pulldown|\blat\b/.test(t)) return MVT.pull;
  return MVT.default;
}

// points: [{ load, velocity }] — filmed submax sets (load kg, mean concentric m/s).
// mvt:    minimal velocity threshold for this lift (from mvtForLift).
export function velocityProfile1RM(points, mvt) {
  const m = (typeof mvt === 'number' && mvt > 0) ? mvt : MVT.default;
  const raw = (points || []).filter((p) => p && Number.isFinite(p.load) && p.load > 0 && Number.isFinite(p.velocity) && p.velocity > 0);
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
  // A valid profile has velocity FALLING with load. The floor must be a REAL
  // signal, not 1e-6: a slope shallower than ~-1e-4 m/s/kg (0.1 m/s over 1000 kg)
  // is noise, and dividing by it blows the 1RM up to nonsense. Refuse it.
  if (b >= -1e-4) return { state: 'invalid', reason: 'velocity barely changes with load — too flat/noisy to profile; film across a real load range' };
  // 1RM = the load where predicted velocity meets the MVT: m = a + b·L → L = (m−a)/b.
  const oneRM = (m - a) / b;
  // An estimate at/below the heaviest load he already lifted is nonsense.
  const maxLoad = Math.max(...loads);
  const minLoad = Math.min(...loads);
  if (!(oneRM > maxLoad)) return { state: 'invalid', reason: 'estimate is at/below a load he already lifted — needs lighter submax points for a clean extrapolation' };
  // Loads bunched together fit a slope out of noise — one rep's velocity wobble
  // then swings the 1RM tens of kg. Demand a real spread before trusting the line.
  const minSpread = Math.max(5, maxLoad * 0.1);
  if ((maxLoad - minLoad) < minSpread) return { state: 'invalid', reason: 'filmed loads are too close together — spread them (a lighter and a heavier set) so the line is real, not noise' };
  // Extrapolation reach: how far above the heaviest FILMED load the estimate sits.
  // R² only measures fit WITHIN the filmed loads — it says nothing about a long
  // reach out to a max far above any real data (the classic LV over-read, and the
  // direction of error is dangerous: light/fast-only profiles over-estimate 1RM).
  // Beyond ~2× is fantasy; refuse rather than hand the coach a too-heavy number.
  const reach = oneRM / maxLoad;
  if (reach > 2) return { state: 'invalid', reason: 'estimate is >2× your heaviest filmed load — too far to extrapolate; film a heavier, grindier set to anchor it' };
  // R² — goodness of the linear fit.
  const ssTot = pts.reduce((s, p) => s + (p.velocity - mVel) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.velocity - (a + b * p.load)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  // Confidence needs THREE things, not just a tight in-range fit: ≥3 SEPARATED
  // loads, a good fit, AND a short extrapolation. "Separated" (not merely
  // distinct): two near-identical loads + one far load is really a 2-point fit —
  // the third bunched point adds no independent information and r²≈1 is the same
  // "2 points fit a line perfectly" artifact we exclude for 2 loads. Count loads
  // that clear a real gap from the previous one, so a bunched-3 profile stays
  // 'low' → the UI hides it (a 2-load profile already can never exceed 'low').
  const gap = Math.max(2.5, maxLoad * 0.025);
  const sortedLoads = [...loads].sort((x, y) => x - y);
  let sepLoads = 1;
  for (let i = 1; i < sortedLoads.length; i++) if (sortedLoads[i] - sortedLoads[i - 1] >= gap) sepLoads++;
  let confidence;
  if (sepLoads >= 3 && r2 >= 0.9 && reach <= 1.35) confidence = 'high';
  else if (sepLoads >= 3 && r2 >= 0.75 && reach <= 1.5) confidence = 'medium';
  else confidence = 'low';
  return {
    state: 'ok',
    oneRM: Math.round(oneRM),
    r2: Math.round(r2 * 100) / 100,
    loads: loads.length,
    points: raw.length,
    mvt: m,
    reach: Math.round(reach * 100) / 100,
    confidence,
  };
}
