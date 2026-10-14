import { useCallback, useEffect, useRef, useState } from 'react';

// Component-level autosave: every change to `value` queues an async `save(value)`
// through a serial Promise chain so writes never race or drop the latest data.
// Triggers a flush on the four ways out of an editor: debounce after typing,
// browser visibilitychange (tab switch / screen lock), pagehide (browser back,
// refresh, tab close), and component unmount.
//
// Returns:
//   status — 'idle' | 'pending' | 'saving' | 'saved' | 'error'
//   flush  — async () => void; awaits the chain tail (use from a Back button)
//   markClean — () => void; declare the current value already-saved (use after
//               an explicit Save handles all pending edits, to suppress the
//               redundant unmount/visibilitychange write)
//
// Required: value (the thing to persist), save (async fn returning truthy on
// success / falsy on failure / throwing on failure — all three are handled).
//
// Options:
//   debounceMs       — defaults 600
//   skipFirst        — defaults true; the initial render shouldn't trigger a
//                      write since it's just the loaded data
//   savedDisplayMs   — how long to show '✓ Saved' before reverting to 'idle'
export default function useAutosave(value, save, options = {}) {
  const { debounceMs = 600, skipFirst = true, savedDisplayMs = 1800 } = options;
  const [status, setStatus] = useState('idle');
  const valueRef = useRef(value);
  const saveRef = useRef(save);
  const dirtyRef = useRef(false);
  const chainRef = useRef(Promise.resolve());
  const isMountRef = useRef(skipFirst);
  const debounceRef = useRef(null);
  const savedTimerRef = useRef(null);
  // Result of the most recent save, so flush() can report success/failure to
  // its caller (SHARE/DUPLICATE/PREVIEW must NOT proceed on a stale DB copy).
  const lastOkRef = useRef(true);
  // WHAT THE SERVER HAS (14.10): the loaded value, then each value a save landed. A new object with the SAME content
  // (the editor re-normalising a plan after it loads) is not an edit - it re-saved an unchanged program on every open,
  // bumped updated_at and could make another device's save read as "changed on another device".
  const sig = (v) => { try { return JSON.stringify(v); } catch { return null; } };
  const savedSigRef = useRef(sig(value));
  const inflightRef = useRef(false);   // a save on the wire: an undo back to the OLD content must still be saved after it

  useEffect(() => { saveRef.current = save; }, [save]);
  // #780: an edit not saved yet holds the app's automatic update (SwUpdateBanner reads window.__expoUnsaved)
  const unsavedKey = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!unsavedKey.current) unsavedKey.current = Symbol('autosave');
    const set = (window.__expoUnsaved = window.__expoUnsaved || new Set());
    if (status === 'pending' || status === 'saving' || status === 'error') set.add(unsavedKey.current); else set.delete(unsavedKey.current);
    return undefined;
  }, [status]);
  // on unmount the key goes only once the FINAL save (started by the leave-flush below) has landed
  useEffect(() => () => { const k = unsavedKey.current; setTimeout(() => { Promise.resolve(chainRef.current).finally(() => { try { if (window.__expoUnsaved && k) window.__expoUnsaved.delete(k); } catch { /* noop */ } }); }, 0); }, []);

  const enqueue = useCallback(() => {
    if (!dirtyRef.current) return chainRef.current;
    const next = chainRef.current.then(async () => {
      if (!dirtyRef.current) return;
      setStatus('saving');
      // Snapshot now and clear dirty before awaiting; if a new edit lands during
      // the save it re-flips dirty and is picked up by the next enqueue.
      const snap = valueRef.current;
      dirtyRef.current = false;
      const snapSig = sig(snap);
      if (snapSig != null && snapSig === savedSigRef.current) { lastOkRef.current = true; if (!dirtyRef.current) setStatus('idle'); return; }   // nothing new
      let ok = true;
      inflightRef.current = true;
      try { ok = (await saveRef.current(snap)) !== false; }
      catch (e) { ok = false; console.error('useAutosave error:', e); }
      inflightRef.current = false;
      lastOkRef.current = ok;
      if (ok) savedSigRef.current = snapSig;
      if (!ok) {
        dirtyRef.current = true;
        setStatus('error');
        return;
      }
      if (!dirtyRef.current) {
        setStatus('saved');
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(
          () => setStatus(prev => (prev === 'saved' ? 'idle' : prev)),
          savedDisplayMs
        );
      }
    });
    chainRef.current = next;
    return next;
  }, [savedDisplayMs]);

  // Returns true if the flushed save succeeded (or there was nothing to save),
  // false if it failed — callers gate destructive/outbound actions on this.
  const flush = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    await enqueue();
    return lastOkRef.current;
  }, [enqueue]);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
    savedSigRef.current = sig(valueRef.current);
    setStatus('idle');
  }, []);

  useEffect(() => {
    valueRef.current = value;
    if (isMountRef.current) { isMountRef.current = false; return; }
    if (!dirtyRef.current && !inflightRef.current && sig(value) === savedSigRef.current) return;   // same content as the server's: no 'Editing…'
    dirtyRef.current = true;
    setStatus('pending');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { enqueue(); }, debounceMs);
  }, [value, enqueue, debounceMs]);

  useEffect(() => {
    const onLeave = () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      enqueue();
    };
    // visibilitychange targets `document` — bind it there (binding to window
    // relied on bubbling, which iOS Safari has historically dropped on
    // screen-lock/tab-switch, the exact case this flush exists for). pagehide
    // is a window event. Both flush the last edit before the tab is frozen.
    document.addEventListener('visibilitychange', onLeave);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onLeave);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [enqueue]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    enqueue();
  }, [enqueue]);

  return { status, flush, markClean };
}

// Cosmetic helper — same status pill PlanEditor uses, factored so every
// caller gets identical styling without copy-pasting the switch statement.
export function autosaveStatusLabel(status, C) {
  switch (status) {
    case 'pending': return { text: 'Editing…', color: C.tm };
    case 'saving': return { text: 'Saving…', color: C.tm };
    case 'saved':  return { text: '✓ Saved', color: C.gn };
    case 'error':  return { text: '⚠ Save failed', color: C.rd };
    default: return null;
  }
}
