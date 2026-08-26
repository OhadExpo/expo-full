// Stacked overlays must not strand the page unscrollable.
//
// WHY THIS EXISTS. Audit finding #1, severity HIGH: Modal and ConfirmDialog
// each saved `document.body.style.overflow` at open and restored it at close.
// A dialog opened OVER another dialog therefore saved 'hidden'. React runs
// cleanup in tree order, so when both closed in the same commit the OUTER
// restored '' first and the INNER restored 'hidden' last — and the whole app
// stayed unscrollable until a full page reload.
//
// Real trigger: TraineesView's Edit Athlete modal contains the Archive button,
// which opens a ConfirmDialog while the modal stays open. handleArchive runs
// setArchiveConfirm(null) and setShowForm(false) in ONE batched commit.
//
// The fix is a module-level refcount. This pins its behaviour, because the
// symptom (a page that will not scroll) is the kind of thing a client reports
// days later and nobody can reproduce.
import { lockBodyScroll } from '../src/scrollLock.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// Minimal document stub — this is pure logic, no DOM needed.
globalThis.document = { body: { style: { overflow: '' } } };
const overflow = () => globalThis.document.body.style.overflow;

check('starts unlocked', overflow() === '');

// --- one overlay -----------------------------------------------------------
const r1 = lockBodyScroll();
check('one overlay locks the page', overflow() === 'hidden');
r1();
check('closing it restores scrolling', overflow() === '');

// --- the exact bug: stacked, closed in one commit, INNER cleanup last ------
const outer = lockBodyScroll();
const inner = lockBodyScroll();
check('stacked overlays keep it locked', overflow() === 'hidden');
outer();
check('outer closing alone does NOT unlock (inner is still open)', overflow() === 'hidden');
inner();
check('the LAST overlay out unlocks — this is the bug that stranded the page', overflow() === '');

// --- reverse order, which React can also produce ---------------------------
const a = lockBodyScroll();
const b = lockBodyScroll();
b();
check('inner-first: still locked while one remains', overflow() === 'hidden');
a();
check('inner-first: unlocks when the last one goes', overflow() === '');

// --- a release called twice must not corrupt the count ---------------------
const c = lockBodyScroll();
const d = lockBodyScroll();
c();
c();          // double-release: React StrictMode double-invokes cleanups
check('double release does not unlock while another overlay is open', overflow() === 'hidden');
d();
check('and the real last release still unlocks', overflow() === '');

// --- a pre-existing overflow value must be given back, not clobbered -------
globalThis.document.body.style.overflow = 'scroll';
const e = lockBodyScroll();
check('locks over a pre-existing value', overflow() === 'hidden');
e();
check('restores the ORIGINAL value, not empty', overflow() === 'scroll');

console.log(`\nSCROLL LOCK: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
