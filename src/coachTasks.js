// Data layer for the in-app task manager (coach_tasks table).
//
// Single hook serves both the full TASKS tab and the trainee-card slice
// (where related_kind='trainee' filters to one trainee's tasks).
//
// Writes go through Supabase. The hook keeps a local list in state and
// patches it optimistically on create/update/delete so the UI stays
// responsive without re-fetching the entire list on every keystroke.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'];
export const TASK_PRIORITIES = ['normal', 'high'];

const newId = () => 'tsk_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

// Filter shape: { assignee?: string, status?: 'todo'|'in_progress'|'done'|'open',
//                 relatedKind?, relatedId?, search? }
// 'open' is a virtual status that maps to (todo, in_progress).
export function useCoachTasks(filter = {}) {
  const filterKey = JSON.stringify(filter);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    let q = supabase.from('coach_tasks').select('*');
    if (filter.assignee) q = q.eq('assignee', filter.assignee);
    if (filter.relatedKind) q = q.eq('related_kind', filter.relatedKind);
    if (filter.relatedId) q = q.eq('related_id', filter.relatedId);
    if (filter.status === 'open') q = q.in('status', ['todo', 'in_progress']);
    else if (filter.status) q = q.eq('status', filter.status);
    // Order: open tasks first (sort by priority desc, due_date asc), done last.
    q = q.order('status', { ascending: true })
         .order('due_date', { ascending: true, nullsFirst: false })
         .order('priority', { ascending: false })
         .order('created_at', { ascending: false })
         .limit(300);
    const { data, error } = await q;
    if (error) {
      console.warn('coach_tasks fetch failed:', error.message);
      setRows([]);
    } else {
      let result = data || [];
      if (filter.search) {
        const s = filter.search.toLowerCase();
        result = result.filter(r =>
          (r.title || '').toLowerCase().includes(s) ||
          (r.description || '').toLowerCase().includes(s) ||
          (r.related_label || '').toLowerCase().includes(s));
      }
      setRows(result);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const create = useCallback(async (input) => {
    const row = {
      id: newId(),
      title: (input.title || '').trim(),
      description: input.description || null,
      assignee: input.assignee || null,
      status: TASK_STATUSES.includes(input.status) ? input.status : 'todo',
      priority: TASK_PRIORITIES.includes(input.priority) ? input.priority : 'normal',
      due_date: input.dueDate || null,
      related_kind: input.relatedKind || null,
      related_id: input.relatedId || null,
      related_label: input.relatedLabel || null,
      notes_log: [],
    };
    if (!row.title) return null;
    const { error } = await supabase.from('coach_tasks').insert(row);
    if (error) { console.warn('coach_tasks insert failed:', error.message); return null; }
    setRows(prev => [row, ...prev]);
    return row;
  }, []);

  const update = useCallback(async (id, patch) => {
    const cur = rows.find(r => r.id === id);
    if (!cur) return;
    const dbPatch = { ...patch };
    if (patch.status === 'done' && cur.status !== 'done') {
      dbPatch.completed_at = new Date().toISOString();
    }
    if (patch.status && patch.status !== 'done' && cur.status === 'done') {
      dbPatch.completed_at = null;
    }
    const { error } = await supabase.from('coach_tasks').update(dbPatch).eq('id', id);
    if (error) { console.warn('coach_tasks update failed:', error.message); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...dbPatch } : r));
  }, [rows]);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('coach_tasks').delete().eq('id', id);
    if (error) { console.warn('coach_tasks delete failed:', error.message); return; }
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const appendNote = useCallback(async (id, note) => {
    const cur = rows.find(r => r.id === id);
    if (!cur || !note?.trim()) return;
    const log = [...(cur.notes_log || []), { ts: new Date().toISOString(), note: note.trim() }];
    const { error } = await supabase.from('coach_tasks').update({ notes_log: log }).eq('id', id);
    if (error) { console.warn('coach_tasks note append failed:', error.message); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, notes_log: log } : r));
  }, [rows]);

  return { rows, loading, refetch, create, update, remove, appendNote };
}

// Convenience: distinct assignees seen across all tasks. Used by the filter
// dropdown so the coach picks from people he's actually delegated to before.
export function useTaskAssignees() {
  const [assignees, setAssignees] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('coach_tasks')
        .select('assignee')
        .not('assignee', 'is', null);
      if (!cancelled && !error && data) {
        const unique = [...new Set(data.map(r => r.assignee).filter(Boolean))].sort();
        setAssignees(unique);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return assignees;
}
