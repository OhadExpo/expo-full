// src/useSupaStore.js — Supabase-backed storage hook (replaces useStore)
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from './supabase';
import { enqueue, registerHandler, drain, setOnError } from './offlineQueue';
import { setOnError as setBlobOnError } from './blobQueue';

// ─────────────────────────────────────────────────────────────
// Save-error emitter. Every silent `catch {}` around a Supabase
// write used to mean: write failed, user typed into the void,
// next page load overwrote the local cache with pre-save data,
// work lost. Hooks now call `emitSaveError()` on failure and the
// app mounts a toast (see SaveErrorToast in auth.jsx) that shows
// the user something went wrong — no forced retries, no silent
// loss. Coach / client can see what's happening.
// ─────────────────────────────────────────────────────────────
const saveErrorListeners = new Set();
export function onSaveError(listener) {
  saveErrorListeners.add(listener);
  return () => saveErrorListeners.delete(listener);
}
export function emitSaveError(err) {
  for (const l of saveErrorListeners) {
    try { l(err); } catch {}
  }
}

// Forward queue-permanent failures (after MAX_ATTEMPTS) to the same toast bus
// so users see writes that gave up rather than discovering them missing later.
setOnError((e) => emitSaveError({ key: e.type, op: 'queue-drop', msg: e.msg }));
setBlobOnError((e) => emitSaveError({ key: 'form_video', op: 'upload-drop', msg: e.msg }));

// Decide whether a thrown/returned Supabase error is a transient network
// problem worth queueing (vs. a real DB error like a constraint violation
// that will never succeed on retry). When in doubt, queue — ops are idempotent
// or last-write-wins, so re-trying a real error costs only attempts*latency
// and eventually gets dropped via MAX_ATTEMPTS.
function isTransient(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = err?.code || '';
  // Permanent Postgres / PostgREST errors — retrying never helps. Surface a
  // toast on the first failure so the user knows the write didn't land,
  // instead of letting the queue burn 5 attempts × 30s in silence.
  //   23xxx — integrity constraint violations (unique, FK, NOT NULL, check)
  //   42501 — insufficient_privilege (RLS denied)
  //   PGRST* — PostgREST request errors (auth, schema, malformed)
  if (typeof code === 'string') {
    if (/^23\d{3}$/.test(code)) return false;
    if (code === '42501') return false;
    if (code.startsWith('PGRST')) return false;
  }
  const msg = (err?.message || String(err || '')).toLowerCase();
  if (!msg) return true;
  if (msg.includes('row-level security') || msg.includes('permission denied') ||
      msg.includes('not authorized') || msg.includes('unauthorized') ||
      msg.includes('jwt expired') || msg.includes('invalid jwt') ||
      msg.includes('duplicate key') || msg.includes('violates') ||
      msg.includes('check constraint') || msg.includes('foreign key')) return false;
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout') ||
      msg.includes('aborted') || msg.includes('offline') || msg.includes('econnreset') ||
      msg.includes('refused')) return true;
  return true; // default: queue
}

// ─── Queue handlers ─────────────────────────────────────────────────────────
// Each Supabase write that we want to survive offline gets a handler here.
// The wrapper functions in the hooks below try the write directly; on failure
// they enqueue with the matching `type`, and the handler replays it.
registerHandler('store.upsert', async ({ key, value }) => {
  const { error } = await supabase.from('store').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
});
registerHandler('client_workouts.upsert', async ({ row }) => {
  const { error } = await supabase.from('client_workouts').upsert(row);
  if (error) throw error;
});
registerHandler('client_workouts.update', async ({ id, patch }) => {
  // Update + ensure the row exists. The blob queue can race ahead of the
  // workout upsert (offline finish → online drain order is not guaranteed)
  // and call this against a row that hasn't materialized yet. Switching to
  // upsert with `id` lets the patch land either as a real update OR as a
  // stub insert that the subsequent `client_workouts.upsert` will then
  // merge over via onConflict on the primary key.
  const { error } = await supabase.from('client_workouts')
    .upsert({ id, ...patch }, { onConflict: 'id' });
  if (error) throw error;
});
registerHandler('client_workouts.delete', async ({ id }) => {
  const { error } = await supabase.from('client_workouts').delete().eq('id', id);
  if (error) throw error;
});
registerHandler('bw_logs.upsert', async ({ row }) => {
  // onConflict matches the table's (client_id, block_name, week) unique
  // constraint. Without it, replaying a queued bw upsert for an existing
  // (client, block, week) tuple fails with 23505 — same class as the
  // weekly_focus bug. The direct save path in useSupaBwLog already passes
  // this; the queue handler did not until now.
  const { error } = await supabase.from('bw_logs').upsert(row, { onConflict: 'client_id,block_name,week' });
  if (error) throw error;
});
registerHandler('bw_logs.delete', async ({ filter }) => {
  let q = supabase.from('bw_logs').delete();
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw error;
});
// Focus keys are `clientId|planName|dayName|eid|Wn` (legacy rows lack the
// clientId prefix). The client_id column drives the athlete-side RLS
// (wf_own_read) — rows without it are visible to staff only.
function focusClientId(k) {
  const seg = String(k).split('|')[0];
  return seg.startsWith('tr_') ? seg : null;
}
registerHandler('weekly_focus.upsert', async ({ k, v }) => {
  // onConflict: focus_key — table has serial id PK + unique focus_key. Without
  // this, every re-write of an existing focus_key tried to INSERT and failed
  // with 23505 (unique violation). The first save for a key worked; every
  // subsequent edit was silently lost.
  const { error } = await supabase.from('weekly_focus').upsert(
    { focus_key: k, value: v, client_id: focusClientId(k), updated_at: new Date().toISOString() },
    { onConflict: 'focus_key' }
  );
  if (error) throw error;
});

// Generic store hook: loads from Supabase 'store' table, falls back to localStorage
// on network failure so the UI isn't stuck empty when Supabase is unreachable.
export function useSupaStore(key, initial) {
  const [data, setData] = useState(() => {
    // Skip synchronous localStorage parse for auth/exercise stores — Supabase is
    // the source of truth, and a stale localStorage blob here can overwrite fresh
    // server data during the brief window before the effect runs.
    if (key === 'expo-exercises' || key === 'expo-trainees') return initial;
    // Coerce a corrupt persisted blob back to the declared shape: if the caller
    // declared an array store (initial is []) but the snapshot is a non-array
    // (a real serial-corruption/blob-restore hazard in this app's history), a
    // non-array here makes every downstream .map/.filter crash app-wide.
    try { const s = localStorage.getItem(key); const p = s ? JSON.parse(s) : initial; return (Array.isArray(initial) && !Array.isArray(p)) ? initial : p; } catch { return initial; }
  });
  // Same shape-guard for values loaded from Supabase / re-hydrated below.
  const asShape = (v) => (Array.isArray(initial) && !Array.isArray(v)) ? initial : v;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const dataRef = useRef(data);
  const savingRef = useRef(false);
  const pendingRef = useRef(null);

  // Load from Supabase on mount. On failure, fall back to any localStorage
  // snapshot and surface the error so the caller can show a banner.
  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase.from('store').select('value').eq('key', key).maybeSingle();
        if (error) throw error;
        if (row && row.value !== undefined && !savingRef.current) {
          const val = asShape(row.value);
          if (key === 'expo-exercises') {
            // Yield so React doesn't block on committing a very large list.
            // Re-check savingRef INSIDE the timer: a save dispatched between the
            // outer guard and this macrotask would otherwise be clobbered back to
            // the stale server snapshot (data loss).
            setTimeout(() => { if (!savingRef.current) { setData(val); dataRef.current = val; } }, 0);
          } else {
            setData(val);
            dataRef.current = val;
            if (key !== 'expo-trainees') {
              try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
            }
          }
        }
      } catch (e) {
        // Fall back to localStorage snapshot — nothing worse than an empty UI
        // on a transient network blip.
        try {
          const s = localStorage.getItem(key);
          if (s) { const parsed = asShape(JSON.parse(s)); setData(parsed); dataRef.current = parsed; }
        } catch {}
        setLoadError(e?.message || 'load failed');
        console.warn(`useSupaStore[${key}] load failed:`, e?.message || e);
      }
      setLoaded(true);
    })();
  }, [key]);

  useEffect(() => { dataRef.current = data; }, [data]);

  // Single-flight debounced writer. `pendingRef` is the "next value to write"
  // and `savingRef` is the in-flight lock. If a new save lands during a write,
  // it just updates pendingRef — the running loop picks it up on the next turn.
  // The previous version swallowed failures and left savingRef stuck true on
  // errors, blocking subsequent writes.
  const writeToSupa = useCallback(async (val) => {
    pendingRef.current = val;
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      while (pendingRef.current !== null) {
        const toWrite = pendingRef.current;
        pendingRef.current = null;
        try {
          const { error } = await supabase.from('store').upsert({ key, value: toWrite, updated_at: new Date().toISOString() });
          if (error) {
            if (isTransient(error)) {
              enqueue({ type: 'store.upsert', payload: { key, value: toWrite }, dedupeKey: key });
            } else {
              console.warn(`useSupaStore[${key}] save error:`, error.message || error);
              emitSaveError({ key, op: 'save', msg: error.message || String(error) });
            }
          }
        } catch (e) {
          if (isTransient(e)) {
            enqueue({ type: 'store.upsert', payload: { key, value: toWrite }, dedupeKey: key });
          } else {
            console.warn(`useSupaStore[${key}] save threw:`, e?.message || e);
            emitSaveError({ key, op: 'save', msg: e?.message || 'save failed' });
          }
        }
      }
    } finally {
      savingRef.current = false;
    }
  }, [key]);

  const save = useCallback(async (next) => {
    const val = typeof next === 'function' ? next(dataRef.current) : next;
    setData(val);
    dataRef.current = val;
    if (key !== 'expo-exercises' && key !== 'expo-trainees') {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }
    writeToSupa(val);
  }, [key, writeToSupa]);

  // Local-only setter: updates state + the localStorage snapshot but does NOT
  // write to Supabase. For applying a value that arrived over realtime broadcast
  // (the sender already persisted it) — persisting again on the receiver is
  // redundant, and on a user without write RLS (e.g. an athlete receiving a
  // coach's portal-visibility change) the failed upsert fires a false
  // "SAVE FAILED" toast.
  const saveLocal = useCallback((next) => {
    const val = typeof next === 'function' ? next(dataRef.current) : next;
    setData(val);
    dataRef.current = val;
    if (key !== 'expo-exercises' && key !== 'expo-trainees') {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }
  }, [key]);

  return [data, save, loaded, loadError, saveLocal];
}

// Client workouts hook — uses dedicated table
export function useSupaClientWorkouts(initial = []) {
  const [data, setData] = useState(() => {
    // Array-shape guard: a corrupt non-array 'expo-cw' blob would JSON.parse
    // fine but then poison every downstream .map/.filter/.reduce on cw and
    // white-screen Review/CRM/History. Fall back to `initial` unless it's an array.
    try { const s = localStorage.getItem('expo-cw'); const p = s ? JSON.parse(s) : initial; return Array.isArray(p) ? p : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);
  // Becomes true the moment the user mutates local state (new workout,
  // form-video patch, reviewed toggle, delete). Guards the initial Supabase
  // fetch below so a slow SELECT can't overwrite edits the user already made
  // — e.g. a review-comment saved during page load no longer gets wiped by
  // the (now stale) snapshot the server returns a moment later.
  const mutatedRef = useRef(false);

  // Loaded flips true after the initial fetch settles (success OR failure,
  // same semantics as useSupaStore) so the app shell can hold its splash
  // instead of flashing empty Review/CRM states while the table loads.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase.from('client_workouts').select('*').order('date', { ascending: false });
        if (rows && rows.length > 0 && !mutatedRef.current) {
          const mapped = rows.map(r => ({
            id: r.id, clientId: r.client_id, planName: r.plan_name,
            dayName: r.day_name, week: r.week, date: r.date,
            autoregulation: r.autoregulation || {}, notes: r.notes || '',
            exercises: r.exercises || [], formVideos: r.form_videos || [],
            reviewedAt: r.reviewed_at || null
          }));
          setData(mapped);
          dataRef.current = mapped;
          localStorage.setItem('expo-cw', JSON.stringify(mapped));
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  // Re-hydrate from localStorage when the blob queue patches a workout's
  // form_videos in place. Without this, components viewing History would
  // keep showing a pendingBlobId placeholder until the user reloads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPatch = () => {
      try {
        const s = localStorage.getItem('expo-cw');
        if (!s) return;
        const parsed = JSON.parse(s);
        mutatedRef.current = true;
        setData(parsed);
        dataRef.current = parsed;
      } catch {}
    };
    window.addEventListener('expo-cw-patched', onPatch);
    return () => window.removeEventListener('expo-cw-patched', onPatch);
  }, []);

  const save = useCallback(async (next) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    mutatedRef.current = true;
    setData(val);
    dataRef.current = val;
    try { localStorage.setItem('expo-cw', JSON.stringify(val)); } catch {}
    // Find new workouts not yet in Supabase
    const newItems = val.filter(w => !prev.find(p => p.id === w.id));
    for (const w of newItems) {
      const row = {
        id: w.id, client_id: w.clientId, plan_name: w.planName,
        day_name: w.dayName, week: w.week, date: w.date,
        autoregulation: w.autoregulation, notes: w.notes,
        exercises: w.exercises, form_videos: w.formVideos,
        reviewed_at: w.reviewedAt || null
      };
      try {
        const { error } = await supabase.from('client_workouts').upsert(row);
        if (error) {
          if (isTransient(error)) enqueue({ type: 'client_workouts.upsert', payload: { row }, dedupeKey: w.id, critical: true });
          else emitSaveError({ key: 'client_workouts', op: 'save', msg: error.message || String(error) });
        }
      } catch (e) {
        if (isTransient(e)) enqueue({ type: 'client_workouts.upsert', payload: { row }, dedupeKey: w.id, critical: true });
        else emitSaveError({ key: 'client_workouts', op: 'save', msg: e?.message || 'save failed' });
      }
    }
  }, []);

  // Toggle or set reviewed state on an existing workout. Patches the single
  // row directly — save() only handles inserts, so this bypasses it.
  const markReviewed = useCallback(async (id, reviewed = true) => {
    const ts = reviewed ? new Date().toISOString() : null;
    const next = dataRef.current.map(w => w.id === id ? { ...w, reviewedAt: ts } : w);
    mutatedRef.current = true;
    setData(next);
    dataRef.current = next;
    try { localStorage.setItem('expo-cw', JSON.stringify(next)); } catch {}
    try {
      const { error } = await supabase.from('client_workouts').update({ reviewed_at: ts }).eq('id', id);
      if (error) {
        if (isTransient(error)) enqueue({ type: 'client_workouts.update', payload: { id, patch: { reviewed_at: ts } }, dedupeKey: 'reviewed:' + id });
        else emitSaveError({ key: 'client_workouts', op: 'markReviewed', msg: error.message || String(error) });
      }
    } catch (e) {
      if (isTransient(e)) enqueue({ type: 'client_workouts.update', payload: { id, patch: { reviewed_at: ts } }, dedupeKey: 'reviewed:' + id });
      else emitSaveError({ key: 'client_workouts', op: 'markReviewed', msg: e?.message || 'update failed' });
    }
  }, []);

  // Patch just the form_videos column of a workout. Used by the trainer's
  // timestamped-comment feature and the client's reply-to-comment flow.
  // Optimistic: updates local state first, then writes to Supabase. Errors
  // surface via emitSaveError and get shown in the save-error toast.
  const updateFormVideos = useCallback(async (id, formVideos) => {
    const next = dataRef.current.map(w => w.id === id ? { ...w, formVideos } : w);
    mutatedRef.current = true;
    setData(next);
    dataRef.current = next;
    try { localStorage.setItem('expo-cw', JSON.stringify(next)); } catch {}
    try {
      const { error } = await supabase.from('client_workouts').update({ form_videos: formVideos }).eq('id', id);
      if (error) {
        if (isTransient(error)) enqueue({ type: 'client_workouts.update', payload: { id, patch: { form_videos: formVideos } }, dedupeKey: 'fv:' + id });
        else emitSaveError({ key: 'client_workouts', op: 'updateFormVideos', msg: error.message || String(error) });
      }
    } catch (e) {
      if (isTransient(e)) enqueue({ type: 'client_workouts.update', payload: { id, patch: { form_videos: formVideos } }, dedupeKey: 'fv:' + id });
      else emitSaveError({ key: 'client_workouts', op: 'updateFormVideos', msg: e?.message || 'update failed' });
    }
  }, []);

  // Hard-delete a workout (and its form videos / review notes by cascade —
  // the row owns those columns). Optimistic local removal, then DB delete.
  const deleteWorkout = useCallback(async (id) => {
    const next = dataRef.current.filter(w => w.id !== id);
    mutatedRef.current = true;
    setData(next);
    dataRef.current = next;
    try { localStorage.setItem('expo-cw', JSON.stringify(next)); } catch {}
    try {
      const { error } = await supabase.from('client_workouts').delete().eq('id', id);
      if (error) {
        if (isTransient(error)) enqueue({ type: 'client_workouts.delete', payload: { id } });
        else emitSaveError({ key: 'client_workouts', op: 'delete', msg: error.message || String(error) });
      }
    } catch (e) {
      if (isTransient(e)) enqueue({ type: 'client_workouts.delete', payload: { id } });
      else emitSaveError({ key: 'client_workouts', op: 'delete', msg: e?.message || 'delete failed' });
    }
  }, []);

  return [data, save, markReviewed, updateFormVideos, deleteWorkout, loaded];
}

// BW logs hook — uses dedicated table
export function useSupaBwLog(initial = []) {
  const [data, setData] = useState(() => {
    // Array-shape guard (same as useSupaClientWorkouts): a corrupt non-array
    // 'expo-bw' blob would poison the BW chart's min/max/map math.
    try { const s = localStorage.getItem('expo-bw'); const p = s ? JSON.parse(s) : initial; return Array.isArray(p) ? p : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);
  // Same loaded contract as useSupaClientWorkouts above.
  const [loaded, setLoaded] = useState(false);
  // Mirrors useSupaClientWorkouts' guard (see ~240). Without it, an athlete who
  // typed their weight and hit SAVE *before* this mount fetch resolved had the
  // response overwrite both state and the localStorage cache — their weigh-in
  // visibly vanished from the graph. The row did reach the DB (the upsert had
  // already fired), so it reappeared after a reload, which made it look random.
  const mutatedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase.from('bw_logs').select('*').order('date', { ascending: true });
        if (rows && rows.length > 0 && !mutatedRef.current) {
          const mapped = rows.map(r => ({
            date: r.date, clientId: r.client_id, week: r.week, bw: r.bw,
            blockName: r.block_name, planId: r.plan_id
          }));
          setData(mapped);
          dataRef.current = mapped;
          localStorage.setItem('expo-bw', JSON.stringify(mapped));
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const save = useCallback(async (next) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    // Claim local ownership BEFORE the await below, so an in-flight mount fetch
    // can no longer clobber this entry when it lands.
    mutatedRef.current = true;
    setData(val);
    dataRef.current = val;
    try { localStorage.setItem('expo-bw', JSON.stringify(val)); } catch {}
    // Upsert entries that are new or whose bw/date changed for (clientId, blockName, week)
    const changed = val.filter(b => {
      const p = prev.find(x => x.clientId === b.clientId && x.blockName === b.blockName && x.week === b.week);
      return !p || p.bw !== b.bw || p.date !== b.date;
    });
    for (const b of changed) {
      if (!b.blockName) continue; // DB requires block_name NOT NULL
      const row = {
        client_id: b.clientId,
        plan_id: b.planId ?? null,
        block_name: b.blockName,
        week: b.week,
        bw: b.bw,
        date: b.date,
      };
      const dedupeKey = `${b.clientId}|${b.blockName}|${b.week}`;
      try {
        const { error } = await supabase.from('bw_logs').upsert(row, { onConflict: 'client_id,block_name,week' });
        if (error) {
          if (isTransient(error)) enqueue({ type: 'bw_logs.upsert', payload: { row }, dedupeKey, critical: true });
          else emitSaveError({ key: 'bw_logs', op: 'save', msg: error.message || String(error) });
        }
      } catch (e) {
        if (isTransient(e)) enqueue({ type: 'bw_logs.upsert', payload: { row }, dedupeKey, critical: true });
        else emitSaveError({ key: 'bw_logs', op: 'save', msg: e?.message || 'save failed' });
      }
    }
    // Delete entries that were in prev but are gone from val
    const removed = prev.filter(p => {
      if (!p.blockName || !p.clientId) return false;
      return !val.find(v => v.clientId === p.clientId && v.blockName === p.blockName && v.week === p.week);
    });
    for (const p of removed) {
      const filter = { client_id: p.clientId, block_name: p.blockName, week: p.week };
      try {
        const { error } = await supabase.from('bw_logs').delete()
          .eq('client_id', p.clientId)
          .eq('block_name', p.blockName)
          .eq('week', p.week);
        if (error) {
          if (isTransient(error)) enqueue({ type: 'bw_logs.delete', payload: { filter } });
          else emitSaveError({ key: 'bw_logs', op: 'delete', msg: error.message || String(error) });
        }
      } catch (e) {
        if (isTransient(e)) enqueue({ type: 'bw_logs.delete', payload: { filter } });
        else emitSaveError({ key: 'bw_logs', op: 'delete', msg: e?.message || 'delete failed' });
      }
    }
  }, []);

  return [data, save, loaded];
}

// Weekly focus hook — uses dedicated table.
// Supabase writes are debounced 500ms so typing in the focus textarea doesn't
// fire one network call per keystroke. Local state + localStorage update
// synchronously, so UI feels instant.
export function useSupaWeeklyFocus(initial = {}) {
  const [data, setData] = useState(() => {
    try { const s = localStorage.getItem('expo-weekly-focus'); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);
  const pendingRef = useRef({}); // focus_key -> latest value not yet flushed
  const timerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase.from('weekly_focus').select('*');
        if (!rows) return;
        // Build merged state: cloud first, then overlay any unsynced writes
        // still sitting in the offline queue (e.g. last session typed a longer
        // value but the upsert hadn't drained yet). Without this overlay, a
        // page reload would replace the local cache with the older cloud
        // value and silently nuke the in-flight typing.
        const cloud = {};
        rows.forEach(r => { cloud[r.focus_key] = r.value; });
        let pending = {};
        try {
          const queued = JSON.parse(localStorage.getItem('expo-offline-queue') || '[]');
          for (const item of queued) {
            if (item?.type !== 'weekly_focus.upsert') continue;
            const { k, v } = item.payload || {};
            if (k != null) pending[k] = v;
          }
        } catch {}
        const merged = { ...cloud, ...pending };
        setData(merged);
        dataRef.current = merged;
        try { localStorage.setItem('expo-weekly-focus', JSON.stringify(merged)); } catch {}
      } catch {}
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    pendingRef.current = {};
    timerRef.current = null;
    for (const [k, v] of Object.entries(pending)) {
      try {
        const { error } = await supabase.from('weekly_focus').upsert(
          { focus_key: k, value: v, client_id: focusClientId(k), updated_at: new Date().toISOString() },
          { onConflict: 'focus_key' }
        );
        if (error) {
          if (isTransient(error)) enqueue({ type: 'weekly_focus.upsert', payload: { k, v }, dedupeKey: k });
          else emitSaveError({ key: 'weekly_focus', op: 'save', msg: error.message || String(error) });
        }
      } catch (e) {
        if (isTransient(e)) enqueue({ type: 'weekly_focus.upsert', payload: { k, v }, dedupeKey: k });
        else emitSaveError({ key: 'weekly_focus', op: 'save', msg: e?.message || 'save failed' });
      }
    }
  }, []);

  // Flush any pending writes on unmount so typed notes don't sit in memory.
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); flush(); }
  }, [flush]);

  const save = useCallback((next) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    setData(val);
    dataRef.current = val;
    try { localStorage.setItem('expo-weekly-focus', JSON.stringify(val)); } catch {}

    for (const [k, v] of Object.entries(val)) {
      if (prev[k] !== v) pendingRef.current[k] = v;
    }
    // Sync CLEARS too: a focus key present before but now removed from `val`
    // means the coach cleared that week's focus. Without this the delete never
    // reached Supabase (save only diffed keys present in val), so a reload
    // restored the "cleared" focus and the athlete kept seeing it. Push '' so
    // flush upserts an empty value (= no focus). (deep-logic audit)
    for (const k of Object.keys(prev)) {
      if (!(k in val) && prev[k] !== '') pendingRef.current[k] = '';
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [flush]);

  return [data, save];
}
