// Regression suite for copying plan days to another athlete.
//
// The bug this pins: a program copied from one athlete to another arrived with
// every exercise intact and ZERO videos on the receiving athlete's seat. The
// rows never stored a video — they resolved it from the exercise library, which
// an athlete (and a BHBC club coach) cannot read. A plain spread carried the
// exerciseId and nothing the athlete could actually use.
import { cloneDayForCopy, cloneExerciseForCopy, libVideoFor } from '../src/planCopy.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};

// Shaped like the REAL library: entries carry `title` and `videoLink`. The
// first version of this fixture used `name`, which let a bug through — the
// code read `.name` too, and the live library has none.
const LIB = [
  { id: 'e10', title: 'BB Lunge', videoLink: 'https://youtu.be/lunge' },
  { id: 'e42', title: 'DB Goblet Squat', video: 'https://youtu.be/goblet' },
  { id: 'ex_novid', title: 'Depth Landing', videoLink: '' },
  { id: 'ex_named', title: 'Pogo Jump', videoLink: 'https://youtu.be/pogo' },
  { id: 'ex_alias', name: 'Legacy Alias Only', videoLink: 'https://youtu.be/alias' },
];
let n = 0;
const newId = () => `id${++n}`;

console.log('PLAN COPY\n');

// ── the actual bug ─────────────────────────────────────────────────────────
{
  // The real shape of the broken copy: normalised rows, valid exerciseId,
  // videoUrl absent because it was inheriting from the library.
  const day = { id: 'd1', name: 'Day A', exercises: [
    { id: 'a', exerciseId: 'e10', title: 'BB Lunge', sets: 3 },
    { id: 'b', exerciseId: 'e42', title: 'DB Goblet Squat', sets: 4 },
  ] };
  const out = cloneDayForCopy(day, LIB, newId);
  eq('the copy carries the library video (videoLink)', out.exercises[0].videoUrl, 'https://youtu.be/lunge');
  eq('and the library video stored as `video`', out.exercises[1].videoUrl, 'https://youtu.be/goblet');
  eq('sets survive', out.exercises[1].sets, 4);
  eq('the day gets a fresh id', out.id !== 'd1', true);
  eq('each row gets a fresh id', out.exercises[0].id !== 'a', true);
}

// ── the OLD compact shape — the one that actually broke ────────────────────
{
  // Omer's Block #1 is this shape: eid/s/r, no video field at all.
  const day = { id: 'd9', n: 'Day A', ex: [
    { eid: 'e10', s: 3, r: '8' },
    { eid: 'ex_named', s: 4, r: '6' },
  ] };
  const out = cloneDayForCopy(day, LIB, newId);
  eq('compact rows are cloned, not dropped', out.exercises.length, 2);
  eq('compact rows get the library video', out.exercises[0].videoUrl, 'https://youtu.be/lunge');
  eq('and the library NAME, since the athlete cannot look it up', out.exercises[1].title, 'Pogo Jump');
  eq('the compact `ex` key is removed', 'ex' in out, false);
  eq('the day keeps its other fields', out.n, 'Day A');
}

// ── the 3-state videoUrl contract must survive ─────────────────────────────
{
  const day = { exercises: [
    { exerciseId: 'e10', videoUrl: '' },                                  // deliberate: no video here
    { exerciseId: 'e10', videoUrl: 'https://youtu.be/override' },         // per-row override
    { exerciseId: 'e10' },                                                // inherits
  ] };
  const out = cloneDayForCopy(day, LIB, newId);
  eq('an explicit blank is NEVER refilled', out.exercises[0].videoUrl, '');
  eq('a per-row override is untouched', out.exercises[1].videoUrl, 'https://youtu.be/override');
  eq('an inheriting row is filled', out.exercises[2].videoUrl, 'https://youtu.be/lunge');
}

// ── refusing to invent ─────────────────────────────────────────────────────
{
  const day = { exercises: [
    { exerciseId: 'ex_novid', title: 'Depth Landing' },   // library entry has no video
    { exerciseId: 'ex_missing', title: 'Ghost' },          // not in the library at all
    { title: 'Freehand row' },                             // no exerciseId
  ] };
  const out = cloneDayForCopy(day, LIB, newId);
  eq('no video in the library → none invented', out.exercises[0].videoUrl, undefined);
  eq('exercise not in the library → none invented', out.exercises[1].videoUrl, undefined);
  eq('no exerciseId → none invented', out.exercises[2].videoUrl, undefined);
  eq('a freehand title is left alone', out.exercises[2].title, 'Freehand row');
}

// ── edges ──────────────────────────────────────────────────────────────────
eq('an empty day survives', cloneDayForCopy({ exercises: [] }, LIB, newId).exercises, []);
eq('a day with neither shape survives', cloneDayForCopy({}, LIB, newId).exercises, []);
eq('no library → nothing invented', cloneExerciseForCopy({ exerciseId: 'e10' }, [], newId).videoUrl, undefined);
eq('lookup by the compact eid works', libVideoFor({ eid: 'e10' }, LIB), 'https://youtu.be/lunge');
// The live library keys the name as `title`; `name` is only a fixture alias.
eq('the title comes from the library `title` field',
   cloneExerciseForCopy({ exerciseId: 'ex_named' }, LIB, newId).title, 'Pogo Jump');
eq('a legacy `name` entry still resolves',
   cloneExerciseForCopy({ exerciseId: 'ex_alias' }, LIB, newId).title, 'Legacy Alias Only');
{
  // An empty d.exercises must not shadow a populated d.ex — the hybrid state
  // that has destroyed day content before ([[plan_dual_shape]]).
  const out = cloneDayForCopy({ exercises: [], ex: [{ eid: 'e10' }] }, LIB, newId);
  eq('a populated compact array wins over an empty trainer array', out.exercises.length, 1);
}

console.log(`\nPLAN COPY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
