// Fixtures for exerciseContinuity (src/exerciseContinuity.js) — how long each main
// lift has run across blocks (the coach's own programming-continuity mirror). The
// coach reads the runs to judge specificity vs churn, so the run math + the
// "current run must end at the LATEST block" rule have to be exact. Run:
//   node scripts/verify-exercise-continuity.mjs
import { exerciseContinuity } from '../src/exerciseContinuity.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const B = (num, ...mains) => ({ num, mains });
const lift = (res, title) => res.lifts.find((l) => l.title === title);

// Squat in all 6 blocks (unbroken to the latest); Trap-Bar only in the first 2;
// Front Squat in the last 3; a churned "SSB/Safety Squat" appears once.
const res = exerciseContinuity([
  B(1, 'BB Back Squat', 'Trap-Bar DL'),
  B(2, 'BB Back Squat', 'Trap-Bar DL'),
  B(3, 'BB Back Squat'),
  B(4, 'BB Back Squat', 'Front Squat'),
  B(5, 'BB Back Squat', 'Front Squat'),
  B(6, 'BB Back Squat', 'Front Squat', 'SSB Squat'),
]);
check('total blocks = 6', res.totalBlocks === 6);
check('BB Back Squat: current run 6 (unbroken to latest)', lift(res, 'BB Back Squat').currentRun === 6);
check('BB Back Squat: static (>=4 unbroken)', lift(res, 'BB Back Squat').static === true);
check('BB Back Squat in staticNow (run 6)', res.staticNow.some((s) => s.title === 'BB Back Squat' && s.run === 6));
check('Trap-Bar DL: dropped (not in latest) -> current run 0', lift(res, 'Trap-Bar DL').currentRun === 0);
check('Trap-Bar DL: longest run 2 (blocks 1-2)', lift(res, 'Trap-Bar DL').longestRun === 2);
check('Trap-Bar DL: NOT static', lift(res, 'Trap-Bar DL').static === false);
check('Front Squat: current run 3 (blocks 4-6)', lift(res, 'Front Squat').currentRun === 3);
check('Front Squat: NOT static (<4)', lift(res, 'Front Squat').static === false);
check('SSB Squat: count 1, current run 1', lift(res, 'SSB Squat').count === 1 && lift(res, 'SSB Squat').currentRun === 1);
check('staticNow holds ONLY the 6-block squat', res.staticNow.length === 1);

// gaps: a lift skipping blocks never builds a run
const gap = exerciseContinuity([B(1, 'DL'), B(2, 'x'), B(3, 'DL'), B(4, 'x'), B(5, 'DL')]);
check('gapped DL (blocks 1,3,5): longest run 1', lift(gap, 'DL').longestRun === 1);
check('gapped DL in latest block -> current run 1 (no back-to-back)', lift(gap, 'DL').currentRun === 1);
check('gapped DL count 3', lift(gap, 'DL').count === 3);

// SAFETY (adversarial-review finding #1): a block dropped UPSTREAM (near-empty,
// filtered before this engine) leaves a NUM gap in an otherwise array-adjacent
// list. Block 3 is gone -> nums 1,2,4,5,6. A lift in all 5 surviving blocks must
// NOT read as 5-in-a-row / static (that would tell the coach to rotate a lift he
// only ran 3 straight). The num gap between 2 and 4 breaks the run.
const dropped = exerciseContinuity([B(1, 'BB Back Squat'), B(2, 'BB Back Squat'), B(4, 'BB Back Squat'), B(5, 'BB Back Squat'), B(6, 'BB Back Squat')]);
check('dropped block: num gap breaks the run -> current run 3 (blocks 4-6), not 5', lift(dropped, 'BB Back Squat').currentRun === 3);
check('dropped block: longest run 3 (blocks 4-6), not 5', lift(dropped, 'BB Back Squat').longestRun === 3);
check('dropped block: NOT static (no false rotate-it flag)', lift(dropped, 'BB Back Squat').static === false);
check('dropped block: staticNow empty', dropped.staticNow.length === 0);
// contiguous nums with no drop still count the full run (fix must not under-report)
const contig = exerciseContinuity([B(1, 'Sq'), B(2, 'Sq'), B(3, 'Sq'), B(4, 'Sq')]);
check('contiguous nums 1-4: full run 4, static', lift(contig, 'Sq').currentRun === 4 && lift(contig, 'Sq').static === true);
// un-numbered blocks (null num) fall back to array-adjacency (never penalize)
const nonum = exerciseContinuity([B(null, 'Sq'), B(null, 'Sq'), B(null, 'Sq'), B(null, 'Sq')]);
check('null nums: fall back to list-adjacency -> full run 4, static', lift(nonum, 'Sq').currentRun === 4 && lift(nonum, 'Sq').static === true);

// hygiene: duplicate main in one block counts once; empty -> empty
const dup = exerciseContinuity([B(1, 'Bench', 'Bench', 'Bench')]);
check('duplicate main in a block counts once', lift(dup, 'Bench').count === 1);
check('no blocks -> empty', exerciseContinuity([]).lifts.length === 0 && exerciseContinuity([]).totalBlocks === 0);
check('null-safe', exerciseContinuity(null).totalBlocks === 0);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
