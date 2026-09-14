// A game's MINUTES are a fact; its RPE is the coach's judgement. Until he
// gives one, the minutes must still be recorded - the same rule the gym has
// had since 08-21 (minutes only, NO RPE, zero load, attended), so the history
// is complete and ACWR is never fed a number nobody said.
//
// Before: applyGameMinutes computed load = sessionLoad(mins, rpe); with no RPE
// that is 0, and the whole row was deleted - the box score could not be
// entered without inventing an intensity.
import fs from 'node:fs';
const f = 'src/bhbcGameLoad.js';
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const a = `    if (load > 0) {
      rec.loads[date] = base + load;
      rec.sessions[date] = [...kept, { type: GAME, min: mins, rpe: Number(rpe) || 0, load }];
    } else {`;
if (s.split(a).length !== 2) throw new Error('anchor');
s = s.replace(a, `    if (load > 0) {
      rec.loads[date] = base + load;
      rec.sessions[date] = [...kept, { type: GAME, min: mins, rpe: Number(rpe) || 0, load }];
    } else if (mins > 0) {
      // Minutes, no RPE: the official box score says how long he played, and
      // nobody has said how hard it was. Recorded like a gym session - zero
      // load, attended - so it shows in the history and stays out of ACWR.
      // Setting an RPE later recomputes the load through the branch above.
      if (base > 0) rec.loads[date] = base; else delete rec.loads[date];
      rec.sessions[date] = [...kept, { type: GAME, min: mins, rpe: null, load: 0, attended: true }];
    } else {`);
fs.writeFileSync(f, s);
console.log('ok minutes without an RPE');
