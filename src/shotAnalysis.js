// shotAnalysis.js — Basketball Shot Analyzer engine (pure functions, no DOM).
//
// Input: the frame array captureShotFrames() produces —
//   [{ t(ms), landmarks (2D image coords, normalised 0..1, y DOWN),
//      worldLandmarks (metric, hip-centred 3D) }]
//   (+ frames.dims {w,h}, frames.windows [{from,to}] = candidate shot windows)
// Output: per-frame metric series, detected shots with key frames
// (STANCE · DIP · SET · RELEASE · APEX · FOLLOW-THROUGH · LANDING), a
// checkpoint scorecard (measured → target → ok/watch/fix), the FIX GUIDE
// (what / why / how) per checkpoint, and session-level consistency.
//
// Coordinate rules: 3D worldLandmarks for JOINT ANGLES (no perspective
// distortion); 2D landmarks for POSITIONS / heights / velocities (the world
// frame is hip-centred, so the hip never moves there).
//
// Distances are normalised by the athlete's OWN body at the moment measured
// (torso length, eye-to-ankle ruler), so a shooter who walks toward or away
// from the camera between shots still measures the same.
//
// Target bands are EXPO's own shooting model — built from shooting
// biomechanics and projectile mechanics, expressed as coach-readable bands.
// They are bands, not laws: read them with the athlete in front of you.
import { angleAt, medianFilter, findPeaks, isReal } from './repCounter.js';
import { trackBall, launchAngle } from './ballTrack.js';   // .js on purpose: this module is imported directly by node in the verify suites

// MediaPipe Pose indices.
const I = {
  NOSE: 0, L_EYE: 2, R_EYE: 5, L_EAR: 7, R_EAR: 8,
  L_SHO: 11, R_SHO: 12, L_ELB: 13, R_ELB: 14, L_WRI: 15, R_WRI: 16,
  L_HIP: 23, R_HIP: 24, L_KNE: 25, R_KNE: 26, L_ANK: 27, R_ANK: 28,
  L_HEEL: 29, R_HEEL: 30, L_FOOT: 31, R_FOOT: 32,
};
const side = (hand) => hand === 'L'
  ? { EYE: I.L_EYE, SHO: I.L_SHO, ELB: I.L_ELB, WRI: I.L_WRI, HIP: I.L_HIP, KNE: I.L_KNE, ANK: I.L_ANK }
  : { EYE: I.R_EYE, SHO: I.R_SHO, ELB: I.R_ELB, WRI: I.R_WRI, HIP: I.R_HIP, KNE: I.R_KNE, ANK: I.R_ANK };
const otherSide = (hand) => (hand === 'L' ? side('R') : side('L'));

const DEG = 180 / Math.PI;
const visOf = (p) => (p ? (p.visibility == null ? 1 : p.visibility) : 0);
const vis = (p, min = 0.3) => visOf(p) >= min;
const mid = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 } : null);
const mean = (arr) => { const a = arr.filter(isReal); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
// A true median: on an even count this averages the two middle values.
// It used to return the UPPER one, which biased every even-length sample high.
// That matters most at line ~450, where median() computes rulerPx, the eye-to-
// ankle pixel distance the whole cm scale is calibrated from. A ruler biased
// high makes cm-per-pixel small, so release height, jump height and every
// derived metre reads LOW - the same direction as the oblique-camera error.
// lineageAnalysis.js and poseMetricsStore.js already do it this way; this file
// was the odd one out.
export const median = (arr) => {
  const a = arr.filter(isReal).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const round = (v, d = 0) => (isReal(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const sdev = (arr) => { const a = arr.filter(isReal); if (a.length < 2) return null; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// Body-segment fractions of stature (standard anthropometry) — only used to
// turn normalised distances into cm when the coach enters a height.
const TORSO_FRACTION = 0.288;        // shoulder → hip
const EYE_HEIGHT_FRACTION = 0.936;
const ANKLE_HEIGHT_FRACTION = 0.039;

function ema(sig, alpha = 0.55) {
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

function deriv(sig, tMs) {
  const out = new Array(sig.length).fill(null);
  for (let i = 1; i < sig.length - 1; i++) {
    const a = sig[i - 1], b = sig[i + 1];
    const dt = (tMs[i + 1] - tMs[i - 1]) / 1000;
    if (isReal(a) && isReal(b) && dt > 0 && dt < 0.5) out[i] = (b - a) / dt;
  }
  return out;
}
const argmax = (sig, from, to) => { let bi = -1, bv = -Infinity; for (let i = Math.max(0, from); i <= Math.min(sig.length - 1, to); i++) { const v = sig[i]; if (isReal(v) && v > bv) { bv = v; bi = i; } } return bi; };
const argmin = (sig, from, to) => { let bi = -1, bv = Infinity; for (let i = Math.max(0, from); i <= Math.min(sig.length - 1, to); i++) { const v = sig[i]; if (isReal(v) && v < bv) { bv = v; bi = i; } } return bi; };
const idxAtTime = (tMs, t) => { let bi = 0, bd = Infinity; for (let i = 0; i < tMs.length; i++) { const d = Math.abs(tMs[i] - t); if (d < bd) { bd = d; bi = i; } } return bi; };

// ---------------------------------------------------------------- series ---
export function buildSeries(frames, { hand = 'R', aspect = 9 / 16 } = {}) {
  const S = side(hand), O = otherSide(hand);
  const n = frames.length;
  const tMs = frames.map((f) => f.t);
  const s = {
    tMs,
    knee: [], kneeOther: [], hip: [], elbow: [], shoulder: [], trunk: [],
    forearm: [], armElev: [], elbowAboveSho: [], wristEye: [], wristElbowX: [], hipY: [], wristY: [], ankleY: [], eyeY: [], headY: [],
    torso: [], ruler: [], armAboveHead: [], visOk: [], visArm: [], visLegs: [], feetOk: [], ball: [], wristPos: [],
  };
  for (let k = 0; k < n; k++) {
    const f = frames[k];
    const w = f.worldLandmarks, p = f.landmarks;
    const P = (i) => (p && p[i]) || null;
    s.knee.push(w ? angleAt(w, S.HIP, S.KNE, S.ANK) : null);
    s.kneeOther.push(w ? angleAt(w, O.HIP, O.KNE, O.ANK) : null);
    s.hip.push(w ? angleAt(w, S.SHO, S.HIP, S.KNE) : null);
    s.elbow.push(w ? angleAt(w, S.SHO, S.ELB, S.WRI) : null);
    s.shoulder.push(w ? angleAt(w, S.HIP, S.SHO, S.ELB) : null);

    const sh = mid(P(I.L_SHO), P(I.R_SHO)), hp = mid(P(I.L_HIP), P(I.R_HIP));
    // x is scaled by the frame aspect so horizontal and vertical normalised
    // distances share one unit.
    const torso = sh && hp ? Math.hypot((sh.x - hp.x) * aspect, sh.y - hp.y) : null;
    s.torso.push(torso);
    if (sh && hp) {
      const dx = (sh.x - hp.x) * aspect, dy = hp.y - sh.y;
      s.trunk.push(Math.abs(Math.atan2(dx, dy) * DEG));
    } else s.trunk.push(null);

    const el = P(S.ELB), wr = P(S.WRI), eye = P(S.EYE) || P(I.NOSE);
    if (el && wr && vis(el) && vis(wr)) {
      const dx = Math.abs((wr.x - el.x) * aspect), dy = el.y - wr.y;
      s.forearm.push(Math.atan2(dy, dx) * DEG);
      s.wristElbowX.push(torso ? dx / torso : null);
    } else { s.forearm.push(null); s.wristElbowX.push(null); }
    // Arm elevation measured IN THE FILMED PLANE: 0° = arm hanging down,
    // 180° = arm straight overhead. The 3D world angle reads ~95° on a clean
    // overhead release when the athlete is small in frame, so the image-plane
    // angle is the honest one for a phone clip shot from 5 m.
    const shP = P(S.SHO);
    if (shP && el && vis(shP) && vis(el)) {
      const dx = (el.x - shP.x) * aspect, dy = shP.y - el.y;   // dy>0 = elbow above shoulder
      s.armElev.push(Math.atan2(dy, Math.abs(dx)) * DEG + 90);  // 0..180
      s.elbowAboveSho.push(dy);
    } else { s.armElev.push(null); s.elbowAboveSho.push(null); }
    // Where the shooting hand IS, in the same height-fraction unit as
    // everything else. The ball leaves from here, which is what tells a real
    // shot apart from some other object drifting across the upper frame.
    s.wristPos.push(wr && vis(wr) ? { x: wr.x * aspect, y: wr.y } : null);
    s.wristEye.push(wr && eye && torso ? (eye.y - wr.y) / torso : null);
    s.hipY.push(hp ? -hp.y : null);
    s.wristY.push(wr ? -wr.y : null);
    s.eyeY.push(eye ? -eye.y : null);
    const headTop = Math.min(...[I.NOSE, I.L_EYE, I.R_EYE, I.L_EAR, I.R_EAR].map((j) => (P(j) ? P(j).y : 1)));
    s.headY.push(isReal(headTop) ? -headTop : null);
    // Either wrist above the head — a shot has the hands overhead regardless of
    // which one is nominated as the shooting hand.
    const wl = P(I.L_WRI), wrr = P(I.R_WRI);
    const hi = Math.min(vis(wl) ? wl.y : 1, vis(wrr) ? wrr.y : 1);
    s.armAboveHead.push(isReal(headTop) ? hi < headTop : false);

    const ankL = P(I.L_ANK), ankR = P(I.R_ANK);
    const ank = mid(ankL, ankR) || P(S.ANK);
    s.ankleY.push(ank ? -ank.y : null);
    const feetOk = vis(ankL, 0.5) && vis(ankR, 0.5);
    s.feetOk.push(feetOk);
    // Full-body ruler (eye → ankle) — only trustworthy when the feet are seen.
    s.ruler.push(feetOk && eye && ank ? (ank.y - eye.y) : null);
    // Tracked ARM (what the release/set checkpoints read) and tracked LEGS
    // (what the dip reads) are separate facts. The far-side arm of a shooter
    // filmed from behind scores low visibility even when MediaPipe places it
    // correctly, so the arm gate runs at a lower bar than the leg gate and the
    // report carries the coverage number that says how sure to be.
    const okArm = !!(el && wr && vis(el, 0.12) && vis(wr, 0.12));
    const okLegs = !!(P(S.KNE) && vis(P(S.KNE)) && P(S.HIP) && vis(P(S.HIP)));
    s.visArm.push(okArm);
    s.visLegs.push(okLegs);
    s.visOk.push(!!(el && wr && vis(el) && vis(wr)) && okLegs);
    // Candidate ball positions from the capture's motion pass, already in a
    // single isotropic pixel space, so they can be fitted as-is.
    s.ball.push(f.blobs || null);
  }
  const sm = {};
  for (const k of ['knee', 'kneeOther', 'hip', 'elbow', 'shoulder', 'armElev', 'elbowAboveSho', 'trunk', 'forearm', 'wristEye', 'wristElbowX', 'hipY', 'wristY', 'ankleY', 'eyeY', 'headY', 'torso', 'ruler']) sm[k] = smooth(s[k]);
  sm.hipVel = deriv(sm.hipY, tMs);
  sm.kneeVel = deriv(sm.knee, tMs);          // deg/s, +ve = extending
  sm.shoulderVel = deriv(sm.shoulder, tMs);
  sm.elbowVel = deriv(sm.elbow, tMs);
  sm.wristVel = deriv(sm.wristY, tMs);
  // aspect travels with the series so the ball fit can share one unit system.
  return { raw: s, sm, n, tMs, aspect };
}

// ------------------------------------------------------------- detection ---
// A shot is anchored on the RELEASE — the one instant every shot shares: the
// hands are above the head, the wrist is at its peak height and the elbow has
// finished firing. Anchoring on the dip instead fires on walking, dribbling
// and rebounding, which is exactly how a 11-shot clip becomes "14 shots".
export function detectShots(series, fps, opts = {}) {
  const dbg = opts.debug || null;
  const note = (t, reason) => { if (dbg) dbg.push({ t: Math.round(t), reason }); };
  // Gate thresholds are parameters so the caller can run a FORGIVING second
  // pass when the strict one finds nothing — a clip filmed slightly off-angle
  // (or a set shot with almost no knee bend) reads lower on every angle and
  // used to be rejected outright with "no shot detected" (audit 08-24).
  const G = {
    // 70, not 95: filmed from behind/side the shooting arm is foreshortened,
    // so a genuine release reads 70-90 degrees in the image plane. The gate that
    // actually separates a shot from a rebound here is the combination that
    // still holds -- wrist above the head + elbow extended + a dip -- and a
    // sweep on the 11-shot clip returns exactly 11 anywhere from 88 down to 60,
    // so 70 sits in the middle of the plateau rather than on its edge (08-24).
    armElev: opts.minArmElev ?? 70,
    elbow: opts.minElbow ?? 110,
    knee: opts.maxDipKnee ?? 165,
    dipWindowMs: opts.dipWindowMs ?? 1400,
    requireAboveHead: opts.requireAboveHead !== false,
  };
  const { sm, raw, tMs, n } = series;
  // Two releases closer together than this are the SAME rep seen twice — the
  // follow-through, the catch, or the rebound reading as a second shot.
  //
  // 700 was too low. On Ohad's 11-rep clip a twelfth "shot" appeared 933ms
  // after the eleventh and passed every gate, which would have shown him 12
  // shots for 11 reps and dragged the session spread with a rep that does not
  // exist. His real gaps are 3.62-4.55s, so the floor has enormous room; 1200
  // still leaves space for a fast catch-and-shoot drill (~2s) while putting the
  // duplicate well outside.
  const minGapMs = 1200;
  const cands = [];

  // Releases are LOCAL PEAKS of wrist height, one per attempt. (Scanning
  // "hands above head" runs instead merges a catch, a shot and a rebound into
  // one five-second run, and the release then lands on an arbitrary frame.)
  const torsoRef = median(sm.torso) || 0.15;
  const peaks = findPeaks(sm.wristY, torsoRef * 0.35, Math.max(2, Math.round(fps * 0.5)));
  // Only a frame with the arm RAISED can be the release. Measured on an
  // 11-shot night-court clip: without this mask five real shots were rejected
  // as "arm not overhead (6–44°)" because argmax(elbow) had locked onto a
  // straight arm hanging at the hip inside the same 500 ms window (08-24).
  const ARM_UP_FLOOR = 55;
// A shot needs enough clip after the release to observe the follow-through
// the scorecard asks for (300 ms), plus a margin. Shorter than this and the
// rep cannot be scored, so counting it only inflates the number.
const MIN_TAIL_MS = 400;
  const elbowUp = sm.elbow.map((v, k) => (isReal(v) && isReal(sm.armElev[k]) && sm.armElev[k] >= ARM_UP_FLOOR ? v : null));
  const searchRuns = peaks.map((p) => {
    // Search window around each peak: enough for the whole attempt.
    const a = idxAtTime(tMs, tMs[p.idx] - 250);
    const b = idxAtTime(tMs, tMs[p.idx] + 250);
    return [a, b];
  });

  // Gates read the BEST frame in a short neighbourhood, not the one frame the
  // capture happened to land on. Pose tracking on a distant, night-lit subject
  // drops or smears individual frames, and gating on a single sampled frame
  // made the shot count flip between 10 and 11 on repeat runs of the SAME clip
  // — one noisy frame could veto a real shot. Thresholds are unchanged; only
  // the frame they are read from is now robust (08-24).
  const bestNear = (sig, i, ms) => {
    const a = idxAtTime(tMs, tMs[i] - ms), b = idxAtTime(tMs, tMs[i] + ms);
    const j = argmax(sig, a, b);
    return j >= 0 ? sig[j] : null;
  };
  const anyNear = (flags, i, ms) => {
    const a = idxAtTime(tMs, tMs[i] - ms), b = idxAtTime(tMs, tMs[i] + ms);
    for (let k = Math.max(0, a); k <= Math.min(flags.length - 1, b); k++) if (flags[k]) return true;
    return false;
  };

  // First frame in [from,to] that reaches within `tol` of `peak` — the arm holds
  // its extension through the follow-through, so the LAST frame of that plateau
  // (what a plain argmax returns) is the end of the hold, not the release.
  const firstNear = (sig, from, to, peak, tol) => {
    for (let k = Math.max(0, from); k <= Math.min(sig.length - 1, to); k++) {
      const v = sig[k]; if (isReal(v) && v >= peak - tol) return k;
    }
    return -1;
  };

  for (const [a, b] of searchRuns) {
    const wPeakIdx = argmax(sm.wristY, a, b);
    if (wPeakIdx < 0) continue;
    const wPeak = firstNear(sm.wristY, a, b, sm.wristY[wPeakIdx], Math.max(0.004, Math.abs(sm.wristY[wPeakIdx]) * 0.01));
    const eSearchFrom = Math.max(a, wPeak - Math.round(fps * 0.45)), eSearchTo = Math.min(b, wPeak + Math.round(fps * 0.35));
    const eMaxIdx = argmax(elbowUp, eSearchFrom, eSearchTo);
    let release = eMaxIdx >= 0 ? firstNear(elbowUp, eSearchFrom, eSearchTo, elbowUp[eMaxIdx], 6) : wPeak;
    if (release < 0) release = wPeak;
    if (!isReal(sm.elbow[release]) || sm.elbow[release] < 110) release = wPeak;
    // Gates — every one of these is true of a shot and false of a dribble, a
    // catch or a rebound, which is what keeps an 11-shot clip from reporting 14.
    // Thresholds calibrated against real release frames (elbow above the
    // shoulder, arm extending). A distant subject reads lower on both angles
    // than a studio capture would, so the bar is where actual shots sit.
    // THERE HAS TO BE CLIP LEFT TO MEASURE THE SHOT IN.
    //
    // The follow-through checkpoint wants the arm held for 300 ms after
    // release, so a release with less clip than that remaining cannot be
    // scored on its own terms - and a truncated tail is exactly what noise
    // turns into a phantom rep. A darkened copy of Ohad's clip returned 18
    // shots against the reference encode's 17, and the extra one sat 250 ms
    // from the end of the file: the camera being switched off, read as a
    // shot. Rejecting it is not a tuned threshold, it is the definition of
    // a rep this engine can measure.
    if (tMs[n - 1] - tMs[release] < MIN_TAIL_MS) { note(tMs[release], 'clip ends ' + Math.round(tMs[n - 1] - tMs[release]) + 'ms after release'); continue; }
    const armElevNear = bestNear(sm.armElev, release, 150);
    if (!isReal(armElevNear) || armElevNear < G.armElev) { note(tMs[release], 'arm not overhead (' + Math.round(armElevNear || 0) + '° image-plane)'); continue; }
    const elbowNear = bestNear(sm.elbow, release, 150);
    if (!isReal(elbowNear) || elbowNear < G.elbow) { note(tMs[release], 'elbow not extended (' + Math.round(elbowNear || 0) + '°)'); continue; }
    if (G.requireAboveHead && !anyNear(raw.armAboveHead, release, 200)) { note(tMs[release], 'hand not above head'); continue; }

    const dipFrom = idxAtTime(tMs, tMs[release] - G.dipWindowMs);
    const dip = argmin(sm.knee, dipFrom, Math.max(dipFrom, release - 1));
    if (dip < 0 || !isReal(sm.knee[dip]) || sm.knee[dip] > G.knee) { note(tMs[release], 'no dip (' + Math.round(sm.knee[dip] || 0) + '°)'); continue; }

    // Set point = elbow closest to the 90° L-shape, chosen among TRACKED
    // frames only — picking an untracked one threw the whole shot away on the
    // key-frame gate below (three real shots on the 08-24 clip).
    let set = -1, best = Infinity;
    for (let k = dip; k < release; k++) { const e = sm.elbow[k]; if (isReal(e) && raw.visArm[k] && Math.abs(e - 90) < best) { best = Math.abs(e - 90); set = k; } }
    if (set < 0) { for (let k = dip; k < release; k++) { const e = sm.elbow[k]; if (isReal(e) && Math.abs(e - 90) < best) { best = Math.abs(e - 90); set = k; } } }
    if (set < 0) set = dip;

    const apFrom = idxAtTime(tMs, tMs[release] - 700), apTo = idxAtTime(tMs, tMs[release] + 700);
    const apex = argmax(sm.hipY, apFrom, apTo);

    const stFrom = idxAtTime(tMs, tMs[dip] - 900), stTo = Math.max(stFrom, idxAtTime(tMs, tMs[dip] - 250));
    const stance = stFrom;
    const baseHip = median(sm.hipY.slice(stFrom, Math.max(stFrom + 1, stTo + 1)));

    const shoRel = sm.shoulder[release];
    let ftEnd = release;
    for (let k = release; k <= Math.min(n - 1, idxAtTime(tMs, tMs[release] + 1500)); k++) {
      const ok = isReal(sm.shoulder[k]) && sm.shoulder[k] >= shoRel - 15 && (sm.wristEye[k] == null || sm.wristEye[k] > -0.15);
      if (!ok) break; ftEnd = k;
    }
    let landing = -1;
    if (isReal(baseHip) && apex >= 0) {
      for (let k = apex + 1; k <= Math.min(n - 1, idxAtTime(tMs, tMs[apex] + 1400)); k++) { if (isReal(sm.hipY[k]) && sm.hipY[k] <= baseHip + 0.004) { landing = k; break; } }
    }
    let seen = 0, tot = 0;
    for (let k = dip; k <= ftEnd; k++) { tot++; if (raw.visOk[k]) seen++; }
    const coverage = tot ? seen / tot : 0;
    // The three frames the scorecard actually reads must each be tracked — but
    // each for what it MEASURES: the arm at the set and the release, the legs
    // at the dip. (Requiring all four joints at all three frames rejected every
    // real shot in a clip filmed from behind — measured 08-24.)
    if (!(anyNear(raw.visArm, release, 120) && anyNear(raw.visArm, set, 120) && (anyNear(raw.visLegs, dip, 120) || anyNear(raw.visArm, dip, 120)))) {
      note(tMs[release], 'key frame untracked (arm rel=' + (raw.visArm[release] ? 1 : 0) + ' set=' + (raw.visArm[set] ? 1 : 0) + ' legs dip=' + (raw.visLegs[dip] ? 1 : 0) + ')');
      continue;
    }
    note(tMs[release], 'candidate cov=' + coverage.toFixed(2));
    cands.push({ stance, dip, set, release, apex, followEnd: ftEnd, landing, baseHip, coverage });
  }

  cands.sort((x, y) => tMs[x.release] - tMs[y.release]);
  const kept = [];
  for (const c of cands) {
    const last = kept[kept.length - 1];
    // Close together in TIME is not enough to call two candidates the same rep.
    //
    // A pure time gate trades one error for the other: at 700ms a
    // follow-through was counted as a twelfth shot; at 1200ms a genuinely fast
    // set risks losing real reps, which is far worse — a shot the athlete took
    // and cannot see. So time only RAISES THE QUESTION; the dip answers it.
    //
    // Every real jump shot has its own dip. A duplicate — the follow-through,
    // the catch, the rebound — is detected off the SAME dip as the shot before
    // it. So two candidates merge only when they are both close in time AND
    // share a dip. Two dips means two shots, however fast they came.
    const closeInTime = last && tMs[c.release] - tMs[last.release] < minGapMs;
    const sameDip = last && (c.dip === last.dip
      || (c.dip >= 0 && last.dip >= 0 && Math.abs(tMs[c.dip] - tMs[last.dip]) < 250));
    if (closeInTime && sameDip) {
      if (c.coverage > last.coverage) kept[kept.length - 1] = c;   // keep the better-tracked of the two
      note(tMs[c.release], 'same dip as the previous shot — merged as one rep');
      continue;
    }
    kept.push(c);
  }
  // A scorecard built from a fifth of the frames is a lie — better to report
  // fewer shots honestly than to score guesses.
  // Coverage is reported, not gated: the key frames are already verified above,
  // and a low average only means the walk-up was tracked loosely.
  return kept;
}

// ------------------------------------------------------------- scorecard ---
const band = (v, okLo, okHi, watchLo, watchHi) => {
  if (!isReal(v)) return 'na';
  if (v >= okLo && v <= okHi) return 'ok';
  if (v >= watchLo && v <= watchHi) return 'watch';
  return 'fix';
};
const SCORE = { ok: 1, watch: 0.55, fix: 0.1, na: null };

// The release-arm band shifts with shot distance: the further out, the flatter
// the arm can be while the ball still drops in steeply enough.
// WHAT ACTUALLY DIFFERS BETWEEN THE THREE SHOTS.
//
// This table used to vary ONE checkpoint - the release arm angle - by three or
// four degrees, so picking a shot type changed almost nothing on screen and the
// control read as decorative (Ohad 08-29: the shot parameter "does not affect
// anything"). The three shots differ in more than the arm:
//
//   Free throw  no jump at all, so there is no apex to time a release against
//               and scoring one is noise. Least leg drive, most upright trunk,
//               and the hold matters most because a free throw is a repeated
//               routine before it is anything else.
//   Mid-range   the reference shot; the defaults are its numbers.
//   Three       needs the legs, so a deeper dip is correct rather than a fault,
//               a few degrees of forward lean is normal at that range, and the
//               kinetic-chain order matters more because the arm alone cannot
//               make the distance.
//
// Bands are coach-readable guidance, not laws - the same caveat the report
// carries at the bottom of the checkpoint list.
export const SHOT_TYPES = [
  { key: 'ft', label: 'Free throw', arm: [48, 66], armWatch: [40, 74],
    dip: [115, 150], dipWatch: [100, 160], trunk: [0, 8], trunkWatch: [0, 14],
    follow: [400, 5000], followWatch: [200, 5000], jump: false,
    w: { dip: 0.8, follow: 1.1, sequence: 0.9 } },
  { key: 'mid', label: 'Mid-range', arm: [45, 62], armWatch: [37, 71],
    dip: [105, 140], dipWatch: [92, 152], trunk: [0, 10], trunkWatch: [0, 18],
    follow: [300, 5000], followWatch: [150, 5000], jump: true, w: {} },
  { key: 'three', label: 'Three', arm: [42, 58], armWatch: [34, 67],
    dip: [95, 130], dipWatch: [85, 145], trunk: [0, 14], trunkWatch: [0, 22],
    follow: [300, 5000], followWatch: [150, 5000], jump: true,
    timing: [-180, 40], timingWatch: [-300, 130],
    w: { dip: 1.2, sequence: 1.3, follow: 0.7 } },
];
const typeSpec = (k) => SHOT_TYPES.find((t) => t.key === k) || SHOT_TYPES[1];

export function buildCheckpoints(shotType = 'mid') {
  const T = typeSpec(shotType);
  // Per-type weight nudges: what matters most is not the same on a free
  // throw as it is on a three.
  const W = (key, base) => Math.round(base * ((T.w && T.w[key]) || 1) * 100) / 100;
  const R = (a, b) => `${a}\u2013${b}`;
  return [
    { key: 'dip', label: 'Dip depth', weight: W('dip', 1),
      target: `${R(T.dip[0], T.dip[1])}° knee angle at the bottom of the dip (${T.label.toLowerCase()})`,
      band: (v) => band(v, T.dip[0], T.dip[1], T.dipWatch[0], T.dipWatch[1]),
      why: 'The legs are the engine. Too shallow a dip leaves the arm to generate the power — a flat, arm-heavy shot that dies short at range; too deep slows the rhythm and lets the defence close. Mid-range knee flexion keeps leg drive AND rhythm.',
      how: ['One-dribble pull-ups: count "down-UP" out loud — the "down" is the dip, the "UP" is the rise.', 'Form shooting from 2–3 m: 10 reps changing nothing but a repeatable quarter-squat dip.', 'Film 5 free throws side-on and compare the dip frame — same depth every rep.'] },
    { key: 'setHeight', label: 'Set point height', weight: 1.2,
      target: 'Wrist at or above the eye line at the set point',
      band: (v) => band(v, 0, 9, -0.15, 9),
      why: 'A high set point raises the release height, so the ball drops into the rim at a steeper angle — a bigger margin for error. It also makes the shot far harder to contest.',
      how: ['Wall-form reps: stand 30 cm from a wall, bring the ball to the forehead and extend straight up without the elbow touching the wall.', 'Pause shooting: hold the set for 1 s, check the wrist is at the eyebrow, then release.', 'Cue: "ball to the forehead, not the chin".'] },
    { key: 'setElbow', label: 'Elbow at set', weight: 0.8,
      target: '~75–105° elbow angle at the set point (L-shape)',
      band: (v) => band(v, 75, 105, 65, 120),
      why: 'An L-shaped elbow at the set stores the extension range that produces a smooth, straight release. An already-open elbow (>120°) pushes the ball; a very closed one (<65°) drops the set point and lengthens the release.',
      how: ['Mirror reps: load the ball at the set and look for the "L" — forearm vertical, upper arm parallel to the floor.', 'One-hand form shooting with the guide hand off the ball, 2 m out, 20 reps.'] },
    { key: 'elbowAlign', label: 'Elbow under the ball', weight: 1,
      target: 'Wrist roughly above the elbow at the set (offset ≤ 0.25 torso)',
      band: (v) => band(v, 0, 0.25, 0, 0.4),
      why: 'With the elbow under the wrist, the extension drives the ball straight at the rim; a flared or trailing elbow adds a sideways component the wrist has to correct — the classic left/right miss.',
      how: ['Wall-slide drill: shooting-side shoulder to a wall, the elbow brushes the wall through the whole extension.', 'Cue: "elbow to the rim" — it points at the target before the arm fires.', 'Guide-hand discipline: the off hand leaves the ball at the set, never pushes.'] },
    { key: 'releaseExt', label: 'Elbow extension at release', weight: 1,
      target: '≥ 160° at release (full extension)',
      band: (v) => band(v, 160, 181, 145, 181),
      why: 'Full extension gives the longest lever and the highest release point, and lets the wrist snap as the last link of the chain. A short arm (<145°) pushes the ball with the shoulder — low arc, inconsistent distance.',
      how: ['"Reach into the rim" — the fingers finish pointing at the hoop, elbow locked.', 'Chair shooting: seated form shots, so the power must come from extension + wrist, not the legs.', 'Shadow reps at 50% speed, holding the extended finish for 2 s.'] },
    { key: 'releaseArm', label: 'Release arm angle', weight: 0.9,
      target: `Forearm ${T.arm[0]}–${T.arm[1]}° above horizontal at release (${T.label.toLowerCase()})`,
      band: (v) => band(v, T.arm[0], T.arm[1], T.armWatch[0], T.armWatch[1]),
      why: 'The forearm angle at release drives the ball’s launch angle. Too flat and the rim window shrinks; too steep costs range and timing. This is the ARM angle — the true ball angle needs ball tracking.',
      how: ['Arc drill: shoot over a target 30–40 cm above the rim (a partner’s hand on a box) — swish only.', 'Cue: "shoot UP, not AT" — aim at the high point of the arc, not the rim.', 'Film side-on: the follow-through fingers finish high, not pointing flat at the rim.'] },
    { key: 'timing', label: 'Release vs jump apex', weight: W('timing', 0.9),
      target: T.jump === false
        ? 'Not scored on a free throw \u2014 there is no jump to time the release against'
        : `Release between ${(T.timing || [-120, 60])[0]} ms and +${(T.timing || [-120, 60])[1]} ms around the apex`,
      // Scoring a free throw against a jump apex it does not have was noise
      // in the score, not information. 'na' is excluded from the weighting.
      band: (v) => (T.jump === false ? 'na' : band(v, (T.timing || [-120, 60])[0], (T.timing || [-120, 60])[1], (T.timingWatch || [-250, 150])[0], (T.timingWatch || [-250, 150])[1])),
      why: 'Releasing at or just before the top of the jump uses the leg drive and the highest release point; releasing on the way down adds a downward body velocity the arm has to overcome and lowers the release.',
      how: ['Rhythm shooting: "1-2-UP" — the release finishes on the UP.', 'Jump-stop into shot off a pass; a partner calls "late" when the feet are already falling.', 'If the release is always late, shorten the dip — the jump is taking too long.'] },
    { key: 'sequence', label: 'Kinetic-chain order', weight: W('sequence', 1.1),
      target: 'Legs → shoulder → elbow, in that order',
      band: (v) => band(v, 3, 3, 2, 3),
      why: 'Power should travel from the ground up: the knees finish extending first, then the shoulder lifts, then the elbow fires and the wrist snaps. When the arm fires before the legs finish, the shot is all arm — it drains at range and falls apart with fatigue.',
      how: ['Slow "down-up-through" reps: feel the legs finish before the arm goes.', 'One-motion form shooting close to the rim, stepping back gradually — keep the same order.', 'Cue: "push the floor, then the ball".'] },
    { key: 'follow', label: 'Follow-through hold', weight: W('follow', 0.8),
      target: `Arm held high ≥ ${T.follow[0]} ms after release, wrist flexed`,
      band: (v) => band(v, T.follow[0], T.follow[1], T.followWatch[0], T.followWatch[1]),
      why: 'The follow-through is the receipt for a complete extension and wrist snap; dropping the arm early almost always means the snap was cut short, and it costs the backspin that softens the bounce.',
      how: ['"Hold it till it hits" — freeze the finish until the ball reaches the rim, every rep, for a whole session.', 'Cue: "hand in the cookie jar" — fingers down over the rim at the finish.'] },
    { key: 'trunk', label: 'Trunk at release', weight: W('trunk', 0.7),
      target: `Near vertical (≤ ${T.trunk[1]}° lean) at release`,
      band: (v) => band(v, T.trunk[0], T.trunk[1], T.trunkWatch[0], T.trunkWatch[1]),
      why: 'A vertical trunk keeps the shoulders square and the release height maximal; a lean or fade moves the release point every rep (unless the fade is deliberate). Forward lean on the catch usually means the feet were late.',
      how: ['Feet first: land the jump-stop with the feet set and the chest up before the ball arrives.', 'Tall-kneeling shooting, 10 reps — the trunk cannot lean.', 'Single-leg RDL holds 3×20 s for the balance underneath it.'] },
  ];
}
export const CHECKPOINTS = buildCheckpoints('mid');

// Proximal-to-distal ordering: how many of the three links fire in order.
function sequenceScore(series, c) {
  const { sm, tMs } = series;
  const from = c.dip, to = c.release;
  if (!(to > from + 2)) return { value: null, order: null };
  const kneeT = argmax(sm.kneeVel, from, to);        // peak knee EXTENSION rate
  const shoT = argmax(sm.shoulderVel, from, to);     // peak arm elevation rate
  const elbT = argmax(sm.elbowVel, from, to);        // peak elbow extension rate
  if (kneeT < 0 || shoT < 0 || elbT < 0) return { value: null, order: null };
  const tk = tMs[kneeT], ts = tMs[shoT], te = tMs[elbT];
  let ok = 0;
  if (tk <= ts + 60) ok++;
  if (ts <= te + 60) ok++;
  if (tk <= te + 60) ok++;
  return { value: ok, order: { kneeMs: Math.round(tk - tMs[c.dip]), shoulderMs: Math.round(ts - tMs[c.dip]), elbowMs: Math.round(te - tMs[c.dip]) } };
}

// cm-per-normalised-unit rulers, measured on the athlete right before the shot
// so a change of court position between shots cannot distort them.
function rulers(series, c, statureCm) {
  const { sm } = series;
  const idxs = [];
  for (let i = Math.max(0, c.stance); i <= c.dip; i++) idxs.push(i);
  const rulerPx = median(idxs.map((i) => sm.ruler[i]));          // eye→ankle, feet visible only
  const torsoPx = median(idxs.map((i) => sm.torso[i])) || sm.torso[c.dip];
  const st = isReal(statureCm) && statureCm >= 120 && statureCm <= 235 ? statureCm : null;
  const cmPerUnit = st
    ? (isReal(rulerPx) && rulerPx > 0.05
      ? (st * (EYE_HEIGHT_FRACTION - ANKLE_HEIGHT_FRACTION)) / rulerPx
      : (isReal(torsoPx) && torsoPx > 0.02 ? (st * TORSO_FRACTION) / torsoPx : null))
    : null;
  return { cmPerUnit, torsoPx, rulerPx };
}

export function scoreShot(series, c, { statureCm = null, shotType = 'mid' } = {}) {
  const { sm, tMs } = series;
  const at = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : null);
  const seq = sequenceScore(series, c);
  const v = {
    dip: at(sm.knee, c.dip),
    setHeight: at(sm.wristEye, c.set),
    setElbow: at(sm.elbow, c.set),
    elbowAlign: at(sm.wristElbowX, c.set),
    releaseExt: at(sm.elbow, c.release),
    releaseArm: at(sm.forearm, c.release),
    timing: c.apex >= 0 && c.release >= 0 ? tMs[c.release] - tMs[c.apex] : null,
    sequence: seq.value,
    follow: c.followEnd > c.release ? tMs[c.followEnd] - tMs[c.release] : 0,
    trunk: at(sm.trunk, c.release),
  };
  // BALL LAUNCH ANGLE — the real thing, where the release-arm angle is only a
  // proxy for it. Sampled from the release forward, and it returns null unless
  // the points genuinely fit a projectile, so a bad detection run shows nothing
  // rather than a confident wrong number.
  const ballLaunch = (() => {
    const cands = series.raw && series.raw.ball;
    if (!Array.isArray(cands) || c.release < 0) return null;
    // From the release out to 700ms — long enough for the ball to clear the
    // hand and show a full arc, short enough that it has not been caught,
    // bounced or replaced by the next rep.
    const end = Math.min(cands.length - 1, idxAtTime(tMs, tMs[c.release] + 700));
    // x1000 purely so the fits work on comfortable numbers; the unit is the
    // same height-fraction the whole engine uses, so it cancels everywhere.
    const K = 1000;
    const frames = [];
    for (let k = c.release; k <= end; k++) {
      if (Array.isArray(cands[k]) && cands[k].length) {
        // NOT aspect-scaled, and that was TESTED rather than assumed.
        //
        // buildSeries multiplies pose x by the aspect so both axes share one
        // unit, and its comment says the ball fit should share it too. Applying
        // the same scaling here is the obvious fix for the speed being ~1.75x
        // too low — and it is wrong. Measured on Ohad's clip: speed moved only
        // 5.30 -> 5.10 m/s while the launch angle went 63 -> 74 degrees, and 74
        // is not a jump shot. Real release angles sit near 45-55. The
        // correction made the geometry less plausible, so the ball blobs are
        // already in a consistent unit system and the scale error is somewhere
        // else. Left alone deliberately; see docs for what is still open.
        frames.push({ t: tMs[k], blobs: cands[k].map((b) => ({ x: b.x * K, y: b.y * K, w: b.w * K, h: b.h * K, n: b.n })) });
      }
    }
    // The ball has to come OUT OF THE SHOOTING HAND. Without this, a ball
    // already in flight from a previous rep — or anything else drifting across
    // the upper frame — can fit a parabola perfectly well and be reported as
    // this shot's launch. On the real clip exactly that happened once in
    // eleven, and it read 17 degrees.
    const wp = (series.raw && series.raw.wristPos && series.raw.wristPos[c.release]) || null;
    const origin = wp ? { x: wp.x * K, y: wp.y * K } : null;
    // Collect WHY when it fails. An untracked rep used to be indistinguishable
    // from one that was never filmed, both for the coach and for anyone trying
    // to improve the tracker.
    const stats = {};
    const tr = trackBall(frames, { ...(origin ? { origin } : {}), stats });
    if (!tr) return { failed: 'no track', frames: frames.length, blobs: frames.reduce((a, f) => a + f.blobs.length, 0), stats };
    const out = {};
    // `origin` is the shooting wrist at release — already computed above for
    // trackBall. launchAngle needs it too, so the rise gate can measure from
    // the hand rather than from wherever the track happened to begin.
    const la = launchAngle(tr.points, tMs[c.release], tr.ballPx, out, origin);
    if (!la) return { failed: 'track rejected', why: out.why, frames: frames.length, n: tr.points.length, fit: tr.fit, ballPx: tr.ballPx, stats };
    return la;
  })();

  const defs = buildCheckpoints(shotType);
  const checks = defs.map((d) => {
    const val = v[d.key];
    const status = d.band(val);
    return { key: d.key, label: d.label, value: val, display: fmtValue(d.key, val), target: d.target, status, why: d.why, how: d.how, weight: d.weight };
  });
  let wsum = 0, ssum = 0;
  for (const ch of checks) { const sc = SCORE[ch.status]; if (sc == null) continue; wsum += ch.weight; ssum += ch.weight * sc; }
  const score = wsum > 0 ? Math.round((ssum / wsum) * 100) : null;

  const R = rulers(series, c, statureCm);
  const jumpRise = isReal(c.baseHip) && c.apex >= 0 && isReal(sm.hipY[c.apex]) ? sm.hipY[c.apex] - c.baseHip : null;
  const relAboveAnkle = c.release >= 0 && isReal(sm.wristY[c.release]) && isReal(at(sm.ankleY, c.dip)) ? sm.wristY[c.release] - at(sm.ankleY, c.dip) : null;
  const info = {
    dipToReleaseMs: c.release > c.dip ? Math.round(tMs[c.release] - tMs[c.dip]) : null,
    jumpRiseCm: isReal(jumpRise) && R.cmPerUnit ? round(Math.max(0, jumpRise) * R.cmPerUnit, 0) : null,
    releaseHeightCm: isReal(relAboveAnkle) && R.cmPerUnit ? round(relAboveAnkle * R.cmPerUnit, 0) : null,
    releaseHeightRatio: isReal(relAboveAnkle) && isReal(R.rulerPx) && R.rulerPx > 0.05 ? round(relAboveAnkle / R.rulerPx, 2) : null,
    shoulderAtRelease: at(sm.shoulder, c.release),
    sequenceOrder: seq.order,
    coverage: round(c.coverage, 2),
    // Measured from the BALL, not inferred from the arm. Null unless the samples
    // actually fit a projectile.
    ballLaunchDeg: ballLaunch && !ballLaunch.failed ? ballLaunch.angleDeg : null,
    // Why a shot produced no ball reading — so a coverage gap is diagnosable
    // instead of just an em dash.
    ballWhy: ballLaunch && ballLaunch.failed ? ballLaunch : null,
    // A track that SUCCEEDED but could not yield an angle still owes the
    // coach an explanation. It returns a partial result rather than a
    // failure, so it fell through the ballWhy branch above and the screen
    // said nothing at all about that rep.
    ballPartial: ballLaunch && !ballLaunch.failed && ballLaunch.angleDeg == null
      ? (ballLaunch.ascentMissing ? 'ascent' : 'unreadable') : null,
    // Real-world units, scaled by the ball's own 0.24 m width. Null unless the
    // flight was tracked well enough to trust the scale.
    ballSpeedMs: ballLaunch && !ballLaunch.failed ? ballLaunch.speedMs : null,
    ballRiseM: ballLaunch && !ballLaunch.failed ? ballLaunch.riseM : null,
    ballLaunchFit: ballLaunch && !ballLaunch.failed ? ballLaunch.fit : null,
    ballSamples: ballLaunch && !ballLaunch.failed ? ballLaunch.n : 0,
    // The shot was filmed obliquely: the ball receded from the camera, so the
    // metre and m/s readings under-read and the launch angle over-reads. The
    // angle SPREAD and the rep-to-rep comparison are unaffected.
    ballOblique: !!(ballLaunch && !ballLaunch.failed && ballLaunch.obliqueShot),
    ballRecede: ballLaunch && !ballLaunch.failed ? ballLaunch.recede : null,
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
    case 'sequence': return v + '/3 in order';
    default: return round(v, 0) + '°';
  }
}

export function frameReadout(series, i) {
  const { raw, sm } = series;
  const g = (arr) => (i >= 0 && i < arr.length ? arr[i] : null);
  return {
    knee: g(sm.knee), hip: g(sm.hip), elbow: g(sm.elbow), shoulder: g(sm.shoulder),
    trunk: g(sm.trunk), forearm: g(sm.forearm), wristEye: g(sm.wristEye), wristElbowX: g(sm.wristElbowX),
    hipVel: g(sm.hipVel), visOk: g(raw.visOk),
  };
}

// ---------------------------------------------------------------- pipeline --
// Which hand actually shot? The shooting wrist rises highest above the
// shoulders at the release and stays there through the follow-through. Reading
// it from the clip removes a setting the coach shouldn't have to think about
// (Ohad 08-24: hand + shot type should be automatic, overridable).
export function detectShootingHand(frames) {
  let rSum = 0, lSum = 0, n = 0;
  for (const f of frames || []) {
    const p = f && (f.pose || f.landmarks || f.lm);
    if (!p || !p[15] || !p[16] || !p[11] || !p[12]) continue;
    const shoY = (p[11].y + p[12].y) / 2;
    const rUp = shoY - p[16].y; // +y is DOWN in normalized pose space
    const lUp = shoY - p[15].y;
    if (Number.isFinite(rUp) && Number.isFinite(lUp)) { rSum += Math.max(0, rUp); lSum += Math.max(0, lUp); n++; }
  }
  if (!n) return null;
  const diff = Math.abs(rSum - lSum) / Math.max(1e-6, rSum + lSum);
  if (diff < 0.06) return null; // genuinely two-handed / inconclusive
  return rSum >= lSum ? 'R' : 'L';
}

export function analyzeShotClip(frames, { hand = 'R', statureCm = null, shotType = 'mid' } = {}) {
  if (!frames || frames.length < 8) return { ok: false, error: 'Not enough frames with a visible body. Film the whole body, side-on, in good light.' };
  const dims = frames.dims || { w: 9, h: 16 };
  const aspect = dims.w / dims.h;
  const tMs = frames.map((f) => f.t);
  const span = (tMs[tMs.length - 1] - tMs[0]) / 1000;
  const fps = frames.fps || (span > 0 ? (frames.length - 1) / span : 30);
  // `fps` above is the SOURCE video's frame rate whenever capture could measure
  // it, so it says nothing about how much of the clip actually reached the
  // model. The starved-capture warning was keyed on it and therefore could not
  // fire for the very failure it exists to catch: a 60 fps clip that lost half
  // its frames still reports 60.
  //
  // effFps is what we really analysed — frames kept, over the span they cover.
  // skipRatio comes from capture: frames discarded because pose detection was
  // still busy. Together they are why the same clip returned 11, 10 and 9 shots
  // on 2026-08-27.
  const effFps = span > 0 ? round((frames.length - 1) / span, 1) : null;
  const skipRatio = (frames.stats && typeof frames.stats.skipRatio === 'number') ? frames.stats.skipRatio : null;
  const series = buildSeries(frames, { hand, aspect });
  const strictWhy = [];
  let cycles = detectShots(series, fps, { debug: strictWhy });
  // Nothing on the strict pass → try again with forgiving gates before giving
  // up. A real shot filmed off-angle, or a flat-footed set shot, reads low on
  // every angle; refusing to analyse it at all was the worst answer (08-24).
  let relaxed = false;
  if (!cycles.length) {
    const why2 = [];
    cycles = detectShots(series, fps, {
      debug: why2, minArmElev: 50, minElbow: 92, maxDipKnee: 173, dipWindowMs: 2400, requireAboveHead: false,
    });
    if (cycles.length) relaxed = true; else strictWhy.push(...why2);
  }
  if (!cycles.length) {
    // Tell the coach what the engine actually SAW, not just that it failed.
    const counts = {};
    for (const r of strictWhy) counts[r.reason.replace(/\s*\([^)]*\)/, '')] = (counts[r.reason.replace(/\s*\([^)]*\)/, '')] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([r, c]) => `${r}${c > 1 ? ` ×${c}` : ''}`).join(' · ');
    const detail = strictWhy.length
      ? ` I found ${strictWhy.length} candidate release${strictWhy.length === 1 ? '' : 's'} and rejected ${strictWhy.length === 1 ? 'it' : 'them'}: ${top}.`
      : ' I could not find a single frame where a wrist peaks above the shoulders — check that the whole body is in frame.';
    // How much of the clip actually had a body? This separates "the pose model
    // never saw him" from "the shot gates were too strict" at a glance.
    let tracked = 0;
    for (const f of frames) { const p = f && (f.pose || f.landmarks || f.lm); if (p && p[11] && p[12] && p[15] && p[16]) tracked++; }
    const pct = Math.round((tracked / Math.max(1, frames.length)) * 100);
    const trackNote = ` Body tracked in ${tracked}/${frames.length} frames (${pct}%)${pct < 50 ? ' — that is the real problem: get the whole body in frame, closer and better lit.' : '.'}`;
    return { ok: false, error: `No shot detected.${detail}${trackNote} Film the whole shot side-on, shooting arm towards the camera, feet to fingertips in frame.`, rejections: strictWhy, tracked: { n: tracked, total: frames.length, pct }, series, fps, effFps, skipRatio };
  }
  const shots = cycles.map((c, k) => ({ index: k + 1, cycle: c, ...scoreShot(series, c, { statureCm, shotType }) }));

  // Tracking quality is measured WHERE THE SHOTS ARE, not over the whole clip —
  // the athlete walking out to rebound is irrelevant to the report.
  const cov = mean(shots.map((s) => s.info.coverage));
  const quality = cov >= 0.8 ? 'good' : cov >= 0.55 ? 'fair' : 'poor';

  const cv = (arr) => { const a = arr.filter(isReal); if (a.length < 2) return null; const m = mean(a); const s = sdev(a); return m ? round((s / Math.abs(m)) * 100, 0) : null; };
  const consistency = shots.length > 1 ? {
    n: shots.length,
    rhythmCv: cv(shots.map((s) => s.info.dipToReleaseMs)),
    dipCv: cv(shots.map((s) => s.raw.dip)),
    releaseArmSd: round(sdev(shots.map((s) => s.raw.releaseArm)), 1),
    setElbowSd: round(sdev(shots.map((s) => s.raw.setElbow)), 1),
    timingSd: round(sdev(shots.map((s) => s.raw.timing)), 0),
  } : null;

  return { ok: true, fps: round(fps, 1), effFps, skipRatio, frameCount: frames.length, hand, shotType, series, shots, consistency, quality: relaxed && quality === 'good' ? 'fair' : quality, relaxed, coverage: round(cov, 2), aspect };
}
