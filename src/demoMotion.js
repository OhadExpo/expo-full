// demoMotion.js — synthetic pose clips so the camera tools can be demoed (and
// the 3D skeleton's V1/V2 rig A/B'd) with NO camera and NO upload. Frames carry
// the same shape MediaPipe produces ({ landmarks, worldLandmarks } of 33 points
// each, y image-down / z- toward camera), so they flow through the exact same
// analyzeClip / jumpMetrics / AnatomyModelViewer pipeline as a real capture.

// Ass-to-grass back squat, 2 reps. Hips drop below the knees, knees track
// forward over the toes, slight forward torso lean, arms reach forward as a
// counterweight, feet planted flat.
export function demoSquatFrames(reps = 2, fps = 20, secPerRep = 2) {
  const base = {
    0: [0, -0.72, 0.04], 7: [-0.06, -0.74, 0.02], 8: [0.06, -0.74, 0.02],
    11: [-0.18, -0.50, 0], 12: [0.18, -0.50, 0],
    13: [-0.21, -0.25, 0.02], 14: [0.21, -0.25, 0.02],
    15: [-0.23, 0.00, 0.02], 16: [0.23, 0.00, 0.02],
    19: [-0.24, 0.08, 0.02], 20: [0.24, 0.08, 0.02],
    23: [-0.10, 0.00, 0], 24: [0.10, 0.00, 0],
    25: [-0.11, 0.45, 0.02], 26: [0.11, 0.45, 0.02],
    27: [-0.11, 0.90, 0], 28: [0.11, 0.90, 0],
    29: [-0.11, 0.95, 0.06], 30: [0.11, 0.95, 0.06],
    31: [-0.11, 0.95, -0.14], 32: [0.11, 0.95, -0.14],
  };
  const frames = []; const fpr = fps * secPerRep; const dt = 1000 / fps; let t = 0;
  for (let r = 0; r < reps; r++) for (let i = 0; i < fpr; i++) {
    const d = Math.sin((i / fpr) * Math.PI); const w = new Array(33).fill(null);
    for (const k of Object.keys(base)) {
      const idx = Number(k); let [x, y, z] = base[k];
      if (idx === 23 || idx === 24) { y += 0.60 * d; z += 0.05 * d; }                 // hips drop deep + back
      else if (idx === 25 || idx === 26) { y += 0.08 * d; z -= 0.20 * d; }            // knees forward over toes
      else if ([0, 7, 8, 11, 12].includes(idx)) { y += 0.50 * d; z -= 0.07 * d; }     // head/shoulders down + lean
      else if ([13, 14, 15, 16, 19, 20].includes(idx)) { y += 0.30 * d; z -= 0.26 * d; } // arms reach forward
      w[idx] = { x, y, z };
    }
    frames.push({ t, landmarks: w, worldLandmarks: w }); t += dt;
  }
  return frames;
}

// Vertical jump with a full arm swing: counter-movement dip (arms back/down) →
// triple extension (legs straighten, ankles point, arms swing overhead) → soft
// landing. Hip-centred, so the read is the limb choreography, not translation.
export function demoJumpFrames(fps = 24, dur = 2.4) {
  const base = {
    0: [0, -0.72, 0.04], 7: [-0.06, -0.74, 0.02], 8: [0.06, -0.74, 0.02],
    11: [-0.18, -0.50, 0], 12: [0.18, -0.50, 0],
    23: [-0.10, 0.00, 0], 24: [0.10, 0.00, 0],
    25: [-0.11, 0.45, 0.02], 26: [0.11, 0.45, 0.02],
    27: [-0.11, 0.90, 0], 28: [0.11, 0.90, 0],
    29: [-0.11, 0.95, 0.06], 30: [0.11, 0.95, 0.06],
    31: [-0.11, 0.95, -0.14], 32: [0.11, 0.95, -0.14],
  };
  const bump = (p, a, b) => (p < a || p > b) ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI);
  const total = Math.round(fps * dur); const frames = []; const dt = 1000 / fps; let t = 0;
  for (let i = 0; i < total; i++) {
    const p = i / total;
    const dip = bump(p, 0.00, 0.32) * 0.8 + bump(p, 0.62, 0.92) * 0.5;
    const ext = bump(p, 0.30, 0.62);
    // Airborne window — the WHOLE body translates up so the ankles rise above
    // the standing baseline. jumpMetrics times that rise as flight (height =
    // g·t²/8); without it the demo had no flight and read "couldn't read a
    // clean jump". ~0.46 s aloft → ≈25 cm, a believable demo vertical.
    const fly = bump(p, 0.42, 0.61);
    let armSw;
    if (p < 0.28) armSw = -Math.sin((p / 0.28) * Math.PI * 0.5);
    else if (p < 0.52) armSw = -1 + ((p - 0.28) / 0.24) * 2;
    else armSw = Math.max(0, 1 - (p - 0.52) / 0.40);
    const thetaDeg = 5 + armSw * (armSw > 0 ? 162 : 58);
    const th = thetaDeg * Math.PI / 180;
    const dz = -Math.sin(th), dy = Math.cos(th);
    const w = new Array(33).fill(null);
    for (const k of Object.keys(base)) {
      const idx = Number(k); let [x, y, z] = base[k];
      if (idx === 23 || idx === 24) { y += dip * 0.22; z += dip * 0.05; }
      else if (idx === 25 || idx === 26) { y += dip * 0.05; z -= dip * 0.12; }
      else if ([0, 7, 8, 11, 12].includes(idx)) { y += dip * 0.22; z -= dip * 0.04; }
      else if (idx === 31 || idx === 32) { y += ext * 0.05; }
      w[idx] = { x, y, z };
    }
    for (const [sgn, sho, elb, wri, han] of [[-1, 11, 13, 15, 19], [1, 12, 14, 16, 20]]) {
      const s = w[sho]; if (!s) continue;
      const ex = s.x + sgn * 0.02;
      w[elb] = { x: ex, y: s.y + 0.25 * dy, z: s.z + 0.25 * dz };
      w[wri] = { x: ex, y: s.y + 0.50 * dy, z: s.z + 0.50 * dz };
      w[han] = { x: ex, y: s.y + 0.57 * dy, z: s.z + 0.57 * dz };
    }
    // Lift the entire body during flight (y is image-down, so up = subtract).
    if (fly > 0) for (const pt of w) { if (pt) pt.y -= fly * 0.30; }
    frames.push({ t, landmarks: w, worldLandmarks: w }); t += dt;
  }
  return frames;
}
