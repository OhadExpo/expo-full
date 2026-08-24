// Regression suite for traineeUtils — couple identity, the PostgREST-injection
// guard, and the canonical program sort.
//
// Couples are the single most bug-prone shape in this data model: one trainee
// ROW, two members, plans that must reference member ids and never the parent.
// Several standing rules and at least four audit findings turn on these
// functions, and none of them was asserted.
import {
  traineeIdsFor, subMemberId, parseTraineeId, memberIndexFromId, isSubMemberId,
  isSafeTraineeId, blockNum, sortProgramsChrono, emailsToArr, emailsToStore,
} from '../src/traineeUtils.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};

console.log('TRAINEE UTILS\n');

// ── couple identity ────────────────────────────────────────────────────────
eq('traineeIdsFor spans parent + both members', traineeIdsFor('tr_x'), ['tr_x', 'tr_x__0', 'tr_x__1']);
eq('subMemberId', subMemberId('tr_x', 1), 'tr_x__1');
eq('parse a member id', parseTraineeId('tr_x__1'), { parentId: 'tr_x', memberIdx: 1 });
eq('a solo id is not a member id', parseTraineeId('tr_x'), null);
eq('non-string', parseTraineeId(null), null);
eq('memberIndexFromId', memberIndexFromId('tr_x__0', 'tr_x'), 0);
eq('index 0 is not confused with "no match"', isSubMemberId('tr_x__0', 'tr_x'), true);
eq('a member of a DIFFERENT parent is not ours', memberIndexFromId('tr_y__0', 'tr_x'), null);

// The prefix trap that produced a live RLS leak (security audit 07-19): `_` is a
// LIKE wildcard, and `tr_yuval` must never be treated as a member of `tr_yu`.
eq('a shared PREFIX is not a member relationship', isSubMemberId('tr_yuval_gotlib', 'tr_yuval'), false);
eq('double underscore is required, not a single one', parseTraineeId('tr_x_1'), null);

// ── the injection guard ────────────────────────────────────────────────────
// Used before interpolating an id into a PostgREST filter string.
eq('ordinary id', isSafeTraineeId('tr_x__0'), true);
eq('rejects a comma (extra clause)', isSafeTraineeId('tr_x,or(1.eq.1)'), false);
eq('rejects parens', isSafeTraineeId('tr_x()'), false);
eq('rejects a percent (LIKE wildcard)', isSafeTraineeId('tr_%'), false);
eq('rejects a dot', isSafeTraineeId('tr.x'), false);
eq('rejects whitespace', isSafeTraineeId('tr x'), false);
eq('rejects empty', isSafeTraineeId(''), false);
eq('rejects a non-string', isSafeTraineeId(null), false);

// ── block numbering — Drive imports drop the # ─────────────────────────────
eq('#N', blockNum('Block #17'), 17);
eq('no hash', blockNum('Block 8 - High VOL/Conditioning'), 8);
eq('bare #N', blockNum('Push/Pull #4'), 4);
eq('phase', blockNum('Phase 3'), 3);
eq('unnumbered sorts last', blockNum('Morning Routine'), -Infinity);
eq('null-safe', blockNum(null), -Infinity);

// ── canonical program order (newest first) ─────────────────────────────────
{
  const names = [
    { name: 'Block #4', createdAt: '2026-01-01' },
    { name: 'Block #17', createdAt: '2026-01-01' },
    { name: 'Comeback — shoulder', createdAt: '2025-01-01' },
    { name: 'Block #16', createdAt: '2026-01-01' },
  ];
  const sorted = names.slice().sort(sortProgramsChrono).map((p) => p.name);
  eq('comeback floats above every numbered block', sorted[0], 'Comeback — shoulder');
  eq('then highest block number first', sorted.slice(1), ['Block #17', 'Block #16', 'Block #4']);
}

// ── the email field: string | string[] | null, editable as an array ────────
// The STORE format is deliberately asymmetric — one email is a bare string, many
// is an array — because the athlete lookup compares against it directly.
eq('a single stored email opens as one editable row', emailsToArr('a@x.com'), ['a@x.com']);
eq('an array is kept as-is', emailsToArr(['a@x.com', 'b@x.com']), ['a@x.com', 'b@x.com']);
eq('empty opens as ONE blank row, not zero (the UI needs an input)', emailsToArr(''), ['']);
eq('an empty array also yields one blank row', emailsToArr([]), ['']);
eq('one email collapses back to a bare STRING', emailsToStore(['a@x.com']), 'a@x.com');
eq('several collapse to an array', emailsToStore(['a@x.com', 'b@x.com']), ['a@x.com', 'b@x.com']);
eq('all-blank collapses to empty string', emailsToStore(['', null]), '');
eq('blanks are dropped and case is normalised', emailsToStore([' A@X.com ', '', null]), 'a@x.com');

console.log(`\nTRAINEE UTILS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
