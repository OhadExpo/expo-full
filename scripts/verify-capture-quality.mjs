// Fixtures for captureQuality (src/poseLab.js) — the clip-quality GATE the coach
// acts on: it grades how well the body was tracked and gates whether the camera
// numbers are trustworthy / whether auto-analysis runs. The dangerous direction
// is grading an UNMEASURABLE clip 'good' (coach trusts garbage). This was
// untested; pinning the KEY-joint coverage contract + the framing carve-out.
// Run: node scripts/verify-capture-quality.mjs
import { captureQuality } from '../src/poseLab.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// A frame with the given landmark indices present at visibility `vis` (rest null).
// vis === null → present WITHOUT a visibility field (some MediaPipe builds omit it).
const frame = (idxs, vis) => { const lm = new Array(33).fill(null); for (const i of idxs) lm[i] = (vis == null ? { x: 0, y: 0.5, z: 0 } : { x: 0, y: 0.5, z: 0, visibility: vis }); return { landmarks: lm }; };
const rep = (f, n) => Array.from({ length: n }, () => f);
const ALL = [11, 12, 13, 14, 23, 24, 25, 26, 27, 28];
const UPPER = [11, 12, 13, 14];   // shoulders + elbows
const LOWER = [23, 24, 25, 26, 27, 28]; // hips + knees + ankles

// ── degenerate ──
check('no frames -> poor', captureQuality(null, 'Back Squat').grade === 'poor');
check('empty frames -> poor', captureQuality([], 'Back Squat').grade === 'poor');

// ── well-tracked full body ──
check('full body, high vis -> good', captureQuality(rep(frame(ALL, 0.95), 12), 'Back Squat').grade === 'good');

// ── coverage / visibility bands ──
check('half the frames untracked (coverage 0.5) -> poor', captureQuality([...rep(frame(ALL, 0.95), 6), ...rep({ landmarks: null }, 6)], 'Back Squat').grade === 'poor');
check('full coverage but low vis (0.4) -> poor', captureQuality(rep(frame(ALL, 0.4), 12), 'Back Squat').grade === 'poor');
check('full coverage, mid vis (0.6) -> fair', captureQuality(rep(frame(ALL, 0.6), 12), 'Back Squat').grade === 'fair');

// ── THE BUG (adversarial self-review): a clip that frames out the MEASURED joints
//    must NOT read as covered off the other joints alone ──
check('squat with LEGS out of shot -> poor (was falsely "good")', captureQuality(rep(frame(UPPER, 0.95), 12), 'Back Squat').grade === 'poor');
check('bench with LEGS out of shot -> good (legs are not KEY for a press)', captureQuality(rep(frame(UPPER, 0.95), 12), 'Bench Press').grade === 'good');
check('bench with only the LEGS in shot -> poor (arms are KEY for a press)', captureQuality(rep(frame(LOWER, 0.95), 12), 'Bench Press').grade === 'poor');

// ── legit no-visibility-field build: KEY joints ARE present (real x/y), just no
//    visibility number → judged on coverage, still good (must not fall to poor) ──
const nv = captureQuality(rep(frame(ALL, null), 12), 'Back Squat');
check('KEY joints present but no visibility field -> meanVis null + good', nv.meanVis === null && nv.grade === 'good');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
