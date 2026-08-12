// Fixtures for the REACTIVE jump engine (drop jump / POGO) — RSI + ground-contact
// time populate the Athletic Evaluation's reactive tests, so a coach acts on them.
// RSI = flight-derived height / contact time; the fps-noise guard (reject a
// sub-2-frame contact) is safety-critical (a 1-frame contact -> absurd RSI).
// Driven by a synthetic whole-body pogo. Run: node scripts/verify-reactive-jump.mjs
import { reactiveJumpMetrics } from '../src/poseLab.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

const BASE = { 11: [-0.18, -0.50, 0], 12: [0.18, -0.50, 0], 23: [-0.10, 0, 0], 24: [0.10, 0, 0], 25: [-0.11, 0.45, 0], 26: [0.11, 0.45, 0], 27: [-0.11, 0.90, 0], 28: [0.11, 0.90, 0] };
const bump = (p, a, b) => (p < a || p > b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI));
// flights = array of [start,end] fractions where the body is airborne (whole body
// lifts, so shoulder→ankle span stays constant → stable scale, like a real jump).
function pogo(flights, fps = 60, dur = 1.6, lift = 0.32) {
  const total = Math.round(fps * dur), dt = 1000 / fps, frames = []; let t = 0;
  for (let i = 0; i < total; i++) {
    const s = i / total;
    const up = flights.reduce((acc, [a, b]) => acc + bump(s, a, b), 0) * lift;
    const w = new Array(33).fill(null);
    for (const k of Object.keys(BASE)) { const [x, y, z] = BASE[k]; w[Number(k)] = { x, y: y - up, z }; }
    frames.push({ t, landmarks: w, worldLandmarks: w }); t += dt;
  }
  return frames;
}

const r = reactiveJumpMetrics(pogo([[0.15, 0.42], [0.55, 0.82]]));
check('reactive read produced (2 flights)', r != null);
check('one hop from two flights', r && r.count === 1);
const h = r && r.best;
check('flight time believable (100–1000 ms)', h && h.flightMs >= 100 && h.flightMs <= 1000);
check('contact >= 2-frame floor (60 ms @60fps) — fps-noise guard', h && h.contactMs >= 60);
check('height believable (5–60 cm)', h && h.heightCm >= 5 && h.heightCm <= 60);
// RSI invariant: rsi ≈ height(m) / contact(s). Computed from unrounded values,
// so allow a small rounding tolerance against the displayed integers.
if (h) {
  const rsiFromShown = (h.heightCm / 100) / (h.contactMs / 1000);
  check(`rsi = height/contact (${h.rsi} ≈ ${rsiFromShown.toFixed(2)})`, Math.abs(h.rsi - rsiFromShown) <= 0.06);
}
check('aggregates present (avgRsi/avgContactMs/avgHeightCm)', r && r.avgRsi === h.rsi && r.avgContactMs === h.contactMs);

// three flights -> two hops
const r2 = reactiveJumpMetrics(pogo([[0.10, 0.30], [0.40, 0.60], [0.70, 0.90]], 60, 1.8));
check('three flights -> two hops', r2 && r2.count === 2);

// a single jump (no rebound) is NOT reactive -> null (needs >=2 airborne windows)
check('single flight -> null (no rebound)', reactiveJumpMetrics(pogo([[0.30, 0.60]])) == null);
// too few frames -> null
check('too few frames -> null', reactiveJumpMetrics(pogo([[0.15, 0.42], [0.55, 0.82]]).slice(0, 8)) == null);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
