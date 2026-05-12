// Data layer for coach_notes — the global Notes feature.
//
// Two query shapes:
//   useCoachNotes()                 — Dashboard widget; returns pinned + recent across all contexts
//   useCoachNotes({targetKind, targetId})  — inline panel scoped to one context
//
// Writes go through Supabase. Optimistic local state so toggling pinned
// or appending a body doesn't blink.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

const newId = () => 'note_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

export function useCoachNotes(filter = {}) {
  const filterKey = JSON.stringify(filter);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    let q = supabase.from('coach_notes').select('*');
    if (filter.targetKind) q = q.eq('target_kind', filter.targetKind);
    if (filter.targetId) q = q.eq('target_id', filter.targetId);
    if (filter.pinnedOnly) q = q.eq('pinned', true);
    q = q.order('pinned', { ascending: false })
         .order('created_at', { ascending: false })
         .limit(filter.limit || 100);
    const { data, error } = await q;
    if (error) {
      console.warn('coach_notes fetch failed:', error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const body = (input.body || '').trim();
    if (!body) return null;
    const row = {
      id: newId(),
      body,
      target_kind: input.targetKind || null,
      target_id: input.targetId || null,
      target_label: input.targetLabel || null,
      pinned: !!input.pinned,
    };
    const { error } = await supabase.from('coach_notes').insert(row);
    if (error) { console.warn('coach_notes insert failed:', error.message); return null; }
    // Re-sort to keep pinned-then-recent invariant.
    setRows(prev => [row, ...prev].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at) - new Date(a.created_at);
    }));
    return row;
  }, []);

  const update = useCallback(async (id, patch) => {
    const { error } = await supabase.from('coach_notes').update(patch).eq('id', id);
    if (error) { console.warn('coach_notes update failed:', error.message); return; }
    setRows(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...patch } : r);
      return updated.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    });
  }, []);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('coach_notes').delete().eq('id', id);
    if (error) { console.warn('coach_notes delete failed:', error.message); return; }
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const togglePin = useCallback((id) => {
    const cur = rows.find(r => r.id === id);
    if (!cur) return;
    return update(id, { pinned: !cur.pinned });
  }, [rows, update]);

  return { rows, loading, refetch, create, update, remove, togglePin };
}
