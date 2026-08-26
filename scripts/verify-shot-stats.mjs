// The statistics the shot tool calibrates from.
//
// median() feeds rulerPx — the eye-to-ankle pixel distance that converts every
// measurement into centimetres. It used to return the UPPER of the two middle
// values on an even-length sample, biasing the ruler high, which makes
// cm-per-pixel small and every reported height and metre read LOW.
//
// A measurement tool cannot have a biased ruler, so this pins the behaviour.
import { median } from '../src/shotAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

check('even count averages the two middle values (was 20)', median([10, 20]) === 15);
check('even count, four samples (was 3)', median([1, 2, 3, 4]) === 2.5);
check('odd count returns the middle', median([1, 2, 3]) === 2);
check('single sample', median([5]) === 5);
check('empty is null, not NaN', median([]) === null);
check('ignores non-numbers', median([1, null, 3, undefined, NaN]) === 2);
check('unsorted input still correct', median([4, 1, 3, 2]) === 2.5);
check('negatives sort numerically, not lexically', median([-10, -2]) === -6);

// The input must survive: callers reuse these arrays for other statistics.
const src = [3, 1, 2, 4];
median(src);
check('does not mutate the caller array', JSON.stringify(src) === '[3,1,2,4]');

// The bias this existed to remove: on an even sample the old upper-median
// always sat at or above the true median, never below.
const sample = [100, 102, 104, 106];
check('ruler sample is centred, not high', median(sample) === 103);

console.log(`\nSHOT STATS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
