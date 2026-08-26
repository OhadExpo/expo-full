// Refcounted body-scroll lock, shared by every blocking overlay.
//
// Lives in its own plain .js module for two reasons: every overlay must share
// ONE counter (a per-component lock is exactly the bug below), and plain JS can
// be imported by the node test harness, which .jsx cannot.
//
// THE BUG THIS REPLACED (audit 08-22 finding #1, HIGH). Modal and ConfirmDialog
// each saved `document.body.style.overflow` at open and restored it at close.
// A dialog opened OVER another dialog therefore saved 'hidden'. React runs
// cleanup effects in tree order, so when both closed in the same commit the
// OUTER restored '' first and the INNER restored 'hidden' last — leaving the
// whole app unscrollable until a full page reload.
//
// Real trigger: TraineesView's Edit Athlete modal contains the Archive button,
// which opens a ConfirmDialog while the modal stays open; handleArchive runs
// setArchiveConfirm(null) and setShowForm(false) in one batched commit.
//
// A counter makes the LAST overlay out the one that unlocks.
let scrollLocks = 0;
let scrollPrev = '';

export function lockBodyScroll() {
  if (typeof document === 'undefined') return () => {};
  if (scrollLocks === 0) {
    scrollPrev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks++;
  // Idempotent: React StrictMode double-invokes cleanups, and a release that
  // decremented twice would unlock while another overlay was still open.
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.overflow = scrollPrev;
  };
}
