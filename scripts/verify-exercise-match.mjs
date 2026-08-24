// Regression suite for the exercise-matching engine.
//
// applyMatch is the riskiest writer in the app: it rewrites rows inside real
// athletes' programs. Its contract was pinned by four separate audit findings
// (08-22 #7, #8, #35, #36) and nothing was asserting any of it.
import { applyMatch, normTitle, canonTokens, suggestMatches, confidenceLabel } from '../src/exerciseMatch.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};

console.log('EXERCISE MATCH\n');

const LIB = [
  { id: 'lib_bench', title: 'Barbell Bench Press', videoLink: 'https://v/bench', cues: 'Pause on the chest' },
  { id: 'lib_row', title: 'Dumbbell Row', videoLink: 'https://v/row', cues: 'Pull to the hip' },
];
const chosen = LIB[0];
const plan = (days) => ([{ id: 'pl_1', data: { days } }]);
const firstEx = (out, di = 0, key = 'exercises') => out[0].data.days[di][key][0];

// ── the link itself, on BOTH plan shapes ────────────────────────────────────
{
  const out = applyMatch(plan([{ exercises: [{ title: 'bench press', sets: 3 }] }]),
    { key: 'bench press', rows: [] }, chosen, LIB);
  const e = firstEx(out);
  eq('links exerciseId on the new shape', e.exerciseId, 'lib_bench');
  eq('writes the PLAN-ROW video key, not videoLink', e.videoUrl, 'https://v/bench');
  eq('no library-shape key leaks in', e.videoLink, undefined);
  eq('sets are untouched', e.sets, 3);
}
{
  const out = applyMatch(plan([{ ex: [{ t: 'bench press', s: 3 }] }]),
    { key: 'bench press', rows: [] }, chosen, LIB);
  const e = firstEx(out, 0, 'ex');
  eq('compact shape links eid, not exerciseId', [e.eid, e.exerciseId], ['lib_bench', undefined]);
  eq('compact shape gets the n snapshot', e.n, 'Pause on the chest');
}

// ── the athlete-visible TITLE is never rewritten (audit #8) ─────────────────
// The confirm dialog promises it, and workout-history / PR fallbacks key on it.
{
  const out = applyMatch(plan([{ exercises: [{ title: 'bench press', sets: 3 }] }]),
    { key: 'bench press', rows: [] }, chosen, LIB);
  eq('title is left exactly as the athlete sees it', firstEx(out).title, 'bench press');
}

// ── fill-only: never clobber what the coach already wrote (audit #35) ───────
{
  const out = applyMatch(plan([{ exercises: [{ title: 'bench press', videoUrl: 'https://mine', notes: 'my own cue' }] }]),
    { key: 'bench press', rows: [] }, chosen, LIB);
  const e = firstEx(out);
  eq('an existing videoUrl survives', e.videoUrl, 'https://mine');
  eq("the coach's own note survives", e.notes, 'my own cue');
  eq('but the link is still made', e.exerciseId, 'lib_bench');
}

// ── a row already correctly linked is skipped entirely (audit #35) ──────────
{
  const before = plan([{ exercises: [{ title: 'bench press', exerciseId: 'lib_row' }] }]);
  const out = applyMatch(before, { key: 'bench press', rows: [] }, chosen, LIB);
  eq('a valid existing link is not repointed', firstEx(out).exerciseId, 'lib_row');
  eq('and the plan object is returned untouched', out[0] === before[0], true);
}

// ── only rows whose NORMALISED title matches are touched ────────────────────
{
  const out = applyMatch(plan([{ exercises: [
    { title: 'Bench   Press!' },   // same after normalisation
    { title: 'Squat' },            // different exercise
  ] }]), { key: 'bench press', rows: [] }, chosen, LIB);
  const day = out[0].data.days[0].exercises;
  eq('normalised match is linked', day[0].exerciseId, 'lib_bench');
  eq('an unrelated row is NOT linked', day[1].exerciseId, undefined);
}

// ── blank-title groups match by COORDINATES, never by title ─────────────────
{
  const days = [{ exercises: [{ title: '' }, { title: '' }] }];
  const out = applyMatch(plan(days),
    { key: '∅:1', rows: [{ planId: 'pl_1', di: 0, ei: 1 }] }, chosen, LIB);
  const day = out[0].data.days[0].exercises;
  eq('the addressed blank row is linked', day[1].exerciseId, 'lib_bench');
  eq('the other blank row is left alone', day[0].exerciseId, undefined);
}

// ── plans that contain no match are returned by IDENTITY ────────────────────
{
  const before = plan([{ exercises: [{ title: 'squat' }] }]);
  const out = applyMatch(before, { key: 'bench press', rows: [] }, chosen, LIB);
  eq('untouched plan keeps its identity (no needless rewrite)', out[0] === before[0], true);
}

// ── normalisation + canonical tokens ───────────────────────────────────────
eq('normTitle folds punctuation and case', normTitle('  BB  Bench-Press!! '), 'bb bench press');
eq('normTitle on junk', normTitle(null), '');
eq('canonTokens returns a set of stems', canonTokens('Dumbbell Rows').size > 0, true);

// ── suggestions are ordered and labelled ───────────────────────────────────
{
  const s = suggestMatches('dumbbell row', LIB, 5);
  eq('the obvious match ranks first', s[0].ex.id, 'lib_row');
  eq('scores descend', s.every((x, i) => i === 0 || s[i - 1].score >= x.score), true);
  eq('confidence bands', [confidenceLabel(99), confidenceLabel(85), confidenceLabel(40)], ['high', 'likely', 'low']);
}

// ── degenerate input must never throw ──────────────────────────────────────
{
  eq('null plans', applyMatch(null, { key: 'x', rows: [] }, chosen, LIB), []);
  const out = applyMatch(plan([{ exercises: [] }, { }]), { key: 'x', rows: [] }, chosen, LIB);
  eq('a day with no exercise array is passed through', out.length, 1);
}

console.log(`\nEXERCISE MATCH: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
