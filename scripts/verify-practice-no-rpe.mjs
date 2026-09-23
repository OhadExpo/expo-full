// A LOGGED SESSION MUST NEVER VANISH.
//
// Ohad, 23.9: "i never asked for a team rpe to exist so wtf" — and he was
// right twice over. He never asked for it, AND the code quietly required it:
// a court session saved with the RPE field empty wrote no row at all, while
// toast() told the coach it had saved. Silent loss behind a success message.
//
// This gate replays the exact write savePractice performs, for the three
// shapes that matter, and asserts a row comes out of each.
import { sessionLoad } from '../src/acwrEngine.js';

// The branch logic from BhbcView.savePractice, kept in step by hand. If that
// function is restructured, this has to move with it — which is the point:
// the rule "a logged session produces a row" should be hard to delete.
function writeRow({ sessionType, minutes, teamRpe, attended = true }) {
  const isLift = sessionType === 'Lift';
  const rpe = isLift ? null : Number(teamRpe || 0);
  const load = attended && !isLift ? sessionLoad(minutes, rpe) : 0;
  const noRpe = !isLift && !(Number(rpe) > 0);
  if (attended && noRpe && Number(minutes) > 0) return { type: sessionType, min: Number(minutes), rpe: null, load: 0 };
  if (attended && isLift && Number(minutes) > 0) return { type: sessionType, min: Number(minutes), rpe: null, load: 0 };
  if (load > 0) return { type: sessionType, min: Number(minutes), rpe, load };
  return null;
}

const cases = [
  ['a practice WITH a team RPE', { sessionType: 'Practice', minutes: 120, teamRpe: 7 }, (r) => r && r.load === 840 && r.rpe === 7],
  ['a practice with NO RPE', { sessionType: 'Practice', minutes: 120, teamRpe: '' }, (r) => r && r.min === 120 && r.rpe === null && r.load === 0],
  ['a whole-squad gym log', { sessionType: 'Lift', minutes: 30, teamRpe: '' }, (r) => r && r.min === 30 && r.rpe === null && r.load === 0],
  ['an absent athlete', { sessionType: 'Practice', minutes: 120, teamRpe: 7, attended: false }, (r) => r === null],
  ['a zero-minute session', { sessionType: 'Practice', minutes: 0, teamRpe: '' }, (r) => r === null],
];

let bad = 0;
for (const [name, input, ok] of cases) {
  const r = writeRow(input);
  const pass = ok(r);
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} -> ${JSON.stringify(r)}`);
}
console.log(`\nPRACTICE-WRITE GATE — ${cases.length} shapes, ${bad} failing`);
process.exit(bad ? 1 : 0);
