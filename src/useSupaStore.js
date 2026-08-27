// src/useSupaStore.js — Supabase-backed storage hook (replaces useStore)
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from './supabase';
import { enqueue, registerHandler, drain, setOnError } from './offlineQueue';
import { setOnError as setBlobOnError } from './blobQueue';
import { checkStoreWrite } from './storeWriteGuard';

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
    // Auth-token codes recover after a refresh — queue them explicitly BEFORE the
    // message checks below (a 301 can carry an 'unauthorized'-ish message that would
    // otherwise mis-classify it as permanent).
    if (code === 'PGRST301' || code === 'PGRST302') return true;
    if (/^23\d{3}$/.test(code)) return false;
    if (code === '42501') return false;
    // PGRST* are permanent EXCEPT the auth-token ones: PGRST301 (JWT expired) and
    // PGRST302 (anon disallowed) recover after supabase-js refreshes the token, so
    // they MUST be queued — else a workout finished right on the token-refresh
    // boundary is silently dropped (never retried). Mirrors offlineQueue.isPermanent
    // exactly; the queue's critical-park logic then guarantees it's never lost.
    if (code.startsWith('PGRST') && code !== 'PGRST301' && code !== 'PGRST302') return false;
  }
  const msg = (err?.message || String(err || '')).toLowerCase();
  if (!msg) return true;
  // NB: 'jwt expired'/'invalid jwt' are deliberately NOT here — a stale token is
  // transient (refresh + retry), so those writes fall through to the queue.
  if (msg.includes('row-level security') || msg.includes('permission denied') ||
      msg.includes('not authorized') || msg.includes('unauthorized') ||
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
  // form_videos is MERGED, never blindly overwritten. A parked (retry-exhausted)
  // upsert rotates to the queue tail and can drain AFTER the blob queue already
  // patched a cloudUrl onto the row — replaying the finish-time snapshot would
  // reset that slot to {pendingBlobId, cloudUrl:null}, orphaning uploaded bytes
  // and showing the coach a forever-pending upload (audit 08-22).
  if (row && row.id && row.form_videos) {
    try {
      const { data: existing } = await supabase.from('client_workouts').select('form_videos').eq('id', row.id).maybeSingle();
      const srv = existing && existing.form_videos;
      if (srv && typeof srv === 'object') {
        const merged = Array.isArray(srv) ? [...(row.form_videos || [])] : { ...(row.form_videos || {}) };
        const entries = Array.isArray(srv) ? srv.map((v, i) => [i, v]) : Object.entries(srv);
        for (const [k, sv] of entries) {
          const mine = merged[k];
          // keep the server's slot when it already carries a real uploaded URL
          if (sv && sv.cloudUrl && !(mine && mine.cloudUrl)) merged[k] = sv;
        }
        row = { ...row, form_videos: merged };
      }
    } catch { /* read failed — fall through to the plain upsert */ }
  }
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
// Coach reviewNotes written while OFFLINE. Distinct from client_workouts.update
// (blobQueue's URL write, which IS authoritative for a slot's upload fields):
// here the SERVER owns each slot's upload/media fields and we apply only
// reviewNotes — the offline mirror of updateFormVideos's online read-modify-write,
// so a coach note drained later can't clobber an athlete upload. (WorkoutReview
// audit Finding 1 — residual close.)
registerHandler('client_workouts.mergeReviewNotes', async ({ id, formVideos }) => {
  const { data: row, error: readErr } = await supabase
    .from('client_workouts').select('form_videos').eq('id', id).maybeSingle();
  if (readErr) throw readErr;
  const serverFv = Array.isArray(row?.form_videos) ? row.form_videos : [];
  const inc = Array.isArray(formVideos) ? formVideos : [];
  const len = Math.max(serverFv.length, inc.length);
  const merged = [];
  for (let i = 0; i < len; i++) {
    const s = serverFv[i], c = inc[i];
    if (s && c) merged.push({ ...s, reviewNotes: c.reviewNotes !== undefined ? c.reviewNotes : s.reviewNotes });
    else merged.push(s || c);
  }
  const { error } = await supabase.from('client_workouts').upsert({ id, form_videos: merged }, { onConflict: 'id' });
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
  // Sticky "the user has mutated local state" latch (mirrors useSupaClientWorkouts
  // / useSupaBwLog). savingRef is only true DURING an in-flight write, so a slow
  // initial mount-load that resolves AFTER a save completed would clobber the
  // just-saved value back to the stale server snapshot. This latch is set on the
  // first save/saveLocal and never reset, so the load permanently defers to it.
  const mutatedRef = useRef(false);
  // DATA-LOSS GUARD (2026-08-27). The exercise library was replaced by a
  // TWO-ROW array because a save ran before the store had ever loaded: the
  // picker's "create in library" did setExercises(prev => [...prev, one]) while
  // `prev` was still the empty initial value, and save() writes the WHOLE
  // array. 1,326 exercises gone in one click.
  //
  // serverLoadedRef: has the server's value for this key actually been applied
  // (or confirmed absent)? Until it has, this store does not know what it
  // holds, and writing the whole array destroys data we never read.
  // serverLenRef: the last array length the SERVER reported — the baseline a
  // catastrophic shrink is measured against.
  const serverLoadedRef = useRef(false);
  const serverLenRef = useRef(null);

  // Load from Supabase on mount. On failure, fall back to any localStorage
  // snapshot and surface the error so the caller can show a banner.
  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase.from('store').select('value').eq('key', key).maybeSingle();
        if (error) throw error;
        // Record what the SERVER holds before deciding whether to apply it.
        // This must happen even when the apply is skipped below, because it is
        // what unlocks writing at all (see the guard in save()).
        if (row && row.value !== undefined) {
          serverLenRef.current = Array.isArray(row.value) ? row.value.length : null;
          serverLoadedRef.current = true;
        } else if (!error) {
          // No row for this key: legitimately empty, so writing is safe.
          serverLoadedRef.current = true;
          serverLenRef.current = 0;
        }
        // A local mutation normally wins over a slow load. But if the local
        // value is EMPTY and the server has rows, deferring means the store
        // stays empty forever — which is precisely how one click replaced the
        // library. An empty local value is not an edit worth protecting.
        const localIsEmpty = Array.isArray(dataRef.current) && dataRef.current.length === 0;
        const serverHasRows = Array.isArray(row?.value) && row.value.length > 0;
        const deferToLocal = (savingRef.current || mutatedRef.current) && !(localIsEmpty && serverHasRows);
        if (row && row.value !== undefined && !deferToLocal) {
          const val = asShape(row.value);
          if (key === 'expo-exercises') {
            // Yield so React doesn't block on committing a very large list.
            // Re-check savingRef INSIDE the timer: a save dispatched between the
            // outer guard and this macrotask would otherwise be clobbered back to
            // the stale server snapshot (data loss).
            // Same empty-local exception as the outer guard: never leave the
            // library empty because a mutation beat this macrotask.
            setTimeout(() => {
              const emptyNow = Array.isArray(dataRef.current) && dataRef.current.length === 0;
              if ((!savingRef.current && !mutatedRef.current) || emptyNow) { setData(val); dataRef.current = val; }
            }, 0);
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
        // on a transient network blip. EXCEPT the deliberately-unsynced keys:
        // a legacy 'expo-trainees' blob holds full-roster PII that RLS now
        // denies — resurrecting it here defeats the exclusion (audit 08-22).
        try {
          if (key !== 'expo-trainees' && key !== 'expo-exercises') {
            const s = localStorage.getItem(key);
            if (s) { const parsed = asShape(JSON.parse(s)); setData(parsed); dataRef.current = parsed; }
          }
        } catch {}
        setLoadError(e?.message || 'load failed');
        console.warn(`useSupaStore[${key}] load failed:`, e?.message || e);
      }
      setLoaded(true);
    })();
  }, [key]);

  useEffect(() => { dataRef.current = data; }, [data]);

  // TRUE instant realtime (the `store` table is in the supabase_realtime
  // publication): when this key changes on the server — another device or a
  // sync script writing — re-fetch and apply it live, so every open client stays
  // in sync like a shared Google Sheet. Skips our own in-flight write (savingRef)
  // and no-op diffs. Applies via saveLocal semantics (state + localStorage, no
  // re-write). A component mid-edit still wins for ~600ms until its own save
  // lands; last-write-wins after that, which is the shared-sheet contract.
  useEffect(() => {
    let disposed = false;
    let ch = null;
    try {
      ch = supabase.channel('store-rt-' + key)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store', filter: `key=eq.${key}` }, async () => {
          if (disposed || savingRef.current) return;
          try {
            const { data: row, error } = await supabase.from('store').select('value').eq('key', key).maybeSingle();
            if (disposed || error || !row || row.value === undefined || savingRef.current) return;
            const val = asShape(row.value);
            if (JSON.stringify(val) === JSON.stringify(dataRef.current)) return;
            setData(val); dataRef.current = val;
            if (key !== 'expo-exercises' && key !== 'expo-trainees') { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
          } catch { /* transient */ }
        })
        .subscribe();
    } catch { /* realtime optional */ }
    return () => { disposed = true; if (ch) { try { supabase.removeChannel(ch); } catch {} } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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

    // ---- DATA-LOSS GUARD (2026-08-27) ---------------------------------
    // A save writes the WHOLE array, so it must never run before the store has
    // been read, and must never accept a value that collapses it. Both rules
    // live in src/storeWriteGuard.js so they are unit-tested. See that file for
    // the incident this exists to prevent.
    const verdict = checkStoreWrite({
      value: val,
      serverLoaded: serverLoadedRef.current,
      serverLen: serverLenRef.current,
    });
    if (!verdict.ok) {
      console.warn(`useSupaStore[${key}] BLOCKED save (${verdict.reason}):`, verdict.message);
      emitSaveError({ key, op: 'save', msg: verdict.message });
      return;
    }
    // An accepted write becomes the new baseline for the next shrink check.
    if (Array.isArray(val)) serverLenRef.current = val.length;
    // -------------------------------------------------------------------

    mutatedRef.current = true;
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
    mutatedRef.current = true;
    // asShape: poll/broadcast payloads must never replace a declared-array
    // store with a non-array — one bad server value would crash every
    // connected client on its next .map/.filter (audit 08-22).
    const val = asShape(typeof next === 'function' ? next(dataRef.current) : next);
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
        const { data: rows, error } = await supabase.from('client_workouts').select('*').order('date', { ascending: false });
        // Guard on `error`, NOT on rows.length: on a DB/RLS failure supabase-js
        // returns rows===null (so `rows &&` short-circuits and the local cache is
        // preserved). A legitimately-EMPTY result ([]) must still clear state —
        // otherwise a device whose rows were all deleted elsewhere keeps showing
        // them from localStorage forever (audit BUG 2).
        if (!error && rows && !mutatedRef.current) {
          const mapped = rows.map(r => ({
            // planId disambiguates two couple members' identically-named plans;
            // plan_name alone cannot (audit 08-22 #31). Undefined until the
            // column exists — every consumer falls back to the name.
            id: r.id, clientId: r.client_id, planId: r.plan_id || null, planName: r.plan_name,
            dayName: r.day_name, week: r.week, date: r.date,
            autoregulation: r.autoregulation || {}, notes: r.notes || '',
            exercises: r.exercises || [], formVideos: r.form_videos || [],
            reviewedAt: r.reviewed_at || null
          }));
          // Overlay any workout still sitting in the offline queue that the server
          // doesn't have yet. A workout finished offline in a PRIOR session is
          // enqueued (critical) + cached but not yet drained; on next launch the
          // mount fetch resolves BEFORE the ~1.5s initial drain, so without this
          // overlay it clobbers state+localStorage and the workout vanishes from
          // History until a manual reload — risking the athlete re-logging a dup.
          // mutatedRef only covers THIS session's edits. Mirror the weekly_focus
          // overlay (audit finding #1).
          try {
            const haveIds = new Set(mapped.map(w => w.id));
            const queued = JSON.parse(localStorage.getItem('expo-offline-queue') || '[]');
            for (const item of queued) {
              if (item?.type !== 'client_workouts.upsert') continue;
              const r = item.payload?.row;
              if (!r || !r.id || haveIds.has(r.id)) continue;
              mapped.push({
                id: r.id, clientId: r.client_id, planName: r.plan_name,
                dayName: r.day_name, week: r.week, date: r.date,
                autoregulation: r.autoregulation || {}, notes: r.notes || '',
                exercises: r.exercises || [], formVideos: r.form_videos || [],
                reviewedAt: r.reviewed_at || null
              });
              haveIds.add(r.id);
            }
            // keep the fetch's date-desc ordering after merging queued rows in
            mapped.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
          } catch {}
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
        // MERGE the form_videos patch into current state — do NOT replace state
        // wholesale from localStorage. If an earlier save() hit a quota error the
        // setItem is swallowed, so the localStorage blob can be MISSING the newest
        // workout (which lives in React state + the DB). A blind setData(parsed)
        // would drop it from the UI until reload (audit BUG 4). Keep every current
        // workout, apply the patched form_videos, and never lose a current-only row.
        const cur = dataRef.current || [];
        const patchById = new Map((parsed || []).map(w => [w.id, w]));
        const seen = new Set();
        const merged = cur.map(w => {
          seen.add(w.id);
          const p = patchById.get(w.id);
          return p ? { ...w, formVideos: p.formVideos } : w;
        });
        for (const p of (parsed || [])) if (p && !seen.has(p.id)) merged.push(p);
        mutatedRef.current = true;
        setData(merged);
        dataRef.current = merged;
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
      const baseRow = {
        id: w.id, client_id: w.clientId, plan_name: w.planName,
        day_name: w.dayName, week: w.week, date: w.date,
        autoregulation: w.autoregulation, notes: w.notes,
        exercises: w.exercises, form_videos: w.formVideos,
        reviewed_at: w.reviewedAt || null
      };
      // plan_id is what lets the portal tell two couple members' identically-named
      // plans apart (audit #31). The column may not exist yet — same pre-migration
      // fallback usePlansStore uses for is_template_purchase, so this is a no-op
      // until `scripts/migrations/2026-08-25-client-workouts-plan-id.sql` runs and
      // starts working by itself the moment it does.
      let row = w.planId ? { ...baseRow, plan_id: w.planId } : baseRow;
      try {
        let { error } = await supabase.from('client_workouts').upsert(row);
        if (error && /column .*plan_id/i.test(error.message || '')) {
          row = baseRow;
          ({ error } = await supabase.from('client_workouts').upsert(row));
        }
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
    // Optimistic local update for immediate UI.
    const next = dataRef.current.map(w => w.id === id ? { ...w, formVideos } : w);
    mutatedRef.current = true;
    setData(next);
    dataRef.current = next;
    try { localStorage.setItem('expo-cw', JSON.stringify(next)); } catch {}
    try {
      // Server-authoritative READ-MODIFY-WRITE (audit CRITICAL). The coach's
      // clientWorkouts snapshot is frozen at page-load and never refreshes from
      // the server, so a whole-column overwrite here SILENTLY ERASED an athlete's
      // form video uploaded after the coach opened Review (the un-fixed mirror of
      // the blobQueue.attachUrl per-slot fix). Re-read the row and keep the
      // SERVER's upload/media fields per slot (cloudUrl / pendingBlobId / has /
      // uploadFailed / fileName …), applying only the local reviewNotes.
      const { data: row, error: readErr } = await supabase
        .from('client_workouts').select('form_videos').eq('id', id).maybeSingle();
      if (readErr) throw readErr;
      const serverFv = Array.isArray(row?.form_videos) ? row.form_videos : [];
      const inc = Array.isArray(formVideos) ? formVideos : [];
      const len = Math.max(serverFv.length, inc.length);
      const merged = [];
      for (let i = 0; i < len; i++) {
        const s = serverFv[i], c = inc[i];
        // shared slot: server owns media fields, client owns reviewNotes;
        // server-only slot (an athlete upload the coach never saw) is preserved.
        if (s && c) merged.push({ ...s, reviewNotes: c.reviewNotes !== undefined ? c.reviewNotes : s.reviewNotes });
        else merged.push(s || c);
      }
      const { error } = await supabase.from('client_workouts').update({ form_videos: merged }).eq('id', id);
      if (error) throw error;
      // Reconcile local state to the merged truth (may now include an athlete
      // upload the coach's stale snapshot lacked).
      const reconciled = dataRef.current.map(w => w.id === id ? { ...w, formVideos: merged } : w);
      setData(reconciled); dataRef.current = reconciled;
      try { localStorage.setItem('expo-cw', JSON.stringify(reconciled)); } catch {}
    } catch (e) {
      // Offline / DB flap: keep the optimistic local update and durably enqueue.
      // Drains via the reviewNotes-merge handler (server-authoritative on upload
      // fields), NOT the generic update — so a note drained after an athlete's
      // offline-window upload still can't clobber the video. Distinct dedupeKey
      // from blobQueue's 'fv:' URL writes so the two never replace each other.
      if (isTransient(e)) enqueue({ type: 'client_workouts.mergeReviewNotes', payload: { id, formVideos }, dedupeKey: 'fvnotes:' + id });
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
        const { data: rows, error } = await supabase.from('bw_logs').select('*').order('date', { ascending: true });
        // Guard on `error`, not rows.length — empty must clear stale local cache (audit BUG 2).
        if (!error && rows && !mutatedRef.current) {
          const mapped = rows.map(r => ({
            date: r.date, clientId: r.client_id, week: r.week, bw: r.bw,
            blockName: r.block_name, planId: r.plan_id
          }));
          // Overlay any weigh-in still queued offline that the server lacks —
          // same prior-session drain race as client_workouts (audit finding #1).
          try {
            const key = (b) => `${b.clientId}|${b.blockName}|${b.week}`;
            const have = new Set(mapped.map(key));
            const queued = JSON.parse(localStorage.getItem('expo-offline-queue') || '[]');
            for (const item of queued) {
              if (item?.type !== 'bw_logs.upsert') continue;
              const r = item.payload?.row;
              if (!r) continue;
              const entry = { date: r.date, clientId: r.client_id, week: r.week, bw: r.bw, blockName: r.block_name, planId: r.plan_id };
              if (have.has(key(entry))) continue;
              mapped.push(entry);
              have.add(key(entry));
            }
            mapped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          } catch {}
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
  // Sticky latch: once the coach has typed anything, the slow mount-fetch must NOT
  // overwrite it. The offline-queue overlay only covers writes that already enqueued;
  // a just-typed value sitting in pendingRef (no error yet, not queued) is invisible
  // to it, so without this guard the load reverts the edit on-screen (parity with the
  // three sibling hooks in this file — this one was missing it).
  const mutatedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase.from('weekly_focus').select('*');
        if (!rows || mutatedRef.current) return;
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
  // A tab close / PWA kill does NOT run React unmount cleanups, so a note still
  // inside the 500ms debounce never reached the server and vanished on every
  // other device (audit 08-22). pagehide + hidden-visibility are the only
  // reliable "page is going away" signals on mobile — flush on those too.
  useEffect(() => {
    const flushNow = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; flush(); } };
    const onHide = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushNow(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flushNow);
      document.addEventListener('visibilitychange', onHide);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', flushNow);
        document.removeEventListener('visibilitychange', onHide);
      }
      flushNow();
    };
  }, [flush]);

  const save = useCallback((next) => {
    mutatedRef.current = true; // once the coach types, the mount-fetch must not clobber it
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
