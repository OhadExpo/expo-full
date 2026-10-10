// verify-block-ending.mjs - the "block is ending" list (5.10 #565). Pure, no network.
// BREAK=1 swaps in a rule that ignores a newer block - must FAIL.
import { blockEndingRows as real } from '../src/blockEnding.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const blockEndingRows = process.env.BREAK
  ? (ctx) => real({ ...ctx, plans: (ctx.plans || []).filter((p) => p.id !== 'p_b2') })
  : real;

const trainees = [
  { id: 'tr_a', name: 'Avi', status: 'Active' },
  { id: 'tr_b', name: 'Bat', status: 'Active' },
  { id: 'tr_c', name: 'Cal', status: 'Active' },
  { id: 'tr_d', name: 'Dov', status: 'Paused' },
  { id: 'tr_e', name: 'Eli & Noa', status: 'Active' },
];
const days = [{ name: 'Day A' }, { name: 'Day B' }];
const plans = [
  { id: 'p_a', name: 'Block #3', traineeId: 'tr_a', weeks: 4, days, createdAt: '2026-09-01' },
  { id: 'p_b1', name: 'Block #5', traineeId: 'tr_b', weeks: 4, days, createdAt: '2026-08-01' },
  { id: 'p_b2', name: 'Block #6', traineeId: 'tr_b', weeks: 4, days, createdAt: '2026-10-01' },   // already written
  { id: 'p_c', name: 'Block #2', traineeId: 'tr_c', weeks: 4, days, createdAt: '2026-09-10' },
  { id: 'p_d', name: 'Block #1', traineeId: 'tr_d', weeks: 4, days, createdAt: '2026-09-10' },
  { id: 'p_e', name: 'Block #9', traineeId: 'tr_e', weeks: 3, days, createdAt: '2026-09-15' },
];
const ex = (load, reps) => [{ eid: 'ex_sq', title: 'Back Squat', sets: [{ load, reps, done: true }, { load: load - 10, reps, done: true }] }];
const W = (clientId, planName, week, dayName, date, exercises = []) => ({ clientId, planName, week, dayName, date, exercises });
const workouts = [
  // Avi: weeks 1-3 complete except one day, now in week 4 -> ending, 7/8
  W('tr_a', 'Block #3', 1, 'Day A', '2026-09-02', ex(100, 5)), W('tr_a', 'Block #3', 1, 'Day B', '2026-09-04', ex(100, 5)),
  W('tr_a', 'Block #3', 2, 'Day A', '2026-09-09', ex(105, 5)), W('tr_a', 'Block #3', 2, 'Day B', '2026-09-11', ex(105, 5)),
  W('tr_a', 'Block #3', 3, 'Day A', '2026-09-16', ex(110, 5)),
  W('tr_a', 'Block #3', 4, 'Day A', '2026-09-23', ex(115, 4)), W('tr_a', 'Block #3', 4, 'Day B', '2026-09-25', ex(112.5, 5)),
  // Bat: in week 4 of #5, but #6 is already written -> not listed
  W('tr_b', 'Block #5', 4, 'Day A', '2026-09-28'),
  // Cal: only week 2 -> not ending
  W('tr_c', 'Block #2', 2, 'Day B', '2026-09-20'),
  // Dov: paused -> never listed even in week 4
  W('tr_d', 'Block #1', 4, 'Day A', '2026-09-28'),
  // Eli & Noa (couple, logged under a member id): finished the last day of week 2 of 3 -> ending
  W('tr_e__1', 'Block #9', 2, 'Day B', '2026-09-30', ex(60, 8)),
];

const rows = blockEndingRows({ trainees, plans, workouts });
const by = Object.fromEntries(rows.map((r) => [r.traineeId, r]));
ok(rows.map((r) => r.traineeId).sort().join() === 'tr_a,tr_e', `listed = Avi + the couple (${rows.map((r) => r.traineeId)})`);
ok(!by.tr_b, 'Bat is not listed: the next block is already written');
ok(!by.tr_c && !by.tr_d, 'week 2 of 4 is not ending; a paused athlete is never listed');
ok(by.tr_a && by.tr_a.logged === 7 && by.tr_a.planned === 8 && by.tr_a.pct === 88, `Avi: 7 of 8 logged, 88% (${by.tr_a && `${by.tr_a.logged}/${by.tr_a.planned} ${by.tr_a.pct}%`})`);
ok(by.tr_a && by.tr_a.week === 4 && by.tr_a.weeks === 4, 'Avi: week 4 of 4');
ok(by.tr_a && by.tr_a.best && by.tr_a.best.load === 115 && by.tr_a.best.reps === 4 && by.tr_a.best.from === 100, `Avi: best Back Squat 115x4, from 100 (${JSON.stringify(by.tr_a && by.tr_a.best)})`);
ok(by.tr_e && by.tr_e.logged === 1 && by.tr_e.planned === 6, 'the couple: a member-id log counts for the family, 1 of 6');
ok(rows[0].traineeId === 'tr_e', 'lowest completion first');
ok(blockEndingRows({ trainees, plans, workouts: [] }).length === 0, 'nothing logged -> nobody listed (blank > wrong)');

console.log(`BLOCK ENDING: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
