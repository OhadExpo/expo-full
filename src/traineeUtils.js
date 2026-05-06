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

/** All trainee IDs that own plans for a given trainee: parent + both sub-IDs. */
export const traineeIdsFor = (id) => [id, id + '__0', id + '__1'];

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
