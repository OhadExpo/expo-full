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
  // Sentinel: when the user clicks an explicit SAVE button, the textarea
  // blurs FIRST (firing flush) and THEN the click fires (firing the
  // caller's own save handler) — double insert. Callers can flip this
  // ref to true before their save to suppress the blur path.
  const skipNextRef = useRef(false);
  useEffect(() => { bodyRef.current = body; }, [body]);
  useEffect(() => { commitRef.current = commit; }, [commit]);
  useEffect(() => { setBodyRef.current = setBody; }, [setBody]);

  const flush = useCallback(async () => {
    if (skipNextRef.current) { skipNextRef.current = false; return; }
    const draft = (bodyRef.current || '').trim();
    if (!draft) return;
    // Clear the local input optimistically BEFORE awaiting commit so that
    // a second event firing in the same tick (e.g., pagehide right after
    // blur) can't re-read the same body and double-insert.
    setBodyRef.current('');
    try {
      const ok = await commitRef.current(draft);
      if (ok === false) {
        // Save failed — restore the draft so the user can retry.
        setBodyRef.current(draft);
      }
    } catch (e) {
      console.warn('draft autosave commit threw:', e);
      setBodyRef.current(draft);
    }
  }, []);

  // Callers wire this onto their explicit-save handler to suppress the
  // imminent blur from also committing.
  const suppressNext = useCallback(() => { skipNextRef.current = true; }, []);

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

  // Return a `onBlur` handler the textarea wires up directly, plus
  // `suppressNext` for explicit-save buttons.
  return { onBlur: flush, flush, suppressNext };
}
