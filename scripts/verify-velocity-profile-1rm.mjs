// Fixtures for the Velocity-Profile 1RM engine (src/velocityProfile1RM.js).
// This estimates a 1RM a coach acts on, and the DANGEROUS direction of error is
// OVER-estimating (a too-heavy number) — so the invalid-state guards (flat line,
// estimate below a lifted load, bunched loads, >2x extrapolation reach) are the
// safety-critical paths and are pinned here. Run: node scripts/verify-velocity-profile-1rm.mjs
import { mvtForLift, velocityProfile1RM } from '../src/velocityProfile1RM.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

// --- mvtForLift family mapping ---
check('mvt deadlift 0.15', mvtForLift('Trap Bar Deadlift') === 0.15);
check('mvt bench 0.17', mvtForLift('Barbell Bench Press') === 0.17);
check('mvt ohp 0.19', mvtForLift('Standing OHP') === 0.19);
check('mvt pull 0.23', mvtForLift('Barbell Row') === 0.23);
check('mvt squat 0.30', mvtForLift('Back Squat') === 0.30);
check('mvt unknown -> default 0.25', mvtForLift('Bicep Curl') === 0.25);
// Hip thrust must NOT inherit the deadlift 0.15 (2nd adversarial review #1) — a
// too-low MVT over-estimates the 1RM in the dangerous direction at HIGH conf.
check('mvt hip thrust 0.30 (not deadlift 0.15)', mvtForLift('Barbell Hip Thrust') === 0.30);
check('mvt glute bridge 0.30', mvtForLift('Barbell Glute Bridge') === 0.30);
check('mvt hip HINGE still deadlift 0.15 (not caught by thrust branch)', mvtForLift('Hip Hinge') === 0.15);
// Regression: the review's exact over-estimate. At 0.15 this returned oneRM 180
// at HIGH confidence; at the correct 0.30 it is honestly 'invalid' (the estimate
// would sit BELOW a load he already lifted → needs lighter submax points).
const htReview = velocityProfile1RM([{ load: 100, velocity: 0.55 }, { load: 130, velocity: 0.40 }, { load: 160, velocity: 0.25 }], mvtForLift('Barbell Hip Thrust'));
check('hip-thrust review case -> NOT a HIGH-confidence over-estimate', !(htReview.state === 'ok' && htReview.confidence === 'high'));
check('hip-thrust review case -> honest invalid (below a lifted load)', htReview.state === 'invalid');

// --- thin: fewer than 2 distinct loads can't fit a line ---
check('single load -> thin', velocityProfile1RM([{ load: 100, velocity: 0.5 }], 0.30).state === 'thin');
check('same load twice -> thin (1 distinct)', velocityProfile1RM([{ load: 100, velocity: 0.5 }, { load: 100, velocity: 0.6 }], 0.30).state === 'thin');

// --- clean 3-load squat profile: exactly linear, MVT 0.30 ---
// line v = 1.45 - 0.0075*load  ->  1RM = (0.30-1.45)/-0.0075 = 153.3
const clean = velocityProfile1RM([{ load: 100, velocity: 0.70 }, { load: 120, velocity: 0.55 }, { load: 140, velocity: 0.40 }], 0.30);
check('clean 3-load -> state ok', clean.state === 'ok');
check('clean 3-load -> 1RM ~153', near(clean.oneRM, 153));
check('clean 3-load -> r2 = 1', clean.r2 === 1);
check('clean 3-load -> 3 loads', clean.loads === 3);
check('clean 3-load -> confidence high (r2>=.9, reach<=1.35)', clean.confidence === 'high');

// --- 2 loads on the SAME line: valid 1RM but confidence can NEVER exceed low
// (2 points fit a line perfectly by definition, so r2=1 proves nothing) ---
const two = velocityProfile1RM([{ load: 100, velocity: 0.70 }, { load: 140, velocity: 0.40 }], 0.30);
check('2-load -> state ok', two.state === 'ok');
check('2-load -> 1RM ~153 (same line)', near(two.oneRM, 153));
check('2-load -> confidence low (never higher)', two.confidence === 'low');

// --- averaging: repeated load is ONE profile point (velocities averaged) ---
const avg = velocityProfile1RM([{ load: 100, velocity: 0.72 }, { load: 100, velocity: 0.68 }, { load: 140, velocity: 0.40 }], 0.30);
check('avg: load 100 velocities averaged to 0.70 -> 1RM ~153', near(avg.oneRM, 153));
check('avg: 2 distinct loads despite 3 raw points', avg.loads === 2 && avg.points === 3);

// --- INVALID GUARDS (coach-safety) ---
// flat: velocity barely changes with load -> slope shallower than -1e-4
check('flat line -> invalid', velocityProfile1RM([{ load: 100, velocity: 0.500 }, { load: 140, velocity: 0.499 }], 0.30).state === 'invalid');
// estimate at/below a load already lifted: heaviest filmed set already slower than MVT
const below = velocityProfile1RM([{ load: 100, velocity: 0.20 }, { load: 120, velocity: 0.12 }], 0.17);
check('estimate below max lifted -> invalid', below.state === 'invalid' && /already lifted/.test(below.reason));
// bunched loads: spread below max(5, 10% of maxLoad)
const bunched = velocityProfile1RM([{ load: 100, velocity: 0.50 }, { load: 104, velocity: 0.49 }], 0.30);
check('bunched loads -> invalid', bunched.state === 'invalid' && /too close/.test(bunched.reason));
// reach > 2x heaviest filmed load: light/slow-only profile over-reads the max
// line v = 0.75 - 0.0015*load -> 1RM 300, maxLoad 120, reach 2.5
const farReach = velocityProfile1RM([{ load: 100, velocity: 0.60 }, { load: 110, velocity: 0.585 }, { load: 120, velocity: 0.57 }], 0.30);
check('reach >2x -> invalid (no fantasy max)', farReach.state === 'invalid' && /2×|2x/.test(farReach.reason));

// --- adversarial-review fixes (2026-08-12) ---
// #1: squat/lunge family resolves BEFORE the overhead branch (a too-low OHP MVT
// over-estimates the 1RM and was shown as high confidence).
check('mvt "Overhead Squat" -> squat 0.30, NOT ohp 0.19', mvtForLift('Overhead Squat') === 0.30);
check('mvt "Overhead Reverse Lunge" -> squat 0.30', mvtForLift('Overhead Reverse Lunge') === 0.30);
check('mvt plain "Overhead Press" still -> ohp 0.19', mvtForLift('Overhead Press') === 0.19);
check('mvt "Military Press" still -> ohp 0.19', mvtForLift('Military Press') === 0.19);
// #2: a bunched third load (100/101 + 140) is really a 2-point fit -> stays 'low',
// never high, even with a perfect r². (Genuinely separated 3 loads can be high.)
const bunched3 = velocityProfile1RM([{ load: 100, velocity: 0.70 }, { load: 101, velocity: 0.699 }, { load: 140, velocity: 0.40 }], 0.30);
check('bunched-3 loads (100/101/140) -> confidence low (2-pt in disguise)', bunched3.state === 'ok' && bunched3.confidence === 'low');
const sep3 = velocityProfile1RM([{ load: 100, velocity: 0.70 }, { load: 120, velocity: 0.55 }, { load: 140, velocity: 0.40 }], 0.30);
check('separated-3 loads still -> high confidence', sep3.confidence === 'high');
// #5: Infinity load can't leak through the input filter
check('Infinity load filtered out -> thin (only 1 real load)', velocityProfile1RM([{ load: Infinity, velocity: 0.5 }, { load: 100, velocity: 0.6 }], 0.30).state === 'thin');

// --- junk input never throws ---
check('empty points -> thin', velocityProfile1RM([], 0.30).state === 'thin');
check('null points -> thin', velocityProfile1RM(null, 0.30).state === 'thin');
check('bad velocities filtered out', velocityProfile1RM([{ load: 100, velocity: 0 }, { load: 120, velocity: -1 }, { load: 140, velocity: NaN }], 0.30).state === 'thin');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
