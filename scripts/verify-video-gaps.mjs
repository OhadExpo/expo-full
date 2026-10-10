// verify-video-gaps.mjs - the library video-gap logic (5.10 #559). Pure, no network.
// BREAK=1 swaps in an apply that ignores the coach's '' (no video) - must FAIL.
import { collectPlanRows, rankGaps, candidatesFor, propagationFor, applyVideoToPlanData } from '../src/videoGaps.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const V = 'https://youtu.be/AAAAAAAAAAA', V2 = 'https://youtu.be/BBBBBBBBBBB';

const library = [
  { id: 'ex_rdl', title: 'DB Romanian Deadlift', videoLink: '' },
  { id: 'ex_rdl2', title: 'Dumbbell Romanian Deadlifts', videoLink: V2 },     // exact twin (DB=dumbbell, plural)
  { id: 'ex_rdl_sa', title: 'DB Romanian Deadlift (Single Arm)', videoLink: V }, // a VARIANT - never a candidate
  { id: 'ex_squat', title: 'Back Squat', videoLink: '' },
  { id: 'ex_pull', title: 'Pull Up', videoLink: V },
];
const plans = [
  { id: 'p1', trainee_id: 'tr_a', active: true, data: { days: [
    { exercises: [{ exerciseId: 'ex_rdl', title: 'DB Romanian Deadlift' }, { exerciseId: 'ex_squat', title: 'Back Squat', videoUrl: '' }] },
    { exercises: [], ex: [{ eid: 'ex_rdl', t: 'DB Romanian Deadlift' }] },     // hybrid day: the compact list is the real one
  ], warmup: [{ eid: 'ex_rdl', t: 'DB Romanian Deadlift' }] } },
  { id: 'p2', trainee_id: 'tr_b', active: true, data: { days: [
    { exercises: [{ exerciseId: 'ex_squat', title: 'Back Squat', videoUrl: V }] },   // the coach's own override
    { exercises: [{ title: 'db romanian deadlift' }] },                             // no id, same title
  ] } },
  { id: 'p3', trainee_id: 'tr_c', active: false, data: { days: [{ exercises: [{ exerciseId: 'ex_rdl' }] }] } },
];

const rows = collectPlanRows(plans);
ok(rows.length === 7, `every row found, both shapes + hybrid day + warm-up (${rows.length})`);
ok(rows.some((r) => r.where === 'day' && r.shape === 'ex'), 'the hybrid day reads its compact list (an empty d.exercises does not shadow it)');

const gaps = rankGaps(library, plans);
ok(gaps.map((g) => g.id).join() === 'ex_rdl,ex_squat', `gaps = the two exercises with no video, RDL first (${gaps.map((g) => g.id)})`);
ok(gaps[0].activeAthletes === 2 && gaps[0].athletes === 3, `RDL: 3 athletes miss it, 2 of them on ACTIVE programs (the inactive plan counts for athletes, not active) (${gaps[0].athletes}/${gaps[0].activeAthletes})`);
ok(gaps[1].missingRows === 0, 'Back Squat: no athlete misses it (one row is your deliberate "no video", one has your override)');

const cR = candidatesFor(gaps[0], library, plans);
ok(cR.length === 1 && cR[0].url === V2 && cR[0].source === 'library-twin', `RDL candidate = the exact twin only, never the single-arm variant (${cR.map((c) => c.source + ':' + c.url)})`);
const cS = candidatesFor(gaps[1], library, plans);
ok(cS.length === 1 && cS[0].url === V && cS[0].source === 'your-program', 'Back Squat candidate = the video you already chose in a program');
ok(candidatesFor({ id: 'x', title: 'Squat' }, [{ id: 'y', title: 'squats', videoLink: V }], []).length === 0, 'a one-word title never takes a twin (too vague to be sure)');

const prop = propagationFor('ex_rdl', 'DB Romanian Deadlift', plans);
ok(prop.rows.length === 5 && prop.athletes === 3, `approving RDL reaches the 5 rows missing it, 3 athletes (${prop.rows.length}/${prop.athletes})`);

const apply = process.env.BREAK
  ? (data, id, t, url) => { const d = JSON.parse(JSON.stringify(data)); let n = 0; for (const day of d.days) for (const r of (day.exercises && day.exercises.length ? day.exercises : day.ex || [])) { if ((r.exerciseId || r.eid) === id || (r.exerciseId || r.eid) === 'ex_squat') { r.videoUrl = url; n++; } } return { data: d, changed: n }; }
  : applyVideoToPlanData;
const a1 = apply(plans[0].data, 'ex_rdl', 'DB Romanian Deadlift', V2);
ok(a1.changed === 3, `p1: day row + hybrid compact row + warm-up row get the video (${a1.changed})`);
ok(a1.data.days[0].exercises[1].videoUrl === '', 'your "no video" on Back Squat is untouched');
ok(a1.data.days[1].ex[0].vid === V2 && a1.data.warmup[0].vid === V2, 'compact and warm-up rows get it on their own key (vid)');
const a2 = apply(plans[1].data, 'ex_rdl', 'DB Romanian Deadlift', V2);
ok(a2.changed === 1 && a2.data.days[0].exercises[0].videoUrl === V, 'p2: the title-only row gets it; your Back Squat override is untouched');
ok(plans[0].data.days[0].exercises[0].videoUrl === undefined, 'the input plan is not mutated (a copy is returned)');

console.log(`VIDEO GAPS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
