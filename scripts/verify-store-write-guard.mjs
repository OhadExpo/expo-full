// Replays the 2026-08-27 library wipe against the guard that now exists.
// If this file ever goes red, one click can delete the exercise library again.
import { checkStoreWrite, BLOCK_UNLOADED, BLOCK_SHRINK } from '../src/storeWriteGuard.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } };

// ---- THE INCIDENT ---------------------------------------------------------
// The picker ran setExercises(prev => [...prev, one]) while the library had not
// loaded, so `prev` was [] and the write was a ONE-ITEM array over 1,326 rows.
const incident = checkStoreWrite({ value: [{ title: 'DB Lunge VERt jump' }], serverLoaded: false, serverLen: null });
ok('the exact incident write is blocked', incident.ok === false);
ok('blocked for the right reason', incident.reason === BLOCK_UNLOADED);
ok('the message tells the coach what to do', /reload/i.test(incident.message || ''));

// The second click, once the server length WAS known, must also be refused.
const second = checkStoreWrite({ value: [{}, {}], serverLoaded: true, serverLen: 1326 });
ok('a 2-row write over 1326 is blocked', second.ok === false);
ok('blocked as a shrink', second.reason === BLOCK_SHRINK);
ok('the message names the damage', /1324 of 1326/.test(second.message || ''));

// ---- NORMAL WORK MUST STILL SAVE -----------------------------------------
const big = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
ok('adding one exercise saves', checkStoreWrite({ value: big(1327), serverLoaded: true, serverLen: 1326 }).ok);
ok('editing in place saves', checkStoreWrite({ value: big(1326), serverLoaded: true, serverLen: 1326 }).ok);
ok('deleting one saves', checkStoreWrite({ value: big(1325), serverLoaded: true, serverLen: 1326 }).ok);
// The Cleanup screen is a coach-deletes-trash surface: a big but legitimate
// purge must NOT be blocked. 150 junk rows off 1,326 stays far above the floor.
ok('a 150-row cleanup purge still saves', checkStoreWrite({ value: big(1176), serverLoaded: true, serverLen: 1326 }).ok);
// Exactly at the floor (half, rounded up) is allowed; one below is not.
ok('exactly half is allowed', checkStoreWrite({ value: big(663), serverLoaded: true, serverLen: 1326 }).ok);
ok('below half is blocked', checkStoreWrite({ value: big(662), serverLoaded: true, serverLen: 1326 }).ok === false);

// ---- SMALL AND NON-ARRAY STORES ------------------------------------------
// A short list may legitimately be cleared — the shrink rule needs a baseline.
ok('clearing a 10-row store is allowed', checkStoreWrite({ value: [], serverLoaded: true, serverLen: 10 }).ok);
ok('clearing a 1326-row store is blocked', checkStoreWrite({ value: [], serverLoaded: true, serverLen: 1326 }).ok === false);
// Config blobs are replaced wholesale by design.
ok('a non-array store is untouched by the guard', checkStoreWrite({ value: { a: 1 }, serverLoaded: false, serverLen: null }).ok);
// A key with no server row yet must still be writable, or nothing new is creatable.
ok('a brand-new empty key can be written', checkStoreWrite({ value: big(3), serverLoaded: true, serverLen: 0 }).ok);

console.log(fail === 0
  ? `store write guard: ${pass} assertions green — the 2026-08-27 wipe is blocked`
  : `store write guard: ${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
