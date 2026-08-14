// reflexPVT.js — REFLEX: central-nervous-system readiness from a reaction-time
// test. A 45-second tap-when-it-flashes drill (a Psychomotor Vigilance Task) →
// mean reaction time, lapses, and false starts → how "sharp" the nervous system
// is TODAY. Reaction time is one of the most validated markers of fatigue and
// sleep loss in the science, and a slow, lapsy CNS is a day to autoregulate down
// the top-end neural work (heavy singles, sprints, plyos). It's the psychomotor
// counterpart to PULSE's autonomic read — a different window on readiness.
//
// GROUNDING (honest):
//   - The PVT (mean RT + LAPSES, RT>500ms) is a gold-standard, extensively
//     validated fatigue / sleep-deprivation marker (Dinges & colleagues;
//     aviation/military fatigue science). ESTABLISHED for fatigue.
//   - Using it as a training-readiness gate (fast CNS → green-light heavy neural
//     work) is a reasonable but less-validated extension (Supported/Theoretical),
//     so the readiness band is ALWAYS relative to the athlete's OWN baseline and
//     labelled — never an absolute "you're unfit to train."
//
// Pure + dependency-free → fixture-tested (scripts/verify-reflex.mjs). Feed it the
// per-trial reaction times (ms) captured in the UI. UI = the REFLEX tab in
// SensorLab. Greenlight-gated; owner-only.

// Classify + summarise a set of reaction times (ms). `rts` is every recorded
// trial including any anticipations; false starts are RT below the human floor.
export function analyzeReflex(rts, opts = {}) {
  const all = (rts || []).filter((x) => Number.isFinite(x));
  if (all.length < 3) return { ok: false, reason: 'need a few more taps' };
  const FLOOR = 100;   // <100ms = anticipation/false start (can't react that fast)
  const LAPSE = 500;   // >500ms = a lapse (the PVT attention-lapse threshold)
  const CEIL = 3000;   // >3s = distraction/put-the-phone-down, drop from stats
  const falseStarts = all.filter((x) => x < FLOOR).length;
  const valid = all.filter((x) => x >= FLOOR && x <= CEIL);
  if (valid.length < 3) return { ok: false, reason: 'too many false starts — wait for the flash', falseStarts };
  const sorted = valid.slice().sort((a, b) => a - b);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const k = Math.max(1, Math.round(sorted.length * 0.1));
  const fastest10 = Math.round(sorted.slice(0, k).reduce((a, b) => a + b, 0) / k);
  const slowest10 = Math.round(sorted.slice(-k).reduce((a, b) => a + b, 0) / k);
  const lapses = valid.filter((x) => x > LAPSE).length;
  const sd = Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length);

  const out = {
    ok: true,
    meanRT: Math.round(mean),
    medianRT: Math.round(median),
    fastest10, slowest10,
    lapses, falseStarts,
    sd: Math.round(sd),
    nValid: valid.length,
  };
  out.readiness = reflexReadiness(out, opts.baseline);
  return out;
}

// Readiness band vs the athlete's OWN baseline meanRT. SLOWER (higher RT) or
// LAPSY = worse — the opposite direction to HRV. Lapses hard-gate down regardless.
export function reflexReadiness(m, baseline) {
  if (m.lapses >= 3) return { band: 'suppressed', z: null, note: `${m.lapses} attention lapses — CNS is foggy. Skip max-effort / high-skill neural work today; keep it submaximal and clean.` };
  if (!baseline || !(baseline.meanRT > 0) || !(baseline.sd > 0)) {
    return { band: 'baseline', z: null, note: 'Building your reaction-time baseline — do this a few mornings before it means anything. (Adults are typically ~250–300ms.)' };
  }
  const z = (m.meanRT - baseline.meanRT) / baseline.sd; // +z = slower = worse
  if (z >= 1.5) return { band: 'suppressed', z: +z.toFixed(2), note: 'Reaction time well above your baseline — CNS is under-recovered. Autoregulate down the heavy neural work (max singles, sprints, plyos).' };
  if (z > 0.5) return { band: 'watch', z: +z.toFixed(2), note: 'A touch slow vs baseline — fine to train; keep top-end volume in check and stop sets crisp.' };
  if (z >= -0.75) return { band: 'ready', z: +z.toFixed(2), note: 'Reaction time in your normal range — nervous system is good to go as planned.' };
  return { band: 'primed', z: +z.toFixed(2), note: 'Sharper than baseline — a green light for a quality neural day (a PR single, top-speed work).' };
}

export default { analyzeReflex, reflexReadiness };
