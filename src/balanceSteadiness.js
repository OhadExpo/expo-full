// balanceSteadiness.js — BALANCE (SWAY): postural steadiness from the phone's
// motion sensor. Athlete holds the phone to the chest (or in a pocket) and stands
// on one leg for ~15s; the accelerometer captures body sway. Sway path + amplitude
// = how steady they are — a validated balance / proprioception read that also
// degrades with fatigue and flags an ankle/knee that isn't trusting load yet. It
// turns the eyeball single-leg-balance test in the Evaluation into a number.
//
// GROUNDING (honest):
//   - Instrumented postural-sway (force plate, and phone-IMU proxies) is a
//     validated balance + neuromuscular-fatigue measure (Supported). Absolute
//     values depend on phone placement, so the band here is rough and the real
//     signal is the TREND / left-vs-right difference, not one number.
//   - Screen + inform, never diagnose.
//
// Pure + dependency-free → fixture-tested (scripts/verify-balance.mjs). UI = the
// SWAY tab in SensorLab. Greenlight-gated; owner-only.

const DEG = 180 / Math.PI;
const norm = (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
// angle (deg) between two gravity vectors
function vecAngle(a, b) {
  const na = norm(a), nb = norm(b);
  if (na < 1e-6 || nb < 1e-6) return 0;
  let c = (a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb);
  c = Math.max(-1, Math.min(1, c));
  return Math.acos(c) * DEG;
}

// samples: [{ t, g:{x,y,z} }] gravity/accel-including-gravity during a still hold.
export function analyzeBalance(samples, opts = {}) {
  const s = (samples || []).filter((x) => x && Number.isFinite(x.t) && x.g && [x.g.x, x.g.y, x.g.z].every(Number.isFinite));
  if (s.length < 20) return { ok: false, reason: 'hold the balance a little longer (need ~15s still)' };
  s.sort((a, b) => a.t - b.t);
  const durSec = (s[s.length - 1].t - s[0].t) / 1000;
  if (durSec < 5) return { ok: false, reason: 'need ~15s of holding the position' };

  // mean gravity direction over the hold = the intended still posture
  const mean = s.reduce((a, x) => ({ x: a.x + x.g.x, y: a.y + x.g.y, z: a.z + x.g.z }), { x: 0, y: 0, z: 0 });
  mean.x /= s.length; mean.y /= s.length; mean.z /= s.length;

  // per-sample tilt deviation from the mean posture (deg)
  const dev = s.map((x) => vecAngle(x.g, mean));
  const swayRMS = +Math.sqrt(dev.reduce((a, d) => a + d * d, 0) / dev.length).toFixed(2);
  const swayMax = +Math.max(...dev).toFixed(1);

  // sway PATH length: total angular travel of the gravity vector over the hold
  let path = 0;
  for (let i = 1; i < s.length; i++) path += vecAngle(s[i].g, s[i - 1].g);
  const pathDeg = +path.toFixed(0);
  const swayVelDegS = +(path / durSec).toFixed(1); // sway velocity — the cleanest steadiness index

  // rough stability score 0..100 (higher = steadier). Anchored so a dead-still
  // hold (~<0.5°/s) ≈ 100 and a very wobbly one (~>8°/s) ≈ 0. Rough by design.
  const stability = Math.max(0, Math.min(100, Math.round(100 - swayVelDegS * 12)));
  const band = stability >= 85 ? 'excellent' : stability >= 65 ? 'good' : stability >= 40 ? 'fair' : 'poor';

  return {
    ok: true,
    swayRMS, swayMax, pathDeg, swayVelDegS,
    stability, band,
    nSamples: s.length, durSec: +durSec.toFixed(1),
    note: band === 'poor'
      ? `High sway (${swayVelDegS}°/s) — unsteady. Worth a left-vs-right compare; a big side difference can flag an ankle/knee not trusting load yet.`
      : band === 'excellent'
      ? `Very steady (${swayVelDegS}°/s sway). Track it — a rise vs your baseline is an early fatigue/again-injury signal.`
      : `Sway ${swayVelDegS}°/s — read the TREND and the left-vs-right gap, not the single number (placement affects absolutes).`,
  };
}

export default { analyzeBalance };
