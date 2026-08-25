// channelFromTitle — which JOINT the rep counter should watch for a given
// exercise name.
//
// Getting this wrong is silent and total: the counter watches a joint that
// barely moves and reps sit at 0 with no error. "Tricep Kickback" resolved to
// the HIP, because 'kickback' lives in the hip group and outranked 'tricep'
// (audit 08-22 #86).
//
// The lexicon is ordered and weighted, so these assertions are really about the
// ORDER OF PRECEDENCE between two tokens that both appear in one title.
import { channelFromTitle } from '../src/liftDetect.js';

let pass = 0, fail = 0;
const is = (title, want) => {
  const got = channelFromTitle(title);
  const kind = got ? got.kind : null;
  if (kind === want) pass++;
  else { fail++; console.log(`  ✗ ${title}\n     got ${kind}, want ${want}`); }
};

console.log('LIFT CHANNEL\n');

// ── the bug ────────────────────────────────────────────────────────────────
is('Tricep Kickback', 'elbow');
is('DB Tricep Kickback', 'elbow');
is('Cable Tricep Kickback', 'elbow');
// …without breaking the exercise 'kickback' was there for.
is('Cable Glute Kickback', 'hip');
is('Glute Kickback', 'hip');

// ── other two-token titles where precedence decides ────────────────────────
is('Squatting Calf Raise', 'knee');        // calf beats squat AND raise
is('Cable Squatting Bicep Curl', 'elbow'); // curl beats squat
is('SLDL POS SA DB Row', 'elbow');         // row beats the SLDL stance
is('Trap-Bar Squat', 'knee');              // squat beats 'trap bar'
is('BB Deadlift', 'hip');
is('Bicep Curl', 'elbow');
is('BB Bench Press', 'elbow');
is('DB Lateral Raise', 'sho');

// ── things that genuinely have no countable limb cycle ─────────────────────
is('Plank', 'none');
is('Farmer Carry', 'none');
is('Dead Bug', 'none');

// ── refuse rather than guess ───────────────────────────────────────────────
is('', null);
is('Zercher Widget', null);   // nothing in the lexicon — a blind default was the old bug

console.log(`\nLIFT CHANNEL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
