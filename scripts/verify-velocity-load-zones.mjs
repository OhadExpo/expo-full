// Fixtures for velocityLoadZones (src/velocityLoadZones.js) — turns an athlete's
// filmed (load, velocity) points into a LOAD PRESCRIPTION per training quality
// (max-strength / strength-speed / speed-strength / speed). A coach would put the
// prescribed kg on the bar, so the fit, the per-zone load, the interpolation-vs-
// extrapolation honesty, and the thin/invalid guards all have to be right.
// Run: node scripts/verify-velocity-load-zones.mjs
import { velocityLoadPrescription, VELOCITY_ZONES } from '../src/velocityLoadZones.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const near = (a, b, t = 1.5) => a != null && Math.abs(a - b) <= t;
const zone = (res, key) => (res.zones || []).find((z) => z.key === key);

// Clean load-velocity line: v = 1.0 − 0.005·load  → filmed v range [0.40, 0.60].
//   load@0.40 = 120, @0.65 = 70, @0.85 = 30, @1.10 = −20 (out of range)
const CLEAN = [{ load: 80, velocity: 0.60 }, { load: 120, velocity: 0.40 }];

// --- thin: a single distinct load can't define a line ---
check('one load only -> thin', velocityLoadPrescription([{ load: 100, velocity: 0.5 }]).state === 'thin');
check('empty -> thin', velocityLoadPrescription([]).state === 'thin');
check('nulls/garbage -> thin', velocityLoadPrescription([{ load: 0, velocity: -1 }, null]).state === 'thin');

// --- invalid physics: velocity RISES with load (positive slope) -> refuse ---
check('velocity rises with load -> thin (no fake line)',
  velocityLoadPrescription([{ load: 80, velocity: 0.40 }, { load: 120, velocity: 0.60 }]).state === 'thin');

// --- clean profile -> ok with 4 zones ---
const R = velocityLoadPrescription(CLEAN);
check('clean profile -> ok', R.state === 'ok');
check('four zones returned', (R.zones || []).length === VELOCITY_ZONES.length);
check('filmed range reported [0.40, 0.60]', near(R.filmedRange?.vMin, 0.40, 0.01) && near(R.filmedRange?.vMax, 0.60, 0.01));

// --- per-zone load prescriptions ---
check('max-strength load ~120kg', near(zone(R, 'max-strength')?.load, 120));
check('strength-speed load ~70kg', near(zone(R, 'strength-speed')?.load, 70));
check('speed-strength load ~30kg', near(zone(R, 'speed-strength')?.load, 30));

// --- honesty: which targets are interpolated (trust) vs reached-for vs guessed ---
check('max-strength inside filmed range -> measured', zone(R, 'max-strength')?.confidence === 'measured');
check('strength-speed just outside -> near', zone(R, 'strength-speed')?.confidence === 'near');
check('speed-strength far outside -> extrapolated', zone(R, 'speed-strength')?.confidence === 'extrapolated');
check('speed target extrapolates past bodyweight-fast -> out-of-range (no negative kg)',
  zone(R, 'speed')?.load == null && zone(R, 'speed')?.confidence === 'out-of-range');

// --- monotonic: a faster target quality must prescribe a LIGHTER bar ---
const ms = zone(R, 'max-strength')?.load, ss = zone(R, 'speed-strength')?.load;
check('heavier bar for the slower quality (max-strength > speed-strength)', ms > ss);

// --- averaging: two clips at the same load are averaged before the fit ---
const AVG = velocityLoadPrescription([
  { load: 80, velocity: 0.58 }, { load: 80, velocity: 0.62 }, { load: 120, velocity: 0.40 },
]);
check('two clips at one load averaged -> same max-strength load ~120', near(zone(AVG, 'max-strength')?.load, 120));

// --- SAFETY: a light/fast-only profile must NOT prescribe a load HEAVIER than
//     anything filmed off an extrapolated line (the unsafe over-heavy direction).
//     60-70kg filmed @ ~0.85 m/s used to yield "max-strength 182kg" — now nulled. ---
const LIGHT = velocityLoadPrescription([
  { load: 60, velocity: 0.90 }, { load: 60, velocity: 0.88 },
  { load: 70, velocity: 0.86 }, { load: 70, velocity: 0.84 },
]);
check('over-heavy extrapolation nulled (max-strength load == null)', zone(LIGHT, 'max-strength')?.load == null && zone(LIGHT, 'max-strength')?.confidence === 'out-of-range');
check('no zone prescribes heavier than 1.25x the filmed max off extrapolation',
  (LIGHT.zones || []).every((z) => z.load == null || z.confidence !== 'extrapolated' || z.load <= 70));
// a short 'near' reach just above the filmed max is still allowed (not over-killed)
check('healthy profile keeps a short near-reach above filmed max',
  (() => { const H = velocityLoadPrescription([{ load: 60, velocity: 1.05 }, { load: 90, velocity: 0.75 }, { load: 120, velocity: 0.45 }]); const z = zone(H, 'max-strength'); return z.load > 120 && z.confidence === 'near'; })());

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
