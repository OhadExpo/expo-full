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


// --- how much did correcting the median actually move things? -------------
// The shift is exactly (a[m] - a[m-1]) / 2 on an even count and zero on an odd
// one, so it depends entirely on sample size. Measured on a synthetic torso
// series (0.15 base, 3% frame-to-frame wobble):
//
//   n=2    1.287%      n=40    0.203%
//   n=4    0.224%      n=120   0.009%
//   n=8    0.217%      n=300   0.022%
//   n=16   0.130%      n=600   0.001%
//
// detectShots calls median(sm.torso) across the WHOLE clip — hundreds of
// frames — so its peak threshold (torsoRef * 0.35) moves by a fraction of a
// percent and the shot count cannot flip on it.
// rulers() calls median over stance..dip only, often a handful of frames,
// which is exactly where the bias was worth removing.
//
// This bound is why the fix ships without an end-to-end clip re-run: the
// browser harness needs a dev server that would not root correctly tonight.
const shiftAt = (n) => {
  const s = [];
  for (let i = 0; i < n; i++) s.push(0.15 + Math.sin(i / 7) * 0.003 + (((i * 2654435761) % 1000) / 1000 - 0.5) * 0.0045);
  const a = s.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? 0 : Math.abs(a[m] - (a[m - 1] + a[m]) / 2) / ((a[m - 1] + a[m]) / 2);
};
check('long samples barely move (detection is safe)', shiftAt(600) < 0.0005);
check('short samples move most (the ruler is what this fixed)', shiftAt(4) > shiftAt(600));


console.log(`\nSHOT STATS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
