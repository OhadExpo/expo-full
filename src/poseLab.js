// poseLab.js — shared movement-analysis foundation.
//
// Builds on repCounter.js (angleAt / ANGLE_DEFS / detectChannels / findPeaks /
// medianFilter) and turns a captured pose stream into the metrics every
// camera feature needs: velocity (VBT), range-of-motion + tempo phases, rep
// segmentation, and jump flight-time. Pure functions, no React — fed by a
// MediaPipe capture loop (see useMediaPipePose) and consumed by MovementLab,
// the AR overlay, and the athletic-testing → evaluation path.
//
// Coordinate spaces — and why each metric uses the one it does:
//   • landmarks       — 2D normalized [0..1] image coords, ABSOLUTE in the
//     frame. Used for velocity + jump (whole-body vertical translation).
//   • worldLandmarks  — 3D METRES but HIP-CENTERED (origin = hip midpoint).
//     Used for joint ANGLES (ROM/tempo/rep cycle) — rotation-invariant, so
//     hip-centering is fine. It CANCELS whole-body translation, so it must
//     NOT be used for bar velocity or jump height (a squat/jump moves the
//     whole body, which is ~static relative to the hip → reads ~0).
// Metric scale for image-space metres: shoulder→ankle length is known in
// metres (worldLandmarks) and measured in image units, giving metres-per-
// image-unit per frame (a mostly-vertical ruler keeps aspect-ratio error low).
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
const mid2 = (a, b) => (a == null || b == null ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// metres-per-image-unit for this frame, from the shoulder→ankle ruler.
function frameScaleY(f) {
  const w = f.worldLandmarks, im = f.landmarks;
  if (!w || !im) return null;
  const ws = w[LM.L_SHO], wa = w[LM.L_ANKLE], is = im[LM.L_SHO], ia = im[LM.L_ANKLE];
  if (!ws || !wa || !is || !ia) return null;
  const worldLen = Math.hypot(ws.x - wa.x, ws.y - wa.y, (ws.z ?? 0) - (wa.z ?? 0));
  const imgLen = Math.hypot(is.x - ia.x, is.y - ia.y);
  return imgLen > 0 ? worldLen / imgLen : null;
}
// Image "up" position in metres: image y is DOWN, so up = -y · scale. This IS
// the correct convention — proved definitively 2026-07-04 with a deterministic
// test against demoMotion.js's synthetic jump data (100% known ground-truth
// motion, no camera/rotation ambiguity possible): at the exact instant the
// wrist is truly rising fastest, -y·scale reads +5.95 m/s (correct) while the
// +y·scale flip I'd shipped earlier that session read -5.95 m/s (backwards).
// That flip is REVERTED. It was a mistake — a live-testing report ("still
// negative on the way up") that I patched by matching the symptom instead of
// finding the actual cause, without a deterministic check to catch that the
// "fix" broke a case that was already correct. Ohad's repeated reports were
// real; the true cause is still open (see project_lift_metrics_backlog memory)
// — most likely a misjudged instant on a fast, multi-oscillation signal (the
// exact scrubbed frame not matching what looks like "clearly rising" in a
// single freeze-frame), since the sign math itself now has a hard proof.
function imgUpMetres(lm2, scale) { return lm2 && isReal(scale) ? -lm2.y * scale : null; }

// Physical plausibility ceiling for vertical bar/hip speed. No real human
// lift or jump gets anywhere near this — even a fast Olympic-lift bar speed
// or a max-effort jump's takeoff velocity tops out around 3-4 m/s. A single
// frame-pair reading above this is not a real measurement; it's tracking
// noise (most plausibly the subject-selection picking a different detected
// person for a frame — see pickSubjectIdx in MovementLab.jsx — but this
// clamp is a direct safety net regardless of the exact cause). Rejected
// frame-pairs are treated as missing data (null) so the median filter
// interpolates through them from real neighbours, instead of a single bad
// frame corrupting the displayed speed or an inflated "peak" number.
const MAX_SPEED_MPS = 6;
function clampSpeed(v) { return (v != null && Math.abs(v) > MAX_SPEED_MPS) ? null : v; }

// Same idea as MAX_SPEED_MPS, applied to joint angles: no real joint changes
// this fast frame-to-frame (1600 deg/s is well above even elite explosive
// movement) — a jump this large is far more likely the subject-tracker
// having briefly locked onto a different, differently-posed person (see
// pickSubjectIdx in MovementLab.jsx) than a genuine flexion/extension. Applied
// as a CAUSAL filter (compared against the last ACCEPTED value, in frame
// order) since angle itself isn't a derivative like speed — rejecting one bad
// frame shouldn't cascade into rejecting every frame after it.
const MAX_DEG_PER_SEC = 1600;
function clampAngleSeries(raw, t) {
  const out = new Array(raw.length).fill(null);
  let lastGood = null, lastT = null;
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (!isReal(v)) continue;
    if (lastGood == null || lastT == null || t[i] <= lastT) { out[i] = v; lastGood = v; lastT = t[i]; continue; }
    const dtSec = (t[i] - lastT) / 1000;
    const degPerSec = Math.abs(v - lastGood) / dtSec;
    if (degPerSec > MAX_DEG_PER_SEC) continue; // reject — leave null, don't advance lastGood
    out[i] = v; lastGood = v; lastT = t[i];
  }
  return out;
}

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
  return { t, angle: medianFilter(clampAngleSeries(raw, t), 5), kind, channels };
}

// ---------------------------------------------------------------------------
// Rep segmentation.
// ---------------------------------------------------------------------------
// A rep is a DIP in the joint angle (top → bottom → top). We count BOTTOMS
// (troughs), not tops — counting tops misses the first/last rep because a clip
// starts and ends at a top sitting on the array edge (findPeaks needs both
// neighbours). Troughs always sit between tops, so N reps → N troughs.
// Each rep spans the local max before the trough → trough → local max after.
// Prominence 25° matches the offline counter. Returns [{startIdx,bottomIdx,endIdx}].
// Reject candidate troughs that aren't REAL reps. The raw peak-finder counts
// ANY ≥25° joint dip — so a fidget, a re-rack, a walkout, or a shallow setup
// motion all get counted (verified on real clips: an RDL clip counted 10 when
// the athlete did 8 — the first two "reps" were 34° twitches vs 100°+ hinges).
// Two gates, both grounded in real captured pose data:
//   1. AMPLITUDE — a real rep's ROM clusters near the set's typical ROM. Reject
//      anything under ~45% of the robust "real-rep" ROM (median of the upper
//      60% of candidate ROMs, so a few shallow fakes can't drag the reference
//      down). Absolute floor 26° kills pure noise. Fatigued/partial reps (60%+
//      ROM) are kept — only twitches/setup are cut.
//   2. STATIONARY — during a real rep the base stays put; a walkout / walk-back
//      translates the hip-center along the ground plane. Reject >0.35 m net
//      horizontal (needs world-landmark frames; skipped for angle-only callers).
export function validateReps(reps, angle, frames = null, fps = 30) {
  if (!reps || reps.length < 2) return { kept: reps || [], rejected: [] };
  const hipXZ = (i) => {
    const l = frames && frames[i] && frames[i].worldLandmarks;
    if (!l || !l[23] || !l[24]) return null;
    return { x: (l[23].x + l[24].x) / 2, z: ((l[23].z ?? 0) + (l[24].z ?? 0)) / 2 };
  };
  const m = reps.map(r => {
    const bot = angle[r.bottomIdx];
    const desc = isReal(angle[r.startIdx]) ? angle[r.startIdx] - bot : 0;
    const asc = isReal(angle[r.endIdx]) ? angle[r.endIdx] - bot : 0;
    const minROM = Math.min(desc, asc);           // full down-up cycle depth
    const a = hipXZ(r.startIdx), b = hipXZ(r.endIdx);
    const net = (a && b) ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
    const dur = frames && frames[r.startIdx] && frames[r.endIdx] ? (frames[r.endIdx].t - frames[r.startIdx].t) / 1000 : 1;
    return { r, minROM, net, dur };
  });
  // Robust real-rep ROM reference: median of the upper 60% of candidate ROMs.
  const romsDesc = m.map(x => x.minROM).sort((a, b) => b - a);
  const upper = romsDesc.slice(0, Math.max(1, Math.ceil(romsDesc.length * 0.6)));
  const refROM = upper[Math.floor(upper.length / 2)] || 0;
  const ampFloor = Math.max(26, 0.45 * refROM);
  const kept = [], rejected = [];
  for (const x of m) {
    let reason = null;
    if (x.minROM < ampFloor) reason = 'shallow';                 // twitch / partial setup
    else if (frames && x.net > 0.35) reason = 'moved';           // walkout / walk-back
    else if (x.dur < 0.35) reason = 'too-fast';                  // sub-rep flicker
    if (reason) rejected.push({ bottomIdx: x.r.bottomIdx, minROM: Math.round(x.minROM), reason });
    else kept.push(x.r);
  }
  return { kept, rejected };
}

export function segmentReps(angle, fps = 30, frames = null) {
  const minDist = Math.max(4, Math.round(fps * 0.4)); // ≥0.4s between reps
  const inv = angle.map(v => (isReal(v) ? -v : v));
  const bottoms = findPeaks(inv, 25, minDist).map(p => p.idx).sort((a, b) => a - b);
  const reps = [];
  for (let k = 0; k < bottoms.length; k++) {
    const b = bottoms[k];
    const lo = k === 0 ? 0 : bottoms[k - 1];
    const hi = k === bottoms.length - 1 ? angle.length - 1 : bottoms[k + 1];
    let startIdx = lo, sv = -Infinity;
    for (let j = lo; j <= b; j++) if (isReal(angle[j]) && angle[j] > sv) { sv = angle[j]; startIdx = j; }
    let endIdx = hi, ev = -Infinity;
    for (let j = b; j <= hi; j++) if (isReal(angle[j]) && angle[j] > ev) { ev = angle[j]; endIdx = j; }
    reps.push({ startIdx, bottomIdx: b, endIdx });
  }
  // Gate out fake reps (fidget / walkout / shallow setup). Attach rejection
  // detail as a property so callers can show "8 reps · 2 not counted".
  const { kept, rejected } = validateReps(reps, angle, frames, fps);
  kept.rejected = rejected;
  return kept;
}

// ---------------------------------------------------------------------------
// Velocity — VBT. Vertical speed (m/s) of the bar proxy (wrist midpoint, or a
// supplied landmark) through the CONCENTRIC portion of each rep.
// ---------------------------------------------------------------------------
// Concentric = bottom → top (the lift drives the load up). We measure mean
// concentric velocity (total upward displacement / duration) and peak
// instantaneous velocity, per rep, then velocity-loss % vs the best rep.
export function velocityMetrics(frames, angle, reps, barLandmark = 'wrist') {
  // Bar position in metres, IMAGE-space (absolute vertical) × ONE stable
  // metres-per-image-unit for the whole clip. Using worldLandmarks here would
  // read ~0 (the bar is static relative to the hip).
  //
  // This MUST be a single locked scale, not recomputed per frame (audit
  // 2026-07-04, confirmed bug — Ohad: negative speed while visibly jumping
  // up). d(pos)/dt with a per-frame scale[i] expands to
  // scale·(dy/dt) + y·(dscale/dt) — a spurious second term riding on the
  // shoulder→ankle ruler's OWN frame-to-frame jitter. That ruler is unstable
  // exactly when it matters most (fast reps, occlusion, legs tucking), and
  // the spurious term can dominate and even flip the sign of the true
  // velocity. jumpMetrics already locks its scale to a stable window for
  // this reason (see its comment); this just wasn't propagated here.
  const scale = median(frames.map(frameScaleY).filter(isReal));
  if (!isReal(scale) || scale <= 0) return null;
  const pos = frames.map((f) => {
    const im = f.landmarks; if (!im) return null;
    const p = barLandmark === 'hip' ? mid2(im[LM.L_HIP], im[LM.R_HIP]) : mid2(im[LM.L_WRIST], im[LM.R_WRIST]);
    return imgUpMetres(p, scale);
  });
  const perRep = reps.map(({ startIdx, bottomIdx, endIdx }) => {
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
      const inst = clampSpeed((b - a) / ((tb - ta) / 1000));
      if (inst != null && inst > peak) peak = inst;
    }
    // Peak (max instantaneous) can never be below the mean; if the true peak
    // frame-pair got clamped out on a fast rep, floor peak at the mean so the
    // table never shows the physically-impossible PEAK < MEAN.
    if (mean > peak) peak = mean;
    // startT (ms, clip-relative) — the top position before this rep's descent
    // begins. Lets a UI click-to-seek to "where rep N starts" (Review player).
    const startT = frames[startIdx]?.t;
    return { meanConcentric: round2(mean), peak: round2(peak), rom: round2(Math.abs(disp)), durSec: round2(dt), startT: startT != null ? Math.round(startT) : null };
  });
  const valid = perRep.filter(Boolean);
  const best = valid.reduce((m, r) => Math.max(m, r.meanConcentric), 0);
  // If no rep produced a positive concentric velocity (occlusion / noisy ruler),
  // don't fabricate a 1.0 m/s baseline (the old `|| 1`) — that emitted plausible-
  // but-wrong VBT loss %. Return null so the UI says it couldn't read velocity.
  // (camera audit)
  if (!(best > 0)) return null;
  const withLoss = perRep.map(r => r && ({ ...r, lossPct: Math.round((1 - r.meanConcentric / best) * 100) }));
  const lastValid = [...withLoss].reverse().find(Boolean);
  return {
    perRep: withLoss,
    bestMean: round2(best),
    finalLossPct: lastValid ? lastValid.lossPct : 0,
  };
}

// Continuous bar-speed trace — instantaneous SIGNED vertical bar speed (m/s)
// per frame across the WHOLE clip, for the velocity tab's "speed over time"
// graph. Signed, not rectified (Ohad 2026-07-04: "speed should be displayed
// only as vertical, so it should be positive on the way up but negative on
// the way down") — positive = concentric/lifting, negative = eccentric/
// lowering, matching how real VBT devices (GymAware, Vmaxpro, etc.) report
// bar speed. Median-smoothed against per-frame ruler/landmark jitter.
// t is ms-from-clip-start so the x-axis is real time.
export function barSpeedSeries(frames, barLandmark = 'wrist') {
  if (!frames || frames.length < 3) return null;
  // ONE stable metres-per-image-unit for the whole clip, not recomputed per
  // frame — see the long comment in velocityMetrics for why a per-frame ruler
  // injects a spurious velocity term that can flip the sign (audit 2026-07-04,
  // confirmed bug).
  const scale = median(frames.map(frameScaleY).filter(isReal));
  if (!isReal(scale) || scale <= 0) return null;
  const pos = frames.map((f) => {
    const im = f.landmarks; if (!im) return null;
    const p = barLandmark === 'hip' ? mid2(im[LM.L_HIP], im[LM.R_HIP]) : mid2(im[LM.L_WRIST], im[LM.R_WRIST]);
    return imgUpMetres(p, scale);
  });
  const raw = frames.map((f, i) => {
    if (i === 0) return null;
    const a = pos[i - 1], b = pos[i], ta = frames[i - 1]?.t, tb = frames[i]?.t;
    if (!isReal(a) || !isReal(b) || ta == null || tb == null || tb <= ta) return null;
    return clampSpeed((b - a) / ((tb - ta) / 1000));           // signed, m/s (+up / -down)
  });
  // Window 5 (was 3) — at typical mobile-capture framerates (~18-30fps), 1-2px
  // of pose-landmark jitter, differentiated into velocity, reads as real
  // "speed" even while the athlete is genuinely still (Ohad: "when he's not
  // moving the speed should be 0 right? I don't think this works good" —
  // correct catch). Heavier smoothing suppresses more jitter without
  // meaningfully blunting real rep peaks, which span many frames.
  const sm = medianFilter(raw, 5);
  // Deadband — below this is noise-dominated, not real bar speed. A true
  // stillstand (dead-stop, top/bottom pause) should read 0.00, not a phantom
  // ±0.3-0.8 m/s. 0.15 m/s sits comfortably above typical landmark-jitter
  // magnitude and comfortably below any deliberate movement.
  const DEADBAND = 0.15;
  const t0 = frames[0].t;
  const series = frames.map((f, i) => {
    if (!isReal(sm[i])) return null;
    return { t: Math.round(f.t - t0), speed: round2(Math.abs(sm[i]) < DEADBAND ? 0 : sm[i]) };
  }).filter(Boolean);
  if (series.length < 3) return null;
  // peak = max magnitude either direction — the graph's y-axis is symmetric.
  return { series, peak: round2(series.reduce((m, p) => Math.max(m, Math.abs(p.speed)), 0)) };
}

// Vertical acceleration (m/s²) of the same tracked point, over time — the
// derivative of velocity. barSpeedSeries is itself already signed (matches
// this), but acceleration still needs its OWN velocity pass here (rather than
// differentiating barSpeedSeries's output directly) because this one applies
// heavier smoothing before the 2nd derivative — a 2nd derivative of noisy
// pose data needs more filtering than a 1st. Sign is kept — a coach reads a
// hard negative dip as "decelerating into the turnaround."
export function barAccelSeries(frames, barLandmark = 'wrist') {
  if (!frames || frames.length < 5) return null;
  // ONE stable metres-per-image-unit for the whole clip — see velocityMetrics
  // for why a per-frame ruler injects a spurious velocity term (audit
  // 2026-07-04, confirmed bug).
  const scale = median(frames.map(frameScaleY).filter(isReal));
  if (!isReal(scale) || scale <= 0) return null;
  const pos = frames.map((f) => {
    const im = f.landmarks; if (!im) return null;
    const p = barLandmark === 'hip' ? mid2(im[LM.L_HIP], im[LM.R_HIP]) : mid2(im[LM.L_WRIST], im[LM.R_WRIST]);
    return imgUpMetres(p, scale);
  });
  const rawV = frames.map((f, i) => {
    if (i === 0) return null;
    const a = pos[i - 1], b = pos[i], ta = frames[i - 1]?.t, tb = frames[i]?.t;
    if (!isReal(a) || !isReal(b) || ta == null || tb == null || tb <= ta) return null;
    return clampSpeed((b - a) / ((tb - ta) / 1000));            // signed, m/s
  });
  const v = medianFilter(rawV, 5);                    // heavier smoothing before the 2nd derivative
  const rawA = frames.map((f, i) => {
    if (i === 0) return null;
    const a = v[i - 1], b = v[i], ta = frames[i - 1]?.t, tb = frames[i]?.t;
    if (!isReal(a) || !isReal(b) || ta == null || tb == null || tb <= ta) return null;
    return (b - a) / ((tb - ta) / 1000);              // signed, m/s²
  });
  const sm = medianFilter(rawA, 3);
  const t0 = frames[0].t;
  const series = frames.map((f, i) => (isReal(sm[i]) ? { t: Math.round(f.t - t0), accel: round2(sm[i]) } : null)).filter(Boolean);
  if (series.length < 3) return null;
  return { series, peak: round2(series.reduce((m, p) => Math.max(m, Math.abs(p.accel)), 0)) };
}

// Joint-angle-over-time trace for the ROM & TEMPO graph (Ohad: wants the same
// synced/scrubbable/pinch-zoomable graph on ROM & TEMPO that SPEED/ACCEL has).
// Reuses the same per-frame channel average channelSignal already computes for
// rep segmentation — just reshaped to the {series,peak} shape the trace
// components expect, with clip-relative ms so it lines up with playheadT.
export function jointAngleSeries(frames, exerciseTitle) {
  if (!frames || frames.length < 3) return null;
  const { angle, channels } = channelSignal(frames, exerciseTitle);
  if (!channels.length) return null;
  const t0 = frames[0].t;
  const series = frames.map((f, i) => (isReal(angle[i]) ? { t: Math.round(f.t - t0), angle: round1(angle[i]) } : null)).filter(Boolean);
  if (series.length < 3) return null;
  return { series, peak: round1(series.reduce((m, p) => Math.max(m, p.angle), 0)) };
}

// Same as jointAngleSeries, but for ONE explicit named channel (e.g. "L KNE")
// instead of the exercise-title-derived, L+R-averaged auto pick — backs the
// ROM & TEMPO graph's manual joint + L/R picker (Ohad: "I need to be able to
// choose a joint, and to choose r/l then the graph adjusts").
export function namedAngleSeries(frames, angleName) {
  if (!frames || frames.length < 3) return null;
  const d = ANGLE_DEFS.find(a => a.name === angleName);
  if (!d) return null;
  const t = frames.map(f => f.t);
  const raw = frames.map(f => (f.worldLandmarks ? angleAt(f.worldLandmarks, d.a, d.b, d.c) : null));
  const angle = medianFilter(clampAngleSeries(raw, t), 5);
  const t0 = frames[0].t;
  const series = frames.map((f, i) => (isReal(angle[i]) ? { t: Math.round(f.t - t0), angle: round1(angle[i]) } : null)).filter(Boolean);
  if (series.length < 3) return null;
  return { series, peak: round1(series.reduce((m, p) => Math.max(m, p.angle), 0)) };
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
    // startT (ms, clip-relative) — lets the RomTable rep row seek the video
    // to this rep's start, same as VelocityTable already does.
    const startT = frames[startIdx]?.t;
    return { rom, ecc: round1(ecc), pause: round1(pause), con: round1(con), startT: startT != null ? Math.round(startT) : null };
  });
  const valid = perRep.filter(Boolean);
  const maxRom = valid.reduce((m, r) => Math.max(m, r.rom), 0) || 1;
  const withFlag = perRep.map(r => r && ({ ...r, romPct: Math.round((r.rom / maxRom) * 100), collapsed: r.rom < 0.85 * maxRom }));
  return { perRep: withFlag, maxRom: round1(maxRom), collapsedCount: withFlag.filter(r => r && r.collapsed).length };
}

// ---------------------------------------------------------------------------
// Multi-joint ROM — angular working range per joint across the whole clip.
// ---------------------------------------------------------------------------
// For each requested joint angle (default: every ANGLE_DEFS entry — L/R
// shoulder, elbow, hip, knee) build the median-smoothed angle series from
// worldLandmarks and report max / min / travel in degrees. This is whole-clip
// ROM (the joint's working range during the movement), distinct from the
// per-rep romTempo above. Joints with too few clean samples are dropped.
//
// HONEST LIMIT: these are in-plane flexion/extension angles. 2D-markerless pose
// can't recover axial rotation (internal/external rotation, pro/supination), so
// rotation axes are deliberately NOT offered here — only the flexion joints.
export function jointRomMetrics(frames, jointNames = null) {
  if (!frames || frames.length < 4) return null;
  const t = frames.map(f => f.t);
  const defs = jointNames ? ANGLE_DEFS.filter(d => jointNames.includes(d.name)) : ANGLE_DEFS;
  const out = defs.map(d => {
    const raw = frames.map(f => (f.worldLandmarks ? angleAt(f.worldLandmarks, d.a, d.b, d.c) : null));
    const series = medianFilter(clampAngleSeries(raw, t), 5).filter(isReal);
    if (series.length < 4) return null;
    const max = Math.max(...series), min = Math.min(...series);
    return { name: d.name, maxDeg: Math.round(max), minDeg: Math.round(min), romDeg: Math.round(max - min), samples: series.length };
  }).filter(Boolean);
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------
// Jump test — vertical jump height from flight time (camera "combine").
// ---------------------------------------------------------------------------
// Track the ankles' vertical position in IMAGE space (converted to metres via
// the per-frame ruler — worldLandmarks would read ~0 since the whole body
// translates relative to the hip). Standing baseline = median over the first
// 0.5s. The airborne span is bracketed by the frame just before the first
// supra-threshold frame and just after the last (so the sub-threshold launch/
// land portions are included), giving flight time ≈ takeoff→landing. Height =
// g·t²/8 (scale-free physics). Peak rise (metres) is a secondary cross-check.
export function jumpMetrics(frames) {
  if (!frames || frames.length < 8) return null;
  const t0 = frames[0].t;
  // Ground-contact reference = the LOWER ankle (max image-y, y is down). Using
  // the lower foot means "airborne" only registers once BOTH feet leave the
  // floor — the correct flight-time gate.
  const ankY = frames.map(f => {
    const im = f.landmarks; if (!im) return null;
    const a = im[LM.L_ANKLE], b = im[LM.R_ANKLE];
    if (a && b) return Math.max(a.y, b.y);
    return (a || b) ? (a || b).y : null;
  });
  // Standing window: first 600 ms. Need the athlete still here (the countdown in
  // the UI guarantees it) so the baseline + ruler are clean.
  const standIdx = frames.map((_, i) => i).filter(i => ankY[i] != null && frames[i].t - t0 < 600);
  if (standIdx.length < 3) return null;
  const baseY = median(standIdx.map(i => ankY[i]));        // standing ankle-y (normalised)
  // ONE stable metres-per-image-unit, the median of the standing ruler. The old
  // code recomputed this PER FRAME from shoulder→ankle, which collapses mid-air
  // when the legs tuck → scale spikes → a false multi-second "flight". Locking
  // it to the standing pose is the fix.
  const scaleSamples = standIdx.map(i => frameScaleY(frames[i])).filter(isReal);
  if (scaleSamples.length < 3) return null;
  const scale = median(scaleSamples);
  if (!isReal(scale) || scale <= 0) return null;
  // rise above standing, in metres (y is down, so baseY − y is upward)
  const rise = ankY.map(y => y == null ? null : (baseY - y) * scale);

  const THR = 0.05;                  // 5 cm — confirms a window is a real jump
  const n = rise.length;
  // sub-frame timestamp where `rise` crosses `level` between frames k0 and k1.
  const interpAt = (k0, k1, level) => {
    const r0 = rise[k0], r1 = rise[k1], ta = frames[k0]?.t, tb = frames[k1]?.t;
    if (r0 == null || r1 == null || ta == null || tb == null || r1 === r0) return (frames[k1] || frames[k0])?.t ?? 0;
    const frac = (level - r0) / (r1 - r0);
    return (frac >= 0 && frac <= 1) ? ta + frac * (tb - ta) : frames[k1].t;
  };
  let best = null, i = 0;
  while (i < n) {
    if (rise[i] != null && rise[i] > THR) {
      let j = i; while (j + 1 < n && rise[j + 1] != null && rise[j + 1] > THR) j++;
      // Flight time = toe-off→touchdown, timed at the ground level (rise = 0), not
      // at the 5 cm gate — gating there would clip the launch/land arcs and shave
      // ~15% off the height. Walk out to the 0-crossings on each side and interp.
      let a = i; while (a - 1 >= 0 && rise[a - 1] != null && rise[a - 1] > 0) a--;
      let b = j; while (b + 1 < n && rise[b + 1] != null && rise[b + 1] > 0) b++;
      const takeoff = interpAt(a - 1 >= 0 ? a - 1 : a, a, 0);
      const landing = interpAt(b, b + 1 < n ? b + 1 : b, 0);
      const flightSec = (landing - takeoff) / 1000;
      let peak = 0; for (let k = i; k <= j; k++) if (rise[k] != null) peak = Math.max(peak, rise[k]);
      if (!best || flightSec > best.flightSec) best = { flightSec, peak };
      i = j + 1;
    } else i++;
  }
  // Physical sanity: a human jump is ~0.15–1.15 s of flight (≈3–162 cm). The
  // upper bound covers elite dunkers (a ~120 cm vertical = ~0.99 s) without
  // re-admitting multi-second noise/occlusion artefacts. Outside → null so the
  // UI says "couldn't read a clean jump" instead of printing a 47-metre result.
  if (!best || best.flightSec < 0.15 || best.flightSec > 1.15) return null;
  const heightCm = (9.81 * best.flightSec * best.flightSec / 8) * 100;
  return {
    heightCm: Math.round(heightCm),
    flightMs: Math.round(best.flightSec * 1000),
    peakRiseCm: Math.round(best.peak * 100),
  };
}

// Per-frame vertical translation of the whole body (METRES, up-positive),
// recovered from the IMAGE landmarks that the hip-centred world-space pose
// throws away. The lower ankle's rise above the standing baseline = the feet
// leaving the ground: a JUMP lifts the whole skeleton by the jump arc, a SQUAT
// keeps the feet planted (≈0, the hip lowers via posture). This lets the 3D
// viewer show real airtime instead of a hip-pinned figure "moving in water".
// Returns an array aligned 1:1 to `frames` (all 0 if no clean standing
// baseline/scale — i.e. it degrades to the old hip-pinned behaviour).
export function verticalTranslations(frames) {
  const n = frames?.length || 0;
  const zeros = new Array(n).fill(0);
  if (n < 8) return zeros;
  const t0 = frames[0].t;
  const ankY = frames.map(f => {
    const im = f.landmarks; if (!im) return null;
    const a = im[LM.L_ANKLE], b = im[LM.R_ANKLE];
    if (a && b) return Math.max(a.y, b.y);           // lower foot (y is image-down)
    return (a || b) ? (a || b).y : null;
  });
  const standIdx = frames.map((_, i) => i).filter(i => ankY[i] != null && frames[i].t - t0 < 600);
  if (standIdx.length < 3) return zeros;
  const baseY = median(standIdx.map(i => ankY[i]));
  const scaleSamples = standIdx.map(i => frameScaleY(frames[i])).filter(isReal);
  if (scaleSamples.length < 3) return zeros;
  const scale = median(scaleSamples);
  if (!isReal(scale) || scale <= 0) return zeros;
  // rise above standing in metres; clamp negatives so the body never sinks below
  // the floor (a deep landing crouch is posture, not downward translation).
  const rise = ankY.map(y => { if (y == null) return 0; const r = (baseY - y) * scale; return r > 0 ? r : 0; });
  // light 3-tap smoothing so ankle jitter doesn't make the figure twitch.
  return rise.map((_, i) => {
    let s = 0, c = 0; for (let k = -1; k <= 1; k++) { const j = i + k; if (j >= 0 && j < n) { s += rise[j]; c++; } }
    return c ? s / c : 0;
  });
}

// Reactive jumps (Drop Jump, repeated hops / POGO) — needs GROUND CONTACT time,
// not just flight. Same ankle-rise ruler as jumpMetrics, but instead of the one
// best airborne window we segment ALL airborne windows and the contacts between
// them. RSI = jump height (m) / ground contact time (s)  [Balsalobre / NSCA].
// Contact = the grounded gap between one window's landing and the next window's
// takeoff. For a drop jump that's drop-land→rebound-takeoff; for POGO it's each
// hop. Returns { best (max-RSI hop), hops[], avgRsi, avgContactMs, avgHeightCm }.
export function reactiveJumpMetrics(frames) {
  if (!frames || frames.length < 10) return null;
  const t0 = frames[0].t;
  const ankY = frames.map(f => {
    const im = f.landmarks; if (!im) return null;
    const a = im[LM.L_ANKLE], b = im[LM.R_ANKLE];
    if (a && b) return Math.max(a.y, b.y);
    return (a || b) ? (a || b).y : null;
  });
  const standIdx = frames.map((_, i) => i).filter(i => ankY[i] != null && frames[i].t - t0 < 600);
  if (standIdx.length < 3) return null;
  const baseY = median(standIdx.map(i => ankY[i]));
  const scaleSamples = standIdx.map(i => frameScaleY(frames[i])).filter(isReal);
  if (scaleSamples.length < 3) return null;
  const scale = median(scaleSamples);
  if (!isReal(scale) || scale <= 0) return null;
  const rise = ankY.map(y => y == null ? null : (baseY - y) * scale);

  const THR = 0.05, n = rise.length;
  const interpAt = (k0, k1, level) => {
    const r0 = rise[k0], r1 = rise[k1], ta = frames[k0]?.t, tb = frames[k1]?.t;
    if (r0 == null || r1 == null || ta == null || tb == null || r1 === r0) return (frames[k1] || frames[k0])?.t ?? 0;
    const frac = (level - r0) / (r1 - r0);
    return (frac >= 0 && frac <= 1) ? ta + frac * (tb - ta) : frames[k1].t;
  };
  // every airborne window, timed at the rise=0 crossings (toe-off → touchdown)
  const windows = []; let i = 0;
  while (i < n) {
    if (rise[i] != null && rise[i] > THR) {
      let j = i; while (j + 1 < n && rise[j + 1] != null && rise[j + 1] > THR) j++;
      let a = i; while (a - 1 >= 0 && rise[a - 1] != null && rise[a - 1] > 0) a--;
      let b = j; while (b + 1 < n && rise[b + 1] != null && rise[b + 1] > 0) b++;
      const takeoff = interpAt(a - 1 >= 0 ? a - 1 : a, a, 0);
      const landing = interpAt(b, b + 1 < n ? b + 1 : b, 0);
      const flightSec = (landing - takeoff) / 1000;
      let peak = 0; for (let k = i; k <= j; k++) if (rise[k] != null) peak = Math.max(peak, rise[k]);
      if (flightSec >= 0.1 && flightSec <= 1.0) windows.push({ takeoff, landing, flightSec, peak });
      i = j + 1;
    } else i++;
  }
  if (windows.length < 2) return null;     // need at least one contact + rebound

  const hops = [];
  for (let w = 1; w < windows.length; w++) {
    const contactSec = (windows[w].takeoff - windows[w - 1].landing) / 1000;
    if (contactSec <= 0.04 || contactSec > 1.5) continue;   // implausible ground contact
    const heightCm = (9.81 * windows[w].flightSec * windows[w].flightSec / 8) * 100;
    const rsi = (heightCm / 100) / contactSec;               // m / s
    hops.push({
      heightCm: Math.round(heightCm),
      flightMs: Math.round(windows[w].flightSec * 1000),
      contactMs: Math.round(contactSec * 1000),
      rsi: Math.round(rsi * 100) / 100,
    });
  }
  if (!hops.length) return null;
  const best = hops.reduce((m, h) => h.rsi > m.rsi ? h : m, hops[0]);
  const mean = (key, dp = 0) => {
    const v = hops.reduce((s, h) => s + h[key], 0) / hops.length;
    return dp ? Math.round(v * 10 ** dp) / 10 ** dp : Math.round(v);
  };
  return { best, hops, count: hops.length, avgRsi: mean('rsi', 2), avgContactMs: mean('contactMs'), avgHeightCm: mean('heightCm') };
}

// Peak power from a vertical jump — Sayers (1999), the validated regression for
// CMJ peak power: P(W) = 60.7·height(cm) + 45.3·mass(kg) − 2055. Returns null
// without a real bodyweight (height alone is bodyweight-independent physics, but
// POWER is the athletic number Ohad wants, and it needs mass).
export function jumpPower(heightCm, massKg) {
  if (!isReal(heightCm) || !isReal(massKg) || massKg <= 0) return null;
  const watts = 60.7 * heightCm + 45.3 * massKg - 2055;
  if (watts <= 0) return null;
  return { watts: Math.round(watts), perKg: Math.round((watts / massKg) * 10) / 10 };
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
  const reps = channels.length ? segmentReps(angle, fps, frames) : [];
  const velocity = reps.length ? velocityMetrics(frames, angle, reps, opts.barLandmark) : null;
  const romTempo = reps.length ? romTempoMetrics(frames, angle, reps) : null;
  const jointRom = jointRomMetrics(frames);
  const barSpeed = barSpeedSeries(frames, opts.barLandmark);
  return { ok: true, fps, kind, repCount: reps.length, reps, rejectedReps: reps.rejected || [], velocity, romTempo, jointRom, barSpeed, frameCount: frames.length };
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
