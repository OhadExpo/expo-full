// verify-return-load.mjs — proves the load x medical cross-check on constructed
// cases, so the alert can be trusted before it is ever shown to a coach.
//
//   node scripts/verify-return-load.mjs
import { returnToLoadFlags, returnDateOf, sumDays, capForDay, shiftISO } from '../src/bhbcReturnLoad.js';

let fails = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  PASS  ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); fails++; }
};

const TODAY = '2026-08-30';
// A steady pre-injury athlete: 4 sessions a week at 300 AU = 1200 AU/week.
const steady = (fromISO, days, perDay) => {
  const m = {};
  for (let i = 0; i < days; i++) m[shiftISO(fromISO, i)] = perDay;
  return m;
};

console.log('return date');
ok('newest progress entry is the return date',
  returnDateOf({ resolved: true, progress: [{ date: '2026-08-20' }, { date: '2026-08-24' }] }) === '2026-08-24');
ok('falls back to updatedAt when nothing was logged',
  returnDateOf({ resolved: true, updatedAt: '2026-08-19T10:00:00.000Z' }) === '2026-08-19');
ok('an unresolved injury has no return date',
  returnDateOf({ resolved: false, progress: [{ date: '2026-08-24' }] }) === null);

console.log('ramp caps');
ok('day 3 is capped at 60%', capForDay(3) === 0.6);
ok('day 10 is capped at 80%', capForDay(10) === 0.8);
ok('day 20 is capped at 100%', capForDay(20) === 1.0);
ok('past 28 days there is no cap', capForDay(40) === null);

console.log('windows');
ok('sumDays counts 7 days inclusive of today',
  sumDays(steady(TODAY, 10, 100), TODAY, 7) === 700);

// ---- the alert itself ----
const roster = [{ id: 'a1', name: 'Amit' }, { id: 'a2', name: 'Roy' }, { id: 'a3', name: 'Guy' }];

// Amit: hurt 2026-07-20, back 2026-08-24 (6 days ago), pre-injury 1400/week,
// and he has done 1200 in the last 7 days = 86% against a 60% cap.
const amitLoads = { ...steady('2026-07-19', 28, 200), ...steady(TODAY, 6, 200) };
// Roy: same history but resting properly - 200 in the last week.
const royLoads = { ...steady('2026-07-19', 28, 200), [TODAY]: 200 };
// Guy: never injured.
const guyLoads = steady(TODAY, 28, 200);

const medical = {
  a1: { injuries: [{ resolved: true, onsetDate: '2026-07-20', bodyPart: 'Ankle', progress: [{ date: '2026-08-24' }] }] },
  a2: { injuries: [{ resolved: true, onsetDate: '2026-07-20', bodyPart: 'Knee', progress: [{ date: '2026-08-24' }] }] },
  a3: { injuries: [] },
};
const loads = { a1: { loads: amitLoads }, a2: { loads: royLoads }, a3: { loads: guyLoads } };

const flags = returnToLoadFlags({ roster, loads, medical, today: TODAY });
console.log('cross-check');
console.log('   ->', JSON.stringify(flags));
ok('flags exactly the athlete who ramped too fast', flags.length === 1 && flags[0].id === 'a1',
  JSON.stringify(flags.map((f) => f.id)));
ok('names the body part', flags[0] && flags[0].bodyPart === 'Ankle');
ok('reports days back', flags[0] && flags[0].daysBack === 6);
ok('reports his own baseline, not a squad number', flags[0] && flags[0].baseline === 1400);
ok('percentage is of his own pre-injury week', flags[0] && flags[0].pct === 86, String(flags[0] && flags[0].pct));

// An athlete with no pre-injury history cannot be judged, and guessing would be
// worse than silence.
const thin = returnToLoadFlags({
  roster: [{ id: 'x', name: 'New' }],
  loads: { x: { loads: { [TODAY]: 900 } } },
  medical: { x: { injuries: [{ resolved: true, onsetDate: '2026-08-01', progress: [{ date: '2026-08-28' }] }] } },
  today: TODAY,
});
ok('says nothing when there is no baseline to compare against', thin.length === 0, JSON.stringify(thin));

// A return older than 28 days is just an athlete training.
const old = returnToLoadFlags({
  roster: [{ id: 'y', name: 'Old' }],
  loads: { y: { loads: { ...steady('2026-06-01', 60, 200) } } },
  medical: { y: { injuries: [{ resolved: true, onsetDate: '2026-06-05', progress: [{ date: '2026-07-01' }] }] } },
  today: TODAY,
});
ok('stops flagging once he is more than 28 days back', old.length === 0, JSON.stringify(old));

console.log(fails ? `\n${fails} FAILED` : '\nall assertions passed');
process.exit(fails ? 1 : 0);
