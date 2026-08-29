// verify-game-load.mjs — proves game minutes convert to load correctly, and in
// particular that saving the same game twice does NOT double a player's week.
//
//   node scripts/verify-game-load.mjs
import { applyGameMinutes, gameMinutesOf, gameRpeOf, priorGameLoad } from '../src/bhbcGameLoad.js';
import { sessionLoad } from '../src/acwrEngine.js';

let fails = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  PASS  ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fails++; }
};

const D = '2026-08-29';
const empty = () => ({ loads: {}, sessions: {}, readiness: {} });

console.log('first save');
let store = applyGameMinutes({}, { date: D, rpe: 8, minutes: { a1: 32, a2: 12, a3: 0 }, emptyRec: empty });
ok('a starter gets rpe x minutes', store.a1.loads[D] === sessionLoad(32, 8), String(store.a1.loads[D]));
ok('a bench player gets his own smaller load', store.a2.loads[D] === sessionLoad(12, 8), String(store.a2.loads[D]));
ok('a DNP gets no load entry at all', store.a3.loads[D] === undefined, JSON.stringify(store.a3.loads));
ok('the session is recorded as a Game', (store.a1.sessions[D] || [])[0].type === 'Game');

console.log('saving the same game twice');
const before = store.a1.loads[D];
store = applyGameMinutes(store, { date: D, rpe: 8, minutes: { a1: 32, a2: 12, a3: 0 }, emptyRec: empty });
ok('does NOT double the load', store.a1.loads[D] === before, `${before} -> ${store.a1.loads[D]}`);
ok('does not leave two Game sessions', (store.a1.sessions[D] || []).filter((s) => s.type === 'Game').length === 1);

console.log('correcting the minutes');
store = applyGameMinutes(store, { date: D, rpe: 8, minutes: { a1: 20 }, emptyRec: empty });
ok('replaces rather than adds', store.a1.loads[D] === sessionLoad(20, 8), String(store.a1.loads[D]));

console.log('a game does not erase the rest of the day');
let mixed = {
  b1: { loads: { [D]: 300 }, sessions: { [D]: [{ type: 'Lift', min: 60, rpe: 5, load: 300 }] }, readiness: {} },
};
mixed = applyGameMinutes(mixed, { date: D, rpe: 9, minutes: { b1: 25 }, emptyRec: empty });
ok('the morning lift survives', (mixed.b1.sessions[D] || []).some((s) => s.type === 'Lift'));
ok('the day totals lift + game', mixed.b1.loads[D] === 300 + sessionLoad(25, 9), String(mixed.b1.loads[D]));
mixed = applyGameMinutes(mixed, { date: D, rpe: 9, minutes: { b1: 0 }, emptyRec: empty });
ok('setting minutes to zero removes only the game', mixed.b1.loads[D] === 300, String(mixed.b1.loads[D]));
ok('and leaves the lift session', (mixed.b1.sessions[D] || []).length === 1);

console.log('reopening the editor');
ok('minutes come back', gameMinutesOf(store, D).a1 === 20, JSON.stringify(gameMinutesOf(store, D)));
ok('rpe comes back', gameRpeOf(store, D) === 8, String(gameRpeOf(store, D)));
ok('prior load is reported', priorGameLoad(store.a1, D) === sessionLoad(20, 8));

console.log('other days are untouched');
const other = applyGameMinutes({ c1: { loads: { '2026-08-01': 500 }, sessions: {}, readiness: {} } },
  { date: D, rpe: 7, minutes: { c1: 10 }, emptyRec: empty });
ok('an earlier date keeps its load', other.c1.loads['2026-08-01'] === 500);

console.log(fails ? `\n${fails} FAILED` : '\nall assertions passed');
process.exit(fails ? 1 : 0);
