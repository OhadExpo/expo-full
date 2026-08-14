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

import { ANGLE_DEFS, angleAt, signedDeviationAt, detectChannels, medianFilter, findPeaks, isReal } from './repCounter.js';

// MediaPipe Pose landmark indices we lean on.
export const LM = {
  NOSE: 0,
  L_EAR: 7, R_EAR: 8,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30,
  L_SHO: 11, R_SHO: 12,
  L_FOOT: 31, R_FOOT: 32,
};

const mid = (a, b) => (a == null || b == null ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });
const mid2 = (a, b) => (a == null || b == null ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// metres-per-image-unit for ONE side's shoulder→ankle ruler, plus how well that
// side is tracked (min 2D-landmark visibility). Missing visibility field (some
// MediaPipe builds omit it) is treated as fully visible, matching the
// movementRepCount convention (`visibility == null || > 0.5`).
function sideScale(w, im, shoI, ankI) {
  const ws = w[shoI], wa = w[ankI], is = im[shoI], ia = im[ankI];
  if (!ws || !wa || !is || !ia) return null;
  const worldLen = Math.hypot(ws.x - wa.x, ws.y - wa.y, (ws.z ?? 0) - (wa.z ?? 0));
  const imgLen = Math.hypot(is.x - ia.x, is.y - ia.y);
  if (!(imgLen > 0) || !(worldLen > 0)) return null;
  const vis = Math.min(is.visibility == null ? 1 : is.visibility, ia.visibility == null ? 1 : ia.visibility);
  return { scale: worldLen / imgLen, vis };
}
// metres-per-image-unit for this frame, from the shoulder→ankle ruler — using
// whichever side is BETTER TRACKED. The standard VBT camera view is straight
// side-on, which occludes the far-side shoulder/ankle; MediaPipe extrapolates
// those to garbage, and reading the ruler off the occluded side (the old
// LEFT-only behaviour) biased metres-per-unit for the WHOLE clip → every rep's
// m/s scaled wrong (adversarial-review HIGH, 2026-08-12). Gate each side on 2D
// visibility, prefer the visible side, average when both are clean.
export function frameScaleY(f) {
  const w = f.worldLandmarks, im = f.landmarks;
  if (!w || !im) return null;
  const L = sideScale(w, im, LM.L_SHO, LM.L_ANKLE);
  const R = sideScale(w, im, LM.R_SHO, LM.R_ANKLE);
  const VIS = 0.5;
  const okL = L && L.vis > VIS, okR = R && R.vis > VIS;
  if (okL && okR) return (L.scale + R.scale) / 2; // both clean → average for stability
  if (okL) return L.scale;
  if (okR) return R.scale;
  // neither side clears the gate (both occluded, or no visibility field): fall
  // back to what exists rather than nulling the clip's scale — captureQuality
  // separately warns the coach when tracking is poor.
  if (L && R) return (L.scale + R.scale) / 2;
  return (L && L.scale) || (R && R.scale) || null;
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
  // A genuinely FATIGUED last rep loses lockout ROM (a grind) — it's the single
  // most informative rep for a fatigue / velocity-loss read, so don't silently
  // delete it for shallowness the way a mid-set fidget or setup twitch is deleted
  // (adversarial-review 2026-08-12: dropping it excluded the slowest rep, so
  // finalLossPct anchored to a faster earlier rep → fatigue UNDER-reported → the
  // coach over-loads the next set). Grace ONLY the chronologically-last candidate,
  // and only when it's a real PARTIAL (≥30% of the reference ROM, ≥26° absolute)
  // rather than a tiny re-rack. It's kept AND flagged `partial` so downstream can
  // caveat it.
  const partialFloor = Math.max(26, 0.30 * refROM);
  const lastI = m.length - 1;
  m.forEach((x, i) => {
    let reason = null;
    const graceShallow = i === lastI && x.minROM >= partialFloor && x.minROM < ampFloor;
    if (x.minROM < ampFloor && !graceShallow) reason = 'shallow';   // twitch / partial setup
    else if (frames && x.net > 0.35) reason = 'moved';              // walkout / walk-back
    else if (x.dur < 0.35) reason = 'too-fast';                     // sub-rep flicker
    if (reason) { rejected.push({ bottomIdx: x.r.bottomIdx, minROM: Math.round(x.minROM), reason }); return; }
    if (graceShallow) x.r.partial = true;                          // kept, but it's a fatigued grind
    kept.push(x.r);
  });
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
    const bot = isReal(angle[b]) ? angle[b] : 0;
    // REP START = descent onset: the moment he actually commits to moving down,
    // NOT the start of the rest plateau between reps. The old code took the
    // argmax angle over the whole window, so if he stood at the top for a beat
    // between reps the "start" landed early in that pause and the rep looked
    // like it began while he was still standing still. Instead: find the top
    // angle in [lo,b], then take the LAST frame that's still within a small
    // tolerance of that top before the descent — that's where the top ends and
    // the lowering begins.
    let topS = -Infinity;
    for (let j = lo; j <= b; j++) if (isReal(angle[j]) && angle[j] > topS) topS = angle[j];
    const tolS = Math.max(5, 0.10 * (topS - bot));
    let startIdx = lo;
    for (let j = lo; j <= b; j++) if (isReal(angle[j]) && angle[j] >= topS - tolS) startIdx = j;
    // REP END = lockout: the FIRST frame back near the top after the bottom
    // (concentric finished), not a later post-rep pause.
    let topE = -Infinity;
    for (let j = b; j <= hi; j++) if (isReal(angle[j]) && angle[j] > topE) topE = angle[j];
    const tolE = Math.max(5, 0.10 * (topE - bot));
    let endIdx = hi;
    for (let j = b; j <= hi; j++) if (isReal(angle[j]) && angle[j] >= topE - tolE) { endIdx = j; break; }
    reps.push({ startIdx, bottomIdx: b, endIdx });
  }
  // Gate out fake reps (fidget / walkout / shallow setup). Attach rejection
  // detail as a property so callers can show "8 reps · 2 not counted".
  const { kept, rejected } = validateReps(reps, angle, frames, fps);
  kept.rejected = rejected;
  return kept;
}

// ---------------------------------------------------------------------------
// Movement-based rep count — for ballistic work (jumps, pogos, hops, bounds,
// snap-downs) the joint-ANGLE channel misses reps: a lateral or ankle-driven
// hop barely flexes the knee, so findPeaks on the angle signal under-counts
// badly (e.g. a lateral pogo set of 15 read as 3). But EVERY hop — vertical or
// lateral — has a flight phase: the higher foot rises off the floor then lands.
// So we count flights directly from the ankle's vertical position in image
// space (y is DOWN, so a flight is a TROUGH in the higher-foot y). This is the
// one signal every jump shares, and it's what a joint-angle counter can't see.
// Returns { count, method, range } or null if there's no usable ankle track.
export function movementRepCount(frames) {
  if (!frames || frames.length < 6) return null;
  const fps = estimateFps(frames);
  const minDist = Math.max(2, Math.round(fps * 0.16)); // hops are fast — allow ~0.16s apart
  // A landmark is usable only if it's confidently tracked AND on-screen —
  // MediaPipe extrapolates off-frame points to wild values (seen: ankle y at
  // -3.49) and drops visibility to ~0.2 during flight/occlusion. Reject both,
  // or the range explodes and the prominence gate silently kills every hop.
  const ok = (p) => p && (p.visibility == null || p.visibility > 0.5) && isReal(p.y) && p.y > -0.05 && p.y < 1.15;
  // Higher foot = MIN image-y of the valid ankles. During a hop it dips (foot
  // leaves the floor) then returns → one trough per hop, for vertical AND
  // lateral hops (every jump has a flight phase).
  const y = frames.map(f => {
    const l = f.landmarks; if (!l) return null;
    const a = l[LM.L_ANKLE], b = l[LM.R_ANKLE];
    const va = ok(a) ? a.y : null, vb = ok(b) ? b.y : null;
    if (va != null && vb != null) return Math.min(va, vb);
    return va != null ? va : vb;
  });
  const sm = medianFilter(y, 3);
  const reals = sm.filter(isReal).sort((p, q) => p - q);
  if (reals.length < 6) return null;
  // Robust range = p5→p95, immune to any surviving off-frame spike.
  const pct = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))];
  const range = pct(reals, 0.95) - pct(reals, 0.05);
  if (range < 0.025) return { count: 0, method: 'flight', range: round2(range) }; // barely leaves the floor
  const inv = sm.map(v => (isReal(v) ? -v : v));            // troughs of y = flight apexes
  const prom = Math.max(0.02, range * 0.35);
  const flights = findPeaks(inv, prom, minDist);
  return { count: flights.length, method: 'flight', range: round2(range) };
}

// Title → is this a ballistic movement where flight-counting should win over
// the joint-angle counter? Jumps, pogos, hops, bounds, plyo, snap-downs,
// skips, and med-ball throws/slams/tosses (whole-body ballistic).
export function isBallistic(title) {
  return /\b(jump|pogo|hop|bound|plyo|plyometric|skip|leap|broad[-\s]?jump|box[-\s]?jump|depth[-\s]?jump|snap[-\s]?down|bounce|slam|toss|throw)\b/i.test(title || '');
}

// ---------------------------------------------------------------------------
// Velocity — VBT. Vertical speed (m/s) of the bar proxy (wrist midpoint, or a
// supplied landmark) through the CONCENTRIC portion of each rep.
// ---------------------------------------------------------------------------
// Concentric = bottom → top (the lift drives the load up). We measure mean
// concentric velocity (total upward displacement / duration) and peak
// instantaneous velocity, per rep, then velocity-loss % vs the best rep.
//
// Trailing re-rack gate (#242): a bar set-down / re-rack at the END of a set
// reads as a tiny-but-positive concentric (the wrist drifts up a hair as the
// bar is racked). That is not a working rep — left alone it both inflates the
// rep count and, worse, becomes the finalLossPct anchor → a false "huge
// velocity-loss / deep fatigue" verdict off a rep that never happened. A
// TRAILING rep is a re-rack only when its mean is positive but below this
// absolute floor AND far under the set's own working effort (relative to best),
// so a genuinely light-but-controlled set (best also low) and any fatigued
// real rep (e.g. 0.18 m/s vs best 0.45) survive. Interior reps are never
// stripped — the walk stops at the first genuine rep.
const RERACK_FLOOR_MS = 0.12;  // absolute: no working rep grinds this slow (m/s)
const RERACK_REL_FRAC = 0.35;  // relative: a re-rack sits under 35% of best mean
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
  // A rep with no positive net concentric (mean <= 0) isn't a measurable lift —
  // it's a bar drop / re-rack / pose noise. Emit lossPct = null for it rather than
  // a physically-impossible >100% "loss", and never let it become the set's
  // final-loss anchor (a dropped bar at the end read as "90%+ junk fatigue" when
  // the working reps actually held speed).
  const withLoss = perRep.map(r => r && (r.meanConcentric > 0
    ? { ...r, lossPct: Math.round((1 - r.meanConcentric / best) * 100) }
    : { ...r, lossPct: null }));
  // Trailing re-rack gate (#242) — see the header comment. Walk from the last
  // rep backward and strip TRAILING re-racks only: a rep with positive mean
  // below the absolute floor AND below RERACK_REL_FRAC·best. Stop at the first
  // genuine rep (so interior slow reps and a fatigued last rep survive). Null
  // (bar-drop, mean<=0) entries are transparent junk we walk past — they don't
  // shield an earlier re-rack — but they're never counted as re-racks. A
  // stripped rep gets lossPct:null (never anchors finalLoss) and rerack:true.
  const relCeil = best * RERACK_REL_FRAC;
  let rerackCount = 0;
  for (let i = withLoss.length - 1; i >= 0; i--) {
    const r = withLoss[i];
    if (!r) continue;               // segmentation gap: skip
    if (r.lossPct == null) continue; // pre-existing bar-drop (mean<=0): transparent junk
    if (r.meanConcentric > 0 && r.meanConcentric < RERACK_FLOOR_MS && r.meanConcentric < relCeil) {
      r.rerack = true;
      r.lossPct = null;
      rerackCount++;
      continue;                     // contiguous trailing re-racks keep stripping
    }
    break;                          // first genuine rep — everything earlier is interior
  }
  const lastValid = [...withLoss].reverse().find(r => r && r.lossPct != null);
  return {
    perRep: withLoss,
    bestMean: round2(best),
    finalLossPct: lastValid ? lastValid.lossPct : 0,
    rerackCount,
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
    // True peak over the rep window — startIdx/endIdx are now the descent-onset
    // and lockout frames (a hair off the exact max), so read ROM from the real
    // peak between them, not the endpoint angles, to keep degrees accurate.
    let top = -Infinity;
    for (let j = startIdx; j <= endIdx; j++) if (isReal(angle[j]) && angle[j] > top) top = angle[j];
    if (!isReal(top)) top = Math.max(angle[startIdx] ?? 0, angle[endIdx] ?? 0);
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
    // Robust extremes for anything that writes a number a human acts on (the
    // camera goniometer): the raw max/min is a SINGLE frame, so a 1–2 frame
    // occlusion glitch that survives the median-5 filter inflates the reported
    // range. Take the median of the 3 most-extreme frames — kills a lone spike,
    // only trims a genuinely-held end-range by a degree or two.
    const sorted = [...series].sort((a, b) => a - b);
    const medOf = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    const k = Math.min(3, sorted.length);
    const loDeg = Math.round(medOf(sorted.slice(0, k)));
    const hiDeg = Math.round(medOf(sorted.slice(-k)));
    return { name: d.name, maxDeg: Math.round(max), minDeg: Math.round(min), romDeg: Math.round(max - min), hiDeg, loDeg, samples: series.length };
  }).filter(Boolean);
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------
// EXTENDED camera-ROM channels — the honest additions the base jointRomMetrics
// can't carry because they need a SIGNED angle, a head/neck construction, or a
// static-hold median rather than the plain interior-angle sweep.
// ---------------------------------------------------------------------------
// Every channel is gated HARD (landmark visibility + filmed plane +, for the
// ankle, sample dispersion). When a read can't be trusted the channel is simply
// OMITTED, so its eval axis shows "no clean read" and the coach enters it by
// hand — never a fabricated degree. Entries share the base jointRom shape, so
// RomConfirm consumes them through romReadingFor exactly like a base channel.
// Channels (when measurable):
//   L KNE± / R KNE±  signed knee, carries overExtDeg (hyperextension magnitude)
//   NECK FLEX        signed neck sagittal (+flexion / −extension), unsided
//   NECK LAT         neck lateral-flexion magnitude, unsided
//   L ANK / R ANK    static ankle interior angle (knee·ankle·foot), dorsi/plantar
const medianOf = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
function robustExtremes(series) {
  const sorted = [...series].sort((a, b) => a - b);
  const k = Math.min(3, sorted.length);
  return {
    max: Math.max(...series), min: Math.min(...series),
    hiDeg: Math.round(medianOf(sorted.slice(-k))),
    loDeg: Math.round(medianOf(sorted.slice(0, k))),
  };
}
const visOK = (lm2, i) => { const p = lm2 && lm2[i]; return !!(p && (p.visibility == null || p.visibility > 0.5) && isReal(p.x) && isReal(p.y)); };

// Signed neck sagittal angle (side-on): +flexion (head forward) / −extension
// (head back). Magnitude = how far the head-vector (mid-shoulder → ear) tips off
// the trunk line (mid-hip → mid-shoulder); the sign is fixed by the NOSE, which
// is anterior of the ear, so it's robust to which way the athlete faces.
export function neckSagittalAngle(lms) {
  const nose = lms[LM.NOSE];
  const earL = lms[LM.L_EAR], earR = lms[LM.R_EAR];
  const ear = (earL && earR) ? mid(earL, earR) : (earL || earR);
  const sho = mid(lms[LM.L_SHO], lms[LM.R_SHO]);
  const hip = mid(lms[LM.L_HIP], lms[LM.R_HIP]);
  if (!nose || !ear || !sho || !hip) return null;
  const hvx = ear.x - sho.x, hvy = ear.y - sho.y;
  const tvx = sho.x - hip.x, tvy = sho.y - hip.y;
  const mh = Math.hypot(hvx, hvy), mt = Math.hypot(tvx, tvy);
  if (mh === 0 || mt === 0) return null;
  const cos = Math.max(-1, Math.min(1, (hvx * tvx + hvy * tvy) / (mh * mt)));
  const mag = Math.acos(cos) * 180 / Math.PI;          // 0 = head stacked on trunk
  const ax = Math.sign(nose.x - ear.x) || 1;           // facing direction (nose is anterior)
  const fwd = (ear.x - sho.x) * ax;                    // >0 ear forward of shoulder = flexion
  return (fwd >= 0 ? 1 : -1) * mag;
}

// Neck lateral-flexion magnitude (front-on): tilt of the ear→ear line off the
// shoulder line. 0 = head upright. Magnitude only (left/right tilt both positive)
// — the schema carries a single "Lateral Flexion" axis.
export function neckLateralAngle(lms) {
  const earL = lms[LM.L_EAR], earR = lms[LM.R_EAR];
  const shoL = lms[LM.L_SHO], shoR = lms[LM.R_SHO];
  if (!earL || !earR || !shoL || !shoR) return null;
  const evx = earR.x - earL.x, evy = earR.y - earL.y;
  const svx = shoR.x - shoL.x, svy = shoR.y - shoL.y;
  const me = Math.hypot(evx, evy), ms = Math.hypot(svx, svy);
  if (me === 0 || ms === 0) return null;
  const cos = Math.max(-1, Math.min(1, (evx * svx + evy * svy) / (me * ms)));
  let a = Math.acos(cos) * 180 / Math.PI;
  if (a > 90) a = 180 - a;                              // acute tilt magnitude
  return a;
}

// Steadiest static read of a (mostly-still) angle series: slide a short window,
// take the one with the LEAST spread, return its median — or null if even the
// steadiest window is too noisy (honest refusal for a wobbly foot). Foot
// landmarks are the noisiest MediaPipe gives, so this gate is deliberately tight.
function stableStaticRead(series, winN = 7, maxSpread = 8) {
  const vals = series.filter(isReal);
  if (vals.length < winN) return null;
  let best = null;
  for (let i = 0; i + winN <= vals.length; i++) {
    const w = vals.slice(i, i + winN).slice().sort((a, b) => a - b);
    const spread = w[w.length - 1] - w[0];
    if (best == null || spread < best.spread) best = { stable: w[Math.floor(w.length / 2)], spread, n: winN };
  }
  if (!best || best.spread > maxSpread) return null;   // too noisy → refuse
  return best;
}

export function extendedJointRom(frames) {
  if (!frames || frames.length < 6) return null;
  const t = frames.map(f => f.t);
  const out = [];

  // ---- signed knee → over-extension (needs a clean side-on view) ----
  for (const [name, hipI, kneeI, ankI] of [['L KNE±', 23, 25, 27], ['R KNE±', 24, 26, 28]]) {
    const raw = frames.map(f => {
      const w = f.worldLandmarks; if (!w) return null;
      if (!(visOK(f.landmarks, hipI) && visOK(f.landmarks, kneeI) && visOK(f.landmarks, ankI))) return null;
      return signedDeviationAt(w, hipI, kneeI, ankI);
    });
    const s0 = medianFilter(clampAngleSeries(raw, t), 5).filter(isReal);
    if (s0.length < 6) continue;
    // ORIENT: flexion is the large excursion → force it positive, so whatever's
    // left on the negative side is hyperextension regardless of which way he faced.
    const mx = Math.max(...s0), mn = Math.min(...s0);
    const s = (Math.abs(mn) > Math.abs(mx)) ? s0.map(v => -v) : s0;
    const flexMax = Math.max(...s);
    const hyper = Math.max(0, -Math.min(...s));
    // Need a REAL flexion sweep to trust the sign; a near-straight clip can't tell
    // a small flexion from a small hyperextension, so we refuse (overExtDeg=null).
    const calibrated = flexMax >= 25;
    const overExtDeg = calibrated ? (hyper >= 5 ? Math.round(hyper) : 0) : null;
    const rex = robustExtremes(s);
    out.push({ name, maxDeg: Math.round(flexMax), minDeg: Math.round(Math.min(...s)), hiDeg: rex.hiDeg, loDeg: rex.loDeg, romDeg: Math.round(flexMax - Math.min(...s)), overExtDeg, samples: s.length });
  }

  // ---- neck sagittal (unsided) ----
  {
    const raw = frames.map(f => {
      const w = f.worldLandmarks; if (!w) return null;
      if (!visOK(f.landmarks, LM.NOSE)) return null;
      if (!(visOK(f.landmarks, LM.L_SHO) || visOK(f.landmarks, LM.R_SHO))) return null;
      if (!(visOK(f.landmarks, LM.L_EAR) || visOK(f.landmarks, LM.R_EAR))) return null;
      return neckSagittalAngle(w);
    });
    const s = medianFilter(clampAngleSeries(raw, t), 5).filter(isReal);
    if (s.length >= 6) {
      const rex = robustExtremes(s);
      out.push({ name: 'NECK FLEX', single: true, maxDeg: Math.round(rex.max), minDeg: Math.round(rex.min), hiDeg: rex.hiDeg, loDeg: rex.loDeg, romDeg: Math.round(rex.max - rex.min), samples: s.length });
    }
  }

  // ---- neck lateral flexion (unsided) ----
  {
    const raw = frames.map(f => {
      const w = f.worldLandmarks; if (!w) return null;
      if (!(visOK(f.landmarks, LM.L_EAR) && visOK(f.landmarks, LM.R_EAR) && visOK(f.landmarks, LM.L_SHO) && visOK(f.landmarks, LM.R_SHO))) return null;
      return neckLateralAngle(w);
    });
    const s = medianFilter(clampAngleSeries(raw, t), 5).filter(isReal);
    if (s.length >= 6) {
      const rex = robustExtremes(s);
      out.push({ name: 'NECK LAT', single: true, maxDeg: Math.round(rex.max), minDeg: Math.round(rex.min), hiDeg: rex.hiDeg, loDeg: rex.loDeg, romDeg: Math.round(rex.max - rex.min), samples: s.length });
    }
  }

  // ---- ankle dorsi/plantar (static hold, dispersion-gated) ----
  for (const [name, kneeI, ankI, footI, heelI] of [['L ANK', 25, 27, 31, 29], ['R ANK', 26, 28, 32, 30]]) {
    const raw = frames.map(f => {
      const w = f.worldLandmarks; if (!w) return null;
      if (!(visOK(f.landmarks, kneeI) && visOK(f.landmarks, ankI) && visOK(f.landmarks, footI) && visOK(f.landmarks, heelI))) return null;
      return angleAt(w, kneeI, ankI, footI);           // interior knee·ankle·foot
    });
    const sm = medianFilter(clampAngleSeries(raw, t), 5);
    const win = stableStaticRead(sm);
    if (!win) continue;                                 // too noisy → honest omit
    const v = Math.round(win.stable);
    out.push({ name, maxDeg: v, minDeg: v, hiDeg: v, loDeg: v, romDeg: 0, samples: win.n });
  }

  return out.length ? out : null;
}

// ---------------------------------------------------------------------------
// Standing broad jump — horizontal distance in cm.
// ---------------------------------------------------------------------------
// 2D image landmarks translate with the body (worldLandmarks are hip-centred and
// cancel it), so we read the feet's horizontal travel in IMAGE units and scale
// it with the athlete's STATURE — a length we know in cm (from the eval/vitals)
// or estimate from the standing metric world-pose (rough → flagged approximate).
// Image x is normalised by WIDTH and y by HEIGHT, so converting an x-displacement
// via a vertical stature needs the frame aspect (w/h), supplied via opts.dims or
// frames.dims; absent it we assume 1:1 and flag the scale approximate. Measured
// start-still → end-still (toe line → landing), coach-confirmed before it writes.
const okXY = (p) => !!(p && (p.visibility == null || p.visibility > 0.5) && isReal(p.x) && isReal(p.y));
function standingStatureYUnits(frames, t0) {
  const vals = frames.filter(f => f.t - t0 < 600).map(f => {
    const im = f.landmarks; if (!im) return null;
    const heads = [im[LM.NOSE], im[LM.L_EAR], im[LM.R_EAR]].filter(okXY).map(p => p.y);
    const feet = [im[LM.L_HEEL], im[LM.R_HEEL], im[LM.L_FOOT], im[LM.R_FOOT], im[LM.L_ANKLE], im[LM.R_ANKLE]].filter(okXY).map(p => p.y);
    if (!heads.length || !feet.length) return null;
    return Math.max(...feet) - Math.min(...heads);
  }).filter(isReal);
  return vals.length ? median(vals) : 0;
}
function standingStatureMetres(frames, t0) {
  const okY = (p) => p && isReal(p.y);
  const vals = frames.filter(f => f.t - t0 < 600).map(f => {
    const w = f.worldLandmarks; if (!w) return null;
    const heads = [w[LM.NOSE], w[LM.L_EAR], w[LM.R_EAR]].filter(okY).map(p => p.y);
    const feet = [w[LM.L_HEEL], w[LM.R_HEEL], w[LM.L_FOOT], w[LM.R_FOOT], w[LM.L_ANKLE], w[LM.R_ANKLE]].filter(okY).map(p => p.y);
    if (!heads.length || !feet.length) return null;
    return Math.abs(Math.max(...feet) - Math.min(...heads));
  }).filter(isReal);
  return vals.length ? median(vals) : 0;
}
export function broadJumpMetrics(frames, opts = {}) {
  if (!frames || frames.length < 8) return null;
  const dims = opts.dims || frames.dims || null;
  const aspect = (dims && dims.w > 0 && dims.h > 0) ? (dims.w / dims.h) : 1;
  const t0 = frames[0].t, tEnd = frames[frames.length - 1].t;
  const footX = (f) => {
    const im = f.landmarks; if (!im) return null;
    const a = im[LM.L_FOOT], b = im[LM.R_FOOT];
    const va = okXY(a) ? a.x : null, vb = okXY(b) ? b.x : null;
    if (va != null && vb != null) return (va + vb) / 2;
    return va != null ? va : vb;
  };
  const startXs = frames.filter(f => f.t - t0 < 600).map(footX).filter(isReal);
  const endXs = frames.filter(f => tEnd - f.t < 600).map(footX).filter(isReal);
  if (startXs.length < 2 || endXs.length < 2) return null;
  const pixelDx = Math.abs(median(endXs) - median(startXs));   // x-normalised units
  if (pixelDx < 0.02) return null;                             // no real horizontal jump
  const statureYunits = standingStatureYUnits(frames, t0);
  if (!(statureYunits > 0)) return null;
  let statureCm = null, approx = false;
  if (opts.heightCm > 0) statureCm = opts.heightCm;
  else { const wm = standingStatureMetres(frames, t0); if (wm > 0) { statureCm = wm * 100; approx = true; } }
  if (!(statureCm > 0)) return null;
  const cmPerYunit = statureCm / statureYunits;
  const cmPerXunit = cmPerYunit * aspect;                      // x-units span WIDTH → reconcile via aspect
  const distanceCm = Math.round(pixelDx * cmPerXunit);
  if (!(distanceCm >= 20) || distanceCm > 400) return null;   // broad-jump sanity band
  return { distanceCm, statureCm: Math.round(statureCm), approxScale: approx || !dims, reactive: false, jumpType: 'broad' };
}

// ---------------------------------------------------------------------------
// Compact, persistable per-lift REPORT payload for the Analysis vault.
// ---------------------------------------------------------------------------
// The camera pipeline computes the full velocity/accel/degrees traces live, but
// the vault (poseMetricsStore) historically kept only per-set SUMMARIES and
// discarded the per-frame series — so the Analysis page could show a trend
// sparkline but not the rich per-lift report the Review screen shows for a clip.
// This packages the graphable series (downsampled so localStorage stays small)
// + the per-rep tables into one JSON-safe object stored alongside the summary.
// Pure: fed the captured frames + the analyzeClip() result, returns null when
// there's nothing graphable (never a fabricated empty shell).

// Uniformly downsample a {series,peak} trace to at most maxPts points, ALWAYS
// keeping the first + last sample (so the time axis endpoints stay honest).
// peak is carried over from the full-resolution series, not the sampled subset.
// Most form clips are short (≤~200 frames) so this is a no-op on them; it only
// bites on a long multi-set clip, where a trend-shaped trace loses no meaning.
export function downsampleTrace(trace, maxPts = 200) {
  if (!trace || !Array.isArray(trace.series) || !trace.series.length) return null;
  const s = trace.series;
  if (s.length <= maxPts) return { series: s, peak: trace.peak };
  const step = (s.length - 1) / (maxPts - 1);
  const out = [];
  for (let i = 0; i < maxPts; i++) out.push(s[Math.round(i * step)]);
  return { series: out, peak: trace.peak };
}

const REPORT_KIND_ABBR = { knee: 'KNE', hip: 'HIP', elbow: 'ELB', sho: 'SHO' };

export function buildPoseReport(frames, exerciseTitle, analysis) {
  if (!frames || frames.length < 4 || !analysis || !analysis.ok) return null;
  const speed = downsampleTrace(barSpeedSeries(frames, 'wrist'), 200);
  const accel = downsampleTrace(barAccelSeries(frames, 'wrist'), 200);
  // Per-joint angle-over-time for every joint the clip actually TRACKED
  // (jointRomMetrics already dropped joints with too few clean samples), so the
  // ROM graph's joint + L/R selector only offers channels that carry real data.
  const angles = {};
  for (const j of (analysis.jointRom || [])) {
    const a = downsampleTrace(namedAngleSeries(frames, j.name), 200);
    if (a && a.series.length >= 3) angles[j.name] = a;
  }
  const vel = analysis.velocity, rt = analysis.romTempo;
  const perRepVel = vel && Array.isArray(vel.perRep)
    ? vel.perRep.map((r) => (r ? { mean: r.meanConcentric, peak: r.peak, loss: r.lossPct == null ? null : r.lossPct } : null))
    : null;
  const perRepRom = rt && Array.isArray(rt.perRep)
    ? rt.perRep.map((r) => (r ? { rom: r.rom, romPct: r.romPct, ecc: r.ecc, pause: r.pause, con: r.con, collapsed: !!r.collapsed } : null))
    : null;
  const jointRom = Array.isArray(analysis.jointRom)
    ? analysis.jointRom.map((j) => ({ name: j.name, romDeg: j.romDeg })) : null;
  const hasSpeed = !!(speed && speed.series && speed.series.length >= 3);
  const hasAngles = Object.keys(angles).length > 0;
  // Nothing graphable at all (occluded/failed pose) → no report, keep the
  // summary-only entry. Never persist an empty payload that would render blank.
  if (!hasSpeed && !hasAngles) return null;
  return {
    v: 2,
    speed: hasSpeed ? speed : null,
    accel: accel && accel.series && accel.series.length >= 3 ? accel : null,
    primaryJoint: REPORT_KIND_ABBR[analysis.kind] || null,
    angles: hasAngles ? angles : null,
    perRepVel,
    perRepRom,
    bestMean: vel && typeof vel.bestMean === 'number' ? vel.bestMean : null,
    lossPct: vel && typeof vel.finalLossPct === 'number' ? vel.finalLossPct : null,
    maxRom: rt && typeof rt.maxRom === 'number' ? rt.maxRom : null,
    collapsedCount: rt && typeof rt.collapsedCount === 'number' ? rt.collapsedCount : 0,
    jointRom,
    repCount: analysis.repCount || 0,
    fps: analysis.fps || null,
  };
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
  // Gate every ankle exactly like movementRepCount (L273): MediaPipe extrapolates
  // OFF-FRAME points to wild values (seen: ankle y at -3.49), and an unfiltered
  // read fabricates a "jump" out of an occlusion — the number that SCORES the
  // athlete (adversarial review F1). Require a confident, on-screen read on BOTH
  // ankles; a single occluded/off-frame ankle → null for that frame.
  const okAnkle = (p) => p && (p.visibility == null || p.visibility > 0.5) && isReal(p.y) && p.y > -0.05 && p.y < 1.15;
  const ankY = frames.map(f => {
    const im = f.landmarks; if (!im) return null;
    const a = okAnkle(im[LM.L_ANKLE]) ? im[LM.L_ANKLE] : null;
    const b = okAnkle(im[LM.R_ANKLE]) ? im[LM.R_ANKLE] : null;
    if (a && b) return Math.max(a.y, b.y);
    return null; // one foot unreadable → can't confirm flight (no fabricated rise)
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
      // PHYSICAL CONSISTENCY (adversarial review F2): the ankle-rise peak must
      // corroborate the flight-time-implied height (h = g·t²/8). A real jump lifts
      // the ankle by ~the jump height, so peak ≈ hTime (a bit MORE, from pre-toe-off
      // plantarflexion). An occlusion/dropout artefact has a huge peak vs a modest
      // flight time (or vice-versa) — reject it rather than let "longest window
      // wins" hand the coach the inflated read.
      const hTime = 9.81 * flightSec * flightSec / 8;   // metres from flight time
      const consistent = flightSec > 0 && peak >= 0.35 * hTime && peak <= 3 * hTime;
      if (consistent && (!best || flightSec > best.flightSec)) best = { flightSec, peak };
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
  // Gate each ankle (visibility + on-screen bounds) like movementRepCount — an
  // off-frame/occluded ankle MediaPipe extrapolates to a wild y would fabricate
  // a hop and inflate RSI, the coach-facing score (adversarial review F1).
  const okAnkle = (p) => p && (p.visibility == null || p.visibility > 0.5) && isReal(p.y) && p.y > -0.05 && p.y < 1.15;
  const ankY = frames.map(f => {
    const im = f.landmarks; if (!im) return null;
    const a = okAnkle(im[LM.L_ANKLE]) ? im[LM.L_ANKLE] : null;
    const b = okAnkle(im[LM.R_ANKLE]) ? im[LM.R_ANKLE] : null;
    if (a && b) return Math.max(a.y, b.y);
    return null;
  });
  // Ground level = where the ankles rest between hops. A POGO/drop often has NO
  // still stand at the start, so a first-600ms baseline lands mid-hop; instead
  // take a high percentile of ankle-Y over the whole clip (ankles sit on the
  // ground through every contact → the dominant high-Y cluster). This also
  // covers a still start — standing ankles ARE at ground level.
  const pctl = (arr, q) => { const a = arr.filter((x) => x != null).sort((p2, q2) => p2 - q2); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : null; };
  const baseY = pctl(ankY, 0.78);
  if (baseY == null) return null;
  const scaleSamples = frames.map(frameScaleY).filter(isReal);
  if (scaleSamples.length < 3) return null;
  const scale = median(scaleSamples);
  if (!isReal(scale) || scale <= 0) return null;
  const rise = ankY.map(y => y == null ? null : (baseY - y) * scale);
  // Adaptive rise threshold — a small stiff pogo rises only a few cm, so a fixed
  // 5cm misses it (movementRepCount uses the same adaptive idea). Floor at 3cm.
  const riseVals = rise.filter((r) => r != null).sort((a, b) => a - b);
  const riseRange = riseVals.length ? (riseVals[Math.floor(riseVals.length * 0.95)] - riseVals[Math.floor(riseVals.length * 0.05)]) : 0;
  const THR = Math.max(0.03, riseRange * 0.2), n = rise.length;
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
      // Physical consistency (F2): the ankle-rise peak must corroborate the
      // flight-time-implied height, else it's a dropout/occlusion artefact.
      const hTime = 9.81 * flightSec * flightSec / 8;
      if (flightSec >= 0.1 && flightSec <= 1.0 && peak >= 0.35 * hTime && peak <= 3 * hTime) windows.push({ takeoff, landing, flightSec, peak });
      i = j + 1;
    } else i++;
  }
  if (windows.length < 2) return null;     // need at least one contact + rebound

  // Ground-contact time drives RSI and is the most fps-sensitive number: a
  // 1-frame contact at low fps quantizes to a tiny time → an absurd RSI (e.g.
  // 45ms / 1 frame @21fps → RSI 20). Reject any contact shorter than ~2 frames;
  // it's timing noise, not a real reactive contact.
  const dts = frames.slice(1).map((f, i) => f.t - frames[i].t).filter((x) => x > 0).sort((a, b) => a - b);
  const medDt = dts.length ? dts[Math.floor(dts.length / 2)] : 33;
  const minContact = Math.max(0.06, (2 * medDt) / 1000);
  const hops = [];
  for (let w = 1; w < windows.length; w++) {
    const contactSec = (windows[w].takeoff - windows[w - 1].landing) / 1000;
    if (contactSec < minContact || contactSec > 1.5) continue;   // implausible / fps-quantized contact
    const heightCm = (9.81 * windows[w].flightSec * windows[w].flightSec / 8) * 100;
    const rsi = (heightCm / 100) / contactSec;               // m / s
    // Plausibility ceiling (F4): elite drop-jump RSI tops out ~2.5–3.5; anything
    // above ~4 is a shortened-contact / timing artefact, not a real reactive
    // score — drop it rather than print a superhuman RSI to the coach.
    if (rsi > 4.0) continue;
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
// Capture-quality gate — 2D markerless pose is only as good as the framing. A
// cropped, shaky, low-light or badly-angled clip yields confident-LOOKING but
// garbage angles/velocities. Grade how well the body was actually tracked so the
// UI can warn the coach when a read shouldn't be trusted. Honest by default.
export function captureQuality(frames, title) {
  if (!frames || !frames.length) return { coverage: 0, meanVis: null, grade: 'poor', note: 'No frames captured.' };
  // Judge only the joints that matter for THIS lift — an upper-body clip framed
  // on the torso (legs out of shot) must not be graded 'poor' because the legs
  // aren't visible, and vice-versa. Elbows (13/14) matter on presses.
  const t = (title || '').toLowerCase();
  const upper = /\b(bench|ohp|overhead|press|push[-\s]?up|dip|row|pull[-\s]?up|chin|pull[-\s]?down|lat|fly|raise|shrug|curl|tricep|bicep)\b/.test(t) && !/\bleg\b/.test(t);
  const lower = /\b(squat|lunge|split|pistol|rfess|bulgarian|step[-\s]?up|deadlift|rdl|hinge|thrust|glute|leg|calf|jump|pogo|hop|bound|nordic|good[-\s]?morning)\b/.test(t);
  const KEY = (upper && !lower) ? [11, 12, 13, 14]
    : (lower && !upper) ? [23, 24, 25, 26, 27, 28]
      : [11, 12, 13, 14, 23, 24, 25, 26, 27, 28];
  const keyNeeded = Math.max(1, Math.ceil(KEY.length * 0.6));
  let detected = 0, visSum = 0, visN = 0;
  for (const f of frames) {
    const lm = f.landmarks;
    if (!lm || !lm.length) continue;
    // A frame only counts as TRACKED when the joints THIS lift is measured on are
    // actually present with a real position — a clip that frames out the measured
    // joints (e.g. a squat with the legs out of shot) previously graded 'good' at
    // "100% tracked" off the torso alone, and the coach trusted garbage depth/ROM.
    let keyPresent = 0;
    for (const i of KEY) {
      const p = lm[i];
      if (p && isReal(p.x) && isReal(p.y)) {
        keyPresent++;
        // Only average visibility that's actually present and positive. A missing
        // visibility field (some MediaPipe builds omit it — see the `== null` path
        // in movementRepCount) or a 0 must not drag a well-tracked clip to 'poor'.
        if (typeof p.visibility === 'number' && p.visibility > 0) { visSum += p.visibility; visN++; }
      }
    }
    if (keyPresent >= keyNeeded) detected++;
  }
  const coverage = detected / frames.length;
  const meanVis = visN ? visSum / visN : null; // null = no usable visibility signal → judge on coverage alone
  let grade = 'good';
  if (coverage < 0.7 || (meanVis != null && meanVis < 0.5)) grade = 'poor';
  else if (coverage < 0.9 || (meanVis != null && meanVis < 0.7)) grade = 'fair';
  const pct = Math.round(coverage * 100);
  const note = grade === 'good'
    ? `Body tracked in ${pct}% of frames. (2D pose — it can't tell if the camera angle is off; a clean straight-on or side view still matters.)`
    : grade === 'fair'
      ? `Body tracked in ${pct}% of frames — usable, but reframe fuller and steadier for sharper numbers.`
      : `Body tracked in only ${pct}% of frames — treat the numbers below as unreliable. Refilm with the whole body in shot (straight-on or a clean side view), steady camera, decent light.`;
  return { coverage: round2(coverage), meanVis: meanVis == null ? null : round2(meanVis), grade, note };
}

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
  // Ballistic override: for jumps/pogos/hops the joint-angle channel misses
  // reps (a lateral or ankle-driven hop barely bends the tracked joint), so
  // count from the flight phase instead — but ONLY adopt it when it finds MORE
  // than the joint channel (flight recovers missed hops; it never lowers a
  // valid count) and the athlete is genuinely leaving the floor. Validated on
  // real clips: lateral pogo 3→12, deep-squat pogo 4→17, matches where the
  // joint channel already worked. Per-rep velocity/ROM stay joint-based (the
  // meaningful jump metrics live in JUMP TEST).
  let repCount = reps.length;
  let countMethod = 'joint';
  if (isBallistic(exerciseTitle)) {
    const mv = movementRepCount(frames);
    if (mv && mv.count > repCount && mv.range > 0.04) { repCount = mv.count; countMethod = 'flight'; }
  }
  // #242: a trailing re-rack (bar set-down that read as a tiny positive rep)
  // must not inflate the reported rep count. Subtract it from the JOINT count
  // only — jointRepCount below keeps the raw pre-gate count, and the flight/
  // plyo count is a separate path that stays untouched.
  if (countMethod === 'joint' && velocity?.rerackCount) {
    repCount = Math.max(0, repCount - velocity.rerackCount);
  }
  // extRom = the extended camera-ROM channels (signed knee / neck / static ankle)
  // kept in a SEPARATE field so nothing that iterates analysis.jointRom (report
  // graphs, asymmetry, faults) sees the non-standard channels; RomConfirm merges
  // the two when reading a spec. Honest by construction — a channel is present
  // only when its hard gate passed.
  const extRom = extendedJointRom(frames);
  return { ok: true, fps, kind, repCount, jointRepCount: reps.length, countMethod, reps, rejectedReps: reps.rejected || [], velocity, romTempo, jointRom, extRom, barSpeed, frameCount: frames.length, captureQuality: captureQuality(frames, exerciseTitle) };
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
