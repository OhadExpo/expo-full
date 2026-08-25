// Session-level consistency across a set of shots.
import { spreadOf, sessionSpread, sessionVerdict, worstRep, TIGHT } from '../src/shotSession.js';

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

// ── real numbers from Ohad's clip ──────────────────────────────────────────
// Measured: angles 66.1 61.1 59.2 64.7 66.2 65.1 60.2 63.6, speeds 4.5 4.2 4.2
// 4.7 4.8 4.3 3.9 4.7, rises 1.07 .92 .87 1.14 1.16 .94 .75 1.07
const REAL = [
  [66.1, 4.5, 1.07], [61.1, 4.2, 0.92], [59.2, 4.2, 0.87], [64.7, 4.7, 1.14],
  [66.2, 4.8, 1.16], [65.1, 4.3, 0.94], [60.2, 3.9, 0.75], [63.6, 4.7, 1.07],
].map(([a, s, r]) => ({ info: { ballLaunchDeg: a, ballSpeedMs: s, ballRiseM: r } }));
{
  const sp = sessionSpread(REAL);
  near('angle mean matches the clip', sp.angle.mean, 63.3, 0.3);
  near('speed mean matches the clip', sp.speed.mean, 4.41, 0.03);
  near('rise mean matches the clip', sp.rise.mean, 0.99, 0.02);
  eq('all eight reps counted', [sp.angle.n, sp.speed.n, sp.rise.n], [8, 8, 8]);
  // sd of those angles is ~2.6 — inside 4, so his ANGLE repeats.
  eq('his launch angle is repeatable', sp.angle.tight, true);
  // sd of those speeds is ~0.29 — inside 0.4.
  eq('his release speed is repeatable', sp.speed.tight, true);
  eq('and the session reads as repeatable', sessionVerdict(sp), 'repeatable');
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


console.log(`\nSHOT SESSION: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
