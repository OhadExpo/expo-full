import { useState, useCallback, useRef, useEffect } from 'react';
export function useStore(key, initial) {
  const [data, setData] = useState(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; } });
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const save = useCallback((next) => {
    const val = typeof next === 'function' ? next(dataRef.current) : next;
    setData(val);
    dataRef.current = val;
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key]);
  return [data, save];
}
