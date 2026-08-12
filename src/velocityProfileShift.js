// velocityProfileShift.js — did a training block make the athlete more FORCEFUL
// or more FAST? Compares two load-velocity (LV) profiles — an earlier window vs a
// later one — and reads WHICH quality moved.
//
// A load-velocity line is v = a + b·load (b < 0). Two anchors describe it:
//   v0  = a          → the intercept: bar velocity extrapolated to zero load, a
//                      proxy for MAX-VELOCITY / RFD quality.
//   L@v = (v − a)/b  → the load the athlete pushes AT a fixed reference velocity,
//                      a proxy for FORCE / strength at that velocity.
// A block that raised L@v at a shared velocity shifted the whole line to the RIGHT
// = a force/strength adaptation. One that raised v0 without moving L@v just got
// FASTER = a velocity adaptation. Both up = a balanced gain; both down = regressed.
//
// Grounded in VBT profiling (García-Ramos et al. 2018 on LV-profile reliability;
// Jovanović & Flanagan 2014). MARKET GAP: elite VBT hardware profiles a SINGLE
// session; nothing tracks the profile SHIFT across a block — and from a phone,
// nobody. EXPO already stores the (load, velocity, date) points per exercise in
// the Bar-Speed vault, so this is a pure read over data we already have.
//
// Pure functions, no UI. Honest thin/invalid states — never fabricates a verdict.
// GREENLIGHT-GATED: not wired into any screen until Ohad approves the read.

const round1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);

// Fit v = a + b·load over one window's points. One point per LOAD (velocities at a
// repeated load are averaged), needs >=2 distinct loads and a REAL negative slope
// (shallower than -1e-4 is noise / wrong sign). Returns null if unfittable.
function fitLV(points) {
  const raw = (points || []).filter((p) => p && Number.isFinite(p.load) && p.load > 0 && Number.isFinite(p.velocity) && p.velocity > 0);
  const byLoad = new Map();
  for (const p of raw) { if (!byLoad.has(p.load)) byLoad.set(p.load, []); byLoad.get(p.load).push(p.velocity); }
  const pts = [...byLoad.entries()].map(([load, vs]) => ({ load, velocity: vs.reduce((s, v) => s + v, 0) / vs.length }));
  if (pts.length < 2) return null;
  const n = pts.length;
  const mL = pts.reduce((s, p) => s + p.load, 0) / n;
  const mV = pts.reduce((s, p) => s + p.velocity, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.load - mL) * (p.velocity - mV); den += (p.load - mL) ** 2; }
  const b = den ? num / den : 0;
  if (b >= -1e-4) return null; // too flat / velocity not falling with load
  const a = mV - b * mL;
  return { a, b, loads: pts.length, maxLoad: Math.max(...pts.map((p) => p.load)), minLoad: Math.min(...pts.map((p) => p.load)) };
}

// pointsBefore / pointsAfter: [{ load, velocity }] for the two windows.
// mvt: the lift's minimal velocity threshold (from mvtForLift), for the 1RM delta.
// refVelocity: the shared velocity at which to compare force (default 0.5 m/s, a
//   mid-strength speed both profiles can speak to).
export function velocityProfileShift(pointsBefore, pointsAfter, mvt, refVelocity = 0.5) {
  const m = (typeof mvt === 'number' && mvt > 0) ? mvt : 0.25;
  const REF = (typeof refVelocity === 'number' && refVelocity > 0) ? refVelocity : 0.5;
  const A = fitLV(pointsBefore), B = fitLV(pointsAfter);
  if (!A || !B) {
    return { state: 'thin', reason: 'need a fittable load-velocity profile (>=2 distinct loads and a real negative slope) in BOTH windows' };
  }
  // Force axis: load pushed at the shared reference velocity. This is the primary,
  // most robust signal (interpolated near the data, not extrapolated to a max).
  const loadAtRef = (f) => (REF - f.a) / f.b;
  const la0 = loadAtRef(A), la1 = loadAtRef(B);
  const dLoadAtRefPct = (la0 > 0 && la1 > 0) ? ((la1 - la0) / la0) * 100 : null;
  // Velocity axis: the intercept v0 (max-velocity quality).
  const dV0Pct = (A.a > 0) ? ((B.a - A.a) / A.a) * 100 : null;
  // Estimated-1RM delta — reported only when BOTH profiles give a sane 1RM
  // (above the heaviest lifted load, within 2x reach); else null (don't fabricate
  // a strength number off an over-extrapolated fit).
  const oneRM = (f) => (m - f.a) / f.b;
  const rm0 = oneRM(A), rm1 = oneRM(B);
  const rmValid = rm0 > A.maxLoad && rm1 > B.maxLoad && (rm0 / A.maxLoad) <= 2 && (rm1 / B.maxLoad) <= 2;
  const dRmPct = rmValid && rm0 > 0 ? ((rm1 - rm0) / rm0) * 100 : null;
  // Verdict on the two axes with a ±2% dead-band so noise doesn't read as a shift.
  const DB = 2;
  const forceUp = dLoadAtRefPct != null && dLoadAtRefPct > DB;
  const forceDn = dLoadAtRefPct != null && dLoadAtRefPct < -DB;
  const velUp = dV0Pct != null && dV0Pct > DB;
  const velDn = dV0Pct != null && dV0Pct < -DB;
  let verdict;
  if (forceUp && velUp) verdict = 'balanced-gain';       // whole line up-and-right
  else if (forceUp && !velUp) verdict = 'force';          // shifted right — stronger at velocity
  else if (velUp && !forceUp) verdict = 'velocity';       // intercept up — faster, not stronger
  else if (forceDn || velDn) verdict = 'regressed';       // either axis dropped
  else verdict = 'flat';                                  // no meaningful move
  return {
    state: 'ok',
    verdict,
    refVelocity: REF,
    dLoadAtRefPct: round1(dLoadAtRefPct),
    dV0Pct: round1(dV0Pct),
    dRmPct: round1(dRmPct),
    oneRMBefore: rmValid ? Math.round(rm0) : null,
    oneRMAfter: rmValid ? Math.round(rm1) : null,
    loadsBefore: A.loads,
    loadsAfter: B.loads,
  };
}
