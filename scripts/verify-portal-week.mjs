// THE ATHLETE'S WEEK MOVES ON BY ITSELF.
//
// Ohad (17.9): "make sure the weeks move on if he finished the entire week (3/3 or 2/2
// workouts etc) - no need to log anything daily (it shouldnt affect it) - if he logged all
// workouts for a certain week - next week now!"
//
// deriveWeekIdx is the one rule the portal, the single logger and the group logger share.
// This pins it: a finished week advances, a partial week stays, daily routines never count,
// and the last week never overflows. ClientPortal calls it again on every completion, so the
// week moves the moment the last workout of the week is logged.
//   node scripts/verify-portal-week.mjs
import { deriveWeekIdx } from '../src/planWeek.js';

const plan = { name: 'Block #9', weeks: 4, days: [{ name: 'Day A' }, { name: 'Day B' }, { name: 'Day C' }, { name: 'Daily routine', kind: 'daily' }] };
const log = (week, dayName) => ({ planName: plan.name, week, dayName });
let pass = 0; const fails = [];
const is = (label, got, want) => { if (got === want) { pass++; console.log(`  PASS  ${label}`); } else { fails.push(`${label}: got ${got}, want ${want}`); console.log(`  FAIL  ${label} — got ${got}, want ${want}`); } };

console.log('the athlete\'s week (0-indexed)');
is('nothing logged → week 1', deriveWeekIdx(plan, [], null), 0);
is('W1 day A only → still week 1', deriveWeekIdx(plan, [log(1, 'Day A')], null), 0);
is('W1 A+B, C missing → still week 1', deriveWeekIdx(plan, [log(1, 'Day A'), log(1, 'Day B')], null), 0);
is('W1 complete (3/3) → week 2', deriveWeekIdx(plan, [log(1, 'Day A'), log(1, 'Day B'), log(1, 'Day C')], null), 1);
is('daily routines do not advance anything', deriveWeekIdx(plan, [log(1, 'Day A'), log(1, 'Daily routine'), log(1, 'Daily routine')], null), 0);
is('a daily routine cannot complete a week', deriveWeekIdx(plan, [log(1, 'Day A'), log(1, 'Day B'), log(1, 'Daily routine')], null), 0);
is('W1+W2 complete → week 3', deriveWeekIdx(plan, [1, 2].flatMap((w) => ['Day A', 'Day B', 'Day C'].map((d) => log(w, d))), null), 2);
is('every week complete → stays on the last week', deriveWeekIdx(plan, [1, 2, 3, 4].flatMap((w) => ['Day A', 'Day B', 'Day C'].map((d) => log(w, d))), null), 3);
// A gap in an EARLIER week does not drag him back: the scan starts at the latest trained week,
// so an athlete who has moved on keeps moving forward (deliberate, see planWeek.js).
is('an old gap in W1 while W2 is done → W3, not back to W1', deriveWeekIdx(plan, [log(1, 'Day A'), log(1, 'Day B'), ...['Day A', 'Day B', 'Day C'].map((d) => log(2, d))], null), 2);

const twoDay = { name: 'Block #2', weeks: 3, days: [{ name: 'Day A' }, { name: 'Day B' }] };
is('2/2 week complete → next week', deriveWeekIdx(twoDay, [{ planName: 'Block #2', week: 1, dayName: 'Day A' }, { planName: 'Block #2', week: 1, dayName: 'Day B' }], null), 1);

console.log(fails.length ? `\n✗ ${fails.length} failed\n  ${fails.join('\n  ')}` : `\n✓ ALL PASS — ${pass} passed, 0 failed`);
process.exit(fails.length ? 1 : 0);
