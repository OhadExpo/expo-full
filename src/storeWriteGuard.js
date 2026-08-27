// Write guards for the shared `store` table.
//
// WHY THIS EXISTS. On 2026-08-27 the exercise library — 1,326 rows — was
// replaced by a TWO-ROW array. Nothing exotic happened: the exercise picker's
// "create in library" button ran
//
//     setExercises(prev => [...(prev || []), newExercise])
//
// while `prev` was still the empty initial value, because the library had not
// finished loading. `save()` writes the WHOLE array, so that one click wrote a
// one-item array over the entire library. A second click made it two.
//
// The lesson is not "add a null check". It is that a store which writes its
// whole value must never write before it has read, and must never accept a
// write that collapses it. Both rules live here, as pure functions, so they can
// be tested without a browser or a database.

// Reject a write that would replace a store we have never successfully read.
// Until the server value arrives, local state is the empty initial value, and
// "append one item" is indistinguishable from "delete everything".
export const BLOCK_UNLOADED = 'unloaded';
// Reject a write that collapses a substantial array. A real edit adds, removes
// or changes some rows. Dropping most of the store is a bug every time.
export const BLOCK_SHRINK = 'shrink';

// Below this many rows a store is small enough that halving it can be a genuine
// edit (clearing a short list), so the shrink rule does not apply.
export const SHRINK_MIN_BASELINE = 25;
// Keep at least this fraction of the known server rows.
export const SHRINK_MIN_RATIO = 0.5;

/**
 * Decide whether a store write is safe.
 *
 * @param {{ value: any, serverLoaded: boolean, serverLen: number|null }} o
 *   value       - the value about to be written
 *   serverLoaded- has this key's server value been read (or confirmed absent)?
 *   serverLen   - last array length the server reported, or null if not an array
 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
 */
export function checkStoreWrite({ value, serverLoaded, serverLen }) {
  // Non-array stores (config blobs) are replaced wholesale by design.
  if (!Array.isArray(value)) return { ok: true };

  if (!serverLoaded) {
    return {
      ok: false,
      reason: BLOCK_UNLOADED,
      message: 'Not saved — the data had not finished loading. Reload and try again.',
    };
  }

  if (typeof serverLen === 'number'
      && serverLen >= SHRINK_MIN_BASELINE
      && value.length < Math.ceil(serverLen * SHRINK_MIN_RATIO)) {
    return {
      ok: false,
      reason: BLOCK_SHRINK,
      message: `Not saved — that would have deleted ${serverLen - value.length} of ${serverLen} rows.`,
    };
  }

  return { ok: true };
}
