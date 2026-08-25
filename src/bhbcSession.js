// bhbcSession.js — pure helpers for a logged BHBC session.
//
// .js on purpose: this module is imported directly by node in the verify suites,
// which cannot load .jsx.

/**
 * A session's fingerprint.
 *
 * Edit and delete address a session by its INDEX in rec.sessions[date], and an
 * index goes stale the moment the array changes: open the minutes edit on the
 * third session, delete the first, and the still-open input saves onto a
 * different session entirely (audit #70). Double-click the delete cross and the
 * second fire removes whatever slid into that slot, subtracting the wrong
 * session's load from ACWR.
 *
 * Rather than migrate every stored session to carry an id, the caller passes the
 * fingerprint of the row it was actually looking at, and the write is REFUSED if
 * the entry at that index no longer matches. Refusing beats silently editing the
 * wrong session.
 *
 * Defined once and shared: it is computed in the row builder and compared in the
 * guard, and two copies that drifted apart would refuse every legitimate edit —
 * worse than the bug it exists to prevent.
 */
export const sessionSig = (x) => (x ? [x.type || '', x.min || 0, x.rpe == null ? '' : x.rpe, x.load || 0, x.start || ''].join('|') : '');
