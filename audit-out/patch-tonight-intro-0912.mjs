// The tonight page's banner still described the 09-11 evening only.
import fs from 'node:fs';
const f = 'scripts/build-tonight.mjs';
let s = fs.readFileSync(f, 'utf8');
const from = 'a second and third Hebrew pass on every coach screen as it is seen, and the ⋮ menu, review detail, athlete detail, exercises, waitlist and intake losing their last English. Where "Live" and "This branch" differ below';
const to = 'a second and third Hebrew pass on every coach screen as it is seen, and the ⋮ menu, review detail, athlete detail, exercises, waitlist and intake losing their last English. Then 12 Sep: the program editor made OCD (one 42px height for every toolbar control, the GRP box readable, the CHANGE EXERCISE drawer no longer scrolling sideways, every single-glyph button centred on its ink across the platform), the dashboard REVENUE card reading the roster sheet (synced twice a day by a clock that survives logoff), a build gate that fails on English labels in translated views, the public coach demo in Hebrew, and the club zone as the physio reads it in Hebrew — every tab measured, only names and stat abbreviations left in Latin. Where "Live" and "This branch" differ below';
if (!s.includes(from)) throw new Error('intro sentence not found');
s = s.replace(from, to);
fs.writeFileSync(f, s);
console.log('intro updated');
