// Audit #70: editing or deleting a BHBC session addresses it by its INDEX, and
// an index goes stale the moment the array changes. The fix is a fingerprint —
// the row the coach was looking at — checked before the write lands.
//
// These are the cases that matter: the fingerprint must SURVIVE an unrelated
// change elsewhere in the list (or every legitimate edit gets refused) and must
// FAIL when the entry at that index is a different session (or the bug is back).
import { sessionSig } from '../src/bhbcSession.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (ok) pass++; else { fail++; console.log(`  x ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};

console.log('SESSION FINGERPRINT (audit #70)\n');

const A = { type: 'Practice', min: 90, rpe: 7, load: 630, start: '17:00' };
const B = { type: 'Practice', min: 60, rpe: 5, load: 300, start: '18:00' };
const C = { type: 'Game', min: 32, rpe: 9, load: 288, start: '20:00' };

eq('a session fingerprints the same twice', sessionSig(A), sessionSig({ ...A }));
eq('two different sessions do not collide', sessionSig(A) === sessionSig(B), false);
eq('nothing fingerprints to empty', sessionSig(null), '');
eq('undefined too', sessionSig(undefined), '');

{
  // THE BUG. Three sessions; the coach opens the edit on the third (idx 2) and
  // then deletes the first. Index 2 now holds nothing, and index 1 holds what
  // used to be the third — a write aimed at idx 2 must not land.
  const before = [A, B, C];
  const sigOpened = sessionSig(before[2]);
  const after = before.slice(1);            // the first was deleted
  eq('the row it aimed at is gone', sessionSig(after[2]), '');
  eq('and the guard refuses', sessionSig(after[2]) === sigOpened, false);
  eq('the session did survive, at a new index', sessionSig(after[1]), sigOpened);
}
{
  // The double-click case: delete idx 0 twice. The second fire carries the
  // fingerprint of the row that was rendered, which is no longer at idx 0.
  const before = [A, B, C];
  const sigClicked = sessionSig(before[0]);
  const after = before.slice(1);
  eq('the second delete does not match the shifted entry', sessionSig(after[0]) === sigClicked, false);
}
{
  // And the case that must still WORK: another date's list changed, or a later
  // session was appended. The row the coach is editing has not moved.
  const before = [A, B];
  const after = [A, B, C];                  // a session was added after it
  eq('an unrelated append does not refuse the edit', sessionSig(after[1]), sessionSig(before[1]));
}
{
  // A zero-load gym attendance row: no rpe, no type. It must still fingerprint
  // distinctly from another attendance row on a different clock time.
  const g1 = { min: 45, load: 0, start: '07:00' };
  const g2 = { min: 45, load: 0, start: '19:00' };
  eq('attendance rows are distinguishable', sessionSig(g1) === sessionSig(g2), false);
}

console.log(`\nSESSION FINGERPRINT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
