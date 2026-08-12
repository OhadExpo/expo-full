// End-to-end fixtures for analyzeClip — the top-level camera pipeline every
// reviewed clip runs through (channel detection -> rep segmentation -> velocity
// -> ROM/tempo -> per-joint ROM). The coach acts on the rep count, bar velocity,
// and ROM it returns. Driven by the demo's realistic synthetic squat frames.
// Run: node scripts/verify-analyze-clip.mjs
import { analyzeClip } from '../src/poseLab.js';
import { demoSquatFrames } from '../src/demoMotion.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

const r = analyzeClip(demoSquatFrames(3, 20, 2), 'Back Squat');
check('analyzeClip ok on a squat', r && r.ok === true);
check('picks the knee channel for a squat', r && r.kind === 'knee');
check('counts 3 reps from 3 demo reps', r && r.repCount === 3);

// velocity — one entry per rep, physically ordered (peak >= mean > 0)
const v = r && r.velocity;
check('velocity: one perRep entry per rep', v && v.perRep.length === 3);
check('velocity: mean concentric > 0', v && v.perRep.every((p) => p.meanConcentric > 0));
check('velocity: peak >= mean (peak is the fastest instant)', v && v.perRep.every((p) => p.peak >= p.meanConcentric));
check('velocity: identical demo reps -> ~0% velocity loss', v && Math.abs(v.finalLossPct) <= 5);

// ROM / tempo — a full-depth squat is a big knee sweep
check('romTempo: 3 reps measured', r && r.romTempo && r.romTempo.perRep.length === 3);
check('romTempo: maxRom in a squat range (90–130°)', r && r.romTempo.maxRom >= 90 && r.romTempo.maxRom <= 130);

// joint ROM — the demo squat is symmetric, so L and R knee ROM should match closely
const kn = (r.jointRom || []).filter((j) => /KNE/.test(j.name));
check('jointRom: both knees measured', kn.length === 2);
check('jointRom: L/R knee ROM symmetric (within 5°)', kn.length === 2 && Math.abs(kn[0].romDeg - kn[1].romDeg) <= 5);

// rep-count robustness across different rep totals
check('counts 2 reps', analyzeClip(demoSquatFrames(2, 20, 2), 'Back Squat').repCount === 2);
check('counts 5 reps', analyzeClip(demoSquatFrames(5, 20, 2), 'Back Squat').repCount === 5);

// a hold/isometric title must NOT invent reps
const plank = analyzeClip(demoSquatFrames(3, 20, 2), 'Front Plank');
check('plank title -> no rep counting (0 reps or no-count kind)', plank && (plank.repCount === 0 || plank.kind === 'none'));

// Degenerate input (a bad clip where MediaPipe found nothing) must return an
// honest thin result, never throw — the coach films a clip in poor light and
// the Analysis card should say "couldn't read it", not crash the page.
for (const [label, frames] of [['empty []', []], ['null', null], ['one junk frame', [{ t: 0, landmarks: [], worldLandmarks: [] }]]]) {
  let r, threw = false;
  try { r = analyzeClip(frames, 'Back Squat'); } catch { threw = true; }
  check(`analyzeClip(${label}) doesn't throw`, !threw);
  check(`analyzeClip(${label}) -> ok:false (honest thin state)`, !threw && r && r.ok === false);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
