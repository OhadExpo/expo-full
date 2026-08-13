// goniometer.js — PIVOT: turn the phone into a clinical goniometer / inclinometer.
// Laid flat against a limb segment (or strapped to it), the phone's gravity vector
// gives that segment's inclination from horizontal. Two placements → a joint angle
// (e.g. knee flexion, shoulder flexion); a movement sweep → active range of motion
// + how fast the joint moves through it. This is the objective mobility screen the
// camera-pose ROM read can't give from the wrong angle, and it slots straight into
// the athletic Evaluation as a hard number instead of an eyeball.
//
// GROUNDING (honest):
//   - Smartphone inclinometer/accelerometer goniometry shows good-to-excellent
//     agreement with the universal goniometer for many joints in the literature
//     (Supported). Accuracy depends on clean placement in the movement plane and
//     the segment actually lying flat against the device.
//   - Normative ROM ranges vary by source, age and sex — the norms map here is a
//     rough clinical reference (AAOS-style) for a "% of typical" read, NOT a
//     diagnosis. Per project rules: screen + inform, never diagnose.
//
// Pure + dependency-free. Feed it a gravity vector (from DeviceMotion
// accelerationIncludingGravity, or DeviceOrientation converted to gravity).
// Unit-tested in scripts/verify-pivot.mjs. UI greenlight-gated.

const DEG = 180 / Math.PI;
const hypot = (a, b) => Math.sqrt(a * a + b * b);

// Inclination of the phone's surface from HORIZONTAL, 0..180°. Flat screen-up = 0,
// stood vertical = 90. Direction-agnostic (magnitude only) — a bubble level.
export function inclination(g) {
  if (!g || ![g.x, g.y, g.z].every(Number.isFinite)) return null;
  return +(Math.atan2(hypot(g.x, g.y), g.z) * DEG).toFixed(1);
}

// Joint angle from two placements (proximal segment, then distal segment), each a
// gravity vector. Returns the absolute angular difference of their inclinations.
export function jointAngleTwoPos(gProximal, gDistal) {
  const a = inclination(gProximal), b = inclination(gDistal);
  if (a == null || b == null) return { ok: false, reason: 'bad sensor reading' };
  return { ok: true, angle: +Math.abs(b - a).toFixed(1), proximal: a, distal: b };
}

// Rough clinical ROM norms (degrees) for a "% of typical" read. Sources vary; these
// are mid-range references, not cutoffs.
export const ROM_NORMS = {
  'shoulder-flexion': 180, 'shoulder-abduction': 180, 'shoulder-external-rotation': 90, 'shoulder-internal-rotation': 70,
  'elbow-flexion': 145, 'hip-flexion': 120, 'hip-extension': 30, 'hip-abduction': 45,
  'knee-flexion': 135, 'ankle-dorsiflexion': 20, 'ankle-plantarflexion': 50, 'trunk-flexion': 80,
};

// ROM from a movement sweep: samples of {t, g} while the joint moves through its
// range. Returns range (max−min inclination), peak, and peak angular velocity.
export function romFromSweep(samples, opts = {}) {
  const s = (samples || []).filter((x) => x && Number.isFinite(x.t) && x.g).map((x) => ({ t: x.t, a: inclination(x.g) })).filter((x) => x.a != null);
  if (s.length < 8) return { ok: false, reason: 'hold the sweep a little longer' };
  s.sort((a, b) => a.t - b.t);
  const angs = s.map((x) => x.a);
  const min = Math.min(...angs), max = Math.max(...angs);
  const rom = +(max - min).toFixed(1);
  // peak angular velocity (deg/s) via finite differences, lightly smoothed
  let peakVel = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = (s[i].t - s[i - 1].t) / 1000;
    if (dt > 0) peakVel = Math.max(peakVel, Math.abs(s[i].a - s[i - 1].a) / dt);
  }
  // quality: need a real excursion, not sensor jitter
  const ok = rom >= 5;
  const out = { ok, rom, peak: +max.toFixed(1), min: +min.toFixed(1), peakVelDegS: Math.round(peakVel), nSamples: s.length };
  if (!ok) out.reason = 'no real movement detected — did the segment stay against the phone?';
  if (opts.joint && ROM_NORMS[opts.joint]) {
    const norm = ROM_NORMS[opts.joint];
    out.joint = opts.joint;
    out.pctOfNorm = Math.round((rom / norm) * 100);
    out.limited = out.pctOfNorm < 85;
    out.note = out.limited
      ? `${rom}° is ~${out.pctOfNorm}% of typical ${opts.joint.replace(/-/g, ' ')} (~${norm}°) — flag as a mobility limiter to address before loading the pattern hard.`
      : `${rom}° ≈ ${out.pctOfNorm}% of typical ${opts.joint.replace(/-/g, ' ')} — within normal range.`;
  }
  return out;
}

export default { inclination, jointAngleTwoPos, romFromSweep, ROM_NORMS };
