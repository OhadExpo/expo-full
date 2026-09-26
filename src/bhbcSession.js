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

// What a logged row IS. The reading of each kind, and of the legacy rows that
// carry only a free-text `type`, is documented above emptyRec in BhbcView.jsx.
// It lives here so node can import it in the verify suites.
export const rowKind = (r) => {
  if (!r) return 'other';
  if (r.kind === 'sc' || r.kind === 'lift' || r.kind === 'practice' || r.kind === 'game') return r.kind;
  const t = String(r.type || '').toLowerCase();
  if (t === 'practice' || t === 'shootaround') return 'practice';
  if (t === 'game' || t === 'scrimmage') return 'game';
  if (t === 'conditioning' || t === 'recovery') return 'sc';
  if (t === 'lift' || t === 'weights' || t === 'gym' || !t) return r.team ? 'sc' : 'lift';
  return 'other';
};

/**
 * The rows a Log S&C Session save for the slot `start` OWNS — the ones a
 * re-save replaces instead of adding to.
 *
 * Only the team S&C rows of that slot. The live store (26.9) holds 174 legacy
 * `Practice` rows with team:true AND a `start`: the old filter
 * (`r.team && r.start === start`) matched them, so re-logging S&C on an old
 * slot deleted the squad's court history for it.
 *
 * A day with no fixture saves with start ''. It owns only the rows this model
 * wrote for it (kind:'sc', no start) — never a legacy team row with no start,
 * which carries no `kind`. Before this, no start meant nothing was owned, so
 * every re-save of an unscheduled session appended a duplicate row per athlete.
 */
export const ownsScRow = (r, start) => {
  if (!r || !r.team || rowKind(r) !== 'sc') return false;
  return start ? r.start === start : (r.kind === 'sc' && !r.start);
};
