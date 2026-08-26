// One page-wide cross-fade for changes that repaint everything at once.
//
// Written for the light/dark switch and reused for the language switch, because
// both have the same shape: a single flag flips and every surface on screen has
// to change together. Doing that with per-element CSS transitions produces the
// thing Ohad called "a weird glitchy way" — measured on the theme switch, 434
// element transitions all easing on their own schedule, still running 800ms
// later, on top of and outlasting each other.
//
// The View Transition API removes the problem instead of smoothing it: the
// browser snapshots the page, lets us make every change, and cross-fades the
// before and after as a single image. Staggered React commits inside the
// callback are invisible — they all land in the "after" snapshot.
//
// Two things this got wrong when it was written inline in useTheme, both worth
// keeping in mind before touching it:
//
//  1. Suppressing per-element motion with `animation-duration: 0` also killed
//     the view transition's OWN animation, producing a switch that was
//     perfectly smooth because nothing moved at all. Only TRANSITIONS are
//     suppressed (see .theme-switching in themes.css).
//  2. Awaiting requestAnimationFrame inside the callback deadlocks: the browser
//     suspends rendering while it runs, so rAF never fires, the promise never
//     settles, and the transition is skipped. Callers pass a SYNCHRONOUS commit
//     — use flushSync if React state has to land before the snapshot.

/**
 * Run `commit` as a single page-wide cross-fade.
 *
 * @param {() => void} commit  Must be synchronous. Everything it changes is
 *                             captured in the "after" snapshot.
 * @param {object}  [opts]
 * @param {string}  [opts.className]  class held on <html> for the duration,
 *                                    used to suppress per-element transitions.
 * @param {number}  [opts.fallbackMs] how long to hold the class when the API
 *                                    is unavailable.
 */
export function crossFade(commit, { className = 'theme-switching', fallbackMs = 320 } = {}) {
  if (typeof document === 'undefined') { commit(); return; }
  const root = document.documentElement;
  const reduced = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reduced motion, or a browser without the API: commit plainly. The CSS
  // cross-fade in themes.css still softens it where it applies.
  if (reduced || typeof document.startViewTransition !== 'function') {
    commit();
    return;
  }

  try {
    root.classList.add(className);
    const vt = document.startViewTransition(() => { commit(); });
    const done = () => root.classList.remove(className);
    if (vt && vt.finished && typeof vt.finished.then === 'function') vt.finished.then(done, done);
    else setTimeout(done, fallbackMs);
  } catch {
    root.classList.remove(className);
    commit();
  }
}
