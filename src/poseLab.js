// poseLab.js — shared movement-analysis foundation.
//
// Builds on repCounter.js (angleAt / ANGLE_DEFS / detectChannels / findPeaks /
// medianFilter) and turns a captured pose stream into the metrics every
// camera feature needs: velocity (VBT), range-of-motion + tempo phases, rep
// segmentation, and jump flight-time. Pure functions, no React — fed by a
// MediaPipe capture loop (see useMediaPipePose) and consumed by MovementLab,
// the AR overlay, and the athletic-testing → evaluation path.
//
// Coordinate spaces:
//   • landmarks       — 2D normalized [0..1] image coords (for drawing).
//   • worldLandmarks  — 3D METRES, origin at the hip midpoint. Velocity/ROM/
//     jump use these so a phone at any distance reads true metric values.
// A "frame" captured by the loop is { t (ms), landmarks, worldLandmarks }.

import { ANGLE_DEFS, angleAt, detectChannels, medianFilter, findPeaks, isReal } from './repCounter';

// MediaPipe Pose landmark indices we lean on.
export const LM = {
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_ANKLE: 27, R_ANKLE: 28,
  L_SHO: 11, R_SHO: 12,
  L_FOOT: 31, R_FOOT: 32,
};

const mid = (a, b) => (a == null || b == null ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });

// In MediaPipe world coords +y points DOWN. Vertical "up" displacement is a
// DECREASE in y. upPos() flips so larger = higher, which reads naturally for
// velocity (concentric of a press/squat is upward) and jump height.
const upPos = (lm) => (lm == null ? null : -(lm.y ?? 0));

// ---------------------------------------------------------------------------
// Channel signal — the joint-angle time series a rep cycle rides on.
// ---------------------------------------------------------------------------
// Returns { t[], angle[], kind, channels } where angle is median-smoothed and
// aligned to the frame timestamps. Mirrors the live counter's averaging of the
// L+R channel pair so asymmetry doesn't drop a rep.
export function channelSignal(frames, exerciseTitle) {
  const { kind, channels } = detectChannels(exerciseTitle);
  const t = frames.map(f => f.t);
  const raw = frames.map(f => {
    const lms = f.worldLandmarks;
    if (!lms || channels.length === 0) return null;
    const vals = channels.map(name => {
      const d = ANGLE_DEFS.find(a => a.name === name);
      return d ? angleAt(lms, d.a, d.b, d.c) : null;
    }).filter(isReal);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  return { t, angle: medianFilter(raw, 5), kind, channels };
}

// ---------------------------------------------------------------------------
// Rep segmentation.
// ---------------------------------------------------------------------------
// A rep on these channels is top → bottom → top: the angle dips at the bottom
// and returns at the top. We find the TOP peaks (local maxima of the angle)
// with the same prominence the offline counter validated (25°), then a rep is
// the span between two consecutive tops, with the bottom = the angle minimum
// between them. Returns [{ startIdx, bottomIdx, endIdx }].
export function segmentReps(angle, fps = 30) {
  const minDist = Math.max(4, Math.round(fps * 0.4)); // ≥0.4s between tops
  const tops = findPeaks(angle, 25, minDist).map(p => p.idx);
  const reps = [];
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], b = tops[i + 1];
    let bottomIdx = a, bottomV = Infinity;
    for (let j = a; j <= b; j++) {
      const v = angle[j];
      if (isReal(v) && v < bottomV) { bottomV = v; bottomIdx = j; }
    }
    reps.push({ startIdx: a, bottomIdx, endIdx: b });
  }
  return reps;
}

// ---------------------------------------------------------------------------
// Velocity — VBT. Vertical speed (m/s) of the bar proxy (wrist midpoint, or a
// supplied landmark) through the CONCENTRIC portion of each rep.
// ---------------------------------------------------------------------------
// Concentric = bottom → top (the lift drives the load up). We measure mean
// concentric velocity (total upward displacement / duration) and peak
// instantaneous velocity, per rep, then velocity-loss % vs the best rep.
export function velocityMetrics(frames, angle, reps, barLandmark = 'wrist') {
  const pos = frames.map(f => {
    const w = f.worldLandmarks; if (!w) return null;
    if (barLandmark === 'hip') return upPos(mid(w[LM.L_HIP], w[LM.R_HIP]));
    return upPos(mid(w[LM.L_WRIST], w[LM.R_WRIST]));
  });
  const perRep = reps.map(({ bottomIdx, endIdx }) => {
    const t0 = frames[bottomIdx]?.t, t1 = frames[endIdx]?.t;
    const p0 = pos[bottomIdx], p1 = pos[endIdx];
    if (!isReal(p0) || !isReal(p1) || t1 == null || t0 == null || t1 <= t0) return null;
    const dt = (t1 - t0) / 1000;
    const disp = p1 - p0; // metres up over the concentric
    const mean = disp / dt;
    let peak = 0;
    for (let j = bottomIdx; j < endIdx; j++) {
      const a = pos[j], b = pos[j + 1];
      const ta = frames[j]?.t, tb = frames[j + 1]?.t;
      if (!isReal(a) || !isReal(b) || ta == null || tb == null || tb <= ta) continue;
      const inst = (b - a) / ((tb - ta) / 1000);
      if (inst > peak) peak = inst;
    }
    return { meanConcentric: round2(mean), peak: round2(peak), rom: round2(Math.abs(disp)), durSec: round2(dt) };
  });
  const valid = perRep.filter(Boolean);
  const best = valid.reduce((m, r) => Math.max(m, r.meanConcentric), 0) || 1;
  const withLoss = perRep.map(r => r && ({ ...r, lossPct: Math.round((1 - r.meanConcentric / best) * 100) }));
  const lastValid = [...withLoss].reverse().find(Boolean);
  return {
    perRep: withLoss,
    bestMean: round2(best),
    finalLossPct: lastValid ? lastValid.lossPct : 0,
  };
}

// ---------------------------------------------------------------------------
// ROM + tempo per rep, from the joint-angle channel.
// ---------------------------------------------------------------------------
// ROM = top angle − bottom angle (degrees of joint travel). Tempo splits the
// rep into eccentric (top→bottom), a pause at the bottom, and concentric
// (bottom→top), in seconds. Flags ROM collapse: a rep whose ROM is <85% of
// the rep with the largest ROM (fatigue / cheat-rep marker).
export function romTempoMetrics(frames, angle, reps) {
  const perRep = reps.map(({ startIdx, bottomIdx, endIdx }) => {
    const top = Math.max(angle[startIdx] ?? 0, angle[endIdx] ?? 0);
    const bottom = angle[bottomIdx];
    if (!isReal(top) || !isReal(bottom)) return null;
    const rom = round1(top - bottom);
    const tTop = frames[startIdx]?.t, tBot = frames[bottomIdx]?.t, tEnd = frames[endIdx]?.t;
    // Pause = frames near the bottom angle (within 4°) clustered around bottomIdx.
    let pStart = bottomIdx, pEnd = bottomIdx;
    while (pStart > startIdx && isReal(angle[pStart - 1]) && angle[pStart - 1] - bottom < 4) pStart--;
    while (pEnd < endIdx && isReal(angle[pEnd + 1]) && angle[pEnd + 1] - bottom < 4) pEnd++;
    const ecc = ((frames[pStart]?.t ?? tBot) - tTop) / 1000;
    const pause = ((frames[pEnd]?.t ?? tBot) - (frames[pStart]?.t ?? tBot)) / 1000;
    const con = (tEnd - (frames[pEnd]?.t ?? tBot)) / 1000;
    return { rom, ecc: round1(ecc), pause: round1(pause), con: round1(con) };
  });
  const valid = perRep.filter(Boolean);
  const maxRom = valid.reduce((m, r) => Math.max(m, r.rom), 0) || 1;
  const withFlag = perRep.map(r => r && ({ ...r, romPct: Math.round((r.rom / maxRom) * 100), collapsed: r.rom < 0.85 * maxRom }));
  return { perRep: withFlag, maxRom: round1(maxRom), collapsedCount: withFlag.filter(r => r && r.collapsed).length };
}

// ---------------------------------------------------------------------------
// Jump test — vertical jump height from flight time (camera "combine").
// ---------------------------------------------------------------------------
// Track the higher-of-the-two ankles' vertical position. Standing baseline =
// median ankle height over the first 0.5s. Flight = the contiguous span where
// both ankles rise clearly above baseline; height = g·t²/8 from flight time.
// Also reports the raw peak rise in metres as a cross-check.
export function jumpMetrics(frames) {
  if (frames.length < 8) return null;
  const ankle = frames.map(f => {
    const w = f.worldLandmarks; if (!w) return null;
    const a = upPos(w[LM.L_ANKLE]), b = upPos(w[LM.R_ANKLE]);
    if (!isReal(a) && !isReal(b)) return null;
    return Math.min(isReal(a) ? a : Infinity, isReal(b) ? b : Infinity) === Infinity
      ? null : ((isReal(a) ? a : b) + (isReal(b) ? b : a)) / 2;
  });
  const t0 = frames[0].t;
  const baseSamples = ankle.filter((v, i) => isReal(v) && frames[i].t - t0 < 500);
  if (baseSamples.length < 3) return null;
  const baseline = median(baseSamples);
  const RISE = 0.06; // m above standing to count as airborne
  let i = 0; const n = ankle.length;
  let best = null;
  while (i < n) {
    if (isReal(ankle[i]) && ankle[i] - baseline > RISE) {
      let j = i;
      while (j + 1 < n && isReal(ankle[j + 1]) && ankle[j + 1] - baseline > RISE) j++;
      const flightSec = (frames[j].t - frames[i].t) / 1000;
      let peakRise = 0;
      for (let k = i; k <= j; k++) if (isReal(ankle[k])) peakRise = Math.max(peakRise, ankle[k] - baseline);
      if (!best || flightSec > best.flightSec) best = { flightSec, peakRise };
      i = j + 1;
    } else i++;
  }
  if (!best || best.flightSec < 0.12) return null; // <120ms = noise, not a jump
  const heightCm = (9.81 * best.flightSec * best.flightSec / 8) * 100;
  return {
    heightCm: Math.round(heightCm),
    flightMs: Math.round(best.flightSec * 1000),
    peakRiseCm: Math.round(best.peakRise * 100),
  };
}

// ---------------------------------------------------------------------------
// 3D skeleton frame — world landmarks recentred for rendering. Returns the
// pose at a frame as points the 3D viewer can plot directly (y already flipped
// up-positive, hip-centred).
// ---------------------------------------------------------------------------
export const POSE_BONES = [
  [11, 13], [13, 15], [12, 14], [14, 16], [11, 12],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];
export function frameToPoints3D(worldLandmarks) {
  if (!worldLandmarks) return null;
  return worldLandmarks.map(lm => lm ? { x: lm.x, y: -(lm.y ?? 0), z: -(lm.z ?? 0) } : null);
}

// ---------------------------------------------------------------------------
// Top-level: run the full battery on a captured clip.
// ---------------------------------------------------------------------------
export function analyzeClip(frames, exerciseTitle, opts = {}) {
  if (!frames || frames.length < 4) return { ok: false, reason: 'too-few-frames' };
  const fps = estimateFps(frames);
  const { angle, kind, channels } = channelSignal(frames, exerciseTitle);
  const reps = channels.length ? segmentReps(angle, fps) : [];
  const velocity = reps.length ? velocityMetrics(frames, angle, reps, opts.barLandmark) : null;
  const romTempo = reps.length ? romTempoMetrics(frames, angle, reps) : null;
  return { ok: true, fps, kind, repCount: reps.length, reps, velocity, romTempo, frameCount: frames.length };
}

// --- small helpers ---
export function estimateFps(frames) {
  if (frames.length < 2) return 30;
  const span = frames[frames.length - 1].t - frames[0].t;
  return span > 0 ? Math.round(((frames.length - 1) / span) * 1000) : 30;
}
function median(arr) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function round2(x) { return Math.round(x * 100) / 100; }
function round1(x) { return Math.round(x * 10) / 10; }
