// Fixtures for movementBucket (src/movementBucket.js) — the six library-style
// buckets {upper,lower}×{bilateral,unilateral,plyo} the Analysis "main movements"
// view groups an athlete's lifts by (#170). Titles are real names from a live
// athlete's vault, so a wrong bucket is a wrong on-screen grouping.
// Run: node scripts/verify-movement-bucket.mjs
import { movementBucket, movementRegion, movementModality, groupByBucket } from '../src/movementBucket.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const B = (title, expect) => check(`${title} -> ${expect}`, movementBucket(title) === expect);

// ── lower ──
B('BB Back Squat', 'lower-bilateral');
B('BB RDL', 'lower-bilateral');
B('BB/DB Jefferson DL', 'lower-bilateral');
B('Machine Leg Curl', 'lower-bilateral');
B('Machine Leg Extension', 'lower-bilateral');
B('Walking DB Lunge', 'lower-unilateral');
B('db unilateral rfess w 90° reach', 'lower-unilateral');
B('B-Stance DB Fast ECC DL', 'lower-unilateral');
B('BW Hand-Supported Shrimp Squat', 'lower-unilateral');
B('Continious Power SL Hip-Thrust', 'lower-unilateral');
B('SL Pogo Lateral Jump', 'lower-plyo');
B('DB Squat Jump', 'lower-plyo');
B('Deep-Squat POGO Jump', 'lower-plyo');
B('Weighted SL Snap-Down', 'lower-plyo');
B('Horizontal Jump to SL Land', 'lower-plyo');

// ── upper ──
B('Close-Grip BB Bench Press', 'upper-bilateral');
B('Wide-Grip Pronated Pulldown', 'upper-bilateral');
B('Chest-Supported T-Bar Pronated Row', 'upper-bilateral');
B('Inclined Seated DB Bicep Curl', 'upper-bilateral');
B('Dead-Bug POS DB Pullover', 'upper-bilateral');
B('Hand-Release to Power Push-Up', 'upper-bilateral');
B('SA Cable Pulldown', 'upper-unilateral');
B('Alternating DB Chest Press', 'upper-unilateral');
B('Tall-Kneeling Over-Head MED-Ball Fake Slam', 'upper-plyo');
B('Standing MED-Ball Lateral Fake Toss', 'upper-plyo');

// ── other (core/carry/full-body don't map to the six) ──
check('Short-Lever ABs Sit-Up -> null (other)', movementBucket('Short-Lever ABs Sit-Up') === null);
check('empty -> null', movementBucket('') === null);
// hardening: hinge/ballistic + Olympic edge cases
check('Kettlebell Swing -> lower-plyo (ballistic hinge, was "other")', movementBucket('Kettlebell Swing') === 'lower-plyo');
check('KB Swing -> lower-plyo', movementBucket('KB Swing') === 'lower-plyo');
check('Power Clean -> null (Olympic, not "upper")', movementBucket('Power Clean') === null);
check('Hang Snatch -> null (Olympic)', movementBucket('Hang Snatch') === null);
check('Snatch-Grip RDL stays lower-bilateral (grind carve-out, not Olympic)', movementBucket('Snatch-Grip RDL') === 'lower-bilateral');
check('Farmer Carry -> null (carry, outside the six)', movementBucket('Farmer Carry') === null);

// ── the two axes independently ──
check('region: squat -> lower', movementRegion('BB Back Squat') === 'lower');
check('region: bench -> upper', movementRegion('BB Bench Press') === 'upper');
check('region: plank -> other', movementRegion('Front Plank') === 'other');
check('modality: SL -> unilateral', movementModality('SL RDL') === 'unilateral');
check('modality: pogo -> plyo', movementModality('Ankle Pogo') === 'plyo');
check('modality: BB squat -> bilateral', movementModality('BB Back Squat') === 'bilateral');

// ── groupByBucket buckets every lift + collects the leftovers ──
const grp = groupByBucket([{ title: 'BB Back Squat' }, { title: 'SA Cable Pulldown' }, { title: 'SL Pogo Lateral Jump' }, { title: 'Sit-Up' }]);
check('group: squat in lower-bilateral', grp['lower-bilateral'].length === 1);
check('group: SA pulldown in upper-unilateral', grp['upper-unilateral'].length === 1);
check('group: pogo in lower-plyo', grp['lower-plyo'].length === 1);
check('group: sit-up in other', grp.other.length === 1);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
