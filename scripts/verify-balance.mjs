// Fixture tests for src/balanceSteadiness.js (BALANCE/SWAY — postural sway).
import { analyzeBalance } from '../src/balanceSteadiness.js';

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} — got ${JSON.stringify(got)}`); } };

// gravity vector tilted `deg` from vertical (in the x–z plane)
const gAt = (deg) => ({ x: Math.sin(deg / 180 * Math.PI), y: 0, z: Math.cos(deg / 180 * Math.PI) });
// a hold: tilt oscillates ±amp at `f` Hz for `durSec` at `fps`
function hold({ amp = 0, f = 1, durSec = 15, fps = 40, noise = 0 }) {
  const s = []; let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let i = 0; i < durSec * fps; i++) { const t = i * 1000 / fps; const tilt = amp * Math.sin(2 * Math.PI * f * t / 1000) + noise * rnd(); s.push({ t, g: gAt(tilt) }); }
  return s;
}

console.log('BALANCE — postural sway engine');

// 1) dead-still hold → excellent, near-zero sway
const still = analyzeBalance(hold({ amp: 0, noise: 0.02 }));
ok('still → ok', still.ok, still.reason);
ok('still → swayVel ~0', still.ok && still.swayVelDegS < 0.6, still.swayVelDegS);
ok('still → stability >= 90', still.ok && still.stability >= 90, still.stability);
ok('still → excellent', still.ok && still.band === 'excellent', still.band);

// 2) wobbly hold → lower stability, higher sway
const wob = analyzeBalance(hold({ amp: 6, f: 1 }));
ok('wobble → ok', wob.ok, wob.reason);
ok('wobble → more sway than still', wob.ok && still.ok && wob.swayVelDegS > still.swayVelDegS + 1, { wob: wob.swayVelDegS, still: still.swayVelDegS });
ok('wobble → not excellent', wob.ok && wob.band !== 'excellent', wob.band);

// 3) sway scales with amplitude (monotonic)
const small = analyzeBalance(hold({ amp: 2, f: 1 }));
const big = analyzeBalance(hold({ amp: 10, f: 1 }));
ok('sway monotonic in amplitude', small.ok && big.ok && big.swayVelDegS > small.swayVelDegS, { small: small.swayVelDegS, big: big.swayVelDegS });

// 4) stability bounded 0..100
ok('stability in [0,100]', big.ok && big.stability >= 0 && big.stability <= 100, big.stability);

// 5) gates: too short / too few samples → refused
ok('too few samples → refused', analyzeBalance([{ t: 0, g: gAt(0) }]).ok === false, 'few');
ok('too short → refused', analyzeBalance(hold({ amp: 0, durSec: 2 })).ok === false, 'short');

// 6) garbage → clean fail, no crash
ok('empty → ok:false', analyzeBalance([]).ok === false, 'empty');

console.log(`\nBALANCE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
