// planCopy.js — cloning plan days when a program (or a day) is copied.
//
// WHY THIS IS NOT JUST A SPREAD. A plan row does not store its video; it stores
// an `exerciseId` and resolves the video out of the exercise library at render
// time. That works on the coach's seat and nowhere else: `expo-exercises` is
// staff-RLS'd, so an athlete — and a BHBC club coach — has NO library to fall
// back on. Copy a day to another athlete with a plain spread and every video
// the coach could see silently vanishes on the seat that matters.
//
// Found the hard way: a program copied to a club athlete arrived with all 24
// exercises intact, every exerciseId valid, and zero videos for the athlete.
//
// So the copy SNAPSHOTS the library's video onto the row, exactly the way the
// exercise title is already snapshotted — the athlete cannot look either one up.
//
// Pure and dependency-free so it is node-testable — see
// scripts/verify-plan-copy.mjs.

/** The library's video for a row, or undefined when there isn't one. */
export function libVideoFor(ex, exercises) {
  const eid = (ex && (ex.exerciseId || ex.eid)) || '';
  if (!eid) return undefined;
  const lib = (exercises || []).find((e) => e && e.id === eid);
  // `videoLink` is the real field (641 of 1326 entries carry one); `video` is
  // tolerated for fixtures and older shapes.
  return (lib && (lib.videoLink || lib.video)) || undefined;
}

/**
 * The library's name for a row, or undefined.
 *
 * The field is `title` — verified against the live library: all 1326 entries
 * have `title` and NONE has `name`. An earlier version read `.name` only, so
 * this never fired at all. `name` is kept as a tolerated alias for fixtures.
 */
export function libNameFor(ex, exercises) {
  const eid = (ex && (ex.exerciseId || ex.eid)) || '';
  if (!eid) return undefined;
  const lib = (exercises || []).find((e) => e && e.id === eid);
  return (lib && (lib.title || lib.name)) || undefined;
}

/**
 * Clone one exercise row for a copy.
 *
 * The 3-state videoUrl contract is preserved exactly:
 *   undefined → no override, inherits from the library — THIS is what we fill
 *   ''        → an explicit "no video for this program" — never refilled
 *   'http…'   → a per-row override — kept untouched
 *
 * newId lets the caller supply its own id generator.
 */
export function cloneExerciseForCopy(ex, exercises, newId) {
  const out = { ...ex };
  if (typeof newId === 'function') out.id = newId();
  if (out.videoUrl === undefined) {
    const v = libVideoFor(ex, exercises);
    if (v) out.videoUrl = v;
  }
  if (!out.title) {
    const n = libNameFor(ex, exercises);
    if (n) out.title = n;
  }
  return out;
}

/**
 * Clone a whole day for a copy, handling BOTH plan shapes.
 *
 * The editor normalises on load so `day.exercises` is the usual case, but a day
 * read straight from an older row arrives as the compact `day.ex` — and that is
 * precisely the shape that never carried a video, so it is the one that matters.
 * The result always speaks the single `exercises` shape; `ex` is dropped so
 * nothing downstream is handed a day carrying both.
 */
export function cloneDayForCopy(day, exercises, newId) {
  const d = day || {};
  const src = (Array.isArray(d.exercises) && d.exercises.length) ? d.exercises
            : (Array.isArray(d.ex) && d.ex.length) ? d.ex
            : (d.exercises || d.ex || []);
  const out = { ...d, exercises: src.map((ex) => cloneExerciseForCopy(ex, exercises, newId)) };
  if (typeof newId === 'function') out.id = newId();
  delete out.ex;
  return out;
}
