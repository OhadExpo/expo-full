// shotAnalysis.js — Basketball Shot Analyzer engine (pure functions, no DOM).
//
// Input: the frame array captureClipFrames() produces —
//   [{ t(ms), landmarks (2D image coords, normalised 0..1, y DOWN),
//      worldLandmarks (metric, hip-centred 3D) }] (+ frames.dims {w,h})
// Output: per-frame metric series, detected shot cycles with key frames
// (STANCE · DIP · SET · RELEASE · APEX · FOLLOW-THROUGH · LANDING), a
// checkpoint scorecard (measured → target → ok/watch/fix) and the FIX GUIDE
// (what / why / how) per checkpoint.
//
// Coordinate rules (same as poseLab): 3D worldLandmarks for JOINT ANGLES (no
// perspective distortion); 2D landmarks for POSITIONS / heights / velocities
// (the world frame is hip-centred, so the hip never moves there).
//
// Evidence basis for the targets — labelled honestly:
//  • KB (Hall, Basic Biomechanics, ch.10 "Projection angle"): a near-vertical
//    entry angle gives a larger margin of error; a common novice error is too
//    flat a trajectory. Higher release → more vertical entry at the same angle.
//  • Literature (not in the local KB — flagged in the UI): Knudson (1993),
//    "Biomechanics of the basketball jump shot — six key teaching points"
//    (high set point, elbow under the ball, release angle ≈ 49–55° for
//    typical release heights, full elbow extension + wrist flexion follow-
//    through, release near the jump apex); Okazaki, Rodacki & Satern (2015)
//    review (release angle 45–55°, elbow ≈ 90° at set, release at/just before
//    apex, trunk near vertical). The ranges below are BANDS, not laws — a
//    coach reads them with the athlete in front of him.
import { angleAt, medianFilter, findPeaks, isReal } from './repCounter.js';

// MediaPipe Pose indices.
const I = {
  NOSE: 0, L_EYE: 2, R_EYE: 5, L_EAR: 7, R_EAR: 8,
  L_SHO: 11, R_SHO: 12, L_ELB: 13, R_ELB: 14, L_WRI: 15, R_WRI: 16,
  L_IDX: 19, R_IDX: 20,
  L_HIP: 23, R_HIP: 24, L_KNE: 25, R_KNE: 26, L_ANK: 27, R_ANK: 28,
  L_HEEL: 29, R_HEEL: 30, L_FOOT: 31, R_FOOT: 32,
};
const side = (hand) => hand === 'L'
  ? { EYE: I.L_EYE, EAR: I.L_EAR, SHO: I.L_SHO, ELB: I.L_ELB, WRI: I.L_WRI, IDX: I.L_IDX, HIP: I.L_HIP, KNE: I.L_KNE, ANK: I.L_ANK, HEEL: I.L_HEEL, FOOT: I.L_FOOT }
  : { EYE: I.R_EYE, EAR: I.R_EAR, SHO: I.R_SHO, ELB: I.R_ELB, WRI: I.R_WRI, IDX: I.R_IDX, HIP: I.R_HIP, KNE: I.R_KNE, ANK: I.R_ANK, HEEL: I.R_HEEL, FOOT: I.R_FOOT };

const DEG = 180 / Math.PI;
const vis = (p, min = 0.35) => !!p && (p.visibility == null || p.visibility >= min);
const mid = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 } : null);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (arr) => { const a = arr.filter(isReal); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const median = (arr) => { const a = arr.filter(isReal).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const round = (v, d = 0) => (isReal(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

// Light EMA after the median filter — keeps phase edges sharp, kills the
// landmark jitter that turns a plateau into dozens of micro-peaks.
function ema(sig, alpha = 0.5) {
  const out = new Array(sig.length); let prev = null;
  for (let i = 0; i < sig.length; i++) {
    const x = sig[i];
    if (!isReal(x)) { out[i] = prev; continue; }
    prev = prev == null ? x : prev + alpha * (x - prev);
    out[i] = prev;
  }
  return out;
}
const smooth = (sig) => ema(medianFilter(sig, 5), 0.55);

// Central-difference derivative of a series in value-units per SECOND.
function deriv(sig, tMs) {
  const out = new Array(sig.length).fill(null);
  for (let i = 1; i < sig.length - 1; i++) {
    const a = sig[i - 1], b = sig[i + 1];
    const dt = (tMs[i + 1] - tMs[i - 1]) / 1000;
    if (isReal(a) && isReal(b) && dt > 0) out[i] = (b - a) / dt;
  }
  return out;
}
const argmax = (sig, from, to) => { let bi = -1, bv = -Infinity; for (let i = Math.max(0, from); i <= Math.min(sig.length - 1, to); i++) { const v = sig[i]; if (isReal(v) && v > bv) { bv = v; bi = i; } } return bi; };
const argmin = (sig, from, to) => { let bi = -1, bv = Infinity; for (let i = Math.max(0, from); i <= Math.min(sig.length - 1, to); i++) { const v = sig[i]; if (isReal(v) && v < bv) { bv = v; bi = i; } } return bi; };
const idxAtOrAfter = (tMs, t) => { for (let i = 0; i < tMs.length; i++) if (tMs[i] >= t) return i; return tMs.length - 1; };

// ---------------------------------------------------------------- series ---
// Every per-frame metric the report reads. `hand` = shooting hand ('R'|'L').
export function buildSeries(frames, { hand = 'R', aspect = 16 / 9 } = {}) {
  const S = side(hand);
  const n = frames.length;
  const tMs = frames.map((f) => f.t);
  const s = {
    tMs,
    knee: [], kneeOther: [], hip: [], elbow: [], shoulder: [], trunk: [],
    forearm: [], wristEye: [], wristElbowX: [], hipY: [], wristY: [], ankleY: [], eyeY: [], torso: [],
    visOk: [],
  };
  for (let k = 0; k < n; k++) {
    const f = frames[k];
    const w = f.worldLandmarks, p = f.landmarks;
    const W = (i) => (w && w[i]) || null;
    const P = (i) => (p && p[i]) || null;
    const otherKne = hand === 'L' ? [I.R_HIP, I.R_KNE, I.R_ANK] : [I.L_HIP, I.L_KNE, I.L_ANK];
    // --- angles (3D world)
    s.knee.push(w ? angleAt(w, S.HIP, S.KNE, S.ANK) : null);
    s.kneeOther.push(w ? angleAt(w, ...otherKne) : null);
    s.hip.push(w ? angleAt(w, S.SHO, S.HIP, S.KNE) : null);
    s.elbow.push(w ? angleAt(w, S.SHO, S.ELB, S.WRI) : null);
    s.shoulder.push(w ? angleAt(w, S.HIP, S.SHO, S.ELB) : null);
    // --- 2D positions (image plane, y DOWN). x is scaled by the aspect so
    // horizontal and vertical distances are in the same units.
    const sh = mid(P(I.L_SHO), P(I.R_SHO)), hp = mid(P(I.L_HIP), P(I.R_HIP));
    const torso = sh && hp ? Math.hypot((sh.x - hp.x) * aspect, sh.y - hp.y) : null;
    s.torso.push(torso);
    if (sh && hp) {
      const dx = (sh.x - hp.x) * aspect, dy = hp.y - sh.y; // dy>0 when shoulders above hips
      s.trunk.push(Math.abs(Math.atan2(dx, dy) * DEG));   // 0 = vertical
    } else s.trunk.push(null);
    const el = P(S.ELB), wr = P(S.WRI), eye = P(S.EYE) || P(I.NOSE);
    if (el && wr && vis(el) && vis(wr)) {
      const dx = Math.abs((wr.x - el.x) * aspect), dy = el.y - wr.y; // dy>0 = wrist above elbow
      s.forearm.push(Math.atan2(dy, dx) * DEG);            // 0 = horizontal, 90 = straight up
      s.wristElbowX.push(torso ? dx / torso : null);
    } else { s.forearm.push(null); s.wristElbowX.push(null); }
    s.wristEye.push(wr && eye && torso ? (eye.y - wr.y) / torso : null); // >0 = wrist above eye line
    s.hipY.push(hp ? -hp.y : null);       // up-positive, normalised image units
    s.wristY.push(wr ? -wr.y : null);
    s.eyeY.push(eye ? -eye.y : null);
    const ank = mid(P(I.L_ANK), P(I.R_ANK)) || P(S.ANK);
    s.ankleY.push(ank ? -ank.y : null);
    s.visOk.push(!!(el && wr && vis(el) && vis(wr) && P(S.KNE) && vis(P(S.KNE)) && P(S.HIP) && vis(P(S.HIP))));
  }
  // Smoothed copies for detection; raw kept for the per-frame readout.
  const sm = {};
  for (const k of ['knee', 'kneeOther', 'hip', 'elbow', 'shoulder', 'trunk', 'forearm', 'wristEye', 'wristElbowX', 'hipY', 'wristY', 'ankleY']) sm[k] = smooth(s[k]);
  sm.hipVel = deriv(sm.hipY, tMs);        // image-units/s (scaled later)
  sm.elbowVel = deriv(sm.elbow, tMs);     // deg/s
  sm.wristVel = deriv(sm.wristY, tMs);
  return { raw: s, sm, n, tMs };
}

// ------------------------------------------------------------- detection ---
// Find shot cycles. Each cycle = a knee-angle DIP (valley) followed by an arm
// extension within ~1.6 s. Multi-shot clips → several cycles.
export function detectShots(series, fps) {
  const { sm, tMs, n } = series;
  const minDist = Math.max(3, Math.round(fps * 0.9));
  const inv = sm.knee.map((v) => (isReal(v) ? -v : null));
  let valleys = findPeaks(inv, 12, minDist).map((p) => p.idx);
  // Fallback: single global minimum when the knee signal is flat-ish (set shot, partial clip).
  if (!valleys.length) { const g = argmin(sm.knee, 0, n - 1); if (g >= 0) valleys = [g]; }
  const cycles = [];
  for (const dip of valleys) {
    const win = idxAtOrAfter(tMs, tMs[dip] + 1600);
    // Snap: peak elbow-extension RATE after the dip (the arm "fires").
    const snap = argmax(sm.elbowVel, dip, win);
    if (snap < 0) continue;
    const elbMax = sm.elbow.slice(dip, win + 1).filter(isReal).reduce((m, v) => Math.max(m, v), -Infinity);
    // Release = first frame after the snap where the elbow is within 8° of its
    // max in the window, or the extension rate has collapsed to ≤20% of peak.
    let release = -1;
    const peakRate = sm.elbowVel[snap] || 0;
    for (let i = snap; i <= win; i++) {
      const e = sm.elbow[i], r = sm.elbowVel[i];
      if (isReal(e) && (e >= elbMax - 8 || (i > snap && isReal(r) && r <= 0.2 * peakRate))) { release = i; break; }
    }
    if (release < 0) release = Math.min(win, snap + 1);
    // Require a real arm elevation at release — otherwise this "dip" was a
    // bounce / walk, not a shot.
    if (!isReal(sm.shoulder[release]) || sm.shoulder[release] < 95) continue;
    // Set point: elbow closest to 90° between dip and release (the ball at the
    // forehead before the arm extends).
    let set = dip; let best = Infinity;
    for (let i = dip; i < release; i++) { const e = sm.elbow[i]; if (isReal(e) && Math.abs(e - 90) < best) { best = Math.abs(e - 90); set = i; } }
    const apex = argmax(sm.hipY, dip, win);
    // Stance baseline = median hip height over the 0.4 s before the dip starts
    // (or the first frames of the clip).
    const preFrom = idxAtOrAfter(tMs, tMs[dip] - 900), preTo = Math.max(preFrom, idxAtOrAfter(tMs, tMs[dip] - 400));
    const stance = preTo > preFrom ? preFrom : Math.max(0, dip - Math.round(fps * 0.6));
    const baseHip = median(sm.hipY.slice(stance, Math.max(stance + 1, preTo)));
    // Follow-through: hold while the arm stays elevated (shoulder within 15° of
    // its release value) AND the wrist stays above the eye line.
    const shoRel = sm.shoulder[release];
    let ftEnd = release;
    for (let i = release; i <= Math.min(n - 1, idxAtOrAfter(tMs, tMs[release] + 1500)); i++) {
      const ok = isReal(sm.shoulder[i]) && sm.shoulder[i] >= shoRel - 15 && (sm.wristEye[i] == null || sm.wristEye[i] > -0.15);
      if (!ok) break; ftEnd = i;
    }
    // Landing: first frame after the apex where the hip is back at baseline.
    let landing = -1;
    if (isReal(baseHip)) for (let i = apex + 1; i <= Math.min(n - 1, idxAtOrAfter(tMs, tMs[apex] + 1200)); i++) { if (isReal(sm.hipY[i]) && sm.hipY[i] <= baseHip + 0.004) { landing = i; break; } }
    cycles.push({ stance, dip, set, release, apex, followEnd: ftEnd, landing, baseHip, elbMax });
  }
  // De-duplicate cycles that resolved to the same release frame.
  const seen = new Set();
  return cycles.filter((c) => (seen.has(c.release) ? false : (seen.add(c.release), true)));
}

// ------------------------------------------------------------- scorecard ---
const band = (v, okLo, okHi, watchLo, watchHi) => {
  if (!isReal(v)) return 'na';
  if (v >= okLo && v <= okHi) return 'ok';
  if (v >= watchLo && v <= watchHi) return 'watch';
  return 'fix';
};
const SCORE = { ok: 1, watch: 0.55, fix: 0.1, na: null };

// Checkpoint definitions — label, how it's measured, target text, band fn,
// and the FIX GUIDE copy. `weight` feeds the overall score.
export const CHECKPOINTS = [
  { key: 'dip', label: 'Dip depth', unit: '°', weight: 1,
    target: '105–140° knee angle at the bottom of the dip',
    band: (v) => band(v, 105, 140, 92, 152),
    why: 'The legs are the engine. Too shallow a dip leaves the arm to generate the power (flat, arm-heavy shot, short on range); too deep slows the rhythm and lets the defence close. Mid-range knee flexion keeps leg drive AND rhythm.',
    how: ['One-dribble pull-ups at the elbow — count "down-UP" out loud; the "down" is the dip, the "UP" is the rise.', 'Form shooting from 2–3 m: 10 reps focusing only on a consistent quarter-squat dip depth.', 'Film 5 free throws side-on; compare the dip frame — same depth every rep.'] },
  { key: 'setHeight', label: 'Set point height', unit: 'torso', weight: 1.2,
    target: 'Wrist at or above the eye line at the set point',
    band: (v) => band(v, 0, 9, -0.15, 9),
    why: 'A high set point raises the release height → a more vertical entry angle into the rim at the same release angle → a bigger margin for error (Hall, Basic Biomechanics ch.10). It also makes the shot harder to contest.',
    how: ['Wall-form reps: stand 30 cm from a wall, bring the ball to the forehead and extend straight up without the elbow touching the wall.', 'Pause shooting: hold the set point for 1 s, check the wrist is at the eyebrow, then release.', 'Cue: "ball to the forehead, not the chin".'] },
  { key: 'setElbow', label: 'Elbow at set', unit: '°', weight: 0.8,
    target: '~75–105° elbow angle at the set point (L-shape)',
    band: (v) => band(v, 75, 105, 65, 120),
    why: 'An L-shaped elbow at the set stores the extension range that produces a smooth, straight release. An already-open elbow (>120°) pushes the ball; a very closed one (<65°) drops the set point and lengthens the release.',
    how: ['Mirror reps: load the ball at the set and look for the "L" — forearm vertical, upper arm parallel to the floor.', 'One-hand form shooting with the guide hand off the ball, 2 m from the rim, 20 reps.'] },
  { key: 'elbowAlign', label: 'Elbow under the ball', unit: 'torso', weight: 1,
    target: 'Wrist roughly above the elbow at the set (offset ≤ 0.25 torso)',
    band: (v) => band(v, 0, 0.25, 0, 0.4),
    why: 'When the elbow sits under the wrist, the extension drives the ball straight at the rim; a flared or trailing elbow adds a sideways component the wrist has to correct — the classic left/right miss.',
    how: ['Wall-slide drill: shooting-side shoulder to a wall, elbow brushes the wall through the whole extension.', 'Cue: "elbow to the rim" — the elbow points at the target before the arm fires.', 'Guide-hand discipline: the off hand leaves the ball at the set, never pushes.'] },
  { key: 'releaseExt', label: 'Elbow extension at release', unit: '°', weight: 1,
    target: '≥ 160° at release (full extension)',
    band: (v) => band(v, 160, 181, 145, 181),
    why: 'Full extension gives the longest lever and the highest release point and makes the wrist snap the last link of the chain. A short arm (<145°) pushes the ball with the shoulder → low arc, inconsistent distance.',
    how: ['"Reach into the rim" cue — the fingers finish pointing at the hoop, elbow locked.', 'Chair shooting: seated, shoot form shots so the power must come from full extension + wrist, not the legs.', 'Slow-motion shadow reps: 10 reps at 50% speed holding the extended finish 2 s.'] },
  { key: 'releaseArm', label: 'Release arm angle', unit: '°', weight: 0.9,
    target: 'Forearm 45–65° above horizontal at release (release-angle proxy)',
    band: (v) => band(v, 45, 65, 36, 74),
    why: 'The forearm angle at release drives the ball’s launch angle. Literature puts the effective release angle around 45–55° for a typical release height (Knudson 1993; Okazaki et al. 2015); too flat means a smaller rim window (Hall ch.10), too steep costs range and timing. Note: this is the ARM angle — true ball angle needs ball tracking.',
    how: ['Arc drill: shoot to a target 30–40 cm ABOVE the rim (a mark on the backboard / hand of a partner on a box) — swish only.', 'Cue: "shoot UP, not AT" — aim for the high point of the arc, not the rim.', 'Film side-on and check the follow-through fingers point at ~60°, not at the rim.'] },
  { key: 'timing', label: 'Release vs jump apex', unit: 'ms', weight: 0.9,
    target: 'Release between −120 ms and +60 ms around the apex',
    band: (v) => band(v, -120, 60, -250, 150),
    why: 'Releasing at/just before the top of the jump (Knudson 1993) uses the leg drive and the highest release point; releasing on the way down ("late") adds a downward body velocity the arm must overcome and lowers the release.',
    how: ['Rhythm shooting: "1-2-UP" — the release finishes on the UP.', 'Jump-stop into shot from a pass: feel the ball leave at the top; a partner calls "late" when the feet are falling.', 'Reduce dip depth if the release is consistently late — the jump is taking too long.'] },
  { key: 'follow', label: 'Follow-through hold', unit: 'ms', weight: 0.8,
    target: 'Arm held high ≥ 300 ms after release, wrist flexed',
    band: (v) => band(v, 300, 5000, 150, 5000),
    why: 'The follow-through is the receipt of a complete extension + wrist flexion; dropping the arm early is almost always a sign the snap was cut short, and it removes the backspin that softens the bounce on the rim.',
    how: ['"Hold it till it hits" — freeze the finish until the ball reaches the rim, every rep, for a full session.', 'Cue: "hand in the cookie jar" — fingers down over the rim at the finish.'] },
  { key: 'trunk', label: 'Trunk at release', unit: '°', weight: 0.7,
    target: 'Near vertical (≤ 10° lean) at release',
    band: (v) => band(v, 0, 10, 0, 18),
    why: 'A vertical trunk keeps the shoulders square and the release height maximal; a fade/lean changes the release point every rep (unless it is a deliberate fade-away). Forward lean on the catch usually means the feet are late.',
    how: ['Feet first: land the jump-stop with the feet already set, chest up, before the ball arrives.', 'Core + balance: single-leg RDL holds, 3×20 s; tall-kneeling shooting 10 reps (trunk can’t lean).', 'Film front + side: the nose stays over the base through the release.'] },
];

// Score one shot cycle → checkpoint values + overall score + phase timings.
export function scoreShot(series, c, { fps, scaleCm } = {}) {
  const { sm, raw, tMs } = series;
  const at = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : null);
  const v = {
    dip: at(sm.knee, c.dip),
    setHeight: at(sm.wristEye, c.set),
    setElbow: at(sm.elbow, c.set),
    elbowAlign: at(sm.wristElbowX, c.set),
    releaseExt: at(sm.elbow, c.release),
    releaseArm: at(sm.forearm, c.release),
    timing: c.apex >= 0 && c.release >= 0 ? tMs[c.release] - tMs[c.apex] : null,
    follow: c.followEnd > c.release ? tMs[c.followEnd] - tMs[c.release] : 0,
    trunk: at(sm.trunk, c.release),
  };
  const checks = CHECKPOINTS.map((d) => {
    const val = v[d.key];
    const status = d.band(val);
    return { key: d.key, label: d.label, unit: d.unit, value: val, display: fmtValue(d.key, val), target: d.target, status, why: d.why, how: d.how, weight: d.weight };
  });
  let wsum = 0, ssum = 0;
  for (const ch of checks) { const s = SCORE[ch.status]; if (s == null) continue; wsum += ch.weight; ssum += ch.weight * s; }
  const score = wsum > 0 ? Math.round((ssum / wsum) * 100) : null;
  // Extra info (not scored): rhythm + jump + heights in cm (if scale known).
  const jumpRise = isReal(c.baseHip) && c.apex >= 0 && isReal(sm.hipY[c.apex]) ? sm.hipY[c.apex] - c.baseHip : null;
  const relHeight = c.release >= 0 && isReal(sm.wristY[c.release]) && isReal(at(sm.ankleY, c.stance)) ? sm.wristY[c.release] - at(sm.ankleY, c.stance) : null;
  const info = {
    dipToReleaseMs: c.release > c.dip ? Math.round(tMs[c.release] - tMs[c.dip]) : null,
    stanceToReleaseMs: c.release > c.stance ? Math.round(tMs[c.release] - tMs[c.stance]) : null,
    jumpRiseCm: isReal(jumpRise) && scaleCm ? round(jumpRise * scaleCm, 0) : null,
    releaseHeightCm: isReal(relHeight) && scaleCm ? round(relHeight * scaleCm, 0) : null,
    kneeOtherAtDip: at(sm.kneeOther, c.dip),
    hipAtDip: at(sm.hip, c.dip),
    shoulderAtRelease: at(sm.shoulder, c.release),
  };
  const phases = [
    { key: 'stance', label: 'STANCE', idx: c.stance },
    { key: 'dip', label: 'DIP', idx: c.dip },
    { key: 'set', label: 'SET', idx: c.set },
    { key: 'release', label: 'RELEASE', idx: c.release },
    { key: 'apex', label: 'APEX', idx: c.apex },
    { key: 'follow', label: 'FOLLOW', idx: c.followEnd },
    { key: 'landing', label: 'LAND', idx: c.landing },
  ].filter((p) => p.idx >= 0).map((p) => ({ ...p, tMs: tMs[p.idx] }));
  return { checks, score, info, phases, raw: v };
}

export function fmtValue(key, v) {
  if (!isReal(v)) return '—';
  switch (key) {
    case 'setHeight': return (v >= 0 ? '+' : '') + round(v, 2) + ' torso';
    case 'elbowAlign': return round(v, 2) + ' torso';
    case 'timing': return (v > 0 ? '+' : '') + Math.round(v) + ' ms';
    case 'follow': return Math.round(v) + ' ms';
    default: return round(v, 0) + '°';
  }
}

// cm-per-image-unit scale from the athlete's stature. Eye→ankle vertical
// distance at stance ≈ 0.90 × stature (eye height ≈ 0.936 H, ankle ≈ 0.039 H).
export function statureScale(series, stanceIdx, statureCm) {
  if (!isReal(statureCm) || statureCm < 120) return null;
  const { sm } = series;
  const e = sm.eyeY ? sm.eyeY[stanceIdx] : null;
  const a = sm.ankleY[stanceIdx];
  const eyeY = isReal(e) ? e : series.raw.eyeY[stanceIdx];
  if (!isReal(eyeY) || !isReal(a) || eyeY - a <= 0.05) return null;
  return (statureCm * 0.897) / (eyeY - a);
}

// Per-frame readout for the player (raw, unsmoothed where it reads better).
export function frameReadout(series, i) {
  const { raw, sm } = series;
  const g = (arr) => (i >= 0 && i < arr.length ? arr[i] : null);
  return {
    knee: g(sm.knee), hip: g(sm.hip), elbow: g(sm.elbow), shoulder: g(sm.shoulder),
    trunk: g(sm.trunk), forearm: g(sm.forearm), wristEye: g(sm.wristEye), wristElbowX: g(sm.wristElbowX),
    hipVel: g(sm.hipVel), visOk: g(raw.visOk),
  };
}

// Full pipeline.
export function analyzeShotClip(frames, { hand = 'R', statureCm = null } = {}) {
  if (!frames || frames.length < 6) return { ok: false, error: 'Not enough frames with a visible body. Film the whole body, side-on, in good light.' };
  const dims = frames.dims || { w: 16, h: 9 };
  const aspect = dims.w / dims.h;
  const tMs = frames.map((f) => f.t);
  const span = (tMs[tMs.length - 1] - tMs[0]) / 1000;
  const fps = span > 0 ? (frames.length - 1) / span : 30;
  const series = buildSeries(frames, { hand, aspect });
  series.sm.eyeY = smooth(series.raw.eyeY);
  const visRatio = series.raw.visOk.filter(Boolean).length / frames.length;
  const cycles = detectShots(series, fps);
  if (!cycles.length) return { ok: false, error: 'No shot detected — I could not find a dip followed by an arm extension. Make sure the clip shows the full shot side-on (shooting arm towards the camera).', series, fps, visRatio };
  const shots = cycles.map((c, k) => {
    const scaleCm = statureScale(series, c.stance, statureCm);
    const s = scoreShot(series, c, { fps, scaleCm });
    return { index: k + 1, cycle: c, scaleCm, ...s };
  });
  // Consistency across shots (CV of dip→release time and of release-arm angle).
  const cv = (arr) => { const a = arr.filter(isReal); if (a.length < 2) return null; const m = mean(a); const sd = Math.sqrt(mean(a.map((x) => (x - m) ** 2))); return m ? round((sd / Math.abs(m)) * 100, 0) : null; };
  const consistency = shots.length > 1 ? { rhythmCv: cv(shots.map((s) => s.info.dipToReleaseMs)), releaseArmCv: cv(shots.map((s) => s.raw.releaseArm)), dipCv: cv(shots.map((s) => s.raw.dip)), n: shots.length } : null;
  const quality = visRatio >= 0.8 ? 'good' : visRatio >= 0.55 ? 'fair' : 'poor';
  return { ok: true, fps: round(fps, 1), frameCount: frames.length, hand, series, shots, consistency, quality, visRatio: round(visRatio, 2), aspect };
}
