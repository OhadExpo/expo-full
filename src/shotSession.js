// shotSession.js — what a SESSION of shots says, as opposed to one rep.
//
// A single rep's numbers are weak on a phone clip: the camera is never square
// to the shot, so every absolute reading carries an unknown offset. That offset
// is the SAME for every rep in the clip, which is exactly why the spread across
// reps survives it — and the spread is the coachable thing. A shooter whose
// release speed wanders misses long and short; one whose speed repeats and
// whose angle wanders has a different problem.
//
// Pure, so it can be tested without a clip — see scripts/verify-shot-session.mjs.

/** Mean / sd / range for a set of readings, or null when there are too few. */
export function spreadOf(values, { min = 3, round = 1 } = {}) {
  const v = (values || []).filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (v.length < min) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  const r = (x) => Math.round(x * 10 ** round) / 10 ** round;
  return { mean: r(mean), sd: r(sd), lo: r(Math.min(...v)), hi: r(Math.max(...v)), n: v.length };
}

// Where each reading stops being repeatable. These are spreads within ONE
// session by ONE shooter, not population norms — a shooter who repeats within
// them is producing the same shot twice, which is the only claim being made.
export const TIGHT = {
  angleDeg: 4,     // degrees of launch angle
  speedMs: 0.4,    // m/s at release
  riseM: 0.15,     // metres of arc height
};

/**
 * Session-level consistency for the ball readings.
 * shots: the analyzed shots, each with .info
 * Returns { angle, speed, rise } — each a spread with `tight`, or null.
 */
export function sessionSpread(shots) {
  const pick = (key) => (shots || []).map((s) => s && s.info && s.info[key]).filter((v) => v != null);
  const out = {};
  for (const [name, key, round] of [['angle', 'ballLaunchDeg', 1], ['speed', 'ballSpeedMs', 2], ['rise', 'ballRiseM', 2]]) {
    const sp = spreadOf(pick(key), { round });
    out[name] = sp ? { ...sp, tight: sp.sd <= TIGHT[key === 'ballLaunchDeg' ? 'angleDeg' : key === 'ballSpeedMs' ? 'speedMs' : 'riseM'] } : null;
  }
  return out;
}

/**
 * The one sentence worth leading with. Speed is the most trustworthy reading —
 * it is scaled by the ball's own width rather than by camera geometry — so an
 * inconsistent SPEED is the finding that matters most, and a consistent speed
 * with a wandering ANGLE is a different fault worth naming separately.
 */
export function sessionVerdict(spread) {
  if (!spread) return null;
  const { angle, speed } = spread;
  if (speed && !speed.tight) return 'speed';
  if (angle && !angle.tight) return 'angle';
  if (speed || angle) return 'repeatable';
  return null;
}

/**
 * The rep that deviates most from the session, on the reading that matters.
 *
 * A spread tells the coach THAT the shot moved; it does not tell him which rep
 * to look at. This names one — the single largest deviation on the reading the
 * verdict picked — because "watch rep 10" is a thing he can actually do,
 * whereas "sd 0.65 m/s" is not.
 *
 * Returns { index, value, delta, key } (index is 1-based, as the UI numbers
 * reps) or null when there is nothing worth singling out.
 */
export function worstRep(shots, spread, verdict) {
  if (!shots || !spread || !verdict || verdict === 'repeatable') return null;
  const key = verdict === 'speed' ? 'ballSpeedMs' : 'ballLaunchDeg';
  const sp = verdict === 'speed' ? spread.speed : spread.angle;
  if (!sp) return null;
  const devs = [];
  shots.forEach((s, i) => {
    const v = s && s.info && s.info[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    // index counts EVERY rep, tracked or not — the UI numbers them all, so
    // "rep 5" has to mean the fifth thing he sees, not the fifth tracked one.
    devs.push({ index: i + 1, value: v, delta: Math.abs(v - sp.mean), key });
  });
  if (devs.length < 3) return null;
  devs.sort((a, b) => b.delta - a.delta);
  const [worst, second] = devs;
  // An outlier is one rep apart from THE REST, not merely the extreme of an
  // even spread. In an evenly spread set the extreme always sits ~1.4 sd from
  // the mean, so a "1 sd" rule names a culprit in every session, including the
  // ones where every rep drifted equally — which is a different fault and must
  // not be reported as one bad rep. Requiring the worst to stand half again
  // clear of the SECOND worst is what separates the two.
  if (worst.delta < second.delta * 1.5) return null;
  return { index: worst.index, value: worst.value, delta: Math.round(worst.delta * 100) / 100, key };
}

/**
 * The whole session read in one object: the spreads, the verdict, and the rep
 * to look at.
 *
 * This exists because the plain verdict got Ohad's own clip wrong. Ten tracked
 * reps: nine sit at sd 0.34 m/s, comfortably repeatable, and one released 27%
 * slower than the rest. Taken together their sd is 0.55, over the threshold, so
 * the verdict was "the force behind the shot is moving rep to rep" — which is a
 * statement about all ten reps and is false about nine of them. The coachable
 * truth is the opposite: he repeats, and one rep did not.
 *
 * So: if dropping the single worst rep brings the reading back inside the
 * threshold, the finding is that ONE rep, not the session.
 */
export function sessionRead(shots) {
  const spread = sessionSpread(shots);
  const verdict = sessionVerdict(spread);
  const culprit = worstRep(shots, spread, verdict);
  if (!verdict || verdict === 'repeatable' || !culprit) return { spread, verdict, culprit };

  // Re-measure without the named rep. Its index is 1-based over ALL reps.
  const without = shots.filter((_, i) => i + 1 !== culprit.index);
  const rest = sessionSpread(without);
  const key = culprit.key === 'ballSpeedMs' ? 'speed' : 'angle';
  const restTight = rest[key] && rest[key].tight;
  // Only when the REST is genuinely a session on its own — dropping a rep from
  // three leaves two, which spreadOf refuses to call a session at all.
  if (restTight && rest[key].n >= 3) {
    return { spread, verdict: 'outlier', culprit, rest: rest[key] };
  }
  return { spread, verdict, culprit };
}
