// Fixtures for trainingMonotony (src/trainingMonotony.js) — Foster Training
// Monotony & Strain from session tonnage. This is the injury lens ACWR can't see:
// a flat "same load every day" grind sits at ACWR ~1.0 (looks fine) but is exactly
// the monotony Foster tied to overtraining/illness. So the two headline properties
// to lock: (1) a monotonous grind reads HIGH monotony, (2) varied training (or
// rest days) reads LOW — rest is protective. Plus honest thin states.
// Run: node scripts/verify-training-monotony.mjs
import { trainingMonotony } from '../src/trainingMonotony.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const DAY = 86400000;
const NOW = Date.parse('2026-08-12T12:00:00Z');
// one session `daysAgo`, carrying `tonnage` kg·reps (load×reps, done).
const sess = (daysAgo, tonnage) => ({ date: new Date(NOW - daysAgo * DAY).toISOString(), exercises: [{ sets: [{ load: tonnage / 10, reps: 10, done: true }] }] });
const run = (arr) => trainingMonotony(arr, NOW);

// ── the point of the tool: a flat daily grind flags HIGH (ACWR would say ~1.0 fine) ──
const grindIdentical = run(Array.from({ length: 7 }, (_, i) => sess(i, 5000)));
check('7 identical days -> SD~0 -> capped high monotony', grindIdentical.state === 'ok' && grindIdentical.band === 'high' && grindIdentical.capped === true && grindIdentical.monotony === 3);
check('grind weeklyLoad = 7 x 5000 = 35000', grindIdentical.weeklyLoad === 35000);
const grindNear = run([sess(0, 5200), sess(1, 4800), sess(2, 5100), sess(3, 4900), sess(4, 5000), sess(5, 5150), sess(6, 4850)]);
check('7 near-identical days -> real monotony > 2 -> high (uncapped)', grindNear.state === 'ok' && grindNear.monotony > 2 && grindNear.band === 'high' && !grindNear.capped);
check('strain = weeklyLoad x monotony (> weeklyLoad when monotony > 1)', grindNear.strain > grindNear.weeklyLoad);

// ── varied training / rest days -> LOW monotony (rest is protective) ──
const varied = run([sess(0, 6000), sess(2, 2000), sess(4, 5500)]); // 3 days among 7, hard/easy/hard
check('3 varied days + rest -> monotony < 1.5 -> varied band', varied.state === 'ok' && varied.monotony < 1.5 && varied.band === 'varied');
const sixVaried = run([sess(0, 6000), sess(1, 2500), sess(2, 5000), sess(3, 1800), sess(4, 5500), sess(5, 2200)]);
check('6 days but VARIED loads -> moderate band (1.5-2.0)', sixVaried.state === 'ok' && sixVaried.monotony >= 1.5 && sixVaried.monotony < 2.0 && sixVaried.band === 'moderate');
check('trainingDays counts distinct loaded days (6)', sixVaried.trainingDays === 6);
check('dailyLoads is a 7-slot microcycle, oldest->newest', Array.isArray(sixVaried.dailyLoads) && sixVaried.dailyLoads.length === 7 && sixVaried.dailyLoads[6] === 6000);

// ── ACWR-blind property, stated explicitly: the grind and the varied week can
//    carry a SIMILAR weekly load, yet monotony separates them ──
check('monotony SEPARATES a flat grind from varied training at similar volume', grindNear.monotony > (sixVaried.monotony + 0.5));

// ── honest thin states (never fabricate a ratio) ──
check('1 training day -> thin (no distribution)', run([sess(0, 5000)]).state === 'thin');
check('no logged tonnage -> thin', run([]).state === 'thin');
check('sessions all older than the 7-day window -> thin', run([sess(20, 5000), sess(22, 5000)]).state === 'thin');
check('two same-day sessions still = 1 training day -> thin', run([sess(0, 3000), sess(0, 3000)]).trainingDays === 1 && run([sess(0, 3000), sess(0, 3000)]).state === 'thin');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
