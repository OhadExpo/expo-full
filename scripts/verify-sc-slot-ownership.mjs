// A LOG S&C SESSION SAVE REPLACES ITS OWN ROWS AND NOTHING ELSE.
//
// Found in the 26.9 hand review of the BHBC rebuild. The re-save filter was
// `r.team && r.start === start`, and the live store holds 174 legacy
// `Practice` rows with team:true and a `start` — so re-logging S&C on an old
// slot deleted the squad's court rows for it. And a day with no fixture saves
// with start '', where the filter owned nothing, so every re-save appended a
// duplicate row per athlete.
//
// This imports the REAL predicate (src/bhbcSession.js) — a copy of the logic
// here would keep passing after the app's version drifted.
import { rowKind, ownsScRow } from '../src/bhbcSession.js';

let bad = 0;
const check = (name, ok, got) => {
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(got)}`}`);
};

// 1. Every row shape in expo-bhbc-loads on 26.9 (counted by kind/type/team/start),
//    plus the shapes the 24.9 model writes. [row, start, should the save own it]
const S = '18:00';
const shapes = [
  ['legacy Conditioning, team, same start (230 live)', { type: 'Conditioning', team: true, start: S, min: 10 }, S, true],
  ['legacy Practice, team, same start (174 live)', { type: 'Practice', team: true, start: S, min: 0 }, S, false],
  ['legacy Lift, no team, start (60 live)', { type: 'Lift', start: S, min: 45 }, S, false],
  ['legacy Conditioning, team, no start (30 live)', { type: 'Conditioning', team: true, min: 8 }, S, false],
  ['legacy Lift, team:true, same start (29 live)', { type: 'Lift', team: true, start: S, min: 30 }, S, true],
  ['legacy Lift, team:false, start (23 live)', { type: 'Lift', team: false, start: S, min: 40 }, S, false],
  ['legacy Game, no start (18 live)', { type: 'Game', min: 22 }, S, false],
  ['new sc row, same start', { kind: 'sc', type: 'Conditioning', team: true, start: S, min: 10 }, S, true],
  ['new sc row, other slot', { kind: 'sc', type: 'Conditioning', team: true, start: '10:00', min: 10 }, S, false],
  ['new lift row', { kind: 'lift', type: 'Lift', team: false, min: 50 }, S, false],
  // no fixture that day: start ''
  ['no fixture: new sc row, no start', { kind: 'sc', type: 'Conditioning', team: true, start: '', min: 10 }, '', true],
  ['no fixture: legacy Conditioning, no start', { type: 'Conditioning', team: true, min: 8 }, '', false],
  ['no fixture: legacy Lift team, no start', { type: 'Lift', team: true, min: 30 }, '', false],
  ['no fixture: new sc row of a real slot', { kind: 'sc', type: 'Conditioning', team: true, start: S, min: 10 }, '', false],
  ['no fixture: new lift', { kind: 'lift', type: 'Lift', team: false, min: 50 }, '', false],
];
for (const [name, row, start, want] of shapes) check(`owns? ${name} = ${want}`, ownsScRow(row, start) === want, ownsScRow(row, start));

// 2. The replace step exactly as saveScSession runs it, twice over one day.
const resave = (dayRows, start, min) => {
  const mine = dayRows.filter((r) => ownsScRow(r, start));
  return [...dayRows.filter((r) => !mine.includes(r)), { kind: 'sc', type: 'Conditioning', min, team: true, start, attended: true }];
};
{
  const legacy = [{ type: 'Practice', team: true, start: S, min: 0 }, { type: 'Conditioning', team: true, start: S, min: 10 }];
  const once = resave(legacy, S, 12);
  const twice = resave(once, S, 15);
  check('old slot re-logged: the legacy Practice row survives', twice.some((r) => r.type === 'Practice'), twice);
  check('old slot re-logged: exactly one S&C row, the latest', twice.filter((r) => ownsScRow(r, S)).length === 1 && twice.find((r) => ownsScRow(r, S)).min === 15, twice);
}
{
  const legacy = [{ type: 'Conditioning', team: true, min: 8 }];
  const twice = resave(resave(legacy, '', 10), '', 12);
  check('no-fixture day saved twice: one new S&C row, not two', twice.filter((r) => r.kind === 'sc').length === 1, twice);
  check('no-fixture day saved twice: the legacy row survives', twice.some((r) => !r.kind && r.min === 8), twice);
}

// 3. rowKind still reads the legacy shapes the way BhbcView documents them.
check('rowKind legacy Practice = practice', rowKind({ type: 'Practice', team: true }) === 'practice');
check('rowKind legacy team Lift = sc', rowKind({ type: 'Lift', team: true }) === 'sc');
check('rowKind untyped, no team = lift', rowKind({ min: 30 }) === 'lift');

console.log(`\nS&C SLOT-OWNERSHIP GATE — ${shapes.length} row shapes + 4 re-save cases + 3 readings, ${bad} failing`);
process.exit(bad ? 1 : 0);
