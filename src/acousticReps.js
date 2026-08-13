// acousticReps.js — ECHO: count reps and read fatigue from SOUND alone.
// During a set the phone mic hears a rhythm: the exertion grunt/breath on each
// concentric, the plate/collar clank at lockout. From the audio ENERGY ENVELOPE
// (short-time loudness, computed on-device from the mic — never uploaded) we
// segment reps, time the tempo, and track a per-rep "grind index" — the loudness
// × duration of the effort burst. As a set approaches failure the concentric
// slows and the grunt lengthens/loudens, so a rising grind in the final reps is a
// proximity-to-failure signal. This works when the CAMERA can't: phone in a
// pocket, in the dark, rack-mounted, or the athlete side-on to the bar.
//
// GROUNDING (honest):
//   - Rep segmentation via audio onset detection is standard music-information-
//     retrieval (Supported) — a clean, rhythmic barbell set counts reliably.
//   - RIR-from-acoustics is an EXTENSION of the established velocity-loss↔RIR link
//     (Theoretical). So we output a grind INDEX + a *soft* RIR estimate that only
//     fires on a clear rising pattern, always labelled as an estimate — never a
//     hard "1 rep left" claim. It complements VBT via a different sense; it does
//     not replace a filmed velocity read.
//   - Gated hard on signal quality: music, a noisy gym floor, or too few reps →
//     it reports what it can (a count, maybe) and withholds the fatigue read.
//
// Pure + dependency-free → unit-tested against synthetic envelopes
// (scripts/verify-echo.mjs). No UI wiring yet — greenlight-gated.

function smooth(a, win) {
  const n = a.length, out = new Array(n).fill(0), half = Math.max(0, Math.floor(win / 2));
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i - half; j <= i + half; j++) if (j >= 0 && j < n) { s += a[j]; c++; } out[i] = s / c; }
  return out;
}
const quantile = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const median = (arr) => quantile(arr, 0.5);

// Segment the envelope into effort bursts (one per rep). Returns bursts with
// start/peak/end times, peak loudness, and the energy integral (loudness×time).
function detectBursts(env, times, opts) {
  const floor = quantile(env, 0.2);                    // ambient/eccentric-quiet level
  const top = quantile(env, 0.95);
  const range = Math.max(1e-6, top - floor);
  const onThr = floor + (opts.onFrac ?? 0.35) * range;
  const offThr = floor + (opts.offFrac ?? 0.18) * range;
  const minGap = opts.minGapMs ?? 700;                 // fastest plausible rep cadence
  const bursts = [];
  let inBurst = false, sIdx = 0, peakV = 0, peakIdx = 0, integ = 0;
  for (let i = 0; i < env.length; i++) {
    if (!inBurst) {
      if (env[i] >= onThr) {
        // refractory vs previous burst START
        if (bursts.length && times[i] - bursts[bursts.length - 1].startT < minGap) continue;
        inBurst = true; sIdx = i; peakV = env[i]; peakIdx = i; integ = 0;
      }
    } else {
      integ += Math.max(0, env[i] - floor) * (times[i] - times[i - 1]);
      if (env[i] > peakV) { peakV = env[i]; peakIdx = i; }
      if (env[i] <= offThr) {
        bursts.push({ startT: times[sIdx], peakT: times[peakIdx], endT: times[i], peak: peakV, energy: integ, durMs: times[i] - times[sIdx] });
        inBurst = false;
      }
    }
  }
  if (inBurst) bursts.push({ startT: times[sIdx], peakT: times[peakIdx], endT: times[times.length - 1], peak: peakV, energy: integ, durMs: times[times.length - 1] - times[sIdx] });
  return { bursts, floor, top };
}

// frames: [{ t: msTimestamp, e: shortTimeEnergy(0..1) }]
export function analyzeAcousticSet(frames, opts = {}) {
  const f = (frames || []).filter((x) => x && Number.isFinite(x.t) && Number.isFinite(x.e));
  if (f.length < 30) return { ok: false, reason: 'not enough audio' };
  f.sort((a, b) => a.t - b.t);
  const times = f.map((x) => x.t);
  const env = smooth(f.map((x) => Math.max(0, x.e)), 3);

  // SNR gate: a segmentable set needs clear peaks over a quiet floor. Constant
  // broadband loudness (music / crowded floor) has low peak-to-floor contrast.
  const floor = quantile(env, 0.2), top = quantile(env, 0.95);
  const contrast = (top - floor) / Math.max(1e-6, top);
  if (contrast < 0.25) return { ok: false, reason: 'too noisy / constant sound — no clear reps to hear (music or a loud floor?)', contrast: +contrast.toFixed(2) };

  const { bursts } = detectBursts(env, times, opts);
  const reps = bursts.length;
  if (reps < 2) return { ok: false, reason: 'couldn’t hear a rhythmic set', reps };

  const gaps = [];
  for (let i = 1; i < bursts.length; i++) gaps.push(bursts[i].startT - bursts[i - 1].startT);
  const tempoMs = Math.round(median(gaps));

  // per-rep grind = normalised effort integral (loudness × duration)
  const energies = bursts.map((b) => b.energy);
  const durs = bursts.map((b) => b.durMs);
  const baseE = median(energies.slice(0, Math.max(1, Math.floor(reps / 2)))); // early-set baseline
  const perRep = bursts.map((b, i) => ({ rep: i + 1, grind: +(b.energy / Math.max(1e-6, baseE)).toFixed(2), durMs: Math.round(b.durMs), peak: +b.peak.toFixed(3) }));

  // fatigue read: is grind RISING across the last reps?
  let grind = { index: 1, rising: false, rirEstimate: null, confidence: 'low', note: '' };
  if (reps >= 3) {
    const last = perRep[reps - 1].grind;
    const prev = perRep[reps - 2].grind;
    const earlyMed = median(perRep.slice(0, Math.max(1, reps - 2)).map((p) => p.grind));
    const rising = last >= prev && last > earlyMed * 1.25;
    const spike = last / Math.max(1e-6, earlyMed);
    let rir = 'several', conf = 'med';
    if (rising && spike >= 1.6) { rir = 0; conf = 'med'; }
    else if (rising && spike >= 1.35) { rir = 1; conf = 'med'; }
    else if (rising) { rir = 2; conf = 'low'; }
    grind = {
      index: +spike.toFixed(2), rising, rirEstimate: rir, confidence: conf,
      note: rising
        ? `Grind rose ${Math.round((spike - 1) * 100)}% into the last reps — effort is climbing, ~${rir} in reserve (acoustic estimate — confirm against bar speed).`
        : 'Effort held steady across the set — sound suggests reps in reserve, not near failure.',
    };
  }

  // durations gate: absurd tempo → probably not a real set
  const plausible = tempoMs >= 700 && tempoMs <= 12000;
  return {
    ok: true,
    reps,
    tempoMs,
    cadence: plausible ? `${(tempoMs / 1000).toFixed(1)}s/rep` : null,
    perRep,
    grind,
    quality: { contrast: +contrast.toFixed(2), reps, tempoPlausible: plausible },
  };
}

export default { analyzeAcousticSet };
