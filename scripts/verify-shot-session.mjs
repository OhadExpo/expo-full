// Session-level consistency across a set of shots.
import { spreadOf, sessionSpread, sessionVerdict, worstRep, sessionRead, TIGHT } from '../src/shotSession.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};
const near = (name, got, want, tol) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: got ${got}, want ${want} ±${tol}`); }
};

console.log('SHOT SESSION\n');

// ── the spread itself ──────────────────────────────────────────────────────
{
  const sp = spreadOf([10, 12, 14]);
  near('mean', sp.mean, 12, 0.001);
  near('sd', sp.sd, 1.6, 0.05);
  eq('range', [sp.lo, sp.hi], [10, 14]);
  eq('counts what it used', sp.n, 3);
}
eq('two readings are not a session', spreadOf([10, 12]), null);
eq('nothing is not a session', spreadOf([]), null);
eq('nulls and NaN are ignored, not counted', spreadOf([10, null, NaN, 12, undefined]), null);
{
  // Four good readings among junk still make a session.
  const sp = spreadOf([10, null, 12, NaN, 14, 12]);
  eq('valid readings survive junk', sp.n, 4);
}

// ── real numbers from Ohad's clip ──────────────────────────
// From scripts/shot-harness-run.mjs on his 11-shot clip. Shot 4 is not tracked
// (the ball is never separable from the body on that rep), so ten readings.
//
// These numbers REPLACED an earlier fixture that was measured before the scale
// came from gravity rather than from the motion blob's width. The blob is the
// union of two ball positions, so it read wider than the ball and every speed
// came out ~18% low. The old fixture said 4.41 m/s mean; the same clip now
// reads 5.33. Keeping the old numbers would have meant asserting against a
// measurement the code no longer makes.
const REAL = [
  [67.5, 5.9, 1.53], [66.1, 5.5, 1.31], [62.0, 5.7, 1.31], [null, null, null],
  [56.8, 5.1, 0.93], [64.1, 6.0, 1.49], [64.2, 5.4, 1.21], [63.9, 5.3, 1.16],
  [59.5, 4.9, 0.89], [55.3, 4.0, 0.56], [63.8, 5.5, 1.24],
].map(([a, s, r]) => ({ info: { ballLaunchDeg: a, ballSpeedMs: s, ballRiseM: r } }));
{
  const sp = sessionSpread(REAL);
  near('angle mean matches the clip', sp.angle.mean, 62.3, 0.3);
  near('speed mean matches the clip', sp.speed.mean, 5.33, 0.03);
  near('rise mean matches the clip', sp.rise.mean, 1.16, 0.03);
  eq('the untracked rep is not counted', [sp.angle.n, sp.speed.n, sp.rise.n], [10, 10, 10]);
  // sd of those angles is ~3.7 — inside 4, so his ANGLE repeats.
  eq('his launch angle is repeatable', sp.angle.tight, true);
  // sd of those speeds is ~0.55, over 0.4 — but that is ONE rep, see below.
  eq('taken flat, the speed reads as inconsistent', sp.speed.tight, false);
  eq('and the flat verdict blames the session', sessionVerdict(sp), 'speed');
}
{
  // The read that gets it right: nine of his ten reps sit at sd 0.34, well
  // inside the threshold. Rep 10 released 27% slower than the rest. Telling him
  // "your release speed is moving rep to rep" is false about nine reps.
  const read = sessionRead(REAL);
  eq('the session is not blamed for one rep', read.verdict, 'outlier');
  eq('and the rep is named', read.culprit.index, 10);
  eq('with its own reading', read.culprit.value, 4);
  near('the other nine are tight', read.rest.sd, 0.34, 0.02);
  eq('and there are nine of them', read.rest.n, 9);
}

// ── the faults it is meant to name ─────────────────────────────────────────
{
  // Same angle every rep, speed all over the place: a force problem.
  const shots = [4.0, 5.2, 3.6, 5.0, 4.4].map((s) => ({ info: { ballLaunchDeg: 60, ballSpeedMs: s } }));
  const sp = sessionSpread(shots);
  eq('a wandering speed is not tight', sp.speed.tight, false);
  eq('and speed is what gets named first', sessionVerdict(sp), 'speed');
}
{
  // Speed repeats, angle wanders: a release problem, and a DIFFERENT finding.
  const shots = [48, 60, 55, 68, 52].map((a) => ({ info: { ballLaunchDeg: a, ballSpeedMs: 4.4 } }));
  const sp = sessionSpread(shots);
  eq('a steady speed is tight', sp.speed.tight, true);
  eq('a wandering angle is not', sp.angle.tight, false);
  eq('so the angle is named', sessionVerdict(sp), 'angle');
}

// ── refusing to speak without evidence ─────────────────────────────────────
{
  const sp = sessionSpread([{ info: { ballLaunchDeg: 60 } }, { info: {} }]);
  eq('one reading says nothing about the angle', sp.angle, null);
  eq('and nothing about speed', sp.speed, null);
  eq('and there is no verdict', sessionVerdict(sp), null);
}
eq('no shots at all', sessionVerdict(sessionSpread([])), null);
eq('null in, null out', sessionVerdict(null), null);
{
  // Shots that were never tracked must not drag a session to "inconsistent".
  const shots = [{ info: { ballSpeedMs: 4.4 } }, { info: { ballSpeedMs: null } }, { info: { ballSpeedMs: 4.5 } }, { info: { ballSpeedMs: 4.4 } }];
  const sp = sessionSpread(shots);
  eq('untracked reps are skipped, not counted as zero', sp.speed.n, 3);
  eq('and the session still reads as repeatable', sp.speed.tight, true);
}
eq('the thresholds are stated, not magic', [TIGHT.angleDeg, TIGHT.speedMs, TIGHT.riseM], [4, 0.4, 0.15]);
// ── naming the rep to look at ──────────────────────────────────────────────
{
  // One clearly slow rep among steady ones.
  const shots = [4.5, 4.4, 4.6, 3.1, 4.5].map((s) => ({ info: { ballLaunchDeg: 60, ballSpeedMs: s } }));
  const sp = sessionSpread(shots);
  const w = worstRep(shots, sp, sessionVerdict(sp));
  eq('names the rep that deviates most', w && w.index, 4);
  eq('and says which reading', w && w.key, 'ballSpeedMs');
  eq('and reports its value', w && w.value, 3.1);
}
{
  // Evenly spread, no single culprit — do not invent one.
  const shots = [4.0, 4.3, 4.6, 4.9, 5.2].map((s) => ({ info: { ballSpeedMs: s } }));
  const sp = sessionSpread(shots);
  eq('an even spread names nobody', worstRep(shots, sp, sessionVerdict(sp)), null);
}
{
  // A repeatable session has no rep to single out.
  const shots = [4.4, 4.4, 4.5, 4.4].map((s) => ({ info: { ballSpeedMs: s } }));
  const sp = sessionSpread(shots);
  eq('a repeatable session names nobody', worstRep(shots, sp, sessionVerdict(sp)), null);
}
{
  // Speed repeats, angle wanders: the culprit is named on the ANGLE, and the
  // index must count untracked reps too — the UI numbers every rep, not just
  // the ones the ball tracker caught.
  const shots = [
    { info: { ballLaunchDeg: 60, ballSpeedMs: 4.4 } },
    { info: { ballSpeedMs: 4.4 } },
    { info: { ballLaunchDeg: 61, ballSpeedMs: 4.4 } },
    { info: { ballLaunchDeg: 59, ballSpeedMs: 4.4 } },
    { info: { ballLaunchDeg: 78, ballSpeedMs: 4.4 } },
  ];
  const sp = sessionSpread(shots);
  const w = worstRep(shots, sp, sessionVerdict(sp));
  eq('the angle culprit is found', w && w.key, 'ballLaunchDeg');
  eq('and its index counts untracked reps', w && w.index, 5);
}
eq('no shots, no culprit', worstRep([], null, null), null);
eq('null spread, no culprit', worstRep([{ info: { ballSpeedMs: 4 } }], null, 'speed'), null);

// ── the outlier read must not excuse a genuinely wandering session ──────────
{
  // Every rep is somewhere different. Dropping the worst leaves it just as
  // spread, so the finding stays "the session", not "one rep".
  const shots = [4.0, 5.4, 3.6, 5.2, 4.4, 6.0].map((s) => ({ info: { ballSpeedMs: s } }));
  const read = sessionRead(shots);
  eq('a wandering session is still blamed on the session', read.verdict, 'speed');
}
{
  // Four reps, one apart. Dropping it leaves three — still a session, so the
  // outlier read is allowed to speak.
  const shots = [4.4, 4.5, 4.4, 2.9].map((s) => ({ info: { ballSpeedMs: s } }));
  const read = sessionRead(shots);
  eq('four reps with one apart reads as an outlier', read.verdict, 'outlier');
  eq('and names it', read.culprit.index, 4);
}
{
  // Three reps, one apart. Dropping it leaves TWO, which is not a session —
  // there is no evidence the other reps repeat, so do not claim they do.
  const shots = [4.4, 4.5, 2.9].map((s) => ({ info: { ballSpeedMs: s } }));
  const read = sessionRead(shots);
  eq('three reps cannot prove the rest repeat', read.verdict, 'speed');
}
{
  // A repeatable session names nobody and stays repeatable.
  const shots = [4.4, 4.4, 4.5, 4.4].map((s) => ({ info: { ballSpeedMs: s } }));
  const read = sessionRead(shots);
  eq('repeatable stays repeatable', read.verdict, 'repeatable');
  eq('with no culprit', read.culprit, null);
}
{
  // The angle path, not just the speed path.
  const shots = [60, 61, 59, 60, 79].map((a) => ({ info: { ballLaunchDeg: a, ballSpeedMs: 4.4 } }));
  const read = sessionRead(shots);
  eq('one wild angle reads as an outlier', read.verdict, 'outlier');
  eq('named on the angle', read.culprit.key, 'ballLaunchDeg');
}
eq('no shots, no read', sessionRead([]).verdict, null);


console.log(`\nSHOT SESSION: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
