// Fixtures for the two foundational Lineage primitives everything else rests on:
//   e1RM   — Epley estimated 1RM (load * (1 + reps/30)); the "e#" the coach reads.
//   topSet — the top set of an exercise instance (max load, ties by reps).
// A regression here silently corrupts every strength trend / verdict downstream,
// so pin the formula + the guard rails (bodyweight/0-load, >12-rep suppression).
// Run: node scripts/verify-lineage-core.mjs
import { e1RM, topSet, perLiftSeries } from '../src/lineageAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const near = (a, b, t = 0.01) => a != null && Math.abs(a - b) <= t;

// ── e1RM (Epley) ──
check('e1RM(100,1) = 103.33', near(e1RM(100, 1), 103.333));
check('e1RM(100,5) = 116.67', near(e1RM(100, 5), 116.667));
check('e1RM(100,10) = 133.33', near(e1RM(100, 10), 133.333));
check('e1RM(100,12) = 140 (boundary kept)', near(e1RM(100, 12), 140));
check('e1RM(100,13) -> null (>12 reps: suppress false precision)', e1RM(100, 13) === null);
check('e1RM(100,0) -> null (reps <1)', e1RM(100, 0) === null);
check('e1RM(0,5) -> null (bodyweight/0-load not a strength point)', e1RM(0, 5) === null);
check('e1RM(-50,5) -> null (non-positive load)', e1RM(-50, 5) === null);
check('e1RM(null,5) / e1RM(100,null) -> null', e1RM(null, 5) === null && e1RM(100, null) === null);
check('e1RM("100","5") -> null (non-numeric rejected)', e1RM('100', '5') === null);

// ── topSet ──
check('topSet picks max load', topSet([{ load: 100, reps: 5 }, { load: 120, reps: 3 }]).load === 120);
check('topSet ties broken by reps', topSet([{ load: 100, reps: 5 }, { load: 100, reps: 8 }]).reps === 8);
check('topSet ignores null-load sets', topSet([{ load: null, reps: 5 }, { load: 80, reps: 5 }]).load === 80);
check('topSet of empty -> null', topSet([]) === null);
check('topSet of null -> null', topSet(null) === null);

// ── perLiftSeries — the chronological assembler every trend function consumes ──
// Sessions deliberately OUT of date order to prove it sorts.
const sessions = [
  { date: '2026-05-15', exercises: [{ title: 'Back Squat', sets: [{ load: 110, reps: 5 }, { load: 100, reps: 5 }] }] },
  { date: '2026-05-01', exercises: [{ title: 'Back Squat', sets: [{ load: 100, reps: 5 }] }, { title: 'Bench Press', sets: [{ load: 80, reps: 5 }] }] },
  { date: '2026-05-08', exercises: [{ title: 'Back Squat', sets: [{ load: 105, reps: 5 }] }] },
];
const map = perLiftSeries(sessions);
const sq = map.get('Back Squat');
check('perLiftSeries: groups per lift (Squat + Bench)', map.has('Back Squat') && map.has('Bench Press'));
check('perLiftSeries: Squat has 3 chronological points', sq.length === 3);
check('perLiftSeries: sorted by date (100/105/110)', sq[0].load === 100 && sq[1].load === 105 && sq[2].load === 110);
check('perLiftSeries: picks the TOP set per session (110, not 100)', sq[2].load === 110);
check('perLiftSeries: computes e1 (Epley) on each point', near(sq[0].e1, e1RM(100, 5)));
// exercises with no usable top set are skipped
const skip = perLiftSeries([{ date: '2026-05-01', exercises: [{ title: 'X', sets: [{ reps: 5 }] }] }]);
check('perLiftSeries: lift with no valid load -> not in the map', !skip.has('X'));

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
