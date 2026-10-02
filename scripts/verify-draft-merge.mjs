// verify-draft-merge.mjs - a resumed workout draft survives the coach
// reshaping the day (2.10 #510-B3). Pure, no network: it holds src/draftMerge.js,
// which StepLogger (ClientPortal) uses to rebuild a draft after the day changed.
//
// The incident it guards: athlete logs 4 exercises, the PWA is killed, the coach
// adds one set to one exercise, the athlete reopens - and every logged set was
// gone, because any shape mismatch rebuilt the sheet blank.
import { alignByEid, setRowUsed, fitRows } from '../src/draftMerge.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name} ${extra}`); } };
const row = (load, done = true) => ({ reps: '5', load: String(load), rpe: '', done });
const blank = () => ({ reps: '', load: '', rpe: '', done: false });

console.log('DRAFT MERGE\n');

// the draft: squat 3 sets, bench 3 sets, row 3 sets - all logged
const prevOrder = ['sq', 'bp', 'rw'];
const prevSets = [[row(100), row(100), row(100)], [row(80), row(80), row(80)], [row(60), row(60), row(60)]];

// 1. the coach adds a 4th set to bench: every logged set stays, bench gains a blank 4th
{
  const a = alignByEid(prevOrder, prevSets, ['sq', 'bp', 'rw']);
  const m = [fitRows(a[0], 3), fitRows(a[1], 4), fitRows(a[2], 3)];
  ok('set added: squat kept', m[0].every((r) => r.load === '100' && r.done));
  ok('set added: bench 4 rows, 3 logged', m[1].length === 4 && m[1].slice(0, 3).every((r) => r.load === '80') && !m[1][3].done);
  ok('set added: row kept', m[2].every((r) => r.load === '60'));
}
// 2. the coach swaps bench for incline: squat + row keep their own sets, the new one has none
{
  const a = alignByEid(prevOrder, prevSets, ['sq', 'inc', 'rw']);
  ok('swap: squat keeps 100s', a[0] && a[0][0].load === '100');
  ok('swap: incline gets nothing from bench', a[1] === undefined);
  ok('swap: row keeps 60s, not bench 80s', a[2] && a[2][0].load === '60');
}
// 3. the coach reorders: sets follow the exercise, never the position
{
  const a = alignByEid(prevOrder, prevSets, ['rw', 'sq', 'bp']);
  ok('reorder: row first carries 60', a[0][0].load === '60');
  ok('reorder: squat second carries 100', a[1][0].load === '100');
}
// 4. the coach cuts a set: a set he already logged is never dropped
{
  const m = fitRows(prevSets[0], 2);
  ok('set cut: the logged 3rd set survives', m.length === 3 && m[2].load === '100');
  const m2 = fitRows([row(100), row(100), blank()], 2);
  ok('set cut: an unused 3rd row goes', m2.length === 2);
}
// 5. an exercise listed twice keeps each occurrence's own rows
{
  const a = alignByEid(['sq', 'sq'], [[row(100)], [row(120)]], ['sq', 'sq']);
  ok('twice: first occurrence 100', a[0][0].load === '100');
  ok('twice: second occurrence 120', a[1][0].load === '120');
}
// 6. a prefilled, untouched top set is not "used"
ok('prefill untouched is not used', !setRowUsed({ reps: '5', load: '100', rpe: '', done: false, prefill: true }));
ok('typed load is used', setRowUsed({ reps: '', load: '40', rpe: '', done: false }));
ok('blank is not used', !setRowUsed(blank()));

// THE BREAK TEST: the old resume dropped the whole draft on any shape change.
// If someone reverts to it, case 1 measures 0 logged sets kept - prove the
// assertion above would have caught that.
{
  const oldResume = (prevRows, counts) => (prevRows.length === counts.length && prevRows.every((r, i) => r.length === counts[i]) ? prevRows : counts.map((c) => Array.from({ length: c }, blank)));
  const kept = oldResume(prevSets, [3, 4, 3]).flat().filter((r) => r.done).length;
  ok('break test: the old behaviour loses all 9 sets (so this gate can fail)', kept === 0, `kept=${kept}`);
}

console.log(`DRAFT MERGE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
