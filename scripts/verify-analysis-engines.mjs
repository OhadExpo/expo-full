// One-command regression suite for the pure, coach-acted analysis engines.
// These produce numbers/reads a coach ACTS on, so they carry standalone fixtures.
// Run: node scripts/verify-analysis-engines.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const suites = [
  'verify-pose-primitives.mjs',      // angleAt / channels / smoothing / jointRomMetrics — camera kernel
  'verify-jump-physics.mjs',         // jumpMetrics height=g·t²/8 + Sayers power — coach-acted eval numbers
  'verify-reactive-jump.mjs',        // reactiveJumpMetrics RSI + contact-time (drop jump / POGO)
  'verify-analyze-clip.mjs',         // analyzeClip end-to-end: rep count + velocity + ROM/tempo + joint ROM
  'verify-rom-goniometer.mjs',       // camera goniometer -> clinical ROM degree
  'verify-velocity-profile-1rm.mjs', // load-velocity -> estimated 1RM
  'verify-velocity-profile-shift.mjs',// velocityProfileShift — block-over-block LV shift: force vs velocity adaptation
  'verify-velocity-load-zones.mjs',  // velocityLoadZones — LV profile -> per-quality load prescription (kg on the bar)
  'verify-periodization-balance.mjs',// block history -> periodization read
  'verify-block-character.mjs',      // classifyBlockCharacter — periodization ZONE + NSCA power rep-ceiling
  'verify-e1rm-trend.mjs',           // e1rmTrend — POSITIVE/NEGATIVE strength direction + 3 hardening guards
  'verify-stale-weight.mjs',         // staleWeight — the STALE->deload gate + rep-progression guard
  'verify-tonnage-acwr.mjs',         // tonnageACWR — acute:chronic injury-risk band + fabricated-spike guards
  'verify-lineage-signals.mjs',      // rpeDrift (autoreg) + missRate (adherence) — thin gates + directions
  'verify-lineage-core.mjs',         // e1RM (Epley) + topSet — the primitives every strength read rests on
  'verify-auto-analyze.mjs',         // auto-analyze collector — clip scoping / couples cid / load-ambiguity
  'verify-pose-metrics-store.mjs',   // Bar-Speed vault reads: asymmetry injury-watch + readiness ref + velocity-loss trend
  'verify-detect-asymmetry.mjs',     // detectAsymmetry — raw L/R imbalance + anti-fabrication guards (feeds the injury flag)
  'verify-detect-faults.mjs',        // detectFaults — technique flags + family gates, plyo/real-elbow/word-boundary guards
  'verify-verdict.mjs',              // synthesizeVerdict — the headline coach-acted call (deload gating)
];

let anyFail = false;
for (const s of suites) {
  process.stdout.write(`\n──────── ${s} ────────\n`);
  const r = spawnSync(process.execPath, [join(here, s)], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stdout.write(r.stderr);
  if (r.status !== 0) anyFail = true;
}

process.stdout.write(`\n════════ ${anyFail ? '✗ SUITE FAILED' : '✓ ALL ENGINE SUITES GREEN'} ════════\n`);
process.exit(anyFail ? 1 : 0);
