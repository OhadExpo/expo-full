// Data layer for coach_notes — the global Notes feature.
//
// Two query shapes:
//   useCoachNotes()                 — Dashboard widget; returns pinned + recent across all contexts
//   useCoachNotes({targetKind, targetId})  — inline panel scoped to one context
//
// Writes go through Supabase. Optimistic local state so toggling pinned
// or appending a body doesn't blink.

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { toast } from './ui';

const newId = () => 'note_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

// Friendly error reporter — shows a toast so silent save-failures stop
// happening. Also keeps the console.warn for debugging.
function reportFailure(action, error) {
  const msg = error?.message || String(error || 'unknown error');
  console.warn(action, 'failed:', msg);
  const friendlier = /relation .* does not exist/i.test(msg)
    ? `${action} failed — migration not applied yet (check scripts/migrations/)`
    : `${action} failed — ${msg}`;
  toast(friendlier, 'error', { ttl: 8000 });
}

export function useCoachNotes(filter = {}) {
  const filterKey = JSON.stringify(filter);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // Realtime channel connection state. Default true so the "sync lost" banner
  // never flashes on mount before the first SUBSCRIBED lands. Flips false only
  // if the channel errors/closes/times out — the 90s poll still keeps data
  // fresh, so it means "live updates paused", not "data is stale".
  const [connected, setConnected] = useState(true);
  // Tracks whether the realtime channel has dropped, so a RE-subscribe triggers
  // a catch-up refetch (realtime doesn't replay changes missed during an outage).
  const hadDropRef = useRef(false);

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
      reportFailure('Loading tasks', error);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  // Live sync between coaches (Ohad + Yuval): when ANY client changes
  // coach_notes, refetch — so a status / urgency / new task by one shows on the
  // other's screen with no refresh. Supabase realtime pushes the change the
  // instant it lands (if the table is in the realtime publication); a focus +
  // interval poll is the always-on fallback so it stays in sync regardless.
  useEffect(() => {
    const chName = 'coach_notes_live_' + Math.random().toString(36).slice(2, 9);
    const channel = supabase
      .channel(chName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_notes' }, () => { refetch(); })
      .subscribe((status) => {
        // SUBSCRIBED = live. CHANNEL_ERROR / TIMED_OUT / CLOSED = dropped.
        const isUp = status === 'SUBSCRIBED';
        setConnected(isUp);
        // Catch-up refetch on RE-subscribe after a drop — realtime does not
        // replay changes that landed during the outage, so without this a
        // status/urgency/new-task by the other coach stayed invisible until the
        // 90s poll. Skip the first SUBSCRIBED (the mount effect already fetched).
        if (isUp) { if (hadDropRef.current) { hadDropRef.current = false; refetch(); } }
        else { hadDropRef.current = true; }
      });
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    // 90s fallback poll — realtime + the focus listener already cover liveness;
    // the old 20s poll re-fetched + re-rendered the whole task list every 20s
    // even when idle and even though realtime had already delivered. (perf audit)
    const poll = setInterval(refetch, 90000);
    return () => {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
      window.removeEventListener('focus', onFocus);
      clearInterval(poll);
    };
  }, [refetch]);

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
      status: 'open',
      completed_at: null,
      linked_plan_id: null,
      auto_kind: input.autoKind || null,
      auto_ref: input.autoRef || null,
      // F-35 — knowledge base via tags. Normalized to lowercase strings
      // so the index works for case-insensitive matching.
      tags: Array.isArray(input.tags) && input.tags.length ? input.tags.map(t => String(t).trim().toLowerCase()).filter(Boolean) : null,
      // Local timestamp on the optimistic row keeps the sort stable until
      // the next refetch resolves the canonical server timestamp. Without
      // it, sortTasks compared NaN and the new task floated to a random
      // position.
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('coach_notes').insert(row);
    if (error) { reportFailure('Saving task', error); return null; }
    // Re-sort to keep open-pinned > open-recent > done invariant.
    setRows(prev => [row, ...prev].sort(sortTasks));
    return row;
  }, []);

  const update = useCallback(async (id, patch) => {
    const { error } = await supabase.from('coach_notes').update(patch).eq('id', id);
    if (error) { reportFailure('Updating task', error); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r).sort(sortTasks));
  }, []);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('coach_notes').delete().eq('id', id);
    if (error) { reportFailure('Deleting task', error); return; }
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const togglePin = useCallback((id) => {
    const cur = rows.find(r => r.id === id);
    if (!cur) return;
    return update(id, { pinned: !cur.pinned });
  }, [rows, update]);

  const toggleDone = useCallback((id) => {
    const cur = rows.find(r => r.id === id);
    if (!cur) return;
    if (cur.status === 'done') {
      return update(id, { status: 'open', completed_at: null });
    }
    return update(id, { status: 'done', completed_at: new Date().toISOString() });
  }, [rows, update]);

  return { rows, loading, connected, refetch, create, update, remove, togglePin, toggleDone };
}

// Sort: open + pinned first, then open by recency, then done at the end.
function sortTasks(a, b) {
  const aDone = a.status === 'done';
  const bDone = b.status === 'done';
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return new Date(b.created_at) - new Date(a.created_at);
}

// Mark a task done and link it to the plan that completed it. Used by the
// plan editor's onSave hook when a pending task→plan handoff is in flight.
export async function markTaskCompletedByPlan(taskId, planId) {
  if (!taskId || !planId) return false;
  const { error } = await supabase
    .from('coach_notes')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      linked_plan_id: planId,
    })
    .eq('id', taskId);
  if (error) { reportFailure('Linking task to plan', error); return false; }
  return true;
}

// SessionStorage handoff: the trainee task → "→ NEW PROGRAM" click writes
// here, the plan editor reads on mount, the plan editor clears on consume.
const PENDING_KEY = 'expo-pendingTaskPlanLink';

export function setPendingTaskPlanLink(payload) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch {}
}
// Destructive read. Prefer peek+drop in mount-races where the consumer
// may be cancelled before it commits to using the payload — see 1.9 fix
// in the audit doc; consume drops the link before the consumer confirms,
// so a race or unmount silently loses the handoff.
export function consumePendingTaskPlanLink() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw);
  } catch { return null; }
}
export function peekPendingTaskPlanLink() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function dropPendingTaskPlanLink() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch {}
}
