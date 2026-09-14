// A gate for the new rule: a box score with no RPE still records the minutes,
// invents no intensity, adds no load - and setting the RPE later fills it in.
import fs from 'node:fs';
const f = 'scripts/verify-game-load.mjs';
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const anchor = "console.log(fails ?";
const i = s.lastIndexOf(anchor);
if (i < 0) throw new Error('anchor');
const block = `console.log('a box score with no RPE - minutes are a fact, intensity is a judgement');
let noRpe = applyGameMinutes({}, { date: D, rpe: 0, minutes: { d1: 26 }, emptyRec: empty });
ok('the game is recorded', (noRpe.d1.sessions[D] || []).some((x) => x.type === 'Game' && x.min === 26), JSON.stringify(noRpe.d1.sessions[D]));
ok('with no invented rpe', (noRpe.d1.sessions[D] || [])[0].rpe === null);
ok('and zero load', (noRpe.d1.sessions[D] || [])[0].load === 0 && noRpe.d1.loads[D] === undefined, JSON.stringify(noRpe.d1.loads));
ok('the editor still opens on those minutes', gameMinutesOf(noRpe, D).d1 === 26);
noRpe = applyGameMinutes(noRpe, { date: D, rpe: 7, minutes: { d1: 26 }, emptyRec: empty });
ok('setting the rpe later computes the load', noRpe.d1.loads[D] === sessionLoad(26, 7), String(noRpe.d1.loads[D]));
ok('and does not double the row', (noRpe.d1.sessions[D] || []).filter((x) => x.type === 'Game').length === 1);
const dnp = applyGameMinutes({}, { date: D, rpe: 0, minutes: { e1: 0 }, emptyRec: empty });
ok('a DNP writes nothing at all', !((dnp.e1.sessions || {})[D] || []).length);

`;
s = s.slice(0, i) + block + s.slice(i);
fs.writeFileSync(f, s);
console.log('cases added');
