// verify-notes-merge.mjs - a form video's review notes are MERGED three-way by id
// (4.10 #524 audit, HIGH: the save replaced the whole array, so the athlete's reply
// deleted the coach's newer note and vice versa). Pure: storeMerge.mergeStoreValues,
// the function updateFormVideos and its offline handler call per slot.
import { mergeStoreValues } from '../src/storeMerge.js';
let pass = 0, fail = 0;
const ok = (m, c, got) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '  got ' + JSON.stringify(got)); } };
const n = (id, text, replies = []) => ({ id, text, author: 'trainer', replies });
const r = (id, text, author = 'client') => ({ id, text, author });
const ids = (arr) => (arr || []).map((x) => x.id).join(',');

// 1. the athlete replies on a stale screen; the coach added a note meanwhile
let out = mergeStoreValues([n('n1', 'knees out')], [n('n1', 'knees out', [r('r1', 'got it')])], [n('n1', 'knees out'), n('n2', 'brace first')]);
ok("the athlete's reply lands AND the coach's newer note survives", ids(out) === 'n1,n2' && ids(out[0].replies) === 'r1', out);
// 2. the coach deletes a note on a stale screen; the athlete's reply on ANOTHER note arrived meanwhile
out = mergeStoreValues([n('n1', 'a'), n('n2', 'b')], [n('n1', 'a')], [n('n1', 'a', [r('r9', 'ok')]), n('n2', 'b')]);
ok("the coach's deletion applies and the athlete's reply on n1 survives", ids(out) === 'n1' && ids(out[0].replies) === 'r9', out);
// 3. the coach edits his note's text; the athlete replied to it meanwhile
out = mergeStoreValues([n('n1', 'old')], [n('n1', 'new')], [n('n1', 'old', [r('r2', 'q?')])]);
ok('the edit and the reply both stand', out[0].text === 'new' && ids(out[0].replies) === 'r2', out);
// 4. both sides add a note at once
out = mergeStoreValues([], [n('a1', 'mine')], [n('s1', 'theirs')]);
ok('two new notes from two screens - both kept', ids(out).split(',').sort().join(',') === 'a1,s1', out);
// 5. TWO QUICK EDITS (review of #524): stroke s2 is saved while s1's save is still
// out; the server read for s2 does not have s1 yet. The base must be what the
// server CONFIRMED ([]), not the screen's optimistic copy ([s1]).
const s1 = { t: 1.2, path: 'M0 0L1 1' }, s2 = { t: 1.2, path: 'M2 2L3 3' };
out = mergeStoreValues([s1], [s1, s2], []);
ok('BREAK PROOF: the old base (optimistic [s1]) drops s1', JSON.stringify(out) === JSON.stringify([s2]), out);
out = mergeStoreValues([], [s1, s2], []);
ok('the confirmed base keeps both strokes', out.length === 2, out);
// ...and when s1's save lands first, the serialized second write reads it back
out = mergeStoreValues([s1], [s1, s2], [s1]);
ok('serialized: s1 confirmed, then s2 - both kept, no duplicate', out.length === 2, out);
// 6. A SAVE QUEUED BEFORE THIS SCREEN LOADED (offline edit, reload): the screen's
// own save folds into it instead of replacing it - mine onto the queued value,
// base = what this screen loaded from the server.
const serverAtLoad = { a: 1, b: 1 }, queuedValue = { a: 2, b: 1 }, screenValue = { a: 1, b: 3 };
out = mergeStoreValues(serverAtLoad, screenValue, queuedValue);
ok("the earlier offline edit (a=2) and this screen’s edit (b=3) both survive", out.a === 2 && out.b === 3, out);
console.log(`NOTES MERGE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
