// Fixture tests for src/goniometer.js (PIVOT — phone-as-goniometer).
// Feeds gravity vectors of KNOWN inclination and asserts angle/ROM math + norms.
import { inclination, jointAngleTwoPos, romFromSweep, ROM_NORMS } from '../src/goniometer.js';

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} — got ${JSON.stringify(got)}`); } };

// gravity vector for a target inclination θ from horizontal (in the x–z plane).
const gAt = (deg) => ({ x: Math.sin(deg / 180 * Math.PI), y: 0, z: Math.cos(deg / 180 * Math.PI) });

console.log('PIVOT — goniometer engine');

// 1) inclination of known vectors
ok('flat (screen up) = 0°', inclination({ x: 0, y: 0, z: 1 }) === 0, inclination({ x: 0, y: 0, z: 1 }));
ok('vertical = 90°', Math.abs(inclination({ x: 1, y: 0, z: 0 }) - 90) < 0.2, inclination({ x: 1, y: 0, z: 0 }));
ok('30° tilt', Math.abs(inclination(gAt(30)) - 30) < 0.2, inclination(gAt(30)));
ok('upside down = 180°', Math.abs(inclination({ x: 0, y: 0, z: -1 }) - 180) < 0.2, inclination({ x: 0, y: 0, z: -1 }));
ok('bad vector → null', inclination({ x: NaN, y: 0, z: 1 }) === null, 'nan');

// 2) two-position joint angle
const j = jointAngleTwoPos(gAt(20), gAt(90));
ok('knee 20°→90° = 70°', j.ok && Math.abs(j.angle - 70) < 0.3, j);

// 3) ROM sweep 0→120→0 → rom 120
const sweep = [];
for (let i = 0; i <= 40; i++) { const a = i <= 20 ? i * 6 : (40 - i) * 6; sweep.push({ t: i * 50, g: gAt(a) }); }
const r = romFromSweep(sweep, { joint: 'knee-flexion' });
ok('sweep ROM ≈ 120°', r.ok && Math.abs(r.rom - 120) < 1.5, r.ok ? r.rom : r.reason);
ok('sweep peak ≈ 120°', r.ok && Math.abs(r.peak - 120) < 1.5, r.ok ? r.peak : r.reason);
ok('knee-flexion % of norm ≈ 89', r.ok && Math.abs(r.pctOfNorm - Math.round(120 / 135 * 100)) === 0, r.pctOfNorm);
ok('knee 120° not limited', r.ok && r.limited === false, r);

// 4) limited ROM flags
const limitedSweep = [];
for (let i = 0; i <= 20; i++) { const a = i <= 10 ? i * 1 : (20 - i) * 1; limitedSweep.push({ t: i * 50, g: gAt(a) }); }
const lr = romFromSweep(limitedSweep, { joint: 'ankle-dorsiflexion' });
ok('ankle 10° flagged limited', lr.ok && lr.rom <= 12 && lr.limited === true, lr);

// 5) peak angular velocity present + sane
ok('sweep has peakVel > 0', r.ok && r.peakVelDegS > 0, r.peakVelDegS);

// 6) no movement → refused
const still = Array.from({ length: 20 }, (_, i) => ({ t: i * 50, g: gAt(45) }));
ok('no movement → refused', romFromSweep(still).ok === false, romFromSweep(still));

// 7) norms map sane
ok('norms present', ROM_NORMS['knee-flexion'] === 135 && ROM_NORMS['shoulder-flexion'] === 180, ROM_NORMS['knee-flexion']);

console.log(`\nPIVOT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
