// Fixtures for two supporting Lineage signals a coach reads:
//   rpeDrift  — autoregulation: is logged RPE drifting above the target zone
//               (creeping fatigue) or holding? Feeds the readiness read.
//   missRate  — adherence: % of top sets short of prescribed reps, per lift.
// Both are simple but coach-facing, so pin their thin gates + directions.
// Run: node scripts/verify-lineage-signals.mjs
import { rpeDrift, missRate, missRateByRegion, adherence, patternCoverage } from '../src/lineageAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// ── rpeDrift ──
check('rpeDrift: <2 logged RPE -> thin', rpeDrift([{ rpe: 8 }]).state === 'thin');
check('rpeDrift: null RPEs filtered, <2 real -> thin', rpeDrift([{ rpe: null }, { rpe: 8 }, { rpe: null }]).state === 'thin');
// no target: raw direction
const noTgtUp = rpeDrift([{ rpe: 7 }, { rpe: 8 }, { rpe: 9 }]);
check('rpeDrift no target: RPE 7->9 -> rising, delta 2', noTgtUp.hasTarget === false && noTgtUp.rising === true && noTgtUp.delta === 2);
check('rpeDrift no target: RPE 8->8 -> not rising, delta 0', rpeDrift([{ rpe: 8 }, { rpe: 8 }]).rising === false);
check('rpeDrift no target: +0.9 swing -> NOT rising (needs >=1)', rpeDrift([{ rpe: 8 }, { rpe: 8.9 }]).rising === false);
// with target: drift vs the prescribed RPE
const tgt = rpeDrift([{ rpe: 9 }, { rpe: 9.5 }, { rpe: 10 }], 8);
check('rpeDrift target 8, RPE 9/9.5/10 -> avgDrift 1.5', tgt.hasTarget === true && tgt.avgDrift === 1.5 && tgt.target === 8);
check('rpeDrift target 8, drift 1->2 -> rising (>=0.5)', tgt.rising === true);
check('rpeDrift target 8, RPE 9/9 flat -> avgDrift 1, not rising', (() => { const r = rpeDrift([{ rpe: 9 }, { rpe: 9 }], 8); return r.avgDrift === 1 && r.rising === false; })());

// ── missRate ──
const sessions = [{ exercises: [
  { title: 'Back Squat', sets: [{ reps: 5, prescribedReps: 5 }, { reps: 4, prescribedReps: 5 }, { reps: 3, prescribedReps: 5 }] },
  { title: 'Bench Press', sets: [{ reps: 8, prescribedReps: 8 }] },
] }];
check('missRate: no matching title -> thin', missRate(sessions, 'Deadlift').state === 'thin');
const sq = missRate(sessions, 'Back Squat');
check('missRate Squat: 2 of 3 short -> pct 67', sq.state === 'ok' && sq.short === 2 && sq.total === 3 && sq.pct === 67);
check('missRate Bench: hit prescribed -> 0%', missRate(sessions, 'Bench Press').pct === 0);
// a set with no reps logged is NOT counted (only attempted sets)
const withUnlogged = [{ exercises: [{ title: 'T', sets: [{ reps: 5, prescribedReps: 5 }, { reps: null, prescribedReps: 5 }] }] }];
check('missRate: reps-null set excluded from total', missRate(withUnlogged, 'T').total === 1);
// no prescribedReps -> can't be short
const noPrescribed = [{ exercises: [{ title: 'T', sets: [{ reps: 3 }, { reps: 2 }] }] }];
check('missRate: no prescribedReps -> 0 short', missRate(noPrescribed, 'T').short === 0);

// ── adherence (the gate: are sessions + sets actually getting done) ──
check('adherence: no sessions -> thin', adherence([], 5).state === 'thin');
const adh = adherence([{ exercises: [{ sets: [{ done: true }, { done: true }, { done: false }] }] }], null);
check('adherence: 2 of 3 sets done -> setsPct 67', adh.state === 'ok' && adh.setsDone === 2 && adh.setsPrescribed === 3 && adh.setsPct === 67);
check('adherence: no plan -> sessionPct null', adh.sessionPct === null);
const adh2 = adherence([{ exercises: [] }, { exercises: [] }], 4);
check('adherence: 2 of 4 planned sessions -> sessionPct 50', adh2.sessionPct === 50);

// ── patternCoverage (CLAUDE.md: every microcycle must cover the primary patterns) ──
const cov = patternCoverage([{ exercises: [
  { pattern: 'Squat', sets: [{ done: true }, { done: true }, { done: false }] },
  { pattern: 'Hip Hinge', sets: [{}] },
] }]);
check('patternCoverage: Squat counts only done sets (2, not 3)', cov.counts['Squat'] === 2);
check('patternCoverage: sets w/o done flag count (Hip Hinge 1)', cov.counts['Hip Hinge'] === 1);
check('patternCoverage: the 6 untouched patterns are gaps', cov.gaps.length === 6 && cov.gaps.includes('Vertical Push'));
check('patternCoverage: unclassified exercise -> unclassified tally', patternCoverage([{ exercises: [{ sets: [{ done: true }] }] }]).unclassified === 1);

// ── missRateByRegion (upper/lower grind split → feeds the deload verdict) ──
const region = missRateByRegion([{ exercises: [
  { title: 'Back Squat', sets: [{ reps: 5, prescribedReps: 5 }, { reps: 5, prescribedReps: 5 }, { reps: 4, prescribedReps: 5 }, { reps: 3, prescribedReps: 5 }, { reps: null, prescribedReps: 5 }] },
  { title: 'Bench Press', sets: [{ reps: 5, prescribedReps: 5 }, { reps: 4, prescribedReps: 5 }] },
] }]);
check('missRateByRegion: squat -> lower bucket, 2 of 4 short -> 50%', region.lower.total === 4 && region.lower.short === 2 && region.lower.pct === 50);
check('missRateByRegion: reps-null set excluded from lower total', region.lower.total === 4);
check('missRateByRegion: bench -> upper bucket', region.upper.short === 1);
check('missRateByRegion: H4 guard — upper total<4 -> pct null (no fabricated deload)', region.upper.pct === null);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
