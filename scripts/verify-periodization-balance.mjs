// Fixtures for the periodization-balance engine (src/periodizationBalance.js).
// Run: node scripts/verify-periodization-balance.mjs
import { periodizationBalance } from '../src/periodizationBalance.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const B = (chars) => chars.map((c, i) => ({ num: i + 1, name: `Block ${i + 1}`, character: c }));

// too little history -> honest refusal
check('3 blocks -> enough:false', periodizationBalance(B(['power', 'strength', 'hypertrophy'])).enough === false);
check('empty -> enough:false', periodizationBalance([]).enough === false);
check('null -> enough:false', periodizationBalance(null).enough === false);

// all one quality -> flags zero variation
const camp = periodizationBalance(B(['hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy']));
check('5x hypertrophy -> qualitiesUsed 1', camp.qualitiesUsed === 1);
check('5x hypertrophy -> not balanced', camp.balanced === false);
check('5x hypertrophy -> currentRun length 5', camp.currentRun.length === 5);
check('5x hypertrophy -> read names no-variation', /no variation/i.test(camp.read));
check('5x hypertrophy -> power+strength+endurance neglected', camp.neglected.sort().join(',') === 'endurance,power,strength');

// lopsided but varied
const lop = periodizationBalance(B(['hypertrophy', 'hypertrophy', 'hypertrophy', 'strength', 'hypertrophy', 'power']));
check('lopsided -> dominant hypertrophy', lop.dominant === 'hypertrophy');
check('lopsided -> lopsided flag true (>50%)', lop.lopsided === true);

// well-rounded rotation
const bal = periodizationBalance(B(['power', 'strength', 'hypertrophy', 'endurance', 'power', 'strength']));
check('rotation -> balanced true', bal.balanced === true);
check('rotation -> qualitiesUsed 4', bal.qualitiesUsed === 4);
check('rotation -> no neglected', bal.neglected.length === 0);
check('rotation -> not lopsided', bal.lopsided === false);

// current camp detected even when history is varied
const nowCamp = periodizationBalance(B(['power', 'strength', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy']));
check('current 4-run detected', nowCamp.currentRun.length === 4 && nowCamp.currentRun.character === 'hypertrophy');
check('current camp -> read flags change-phase cue', /change phase/i.test(nowCamp.read));
check('current camp -> not balanced (run>=4)', nowCamp.balanced === false);

// longest run is the deepest camp anywhere, not just the current tail
const deep = periodizationBalance(B(['strength', 'strength', 'strength', 'strength', 'power', 'hypertrophy']));
check('longest run = 4 strength at the start', deep.longest.length === 4 && deep.longest.character === 'strength');
check('current run = 1 (tail is hypertrophy)', deep.currentRun.length === 1);

// recentN window respected: an old strength phase outside the window still counts neglected
const windowed = periodizationBalance(B(['strength', 'power', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy']), { recentN: 4 });
check('recentN=4 -> strength neglected (only in oldest block)', windowed.neglected.includes('strength'));

// ignores junk characters (e.g. a stray null/'other')
const junk = periodizationBalance([{ character: 'power' }, { character: null }, { character: 'strength' }, { character: 'hypertrophy' }, { character: 'other' }, { character: 'endurance' }]);
check('junk characters filtered, still reads 4 valid', junk.enough === true && junk.n === 4);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
