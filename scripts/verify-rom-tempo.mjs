// Fixtures for romTempoMetrics (src/poseLab.js) — the per-rep ROM + tempo
// (eccentric / pause / concentric seconds) the coach reads in the Analysis ROM
// table. Reviewed (#85) but had no standalone fixtures. Reads the joint-angle
// series + frame timestamps directly (no scale), so construction is exact.
// Pins: ROM = peak-to-bottom degrees, tempo-phase timing, the collapsed-rep
// flag (rom < 85% of the set's max), and honest handling of unreadable angles.
// Run: node scripts/verify-rom-tempo.mjs
import { romTempoMetrics } from '../src/poseLab.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const frames = (n) => Array.from({ length: n }, (_, i) => ({ t: i * 100 })); // 100 ms/frame

// One knee rep: 170° (top) -> 90° (bottom, held 3 frames) -> 170° (lockout).
const a1 = [170, 140, 110, 90, 90, 90, 110, 140, 170];
const one = romTempoMetrics(frames(9), a1, [{ startIdx: 0, bottomIdx: 4, endIdx: 8 }]);
check('ROM = peak - bottom (170-90 = 80°)', one.perRep[0].rom === 80);
check('eccentric phase = top->pause-start (0.3s)', one.perRep[0].ecc === 0.3);
check('pause = dwell within 4° of bottom (0.2s)', one.perRep[0].pause === 0.2);
check('concentric phase = pause-end->lockout (0.3s)', one.perRep[0].con === 0.3);
check('single rep -> romPct 100, not collapsed', one.perRep[0].romPct === 100 && one.perRep[0].collapsed === false);
check('maxRom = 80', one.maxRom === 80);

// Two reps, the 2nd shallower (rom 60 < 85% of 80) -> flagged collapsed.
const a2 = [170, 140, 110, 90, 90, 90, 110, 140, 170, 170, 150, 130, 110, 110, 110, 130, 150, 170];
const two = romTempoMetrics(frames(18), a2, [{ startIdx: 0, bottomIdx: 4, endIdx: 8 }, { startIdx: 9, bottomIdx: 13, endIdx: 17 }]);
check('shallow 2nd rep -> rom 60, romPct 75', two.perRep[1].rom === 60 && two.perRep[1].romPct === 75);
check('shallow rep flagged collapsed (rom < 85% of max)', two.perRep[1].collapsed === true && two.collapsedCount === 1);
check('deep rep NOT collapsed', two.perRep[0].collapsed === false);

// Unreadable angles (all NaN) -> that rep is null (honest), never a fake 0° ROM.
const nan = romTempoMetrics(frames(9), new Array(9).fill(NaN), [{ startIdx: 0, bottomIdx: 4, endIdx: 8 }]);
check('all-NaN angle -> rep null (honest, no fabricated ROM)', nan.perRep[0] === null && nan.collapsedCount === 0);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
