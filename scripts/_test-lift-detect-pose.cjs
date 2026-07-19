// #19 — unit tests for the MOTION signal and the name+motion fusion.
// Synthetic angle series with known ground truth: no clip needed to prove the
// scorer picks the joint that actually swings, and that fusion resolves
// agreement/disagreement/unknown the way it is documented to.
const fs = require('fs'), path = require('path');

function load() {
  const rc = fs.readFileSync(path.join(__dirname, '..', 'src', 'repCounter.js'), 'utf8')
    .replace(/^export\s+/gm, '');
  let ld = fs.readFileSync(path.join(__dirname, '..', 'src', 'liftDetect.js'), 'utf8')
    .replace(/^import[^;]+;/gm, '').replace(/^export\s+/gm, '');
  const m = {};
  new Function('module', 'exports', `${rc}\n${ld}\nmodule.exports={channelFromPose,detectLift,channelFromTitle,isIsometricTitle};`)(m, m);
  return m.exports;
}
const { channelFromPose, detectLift } = load();

const FPS = 30, SECS = 10, N = FPS * SECS;
// reps sinusoid on a joint: baseline ± amp/2, `reps` cycles over the clip
const wave = (baseline, amp, reps, jitter = 1.5) =>
  Array.from({ length: N }, (_, i) =>
    baseline + (amp / 2) * Math.sin((2 * Math.PI * reps * i) / N) + (Math.random() - 0.5) * jitter);
const flat = (baseline, jitter = 2) =>
  Array.from({ length: N }, () => baseline + (Math.random() - 0.5) * jitter);

const series = (o) => ({
  'L SHO': o.sho || flat(20), 'R SHO': o.sho || flat(20),
  'L ELB': o.elb || flat(170), 'R ELB': o.elb || flat(170),
  'L HIP': o.hip || flat(170), 'R HIP': o.hip || flat(170),
  'L KNE': o.kne || flat(175), 'R KNE': o.kne || flat(175),
});

let pass = 0, fail = 0;
const t = (label, got, want) => {
  if (got === want) { pass++; console.log(`  PASS  ${label}  -> ${got}`); }
  else { fail++; console.log(`  FAIL  ${label}  -> got ${got}, want ${want}`); }
};

console.log('MOTION signal (synthetic clips):');
t('squat: knee 90° + hip 60°', channelFromPose(series({ kne: wave(120, 90, 8), hip: wave(130, 60, 8) })).kind, 'knee');
t('hinge: hip 80° + knee 25°', channelFromPose(series({ hip: wave(120, 80, 8), kne: wave(160, 25, 8) })).kind, 'hip');
t('curl: elbow 100°',          channelFromPose(series({ elb: wave(100, 100, 10) })).kind, 'elbow');
t('raise: shoulder 85°',       channelFromPose(series({ sho: wave(50, 85, 9) })).kind, 'sho');
t('isometric hold (all flat)', channelFromPose(series({})).kind, 'none');
t('unilateral (one side only)',
  channelFromPose({ ...series({}), 'L KNE': wave(120, 90, 8), 'R KNE': flat(175) }).kind, 'knee');

console.log('\nFUSION (name + motion):');
t('name unknown -> motion answers',
  detectLift({ title: 'Zzz Unknown Widget Thing', seriesByName: series({ elb: wave(100, 100, 10) }) }).source, 'motion');
t('name unknown -> motion kind',
  detectLift({ title: 'Zzz Unknown Widget Thing', seriesByName: series({ elb: wave(100, 100, 10) }) }).kind, 'elbow');
t('agreement -> name+motion',
  detectLift({ title: 'Back Squat', seriesByName: series({ kne: wave(120, 90, 8) }) }).source, 'name+motion');
t('agreement -> no disagreement flag',
  detectLift({ title: 'Back Squat', seriesByName: series({ kne: wave(120, 90, 8) }) }).disagreement, false);
t('decisive disagreement -> motion wins',
  detectLift({ title: 'BB Bench Press', seriesByName: series({ kne: wave(120, 95, 8) }) }).kind, 'knee');
t('decisive disagreement -> flagged',
  detectLift({ title: 'BB Bench Press', seriesByName: series({ kne: wave(120, 95, 8) }) }).disagreement, true);
t('isometric title beats motion noise',
  detectLift({ title: 'ISO Kneeling Push-Up', seriesByName: series({}) }).kind, 'none');
t('no title, no series -> honest unknown',
  detectLift({}).source, 'unknown');
t('name only (no series) keeps name',
  detectLift({ title: 'Romanian Deadlift' }).kind, 'hip');

console.log(`\ntotal: ${pass + fail}  passed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
