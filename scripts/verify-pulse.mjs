// Fixture tests for src/pulsePPG.js (PULSE — camera PPG HR + HRV).
// Synthesises photoplethysmography waveforms of KNOWN heart rate + variability and
// asserts the engine recovers them, plus quality-gating behaviour. No browser.
import { analyzePPG, rrMetrics, readinessFromHrv } from '../src/pulsePPG.js';

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name} — got ${JSON.stringify(got)}`); } };

// Deterministic pseudo-noise (no Math.random — reproducible).
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };

// Build a synthetic fingertip PPG: fundamental at HR + a harmonic + slow baseline
// drift + sensor noise, sampled at `fps` for `durSec`. Optional beat jitter (ms).
function synthPPG(hr, durSec, fps, { noise = 0.4, jitterMs = 0 } = {}) {
  const samples = [];
  const dt = 1000 / fps;
  let phase = 0; // integrate instantaneous frequency so we can jitter beat timing
  for (let i = 0; i < durSec * fps; i++) {
    const t = i * dt;
    // instantaneous period with optional jitter → controls HRV
    const jitter = jitterMs ? (jitterMs / 1000) * Math.sin(i * 0.7) : 0;
    const f = hr / 60 / (1 + jitter);
    phase += 2 * Math.PI * f * (dt / 1000);
    const baseline = 5 * Math.sin(2 * Math.PI * 0.05 * (t / 1000)); // slow drift
    const pulse = 8 * Math.sin(phase) + 3 * Math.sin(2 * phase);
    samples.push({ t, v: 128 + baseline + pulse + noise * (rnd() * 8) });
  }
  return samples;
}

console.log('PULSE — camera PPG engine');

// 1) HR recovery at several rates
for (const hr of [52, 68, 84, 120]) {
  const r = analyzePPG(synthPPG(hr, 60, 30));
  ok(`HR≈${hr}`, r.ok && Math.abs(r.hr - hr) <= 3, r.ok ? r.hr : r.reason);
}

// 2) Clean 60s still read → HRV usable with decent confidence
const clean = analyzePPG(synthPPG(64, 60, 30, { noise: 0.25 }));
ok('clean read → HRV present', clean.ok && clean.hrv && clean.hrv.rmssd >= 0, clean.hrv || clean.hrvReason);
ok('clean read → confidence med/high', clean.ok && ['med', 'high'].includes(clean.confidence), clean.confidence);

// 3) Short read (10s) → HR ok but HRV withheld (honest gating)
const short = analyzePPG(synthPPG(64, 10, 30));
ok('short read → HR still ok', short.ok && Math.abs(short.hr - 64) <= 4, short.ok ? short.hr : short.reason);
ok('short read → HRV withheld', short.ok && short.hrv === null, short.hrv);

// 4) Motion (heavy jitter + noise) → HRV withheld, not faked
const motion = analyzePPG(synthPPG(70, 60, 30, { noise: 3.5, jitterMs: 220 }));
ok('motion → HRV withheld or low-conf', !motion.ok || motion.hrv === null || motion.confidence === 'low', { ok: motion.ok, hrv: motion.hrv, conf: motion.confidence });

// 5) rrMetrics exact math: alternating RR 850/820 → RMSSD = 30, HR ≈ 71.8→72
const beats = [0];
for (let i = 0; i < 40; i++) beats.push(beats[beats.length - 1] + (i % 2 === 0 ? 850 : 820));
const m = rrMetrics(beats);
ok('rrMetrics RMSSD=30', m.ok && Math.abs(m.rmssd - 30) <= 1, m.rmssd);
ok('rrMetrics HR≈72', m.ok && Math.abs(m.hr - 72) <= 1, m.hr);

// 6) readiness bands vs a personal baseline
const base = { mean: 60, sd: 12 };
ok('readiness suppressed (z≤-1.5)', readinessFromHrv(40, base).band === 'suppressed', readinessFromHrv(40, base));
ok('readiness ready (z~0)', readinessFromHrv(60, base).band === 'ready', readinessFromHrv(60, base));
ok('readiness primed (z>0.75)', readinessFromHrv(80, base).band === 'primed', readinessFromHrv(80, base));
ok('no baseline → baseline band', readinessFromHrv(60, null).band === 'baseline', readinessFromHrv(60, null));

// 7) garbage input → clean failure, no crash
ok('empty → ok:false', analyzePPG([]).ok === false, analyzePPG([]));
ok('flat signal → not a pulse', analyzePPG(Array.from({ length: 300 }, (_, i) => ({ t: i * 33, v: 128 }))).ok === false, 'flat');

console.log(`\nPULSE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
