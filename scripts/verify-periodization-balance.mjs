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

// --- review fix #1 (HIGH): whole-history "varied" must NOT lead when the recent
// window is a camp. 12 blocks, hypertrophy exactly 50% (not lopsided) + a 6-run tail.
const skew = periodizationBalance(B(['strength', 'endurance', 'power', 'strength', 'endurance', 'power', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy']));
check('#1 recent camp -> read does NOT say "Fairly varied"', !/fairly varied/i.test(skew.read));
check('#1 recent camp -> read says "narrowed"', /narrowed/i.test(skew.read));
check('#1 recent camp -> read still flags change-phase', /change phase/i.test(skew.read));

// --- review fix #4 (MED): balanced must consult the recent window ---
const badgeSkew = periodizationBalance(B(['strength', 'endurance', 'strength', 'endurance', 'power', 'power', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'power', 'hypertrophy', 'hypertrophy']));
check('#4 balanced=false when 2 qualities missing recently', badgeSkew.balanced === false);
check('#4 (sanity) neglected has strength+endurance', badgeSkew.neglected.sort().join(',') === 'endurance,strength');

// --- review fix #6 (LOW-MED): the deepest historical camp is surfaced in prose ---
const deepCamp = periodizationBalance(B(['hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'power', 'strength', 'endurance', 'power', 'strength']));
check('#6 read surfaces deepest camp (5 straight hypertrophy)', /deepest camp on record: 5 straight hypertrophy/i.test(deepCamp.read));
// and it must NOT double-report when the longest run IS the current tail run
const tailCamp = periodizationBalance(B(['power', 'strength', 'endurance', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy']));
check('#6 no "deepest camp" line when it equals the current run', !/deepest camp/i.test(tailCamp.read));

// --- review fix #7 (LOW): recentN validation (negative/0 -> sane window, no "-2") ---
const neg = periodizationBalance(B(['strength', 'power', 'hypertrophy', 'hypertrophy', 'hypertrophy', 'hypertrophy']), { recentN: -2 });
check('#7 negative recentN -> no negative number in read', !/-\d/.test(neg.read));
check('#7 zero recentN -> falls back to default (enough:true, no crash)', periodizationBalance(B(['power', 'strength', 'hypertrophy', 'endurance']), { recentN: 0 }).enough === true);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
