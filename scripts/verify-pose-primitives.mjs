// Fixtures for the pose-math primitives every camera measurement stands on.
// angleAt is the 3D joint-angle kernel — a regression here silently corrupts
// rep-counting, ROM, the goniometer, everything. Pinned with known geometry.
// Run: node scripts/verify-pose-primitives.mjs
import { angleAt, detectChannels, medianFilter, isReal } from '../src/repCounter.js';
import { jointRomMetrics } from '../src/poseLab.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const near = (a, b, tol = 0.5) => a != null && Math.abs(a - b) <= tol;
const P = (x, y, z = 0) => ({ x, y, z });

// --- angleAt: angle at vertex b between b→a and b→c (uses x,y,z) ---
// lms is indexed; call angleAt(lms, ai, bi, ci).
const L = (a, b, c) => [a, b, c]; // indices 0,1,2
check('right angle -> 90', near(angleAt(L(P(1, 0), P(0, 0), P(0, 1)), 0, 1, 2), 90));
check('straight -> 180', near(angleAt(L(P(1, 0), P(0, 0), P(-1, 0)), 0, 1, 2), 180));
check('45 degrees', near(angleAt(L(P(1, 0), P(0, 0), P(1, 1)), 0, 1, 2), 45));
check('collinear same side -> 0', near(angleAt(L(P(1, 0), P(0, 0), P(2, 0)), 0, 1, 2), 0));
check('3D right angle (z axis)', near(angleAt(L(P(0, 0, 1), P(0, 0, 0), P(0, 1, 0)), 0, 1, 2), 90));
check('missing landmark -> null', angleAt([P(1, 0), undefined, P(0, 1)], 0, 1, 2) === null);
check('zero-length vector (a===b) -> null', angleAt(L(P(0, 0), P(0, 0), P(0, 1)), 0, 1, 2) === null);

// --- detectChannels: title -> which joint channel carries the rep cycle ---
check('squat -> knee', detectChannels('Back Squat').kind === 'knee');
check('deadlift -> hip', detectChannels('Trap Bar Deadlift').kind === 'hip');
check('bench -> elbow', detectChannels('Barbell Bench Press').kind === 'elbow');
check('lateral raise -> shoulder', detectChannels('DB Lateral Raise').kind === 'sho');
check('plank/hold -> none (no counting)', detectChannels('Front Plank').channels.length === 0);
check('unknown title -> default knee', detectChannels('Weird Thing').kind === 'knee');

// --- medianFilter: a single-frame spike is smoothed out ---
const smoothed = medianFilter([100, 100, 100, 300, 100, 100, 100], 5);
check('median-5 kills a lone 300 spike', !smoothed.includes(300) && smoothed.every((v) => v === 100));

// --- isReal guards ---
check('isReal: finite ok', isReal(5) === true);
check('isReal: null/NaN/Infinity rejected', !isReal(null) && !isReal(NaN) && !isReal(Infinity));

// --- jointRomMetrics: a clean L-knee sweep with the extremes held long enough
// to survive the median-5 filter. Interior knee angle at vertex 25 (hip 23,
// ankle 27): hip straight up, ankle at (sinθ, cosθ) gives interior angle θ. ---
const kneeFrame = (deg) => {
  const r = (deg * Math.PI) / 180;
  const wl = [];
  wl[23] = P(0, 1, 0);                       // hip (up from knee)
  wl[25] = P(0, 0, 0);                        // knee (vertex)
  wl[27] = P(Math.sin(r), Math.cos(r), 0);   // ankle
  return wl;
};
const degs = [160, 160, 160, 160, 120, 120, 120, 120, 160, 160];
const frames = degs.map((d, i) => ({ t: i * 33, worldLandmarks: kneeFrame(d) }));
const jr = jointRomMetrics(frames);
const knee = jr && jr.find((j) => j.name === 'L KNE');
check('jointRomMetrics returns an L KNE entry', !!knee);
check('maxDeg ~160 (held extreme survives filter)', near(knee.maxDeg, 160, 3));
check('minDeg ~120 (held extreme survives filter)', near(knee.minDeg, 120, 3));
check('romDeg ~40', near(knee.romDeg, 40, 4));
check('robust hiDeg present and <= maxDeg', typeof knee.hiDeg === 'number' && knee.hiDeg <= knee.maxDeg);
check('robust loDeg present and >= minDeg', typeof knee.loDeg === 'number' && knee.loDeg >= knee.minDeg);
check('too few frames -> null', jointRomMetrics([{ t: 0, worldLandmarks: kneeFrame(150) }]) === null);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
