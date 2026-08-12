// velocityLoadZones.js — turn an athlete's load-velocity profile into an
// actionable LOAD PRESCRIPTION: "for a power day, use ~X kg."
//
// A coach's real question isn't just "what's his 1RM" — it's "what load do I put
// on the bar TODAY for this quality?" VBT answers it: mean concentric bar velocity
// maps to a training quality (heavy/strength ~0.3-0.5, strength-speed ~0.5-0.75,
// speed-strength/power ~0.75-1.0, speed >1.0 m/s). Fit the load-velocity line and
// solve for the load at each zone's target velocity.
//
// Grounded in VBT load-velocity research (González-Badillo & Sánchez-Medina 2010;
// Mann/Weakley velocity zones). MARKET GAP: elite VBT units ($300-2000) prescribe
// load live from a bar sensor; nothing does it from a phone off a STORED profile —
// and EXPO already keeps the (load, velocity) points this needs.
//
// Pure, honest states — a load that requires extrapolating far past the filmed
// velocities is flagged low-confidence (interpolation within the data is the
// trustworthy zone). GREENLIGHT-GATED: no UI until Ohad approves.

const round = (x) => (x == null || !isFinite(x) ? null : Math.round(x));

// Mean concentric velocity zones (m/s). Target = the mid of each band.
export const VELOCITY_ZONES = [
  { key: 'max-strength',    label: 'Max strength',    target: 0.40, band: [0.30, 0.50], pct: '≥85%' },
  { key: 'strength-speed',  label: 'Strength-speed',  target: 0.65, band: [0.50, 0.75], pct: '75-85%' },
  { key: 'speed-strength',  label: 'Speed-strength',  target: 0.85, band: [0.75, 1.00], pct: '55-75%' },
  { key: 'speed',           label: 'Speed',           target: 1.10, band: [1.00, 1.30], pct: '<55%' },
];

// Least-squares fit v = a + b·load over one point per LOAD (velocities averaged).
// Returns { a, b, loads, vMin, vMax } or null (need >=2 distinct loads, real slope).
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
  if (b >= -1e-4) return null;
  const a = mV - b * mL;
  const vs = pts.map((p) => p.velocity);
  return { a, b, loads: pts.length, vMin: Math.min(...vs), vMax: Math.max(...vs), maxLoad: Math.max(...pts.map((p) => p.load)) };
}

// points: [{ load, velocity }] filmed submax sets. Returns per-zone load
// prescriptions, honest about which are interpolated (trustworthy) vs extrapolated.
export function velocityLoadPrescription(points) {
  const f = fitLV(points);
  if (!f) return { state: 'thin', reason: 'need >=2 distinct filmed loads with a real velocity drop to build a load-velocity line' };
  // Tolerance band around the filmed velocities — a target inside [vMin,vMax] is a
  // true interpolation (trust it); just outside is a short, acceptable reach; far
  // outside is a guess the coach shouldn't program off.
  const span = Math.max(0.05, f.vMax - f.vMin);
  const zones = VELOCITY_ZONES.map((z) => {
    const load = (z.target - f.a) / f.b;
    if (!(load > 0)) return { ...z, load: null, confidence: 'out-of-range' };
    // how far the target velocity sits outside the filmed range, as a fraction of the span
    const over = z.target > f.vMax ? (z.target - f.vMax) / span
      : z.target < f.vMin ? (f.vMin - z.target) / span : 0;
    const confidence = over === 0 ? 'measured' : over <= 0.5 ? 'near' : 'extrapolated';
    const kg = round(load);
    // Don't emit an EXTRAPOLATED load heavier than anything filmed — that's the
    // unsafe direction (prescribing more than the athlete has been measured
    // lifting) off a line the data doesn't support. A near-flat / light-only
    // profile otherwise yields absurd loads (e.g. 182 kg off a 60-70 kg profile).
    // Null it (honest 'out-of-range'); keep measured/near and lighter reaches.
    if (confidence === 'extrapolated' && kg != null && kg > f.maxLoad) {
      return { ...z, load: null, confidence: 'out-of-range' };
    }
    return { ...z, load: kg, confidence };
  });
  return {
    state: 'ok',
    zones,
    filmedRange: { vMin: Math.round(f.vMin * 100) / 100, vMax: Math.round(f.vMax * 100) / 100 },
    loads: f.loads,
  };
}
