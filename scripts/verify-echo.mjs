// Fixture tests for src/acousticReps.js (ECHO — acoustic rep + grind engine).
// Builds synthetic audio ENERGY envelopes with a KNOWN number of effort bursts and
// asserts rep count, tempo, grind-rise detection, and quality gating. No browser.
import { analyzeAcousticSet } from '../src/acousticReps.js';

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} — got ${JSON.stringify(got)}`); } };

let seed = 999;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// Make an envelope: `reps` effort bursts spaced `gapMs`, each a raised-cosine hump
// of width `burstMs` and height `amp[i]`; quiet floor `floor` + noise between.
function synthSet({ reps, gapMs = 2500, burstMs = 600, amps = null, floor = 0.05, noise = 0.01, fps = 50, startMs = 800 }) {
  amps = amps || Array(reps).fill(1);
  const durMs = startMs + reps * gapMs + 1000;
  const frames = [];
  const dt = 1000 / fps;
  for (let t = 0; t < durMs; t += dt) {
    let e = floor + noise * rnd();
    for (let r = 0; r < reps; r++) {
      const center = startMs + r * gapMs;
      const d = t - center;
      if (Math.abs(d) < burstMs / 2) {
        const w = 0.5 * (1 + Math.cos((2 * Math.PI * d) / burstMs)); // raised cosine
        e += amps[r] * w;
      }
    }
    frames.push({ t, e });
  }
  return frames;
}

console.log('ECHO — acoustic rep engine');

// 1) Clean sets of N reps → exact count
for (const n of [3, 5, 8]) {
  const r = analyzeAcousticSet(synthSet({ reps: n }));
  ok(`count ${n} reps`, r.ok && r.reps === n, r.ok ? r.reps : r.reason);
}

// 2) Tempo recovery (~gap between reps)
const t = analyzeAcousticSet(synthSet({ reps: 6, gapMs: 3000 }));
ok('tempo ≈ 3.0s', t.ok && Math.abs(t.tempoMs - 3000) <= 250, t.ok ? t.tempoMs : t.reason);

// 3) Steady set (equal effort) → grind NOT rising, RIR "several"
const steady = analyzeAcousticSet(synthSet({ reps: 6, amps: [1, 1, 1, 1, 1, 1] }));
ok('steady → not rising', steady.ok && steady.grind.rising === false, steady.grind);
ok('steady → rir several', steady.ok && steady.grind.rirEstimate === 'several', steady.grind);

// 4) Set to failure: effort climbs sharply in last reps → grind rising, low RIR
const fail1 = analyzeAcousticSet(synthSet({ reps: 6, burstMs: 700, amps: [1, 1, 1.05, 1.2, 1.6, 2.2] }));
ok('failure set → rising', fail1.ok && fail1.grind.rising === true, fail1.grind);
ok('failure set → RIR 0–1', fail1.ok && [0, 1].includes(fail1.grind.rirEstimate), fail1.grind);

// 5) Music / constant broadband loudness → refuse (no clear reps)
const noisy = [];
for (let tt = 0; tt < 20000; tt += 20) noisy.push({ t: tt, e: 0.6 + 0.05 * rnd() });
const nr = analyzeAcousticSet(noisy);
ok('constant sound → refused', nr.ok === false, nr);

// 6) Too little audio → clean fail
ok('tiny input → ok:false', analyzeAcousticSet([{ t: 0, e: 0.1 }]).ok === false, 'tiny');

// 7) perRep grind is normalised to early-set baseline (~1.0 early)
const norm = analyzeAcousticSet(synthSet({ reps: 6, amps: [1, 1, 1, 1, 1.5, 2] }));
ok('early reps grind ≈ 1.0', norm.ok && Math.abs(norm.perRep[0].grind - 1) <= 0.25, norm.ok ? norm.perRep[0].grind : norm.reason);
ok('last rep grind > 1.4', norm.ok && norm.perRep[5].grind > 1.4, norm.ok ? norm.perRep[5].grind : norm.reason);

console.log(`\nECHO: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
