import { useState, useCallback } from 'react';
export function useStore(key, initial) {
  const [data, setData] = useState(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; } });
  const save = useCallback((next) => { const val = typeof next === 'function' ? next(data) : next; setData(val); try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, data]);
  return [data, save];
}
