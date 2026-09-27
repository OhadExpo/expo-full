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
// NO RPE, NO LOAD (Ohad 23.9): minutes are the fact; no load is ever derived.
ok('a starter keeps his minutes and no derived load', store.a1.sessions[D][0].min === 32 && store.a1.loads[D] === undefined, JSON.stringify(store.a1));
ok('a bench player keeps his own minutes', store.a2.sessions[D][0].min === 12, JSON.stringify(store.a2.sessions[D]));
ok('a DNP gets no load entry at all', store.a3.loads[D] === undefined, JSON.stringify(store.a3.loads));
ok('the session is recorded as a Game', (store.a1.sessions[D] || [])[0].type === 'Game');

console.log('saving the same game twice');
const before = store.a1.loads[D];
store = applyGameMinutes(store, { date: D, rpe: 8, minutes: { a1: 32, a2: 12, a3: 0 }, emptyRec: empty });
ok('does NOT double the load', store.a1.loads[D] === before, `${before} -> ${store.a1.loads[D]}`);
ok('does not leave two Game sessions', (store.a1.sessions[D] || []).filter((s) => s.type === 'Game').length === 1);

console.log('correcting the minutes');
store = applyGameMinutes(store, { date: D, rpe: 8, minutes: { a1: 20 }, emptyRec: empty });
ok('replaces rather than adds', store.a1.sessions[D].length === 1 && store.a1.sessions[D][0].min === 20, JSON.stringify(store.a1.sessions[D]));

console.log('a game does not erase the rest of the day');
let mixed = {
  b1: { loads: { [D]: 300 }, sessions: { [D]: [{ type: 'Lift', min: 60, rpe: 5, load: 300 }] }, readiness: {} },
};
mixed = applyGameMinutes(mixed, { date: D, rpe: 9, minutes: { b1: 25 }, emptyRec: empty });
ok('the morning lift survives', (mixed.b1.sessions[D] || []).some((s) => s.type === 'Lift'));
ok('the day keeps the lift load and adds none for the game', mixed.b1.loads[D] === 300, String(mixed.b1.loads[D]));
mixed = applyGameMinutes(mixed, { date: D, rpe: 9, minutes: { b1: 0 }, emptyRec: empty });
ok('setting minutes to zero removes only the game', mixed.b1.loads[D] === 300, String(mixed.b1.loads[D]));
ok('and leaves the lift session', (mixed.b1.sessions[D] || []).length === 1);

console.log('reopening the editor');
ok('minutes come back', gameMinutesOf(store, D).a1 === 20, JSON.stringify(gameMinutesOf(store, D)));
ok('no rpe is ever stored', gameRpeOf(store, D) == null, String(gameRpeOf(store, D)));
ok('no prior game load exists', !priorGameLoad(store.a1, D));

console.log('other days are untouched');
const other = applyGameMinutes({ c1: { loads: { '2026-08-01': 500 }, sessions: {}, readiness: {} } },
  { date: D, rpe: 7, minutes: { c1: 10 }, emptyRec: empty });
ok('an earlier date keeps its load', other.c1.loads['2026-08-01'] === 500);

console.log('a box score with no RPE - minutes are a fact, intensity is a judgement');
let noRpe = applyGameMinutes({}, { date: D, rpe: 0, minutes: { d1: 26 }, emptyRec: empty });
ok('the game is recorded', (noRpe.d1.sessions[D] || []).some((x) => x.type === 'Game' && x.min === 26), JSON.stringify(noRpe.d1.sessions[D]));
ok('with no invented rpe', ((noRpe.d1.sessions[D] || [])[0] || {}).rpe === null);
ok('and zero load', ((noRpe.d1.sessions[D] || [])[0] || {}).load === 0 && noRpe.d1.loads[D] === undefined, JSON.stringify(noRpe.d1.loads));
ok('the editor still opens on those minutes', gameMinutesOf(noRpe, D).d1 === 26);
noRpe = applyGameMinutes(noRpe, { date: D, rpe: 7, minutes: { d1: 26 }, emptyRec: empty });
ok('an rpe passed in is ignored - still no load', (noRpe.d1.loads || {})[D] === undefined, String((noRpe.d1.loads || {})[D]));
ok('and does not double the row', (noRpe.d1.sessions[D] || []).filter((x) => x.type === 'Game').length === 1);
const dnp = applyGameMinutes({}, { date: D, rpe: 0, minutes: { e1: 0 }, emptyRec: empty });
ok('a DNP writes nothing at all', !((dnp.e1.sessions || {})[D] || []).length);

console.log('re-saving keeps the official box score (27.9 review)');
const box = { pts: 20, fg3: { m: 2, a: 5 }, reb: 4 };
let official = { f1: { loads: {}, readiness: {}, sessions: { [D]: [{ kind: 'game', type: 'Game', min: 27, rpe: null, load: 0, attended: true, opp: 'X', comp: 'League', box, source: 'basket.co.il/1' }] } } };
ok('the editor opens on the logger\'s minutes', gameMinutesOf(official, D).f1 === 27, JSON.stringify(gameMinutesOf(official, D)));
official = applyGameMinutes(official, { date: D, minutes: gameMinutesOf(official, D), emptyRec: empty });
const g1 = official.f1.sessions[D].find((x) => x.type === 'Game');
ok('an unchanged save keeps box, opponent and source', g1 && g1.box === box && g1.opp === 'X' && g1.source === 'basket.co.il/1', JSON.stringify(g1));
official = applyGameMinutes(official, { date: D, minutes: { f1: 29 }, emptyRec: empty });
const g2 = official.f1.sessions[D].filter((x) => x.type === 'Game');
ok('a corrected minute keeps the box and stays one row', g2.length === 1 && g2[0].min === 29 && g2[0].box === box, JSON.stringify(g2));

console.log(fails ? `\n${fails} FAILED` : '\nall assertions passed');
process.exit(fails ? 1 : 0);
