// pulsePPG.js — PULSE: heart rate + heart-rate variability from the phone CAMERA.
// The athlete covers the rear camera + flash with a fingertip for ~60s; each video
// frame's mean RED-channel brightness rises and falls with the capillary blood
// volume under the skin (photoplethysmography). From that waveform we recover
// pulse rate and — when the signal is clean and still — short-term HRV (RMSSD),
// the same autonomic-readiness read a $300 chest strap / Oura / Whoop gives, with
// nothing but the phone already in his hand.
//
// GROUNDING (honest):
//   - Smartphone-camera PPG heart rate is well-validated against ECG for a still
//     fingertip (Established). We report HR whenever the pulse is clean.
//   - RMSSD/SDNN from smartphone PPG tracks ECG HRV *with limitations* (Supported):
//     it needs a still finger, an adequate frame rate, and ~1 min of clean beats.
//     Motion, poor contact, or arrhythmia degrade it — so HRV is gated HARD on
//     signal quality and labelled with a confidence, never shown as a lab number.
//   - This is NOT a medical device; it informs a readiness conversation, it does
//     not diagnose. (Per project rules: manage/inform, never diagnose.)
//
// Pure + dependency-free so it unit-tests against synthetic pulses (see
// scripts/verify-pulse.mjs). No UI wiring yet — greenlight-gated like the other
// novel engines (velocityProfile1RM, readiness autoreg).

// ---- small DSP helpers (all pure) ----

// Centered moving-average detrend: subtracts the local baseline (removes the slow
// brightness drift from finger pressure / auto-exposure) leaving the pulse.
function detrend(values, win) {
  const n = values.length;
  const out = new Array(n).fill(0);
  const half = Math.max(1, Math.floor(win / 2));
  let sum = 0;
  const q = [];
  for (let i = 0; i < n; i++) {
    q.push(values[i]); sum += values[i];
    if (q.length > 2 * half + 1) sum -= q.shift();
    const base = sum / q.length;
    out[i] = values[i] - base;
  }
  return out;
}

// Short moving-average smooth to knock down per-frame sensor noise.
function smooth(values, win) {
  const n = values.length, out = new Array(n).fill(0);
  const half = Math.max(0, Math.floor(win / 2));
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - half; j <= i + half; j++) { if (j >= 0 && j < n) { s += values[j]; c++; } }
    out[i] = s / c;
  }
  return out;
}

// Peak detection with a refractory (minimum inter-beat) distance and a dynamic
// amplitude threshold. Returns the sample indices of systolic peaks.
function findPeaks(sig, times, minGapMs, threshFrac) {
  const n = sig.length;
  // dynamic threshold from the robust amplitude (90th pct of |sig|)
  const mags = sig.map(Math.abs).slice().sort((a, b) => a - b);
  const p90 = mags[Math.floor(0.9 * (mags.length - 1))] || 0;
  const thr = p90 * threshFrac;
  const peaks = [];
  let lastT = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (sig[i] > thr && sig[i] >= sig[i - 1] && sig[i] > sig[i + 1]) {
      if (times[i] - lastT >= minGapMs) { peaks.push(i); lastT = times[i]; }
      else if (peaks.length && sig[i] > sig[peaks[peaks.length - 1]]) {
        // a bigger peak inside the refractory window replaces the last one
        peaks[peaks.length - 1] = i; lastT = times[i];
      }
    }
  }
  return peaks;
}

// RR-interval metrics from an array of beat timestamps (ms).
export function rrMetrics(beatTimesMs) {
  const rr = [];
  for (let i = 1; i < beatTimesMs.length; i++) rr.push(beatTimesMs[i] - beatTimesMs[i - 1]);
  // drop physiologically impossible intervals (<250ms=>240bpm, >2000ms=>30bpm)
  const clean = rr.filter((x) => x >= 250 && x <= 2000);
  if (clean.length < 2) return { ok: false, reason: 'too few beats' };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const sd = Math.sqrt(clean.reduce((a, b) => a + (b - mean) ** 2, 0) / clean.length);
  let ss = 0;
  for (let i = 1; i < clean.length; i++) ss += (clean[i] - clean[i - 1]) ** 2;
  const rmssd = Math.sqrt(ss / (clean.length - 1));
  const cv = sd / mean; // beat-to-beat regularity: high cv = motion/arrhythmia/poor
  return {
    ok: true,
    hr: Math.round(60000 / mean),
    meanRR: Math.round(mean),
    sdnn: Math.round(sd),
    rmssd: Math.round(rmssd),
    cv: +cv.toFixed(3),
    nBeats: clean.length + 1,
  };
}

// Map an RMSSD reading against the athlete's own rolling baseline into a readiness
// band. HRV is deeply individual, so this is ALWAYS relative to his baseline —
// never an absolute cutoff. baseline = { mean, sd } of his recent morning RMSSDs.
export function readinessFromHrv(rmssd, baseline) {
  if (!baseline || !(baseline.mean > 0) || !(baseline.sd > 0)) {
    return { band: 'baseline', z: null, note: 'Building your HRV baseline — need ~1–2 weeks of morning reads before this means anything.' };
  }
  const z = (rmssd - baseline.mean) / baseline.sd;
  if (z <= -1.5) return { band: 'suppressed', z: +z.toFixed(2), note: 'HRV well below your baseline — parasympathetic suppression. Favour technique/lighter work; hold back top-end intensity today.' };
  if (z < -0.5) return { band: 'watch', z: +z.toFixed(2), note: 'HRV a touch low — fine to train, keep autoregulating; back off if bar speed sags.' };
  if (z <= 0.75) return { band: 'ready', z: +z.toFixed(2), note: 'HRV in your normal range — train as planned.' };
  return { band: 'primed', z: +z.toFixed(2), note: 'HRV above baseline — well recovered; a good day to push a quality PR attempt.' };
}

// ---- main entry ----
// samples: [{ t: msTimestamp, v: meanRedValue }]  (v typically 0..255)
// Returns HR always-if-clean, HRV only when the signal is still + long enough.
export function analyzePPG(samples, opts = {}) {
  const s = (samples || []).filter((x) => x && Number.isFinite(x.t) && Number.isFinite(x.v));
  if (s.length < 60) return { ok: false, reason: 'not enough frames (need ~a few seconds)' };
  s.sort((a, b) => a.t - b.t);
  const times = s.map((x) => x.t);
  const durSec = (times[times.length - 1] - times[0]) / 1000;
  const fs = s.length / Math.max(durSec, 1e-6); // effective frame rate
  if (fs < 10) return { ok: false, reason: 'frame rate too low for a reliable pulse' };

  const raw = s.map((x) => x.v);
  const detr = detrend(raw, Math.round(fs * 0.75));   // ~0.75s baseline window
  const sig = smooth(detr, Math.max(3, Math.round(fs * 0.08)));

  // amplitude gate: a real fingertip PPG has a clear pulsatile swing
  const p2p = Math.max(...sig) - Math.min(...sig);
  const rawRange = Math.max(...raw) - Math.min(...raw);
  const ampOk = p2p > 0.4 && rawRange > 2;

  const minGapMs = 60000 / 220;                        // refractory = 220 bpm ceiling
  const peaks = findPeaks(sig, times, minGapMs, opts.threshFrac ?? 0.4);
  const beatTimes = peaks.map((i) => times[i]);
  const m = rrMetrics(beatTimes);
  if (!m.ok) return { ok: false, reason: m.reason, ampOk, nPeaks: peaks.length, fps: +fs.toFixed(1) };

  // HR sanity
  if (m.hr < 35 || m.hr > 210) return { ok: false, reason: 'pulse out of plausible range — check finger contact', hr: m.hr, ampOk };

  // HRV confidence: needs enough clean, regular beats over enough time
  const enoughForHrv = m.nBeats >= 20 && durSec >= 30;
  const regular = m.cv <= 0.15;         // beat-to-beat CV low => still finger
  const veryRegular = m.cv <= 0.09;
  let confidence = 'low';
  if (ampOk && enoughForHrv && veryRegular) confidence = 'high';
  else if (ampOk && enoughForHrv && regular) confidence = 'med';

  const hrvUsable = ampOk && enoughForHrv && regular;
  const readiness = hrvUsable ? readinessFromHrv(m.rmssd, opts.baseline) : null;

  return {
    ok: true,
    hr: m.hr,
    meanRR: m.meanRR,
    hrv: hrvUsable ? { rmssd: m.rmssd, sdnn: m.sdnn, confidence } : null,
    hrvReason: hrvUsable ? null : (!ampOk ? 'weak signal — press the fingertip gently but fully over the lens + flash'
      : !enoughForHrv ? 'need ~60s of holding still for HRV — HR is fine, HRV needs more clean beats'
      : 'too much movement for HRV — HR shown; hold the finger dead still for the HRV read'),
    readiness,
    quality: { ampOk, regular, cv: m.cv, nBeats: m.nBeats, fps: +fs.toFixed(1), durSec: +durSec.toFixed(1) },
    confidence,
  };
}

export default { analyzePPG, rrMetrics, readinessFromHrv };
