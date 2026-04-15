// src/useSupaStore.js — Supabase-backed storage hook (replaces useStore)
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from './supabase';

// Generic store hook: loads from Supabase 'store' table, falls back to localStorage
export function useSupaStore(key, initial) {
  const [data, setData] = useState(() => {
    // Skip synchronous localStorage parse for large datasets — let Supabase load handle it
    if (key === 'expo-plans' || key === 'expo-exercises') return initial;
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const [loaded, setLoaded] = useState(false);
  const dataRef = useRef(data);
  const savingRef = useRef(false);
  const pendingRef = useRef(null);

  // Load from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: row } = await supabase.from('store').select('value').eq('key', key).maybeSingle();
        if (row && row.value !== undefined && !savingRef.current) {
          setData(row.value);
          dataRef.current = row.value;
          try { localStorage.setItem(key, JSON.stringify(row.value)); } catch {}
        }
      } catch {}
      setLoaded(true);
    })();
  }, [key]);

  useEffect(() => { dataRef.current = data; }, [data]);

  // Debounced Supabase write — ensures only the latest value gets written
  const writeToSupa = useCallback(async (val) => {
    pendingRef.current = val;
    if (savingRef.current) return; // a write is in progress, it'll pick up pendingRef
    savingRef.current = true;
    while (pendingRef.current !== null) {
      const toWrite = pendingRef.current;
      pendingRef.current = null;
      try {
        await supabase.from('store').upsert({ key, value: toWrite, updated_at: new Date().toISOString() });
      } catch {}
    }
    savingRef.current = false;
  }, [key]);

  const save = useCallback(async (next) => {
    const val = typeof next === 'function' ? next(dataRef.current) : next;
    setData(val);
    dataRef.current = val;
    // Skip localStorage for large datasets — Supabase is source of truth
    if (key !== 'expo-plans' && key !== 'expo-exercises') {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }
    writeToSupa(val);
  }, [key, writeToSupa]);

  return [data, save, loaded];
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
            exercises: r.exercises || [], formVideos: r.form_videos || []
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
          exercises: w.exercises, form_videos: w.formVideos
        });
      } catch {}
    }
  }, []);

  return [data, save];
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
            date: r.date, clientId: r.client_id, week: r.week, bw: r.bw
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
    // Insert new BW entries
    const newItems = val.filter(b => !prev.find(p => p.date === b.date && p.clientId === b.clientId));
    for (const b of newItems) {
      try {
        await supabase.from('bw_logs').insert({
          client_id: b.clientId, week: b.week, bw: b.bw, date: b.date
        });
      } catch {}
    }
  }, []);

  return [data, save];
}

// Weekly focus hook — uses dedicated table
export function useSupaWeeklyFocus(initial = {}) {
  const [data, setData] = useState(() => {
    try { const s = localStorage.getItem('expo-weekly-focus'); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);

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

  const save = useCallback(async (next) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    setData(val);
    dataRef.current = val;
    try { localStorage.setItem('expo-weekly-focus', JSON.stringify(val)); } catch {}
    // Upsert all keys (simple approach for small dataset)
    for (const [k, v] of Object.entries(val)) {
      if (prev[k] !== v) {
        try {
          await supabase.from('weekly_focus').upsert({ focus_key: k, value: v, updated_at: new Date().toISOString() });
        } catch {}
      }
    }
  }, []);

  return [data, save];
}
