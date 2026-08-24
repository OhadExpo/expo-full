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
  'verify-eval-camera-rom.mjs',      // extended CAMERA TEST ROM catalog (shoulder/hip/knee/over-ext/neck/ankle) -> clinical degree + honest 'soon' boundary
  'verify-eval-extended-rom.mjs',    // signedDeviationAt + extendedJointRom: over-extension calibration, neck sagittal/lateral, dispersion-gated ankle, occlusion gates
  'verify-broad-jump.mjs',           // broadJumpMetrics — stature-scaled horizontal distance + aspect reconciliation + honest guards
  'verify-eval-writeback.mjs',       // end-to-end writeback: applyTestResult/applyRomResult land the numbers in scores[id]/rom[key], sided merge, composite, RETAKE overwrite
  'verify-velocity-profile-1rm.mjs', // load-velocity -> estimated 1RM
  'verify-velocity-profile-shift.mjs',// velocityProfileShift — block-over-block LV shift: force vs velocity adaptation
  'verify-velocity-load-zones.mjs',  // velocityLoadZones — LV profile -> per-quality load prescription (kg on the bar)
  'verify-movement-bucket.mjs',      // movementBucket — lift -> library's 6 buckets (upper/lower x bi/uni/plyo) for the Analysis grouping
  'verify-readiness-autoreg.mjs',    // readinessAutoreg — daily pain/sleep/energy check-in -> concrete session-load nudge (pain-gated)
  'verify-training-monotony.mjs',    // trainingMonotony — Foster monotony/strain: flat-grind flags high, rest/variation reads low, honest thin
  'verify-exercise-continuity.mjs',  // exerciseContinuity — how many blocks each main lift has run (programming-continuity mirror)
  'verify-periodization-balance.mjs',// block history -> periodization read
  'verify-block-character.mjs',      // classifyBlockCharacter — periodization ZONE + NSCA power rep-ceiling
  'verify-e1rm-trend.mjs',           // e1rmTrend — POSITIVE/NEGATIVE strength direction + 3 hardening guards
  'verify-stale-weight.mjs',         // staleWeight — the STALE->deload gate + rep-progression guard
  'verify-tonnage-acwr.mjs',         // tonnageACWR — acute:chronic injury-risk band + fabricated-spike guards
  'verify-lineage-signals.mjs',      // rpeDrift (autoreg) + missRate (adherence) — thin gates + directions
  'verify-vbt-autoreg.mjs',          // velocityAutoreg (stop-set) + warmupReadiness — degenerate honesty + delta direction
  'verify-capture-quality.mjs',      // captureQuality — KEY-joint coverage gate (a framed-out lift must not read 'good')
  'verify-velocity-metrics.mjs',     // velocityMetrics — locked scale, peak>=mean, bar-drop -> null loss (not >100%), no fabricated baseline
  'verify-rerack-gate.mjs',          // velocityMetrics trailing RE-RACK gate (#242) — tiny+positive set-down stripped (rerack/lossPct null/repCount), fatigued/light/interior reps survive
  'verify-rom-tempo.mjs',            // romTempoMetrics — ROM degrees + tempo phases + collapsed-rep flag + honest NaN handling
  'verify-lineage-core.mjs',         // e1RM (Epley) + topSet — the primitives every strength read rests on
  'verify-auto-analyze.mjs',         // auto-analyze collector — clip scoping / couples cid / load-ambiguity
  'verify-pose-metrics-store.mjs',   // Bar-Speed vault reads: asymmetry injury-watch + readiness ref + velocity-loss trend
  'verify-pose-report.mjs',          // buildPoseReport — persistable per-lift report payload (downsampled series + per-rep tables) for the Analysis velocity/ROM graphs
  'verify-detect-asymmetry.mjs',     // detectAsymmetry — raw L/R imbalance + anti-fabrication guards (feeds the injury flag)
  'verify-detect-faults.mjs',        // detectFaults — technique flags + family gates, plyo/real-elbow/word-boundary guards
  'verify-verdict.mjs',              // synthesizeVerdict — the headline coach-acted call (deload gating)
  // --- 2026-08-14 sensor-triad tools (#234), engines only, UI greenlight-gated ---
  'verify-pulse.mjs',                // PULSE — camera-PPG heart rate + HRV (readiness), quality-gated
  'verify-echo.mjs',                 // ECHO — acoustic rep count + grind/RIR from the mic
  'verify-pivot.mjs',                // PIVOT — phone-as-goniometer joint ROM + %-of-norm
  'verify-reflex.mjs',               // REFLEX — PVT reaction-time CNS readiness (mean RT + lapses)
  'verify-balance.mjs',              // BALANCE/SWAY — postural sway steadiness (single-leg balance)
  // --- 2026-08-25 live-sync ---
  'verify-session-merge.mjs',        // mergeIncomingSession — two coach devices on the floor must not revert each other (audit #43)
  'verify-exercise-match.mjs',       // applyMatch — the riskiest writer in the app: it rewrites rows inside real athletes' programs
  'verify-offline-queue.mjs',        // the offline write queue — where a bug silently destroys an athlete's logged workout
  'verify-storage-url.mjs',          // parseStoredUrl — the resolver that lets the media buckets go private without breaking playback
  'verify-plan-log-match.mjs',       // isLogOfPlan — a couple's identically-named plans must not cross-contaminate, WITHOUT regressing a recreated block (audit #31)
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
