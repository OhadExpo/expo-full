// verify-edge-cases.mjs — the inputs that actually reach a module in production.
//
// Ohad, 2026-08-30: "0 bugs are allowed. also prevent future bugs."
//
// Every module shipped this week has a happy-path suite. None of them had a
// test for the shapes real data arrives in on a Sunday morning: an empty roster
// before the store loads, an athlete with no sessions, a clip where every
// landmark is null, a rep with no checks. Those are the states that throw in
// front of a coach, and a throw inside a React render blanks the screen.
//
// Rule for this file: nothing here may throw, and nothing may return a wrong
// SHAPE. It does not assert coaching values - the other suites do that.
//
//   node scripts/verify-edge-cases.mjs
import { sessionConclusions, checkTally, fatigueTrend } from '../src/shotSession.js';
import { returnToLoadFlags, returnDateOf, sumDays, capForDay, dayGap, shiftISO } from '../src/bhbcReturnLoad.js';
import { applyGameMinutes, gameMinutesOf, gameRpeOf, priorGameLoad } from '../src/bhbcGameLoad.js';

let fails = 0;
const ok = (name, fn) => {
  try {
    const r = fn();
    if (r === false) { console.log(`  FAIL  ${name} — returned false`); fails++; }
    else console.log(`  PASS  ${name}`);
  } catch (e) {
    console.log(`  THREW ${name} — ${String(e.message || e).slice(0, 90)}`);
    fails++;
  }
};

console.log('shotSession — degenerate clips');
ok('no shots at all', () => sessionConclusions([]) === null);
ok('null argument', () => sessionConclusions(null) === null);
ok('undefined argument', () => sessionConclusions(undefined) === null);
ok('one shot, no checks', () => {
  const c = sessionConclusions([{ score: 70 }]);
  return c && c.reps === 1 && Array.isArray(c.solid);
});
ok('shots with null scores', () => {
  const c = sessionConclusions([{ score: null, checks: [] }, { score: null, checks: [] }]);
  return c && c.avg === null && c.band === null;
});
ok('checks with an unknown status', () => {
  const c = sessionConclusions([{ score: 60, checks: [{ key: 'x', label: 'X', status: 'weird', weight: 1 }] }]);
  return c !== null;
});
ok('checks missing a weight', () => checkTally([{ checks: [{ key: 'a', label: 'A', status: 'ok' }] }]).length === 1);
ok('every check is na', () => {
  const c = sessionConclusions([{ score: 50, checks: [{ key: 'a', label: 'A', status: 'na', weight: 1 }] }]);
  return c && c.solid.length === 0 && c.broken.length === 0;
});
ok('fatigue needs six reps', () => fatigueTrend([{ score: 10 }, { score: 90 }]) === null);
ok('fatigue with non-numeric scores', () => fatigueTrend(Array.from({ length: 8 }, () => ({ score: 'x' }))) === null);
ok('fatigue on a flat clip', () => {
  const t = fatigueTrend(Array.from({ length: 9 }, () => ({ score: 70 })));
  return t && t.dir === 'flat';
});

console.log('bhbcReturnLoad — empty and malformed stores');
ok('no roster', () => returnToLoadFlags({ roster: [], loads: {}, medical: {}, today: '2026-08-30' }).length === 0);
ok('no today', () => returnToLoadFlags({ roster: [{ id: 'a' }], today: null }).length === 0);
ok('roster entry with no id', () => returnToLoadFlags({ roster: [{ name: 'x' }], loads: {}, medical: {}, today: '2026-08-30' }).length === 0);
ok('athlete with no medical record', () => returnToLoadFlags({ roster: [{ id: 'a', name: 'A' }], loads: {}, medical: {}, today: '2026-08-30' }).length === 0);
ok('injury with no onset date', () => returnToLoadFlags({
  roster: [{ id: 'a', name: 'A' }], loads: { a: { loads: { '2026-08-30': 900 } } },
  medical: { a: { injuries: [{ resolved: true, progress: [{ date: '2026-08-29' }] }] } }, today: '2026-08-30',
}).length === 0);
ok('malformed dates do not throw', () => dayGap('nonsense', '2026-08-30') === null);
ok('shiftISO on a bad date', () => shiftISO('nope', 3) === null);
ok('sumDays with no loads', () => sumDays(null, '2026-08-30', 7) === 0);
ok('sumDays ignores non-numeric values', () => sumDays({ '2026-08-30': 'abc' }, '2026-08-30', 1) === 0);
ok('capForDay past the window', () => capForDay(999) === null);
ok('returnDateOf on junk', () => returnDateOf(null) === null && returnDateOf({}) === null);

console.log('bhbcGameLoad — empty and malformed stores');
ok('no date is a no-op', () => {
  const before = { a: { loads: { x: 1 } } };
  return applyGameMinutes(before, { date: null, rpe: 8, minutes: { a: 20 } }) === before;
});
ok('no minutes object', () => {
  const r = applyGameMinutes({}, { date: '2026-08-30', rpe: 8 });
  return r && typeof r === 'object';
});
ok('null prev store', () => {
  const r = applyGameMinutes(null, { date: '2026-08-30', rpe: 8, minutes: { a: 20 } });
  return r && r.a && r.a.loads['2026-08-30'] > 0;
});
ok('non-numeric minutes are treated as none', () => {
  const r = applyGameMinutes({}, { date: '2026-08-30', rpe: 8, minutes: { a: 'abc' } });
  return r.a && r.a.loads['2026-08-30'] === undefined;
});
ok('negative minutes cannot create load', () => {
  const r = applyGameMinutes({}, { date: '2026-08-30', rpe: 8, minutes: { a: -30 } });
  return r.a && r.a.loads['2026-08-30'] === undefined;
});
ok('zero rpe creates no load', () => {
  const r = applyGameMinutes({}, { date: '2026-08-30', rpe: 0, minutes: { a: 30 } });
  return r.a && r.a.loads['2026-08-30'] === undefined;
});
ok('an athlete record keeps its other fields', () => {
  const r = applyGameMinutes(
    { a: { loads: {}, sessions: {}, readiness: { '2026-08-29': { sleep: 'good' } } } },
    { date: '2026-08-30', rpe: 8, minutes: { a: 20 } },
  );
  return r.a.readiness['2026-08-29'].sleep === 'good';
});
ok('other athletes are untouched', () => {
  const r = applyGameMinutes({ a: { loads: { '2026-08-01': 500 } }, b: { loads: {} } },
    { date: '2026-08-30', rpe: 8, minutes: { b: 20 } });
  return r.a.loads['2026-08-01'] === 500;
});
ok('gameMinutesOf on an empty store', () => Object.keys(gameMinutesOf({}, '2026-08-30')).length === 0);
ok('gameMinutesOf on null', () => Object.keys(gameMinutesOf(null, '2026-08-30')).length === 0);
ok('gameRpeOf on an empty store', () => gameRpeOf({}, '2026-08-30') === null);
ok('priorGameLoad on junk', () => priorGameLoad(null, '2026-08-30') === 0);

console.log(fails ? `\n${fails} FAILED` : '\nevery module survives the shapes real data arrives in');
process.exit(fails ? 1 : 0);
