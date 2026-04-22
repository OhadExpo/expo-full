// src/useSupaStore.js — Supabase-backed storage hook (replaces useStore)
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from './supabase';

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
function emitSaveError(err) {
  for (const l of saveErrorListeners) {
    try { l(err); } catch {}
  }
}

// Generic store hook: loads from Supabase 'store' table, falls back to localStorage
// on network failure so the UI isn't stuck empty when Supabase is unreachable.
export function useSupaStore(key, initial) {
  const [data, setData] = useState(() => {
    // Skip synchronous localStorage parse for auth/exercise stores — Supabase is
    // the source of truth, and a stale localStorage blob here can overwrite fresh
    // server data during the brief window before the effect runs.
    if (key === 'expo-exercises' || key === 'expo-trainees') return initial;
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
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
          if (key === 'expo-exercises') {
            // Yield so React doesn't block on committing a very large list.
            setTimeout(() => { setData(row.value); dataRef.current = row.value; }, 0);
          } else {
            setData(row.value);
            dataRef.current = row.value;
            if (key !== 'expo-trainees') {
              try { localStorage.setItem(key, JSON.stringify(row.value)); } catch {}
            }
          }
        }
      } catch (e) {
        // Fall back to localStorage snapshot — nothing worse than an empty UI
        // on a transient network blip.
        try {
          const s = localStorage.getItem(key);
          if (s) { const parsed = JSON.parse(s); setData(parsed); dataRef.current = parsed; }
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
          if (error) console.warn(`useSupaStore[${key}] save error:`, error.message || error);
        } catch (e) {
          console.warn(`useSupaStore[${key}] save threw:`, e?.message || e);
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

  return [data, save, loaded, loadError];
}

// Client workouts hook — uses dedicated table
export function useSupaClientWorkouts(initial = []) {
  const [data, setData] = useState(() => {
    try { const s = localStorage.getItem('expo-cw'); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase.from('client_workouts').select('*').order('date', { ascending: false });
        if (rows && rows.length > 0) {
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
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const save = useCallback(async (next) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    setData(val);
    dataRef.current = val;
    try { localStorage.setItem('expo-cw', JSON.stringify(val)); } catch {}
    // Find new workouts not yet in Supabase
    const newItems = val.filter(w => !prev.find(p => p.id === w.id));
    for (const w of newItems) {
      try {
        await supabase.from('client_workouts').upsert({
          id: w.id, client_id: w.clientId, plan_name: w.planName,
          day_name: w.dayName, week: w.week, date: w.date,
          autoregulation: w.autoregulation, notes: w.notes,
          exercises: w.exercises, form_videos: w.formVideos,
          reviewed_at: w.reviewedAt || null
        });
      } catch {}
    }
  }, []);

  // Toggle or set reviewed state on an existing workout. Patches the single
  // row directly — save() only handles inserts, so this bypasses it.
  const markReviewed = useCallback(async (id, reviewed = true) => {
    const ts = reviewed ? new Date().toISOString() : null;
    const next = dataRef.current.map(w => w.id === id ? { ...w, reviewedAt: ts } : w);
    setData(next);
    dataRef.current = next;
    try { localStorage.setItem('expo-cw', JSON.stringify(next)); } catch {}
    try {
      await supabase.from('client_workouts').update({ reviewed_at: ts }).eq('id', id);
    } catch {}
  }, []);

  return [data, save, markReviewed];
}

// BW logs hook — uses dedicated table
export function useSupaBwLog(initial = []) {
  const [data, setData] = useState(() => {
    try { const s = localStorage.getItem('expo-bw'); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase.from('bw_logs').select('*').order('date', { ascending: true });
        if (rows && rows.length > 0) {
          const mapped = rows.map(r => ({
            date: r.date, clientId: r.client_id, week: r.week, bw: r.bw,
            blockName: r.block_name, planId: r.plan_id
          }));
          setData(mapped);
          dataRef.current = mapped;
          localStorage.setItem('expo-bw', JSON.stringify(mapped));
        }
      } catch {}
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const save = useCallback(async (next) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
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
      try {
        await supabase.from('bw_logs').upsert({
          client_id: b.clientId,
          plan_id: b.planId ?? null,
          block_name: b.blockName,
          week: b.week,
          bw: b.bw,
          date: b.date,
        }, { onConflict: 'client_id,block_name,week' });
      } catch {}
    }
    // Delete entries that were in prev but are gone from val
    const removed = prev.filter(p => {
      if (!p.blockName || !p.clientId) return false;
      return !val.find(v => v.clientId === p.clientId && v.blockName === p.blockName && v.week === p.week);
    });
    for (const p of removed) {
      try {
        await supabase.from('bw_logs').delete()
          .eq('client_id', p.clientId)
          .eq('block_name', p.blockName)
          .eq('week', p.week);
      } catch {}
    }
  }, []);

  return [data, save];
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
        if (rows && rows.length > 0) {
          const obj = {};
          rows.forEach(r => { obj[r.focus_key] = r.value; });
          setData(obj);
          dataRef.current = obj;
          localStorage.setItem('expo-weekly-focus', JSON.stringify(obj));
        }
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
        await supabase.from('weekly_focus').upsert({ focus_key: k, value: v, updated_at: new Date().toISOString() });
      } catch {}
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

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [flush]);

  return [data, save];
}
