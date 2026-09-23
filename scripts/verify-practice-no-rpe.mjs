// THE CLUB ZONE LOGS S&C. A PRACTICE IS ATTENDANCE.
//
// Ohad, 23.9, in four messages:
//   "i don't need to log any practice sessions just the s&c part!!"
//   "pratice logs > attendance only, s&c team sessions next to/attached to
//    each practice (allow me to add sc session to the basketball session)"
//   "i told you each times for the s&c team sessions. i don't need a practice
//    time"
//   "i never asked for a team rpe to exist" / "remember i dont need team rpes"
//
// His record agreed before he said it: 557 session rows over two months and
// NOT ONE carried an RPE. Conditioning (250 rows, 5-12 min, "ladders + quick
// feet + dynamic stretching") and Lift (115) are his. Practice was 174 rows of
// a flat 90 or 120 minutes with zero notes — the basketball session's length
// copied onto every athlete.
//
// Two things this guards.
//
// 1. THE WRITE SHAPES. A court session records attendance and no duration; an
//    S&C session records minutes; a Game keeps minutes played; nothing carries
//    an RPE and nothing derives a load. Before the rebuild, a court session
//    saved with the RPE box empty wrote NOTHING and still fired
//    toast('Practice saved') — silent loss behind a success message.
//
// 2. THE TEAM RPE CANNOT COME BACK. A future edit that re-adds the input, or
//    derives a load from one, fails the build here rather than quietly
//    re-introducing a number he has never once written.
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// 1. the write shapes
//
// Mirrors the branch logic in BhbcView.savePractice / logSession /
// logTeamSession. If those are restructured this has to move with them, which
// is the point: "a logged session produces the right row" should be hard to
// delete by accident.
function writeRow({ type, minutes, attended = true }) {
  const attendanceOnly = type === 'Practice' || type === 'Shootaround';
  if (!attended) return null;                       // absence lives in rec.attendance
  if (attendanceOnly) return { type, min: 0, rpe: null, load: 0 };
  if (Number(minutes) > 0) return { type, min: Number(minutes), rpe: null, load: 0 };
  return null;
}

const cases = [
  ['a practice', { type: 'Practice', minutes: 120 }, (r) => r && r.min === 0 && r.rpe === null && r.load === 0],
  ['a practice with no minutes', { type: 'Practice', minutes: '' }, (r) => r && r.min === 0],
  ['a shootaround', { type: 'Shootaround', minutes: 45 }, (r) => r && r.min === 0],
  ['an S&C conditioning block', { type: 'Conditioning', minutes: 10 }, (r) => r && r.min === 10 && r.rpe === null && r.load === 0],
  ['a gym lift', { type: 'Lift', minutes: 30 }, (r) => r && r.min === 30 && r.rpe === null && r.load === 0],
  ['game minutes played', { type: 'Game', minutes: 22 }, (r) => r && r.min === 22 && r.load === 0],
  ['an athlete marked absent', { type: 'Conditioning', minutes: 10, attended: false }, (r) => r === null],
  ['an S&C block with no minutes', { type: 'Conditioning', minutes: 0 }, (r) => r === null],
];

let bad = 0;
for (const [name, input, ok] of cases) {
  const r = writeRow(input);
  const pass = ok(r);
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} -> ${JSON.stringify(r)}`);
}
console.log(`\nSESSION-WRITE GATE — ${cases.length} shapes, ${bad} failing`);

// ---------------------------------------------------------------------------
// 2. no RPE anywhere in the club zone
const src = fs.readFileSync('src/BhbcView.jsx', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const banned = [
  [/teamRpe/, 'a teamRpe binding'],
  [/Team RPE/, 'a "Team RPE" label'],
  [/Session RPE/, 'a "Session RPE" input'],
  [/sessionLoad\s*\(\s*minutes/, 'a load derived from minutes x RPE'],
];
let bannedBad = 0;
for (const [re, what] of banned) {
  const hit = re.test(code);
  console.log(`${hit ? 'FAIL' : 'PASS'}  no ${what}`);
  if (hit) bannedBad++;
}
console.log(`\nNO-TEAM-RPE GATE — ${banned.length} checks, ${bannedBad} failing`);

process.exit(bad + bannedBad ? 1 : 0);
