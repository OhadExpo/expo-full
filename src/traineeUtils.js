// Shared helpers for trainee email lists + couple member IDs.
// Couples are represented as a single trainee row whose `members` array holds
// two people. Plans can be assigned to the parent ID (shared) or to a sub-ID
// of the form `${parentId}__0` / `${parentId}__1` (per-member).

// --- Emails -----------------------------------------------------------------

/** Normalize an email field (string | string[] | null) to an array for UI editing. */
export const emailsToArr = (email) => {
  if (!email) return [''];
  if (Array.isArray(email)) return email.length ? email : [''];
  return [email];
};

/** Collapse a UI array back to the store format (empty → '', one → string, many → array). */
export const emailsToStore = (arr) => {
  const clean = arr.map(e => (e || '').trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  return clean;
};

/** Flatten to a comma-separated display string. */
export const emailsDisplay = (email) => {
  if (!email) return '';
  if (Array.isArray(email)) return email.join(', ');
  return email;
};

// --- Couple member IDs ------------------------------------------------------

/** All trainee IDs that own plans for a given trainee: parent + both sub-IDs.
 *  Memoized: it's a pure function of the id STRING, but the autoTasks rules call
 *  it per-array-element inside per-trainee filters (~147K calls/sync at scale),
 *  so caching the array kills that allocation churn. The cache never goes stale
 *  (same id → same ids) and is bounded by the trainee count. (perf audit) */
const _traineeIdsCache = new Map();
export const traineeIdsFor = (id) => {
  let v = _traineeIdsCache.get(id);
  if (!v) { v = [id, id + '__0', id + '__1']; _traineeIdsCache.set(id, v); }
  return v;
};

/** `${parentId}__${idx}` */
export const subMemberId = (parentId, idx) => parentId + '__' + idx;

/** Parse a trainee_id that may be a sub-member ID → { parentId, memberIdx } or null. */
export const parseTraineeId = (tid) => {
  const m = typeof tid === 'string' ? tid.match(/^(.+)__(\d+)$/) : null;
  return m ? { parentId: m[1], memberIdx: Number(m[2]) } : null;
};

/** Returns the member index (0/1/…) if tid is a sub-member of parentId, else null. */
export const memberIndexFromId = (tid, parentId) => {
  if (!tid || !parentId) return null;
  const p = parseTraineeId(tid);
  return p && p.parentId === parentId ? p.memberIdx : null;
};

/** True if tid is a sub-member of parentId. */
export const isSubMemberId = (tid, parentId) => memberIndexFromId(tid, parentId) !== null;

// --- Validation -------------------------------------------------------------

/**
 * Validate a trainee ID before interpolating it into a Supabase filter
 * string (e.g. `.or(...)`, `.like(...)`). All real trainee IDs in our
 * schema are `[A-Za-z0-9_-]+`. Anything outside that alphabet — commas,
 * parens, percent signs — could inject extra PostgREST clauses or LIKE
 * wildcards. Use this whenever you accept a trainee ID from a URL or
 * any other untrusted boundary.
 */
export const isSafeTraineeId = (tid) => typeof tid === 'string' && /^[A-Za-z0-9_-]+$/.test(tid);

// --- Program sort (newest → oldest) ---------------------------------------
// Block number from a program name. Matches "#N", "Block N", "Block #N",
// "Phase N" (Hebrew or English). Drive-imported names often drop the # —
// "Block 8 - High VOL/Conditioning", "Block 1 - Start Moving" — so we
// must accept both shapes.
export const blockNum = (n) => {
  const m = /(?:block|phase)\s*#?\s*(\d+)|#(\d+)/i.exec(n || '');
  return m ? parseInt(m[1] || m[2], 10) : -Infinity;
};

const isComeback = (n) => /comeback/i.test(n || '');

/**
 * Canonical chronological sort for programs (newest first).
 *
 *   1. "Comeback" / rehab blocks float to the top — they replace the active
 *      numbered progression while a trainee is rebuilding.
 *   2. Higher block# wins. "Block #17" before "Block #16" before "Block #4".
 *   3. createdAt only breaks ties — Drive-imported plans share a single
 *      import timestamp, so without the block# fallback they were random.
 *
 * Use this everywhere a program list is displayed so the order is stable
 * across the coach + athlete portals.
 */
export const sortProgramsChrono = (a, b) => {
  const cb = (isComeback(b.name) ? 1 : 0) - (isComeback(a.name) ? 1 : 0);
  if (cb !== 0) return cb;
  const bn = blockNum(b.name) - blockNum(a.name);
  if (bn !== 0) return bn;
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
};

/**
 * Coach-side "most recent block first" sort — literal last-created/added wins,
 * so a freshly-created block with NO number (e.g. "Block Beta") floats to the
 * top instead of sinking below every numbered block the way sortProgramsChrono
 * ranks it. Robust recency signal, in order:
 *
 *   1. createdAt DESC — a new program is stamped `createdAt: new Date()` at
 *      creation, so the block the coach just added is always newest. THIS is
 *      what "figure out the most recent one, constantly" means.
 *   2. block# DESC — breaks ties for a Drive-import batch that shares one
 *      import timestamp (so #9 still sits above #8 within the batch).
 *   3. updatedAt DESC — final tiebreak (last-edited) when both above tie.
 *
 * COACH-SIDE ONLY. The athlete portal (ClientPortal) deliberately keeps
 * sortProgramsChrono / highest-block-# as its "current block" — see the
 * coach-vs-athlete divergence Ohad signed off on.
 */
export const sortProgramsRecent = (a, b) => {
  const ct = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  if (ct !== 0) return ct;
  const bn = blockNum(b.name) - blockNum(a.name);
  if (bn !== 0) return bn;
  return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
};
