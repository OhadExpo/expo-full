// Integration fixtures for the camera JUMP engine — the coach acts on jump
// height / flight time / power (they populate the Athletic Evaluation). Driven
// by the demo's realistic synthetic frames (demoJumpFrames) so this exercises
// the real ankle-tracking + airborne-detection + physics path, not a stub.
// Run: node scripts/verify-jump-physics.mjs
import { jumpMetrics, jumpPower } from '../src/poseLab.js';
import { demoJumpFrames } from '../src/demoMotion.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

const jm = jumpMetrics(demoJumpFrames());
check('jump read produced (not null)', jm != null);
check('height in a believable range (20–40 cm)', jm && jm.heightCm >= 20 && jm.heightCm <= 40);
check('flight time in a believable range (400–600 ms)', jm && jm.flightMs >= 400 && jm.flightMs <= 600);

// The load-bearing physics: height = g·t²/8. Pin the formula against the flight
// time the tracker measured, so a change to the height math fails loudly.
if (jm) {
  const expected = Math.round((9.81 * (jm.flightMs / 1000) ** 2 / 8) * 100);
  check(`height matches g·t²/8 from flight (${jm.heightCm} ≈ ${expected})`, Math.abs(jm.heightCm - expected) <= 1);
  // peak-rise is an independent cross-check (metres the hip actually rose) — it
  // should corroborate the flight-time height, not diverge wildly.
  check('peak-rise corroborates flight height (within 8 cm)', Math.abs(jm.peakRiseCm - jm.heightCm) <= 8);
}

// Degenerate: a perfectly still stance (no airborne window) must NOT invent a
// jump — return null / no clean read, never a positive height off noise.
const still = Array.from({ length: 24 }, (_, i) => {
  const w = new Array(33).fill(null);
  w[11] = { x: -0.18, y: -0.50, z: 0 }; w[12] = { x: 0.18, y: -0.50, z: 0 };  // shoulders
  w[27] = { x: -0.11, y: 0.90, z: 0 };  w[28] = { x: 0.11, y: 0.90, z: 0 };   // ankles (constant)
  return { t: i * 42, landmarks: w, worldLandmarks: w };
});
const stillJm = jumpMetrics(still);
check('still stance -> no invented jump', stillJm == null || stillJm.heightCm < 5);
check('too few frames -> null', jumpMetrics(demoJumpFrames().slice(0, 4)) == null);

// jumpPower — Sayers peak-power equation, exact + guards.
const jp = jumpPower(31, 80);
check('jumpPower(31,80) = Sayers 3451 W', jp && jp.watts === 3451);
check('jumpPower perKg = 43.1', jp && jp.perKg === 43.1);
check('jumpPower rejects null height', jumpPower(null, 80) === null);
check('jumpPower rejects zero mass', jumpPower(31, 0) === null);
check('jumpPower rejects sub-zero result (tiny inputs)', jumpPower(1, 1) === null);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
