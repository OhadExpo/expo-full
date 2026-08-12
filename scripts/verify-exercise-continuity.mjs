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

// hygiene: duplicate main in one block counts once; empty -> empty
const dup = exerciseContinuity([B(1, 'Bench', 'Bench', 'Bench')]);
check('duplicate main in a block counts once', lift(dup, 'Bench').count === 1);
check('no blocks -> empty', exerciseContinuity([]).lifts.length === 0 && exerciseContinuity([]).totalBlocks === 0);
check('null-safe', exerciseContinuity(null).totalBlocks === 0);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
