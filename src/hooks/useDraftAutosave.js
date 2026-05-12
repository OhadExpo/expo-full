// Lightweight draft auto-save for short text inputs (task/note textboxes).
//
// Saves the body via `commit(body)` when ANY of these happen:
//   - textarea blur (user clicked / tabbed away)
//   - tab/visibility hidden (browser back, tab switch, screen lock)
//   - pagehide (refresh, tab close, browser back across pages)
//   - component unmount
//
// `commit` must be idempotent and tolerate an empty/whitespace string
// (in which case it should do nothing). On success it should clear the
// textbox via the setter passed in.
//
// Differs from the heavier useAutosave hook used by plan editing — this
// one is for "stop dropping drafts on the floor", not "real-time
// persistence". One commit per loss-of-focus is plenty.

import { useCallback, useEffect, useRef } from 'react';

export default function useDraftAutosave(body, setBody, commit) {
  // Refs so the event handlers always read the latest values without
  // forcing a re-subscribe per keystroke.
  const bodyRef = useRef(body);
  const commitRef = useRef(commit);
  const setBodyRef = useRef(setBody);
  useEffect(() => { bodyRef.current = body; }, [body]);
  useEffect(() => { commitRef.current = commit; }, [commit]);
  useEffect(() => { setBodyRef.current = setBody; }, [setBody]);

  const flush = useCallback(async () => {
    const draft = (bodyRef.current || '').trim();
    if (!draft) return;
    try {
      const ok = await commitRef.current(draft);
      // commit() that returned falsy = save failed; keep the draft so
      // the user can try again. truthy/undefined = success, clear it.
      if (ok !== false) setBodyRef.current('');
    } catch (e) {
      console.warn('draft autosave commit threw:', e);
      // Keep draft on the screen — caller's toast will surface the error.
    }
  }, []);

  // Tab visibility + pagehide listeners
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const onPageHide = () => { flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flush]);

  // Final flush on unmount — last chance to catch a draft that survived
  // every other path (e.g., parent route change without pagehide).
  useEffect(() => {
    return () => { flush(); };
  }, [flush]);

  // Return a `onBlur` handler the textarea wires up directly.
  return { onBlur: flush, flush };
}
