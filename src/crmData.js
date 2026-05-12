// CRM v1 data layer for the trainee card.
//
// - useTraineeActivity(traineeId)       — manual coach-logged events from trainee_activity table
// - useTraineeNextActions(traineeId)    — todo list from trainee_next_actions table
// - deriveCadence(td, clientWorkouts)   — expected vs actual session gap (the "at risk" signal)
// - deriveAutoEvents(td, clientWorkouts, payments, plans) — merges workouts/payments/plan-starts
//                                          into the activity feed so coaches don't double-log.
//
// All writes go through Supabase. Reads are scoped to the trainee_id passed in.
// For couples (parent + __0 + __1), the caller is responsible for deciding
// whether to query parent-or-children — typically: lifecycle/next-actions on
// parent, activity per-member, both surfaces visible when viewing a couple.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

const ACT_KINDS = ['whatsapp', 'call', 'meeting', 'note', 'email', 'instagram', 'sms'];

const newId = (prefix) =>
  prefix + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

// ───────────────────────────────────────────────────────────────────────
// useTraineeActivity — manual coach interaction log, newest first.
// ───────────────────────────────────────────────────────────────────────
export function useTraineeActivity(traineeIds) {
  const ids = Array.isArray(traineeIds) ? traineeIds : (traineeIds ? [traineeIds] : []);
  const idsKey = ids.join('|');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (ids.length === 0) { setRows([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('trainee_activity')
      .select('*')
      .in('trainee_id', ids)
      .order('occurred_at', { ascending: false })
      .limit(200);
    if (error) {
      console.warn('trainee_activity fetch failed:', error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const add = useCallback(async ({ traineeId, kind, summary, occurredAt }) => {
    if (!traineeId || !summary?.trim()) return null;
    const row = {
      id: newId('act_'),
      trainee_id: traineeId,
      kind: ACT_KINDS.includes(kind) ? kind : 'note',
      summary: summary.trim(),
      occurred_at: occurredAt || new Date().toISOString(),
    };
    const { error } = await supabase.from('trainee_activity').insert(row);
    if (error) { console.warn('activity insert failed:', error.message); return null; }
    setRows(prev => [row, ...prev]);
    return row;
  }, []);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('trainee_activity').delete().eq('id', id);
    if (error) { console.warn('activity delete failed:', error.message); return false; }
    setRows(prev => prev.filter(r => r.id !== id));
    return true;
  }, []);

  return { rows, loading, refetch, add, remove };
}

// ───────────────────────────────────────────────────────────────────────
// useTraineeNextActions — per-trainee todo queue.
// ───────────────────────────────────────────────────────────────────────
export function useTraineeNextActions(traineeId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!traineeId) { setRows([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('trainee_next_actions')
      .select('*')
      .eq('trainee_id', traineeId)
      .order('status', { ascending: true })       // pending first
      .order('order_idx', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('next_actions fetch failed:', error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [traineeId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const add = useCallback(async (title, dueDate) => {
    const trimmed = (title || '').trim();
    if (!trimmed || !traineeId) return null;
    const row = {
      id: newId('na_'),
      trainee_id: traineeId,
      title: trimmed,
      due_date: dueDate || null,
      status: 'pending',
      order_idx: rows.length,
    };
    const { error } = await supabase.from('trainee_next_actions').insert(row);
    if (error) { console.warn('next_actions insert failed:', error.message); return null; }
    setRows(prev => [...prev, row]);
    return row;
  }, [traineeId, rows.length]);

  const toggleDone = useCallback(async (id) => {
    const cur = rows.find(r => r.id === id);
    if (!cur) return;
    const nextStatus = cur.status === 'done' ? 'pending' : 'done';
    const completedAt = nextStatus === 'done' ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('trainee_next_actions')
      .update({ status: nextStatus, completed_at: completedAt })
      .eq('id', id);
    if (error) { console.warn('next_actions update failed:', error.message); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: nextStatus, completed_at: completedAt } : r));
  }, [rows]);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('trainee_next_actions').delete().eq('id', id);
    if (error) { console.warn('next_actions delete failed:', error.message); return; }
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rows, loading, refetch, add, toggleDone, remove };
}

// ───────────────────────────────────────────────────────────────────────
// deriveCadence — turn td.format ("2x/week", "Couple 1x/week", etc.) into
// an expected sessions-per-week value, then compare against the gap since
// the last logged session to flag "at risk".
//
// Returns { sessionsPerWeek, daysSinceLast, expectedGap, behind, label,
//           level: 'on-track' | 'slipping' | 'at-risk' | 'inactive' }
// ───────────────────────────────────────────────────────────────────────
export function deriveCadence(td, clientWorkouts) {
  const format = String(td?.format || '').toLowerCase();
  let sessionsPerWeek = 2; // default
  const m = format.match(/(\d+(?:\.\d+)?)\s*x/);
  if (m) sessionsPerWeek = parseFloat(m[1]) || 2;
  if (sessionsPerWeek <= 0) sessionsPerWeek = 2;

  const ids = new Set();
  if (td?.id) ids.add(td.id);
  if (Array.isArray(td?.members)) td.members.forEach(m => m?.id && ids.add(m.id));

  const sessions = (clientWorkouts || [])
    .filter(w => ids.has(w.clientId))
    .map(w => new Date(w.date).getTime())
    .filter(t => Number.isFinite(t))
    .sort((a, b) => b - a);

  if (sessions.length === 0) {
    return { sessionsPerWeek, daysSinceLast: null, expectedGap: 7 / sessionsPerWeek,
             behind: 0, label: 'NO SESSIONS LOGGED', level: 'inactive' };
  }

  const lastTs = sessions[0];
  const daysSinceLast = Math.floor((Date.now() - lastTs) / 86400000);
  const expectedGap = 7 / sessionsPerWeek;
  const behind = Math.max(0, (daysSinceLast / expectedGap) - 1);

  let level = 'on-track';
  if (daysSinceLast > expectedGap * 3) level = 'at-risk';
  else if (daysSinceLast > expectedGap * 1.5) level = 'slipping';

  let label;
  if (level === 'on-track') label = `ON TRACK · last session ${daysSinceLast}d ago`;
  else if (level === 'slipping') label = `1 SESSION BEHIND · ${daysSinceLast}d`;
  else label = `AT RISK · ${daysSinceLast}d since last session`;

  return { sessionsPerWeek, daysSinceLast, expectedGap, behind, label, level };
}

// ───────────────────────────────────────────────────────────────────────
// useCompletedTasksForTrainee — fetches done coach_tasks linked to this
// trainee so they can be folded into deriveAutoEvents. Kept as a hook so
// React handles the loading lifecycle correctly.
// ───────────────────────────────────────────────────────────────────────
export function useCompletedTasksForTrainee(traineeId) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!traineeId) { setRows([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from('coach_tasks')
        .select('id, title, completed_at, status')
        .eq('related_kind', 'trainee')
        .eq('related_id', traineeId)
        .eq('status', 'done')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(50);
      if (!cancelled && !error && data) setRows(data);
    })();
    return () => { cancelled = true; };
  }, [traineeId]);
  return rows;
}

// ───────────────────────────────────────────────────────────────────────
// promoteNextActionToTask — converts a CRM next-action into a coach_tasks
// row, transferring title + due_date and tagging it to the trainee. Then
// deletes the original next-action so it doesn't linger in two places.
// Returns the created task row, or null on failure.
// ───────────────────────────────────────────────────────────────────────
export async function promoteNextActionToTask(nextAction, trainee) {
  if (!nextAction || !trainee?.id) return null;
  const taskId = 'tsk_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
  const taskRow = {
    id: taskId,
    title: nextAction.title,
    description: null,
    assignee: null,
    status: 'todo',
    priority: 'normal',
    due_date: nextAction.due_date || null,
    related_kind: 'trainee',
    related_id: trainee.id,
    related_label: trainee.name || null,
    notes_log: [{
      ts: new Date().toISOString(),
      note: `Promoted from Next Action.`,
    }],
  };
  const { error: insErr } = await supabase.from('coach_tasks').insert(taskRow);
  if (insErr) { console.warn('promote → task insert failed:', insErr.message); return null; }
  const { error: delErr } = await supabase.from('trainee_next_actions').delete().eq('id', nextAction.id);
  if (delErr) console.warn('promote → next_action delete failed (task created anyway):', delErr.message);
  return taskRow;
}

// ───────────────────────────────────────────────────────────────────────
// deriveAutoEvents — pulls workout sessions, plan-assignments, payment
// receipts, AND completed task events into a single chronological stream.
// These are NEVER written to trainee_activity; they're computed on render
// so the feed always reflects the source-of-truth tables.
//
// Returns events: [{ id, ts, kind, summary, autoSource }]
//   kind ∈ 'session' | 'plan' | 'payment' | 'task'
// ───────────────────────────────────────────────────────────────────────
export function deriveAutoEvents(td, clientWorkouts, payments, planIndex, completedTasks) {
  const ids = new Set();
  if (td?.id) ids.add(td.id);
  if (Array.isArray(td?.members)) td.members.forEach(m => m?.id && ids.add(m.id));

  const events = [];

  // Workout sessions (athlete-portal logged)
  for (const w of clientWorkouts || []) {
    if (!ids.has(w.clientId)) continue;
    const t = new Date(w.date).getTime();
    if (!Number.isFinite(t)) continue;
    const setsDone = (w.exercises || []).reduce((a, ex) => a + (ex.sets || []).filter(s => s.done).length, 0);
    const totalSets = (w.exercises || []).reduce((a, ex) => a + (ex.sets || []).length, 0);
    events.push({
      id: `auto-session-${w.id}`,
      ts: w.date,
      kind: 'session',
      summary: `${w.dayName || 'Workout'} · W${w.week || '?'} · ${setsDone}/${totalSets} sets`,
      autoSource: 'clientWorkouts',
    });
  }

  // Plan assignments — when a block first appeared for this trainee.
  for (const p of planIndex || []) {
    if (!ids.has(p.traineeId)) continue;
    if (!p.createdAt) continue;
    events.push({
      id: `auto-plan-${p.id}`,
      ts: p.createdAt,
      kind: 'plan',
      summary: `Started ${p.name}`,
      autoSource: 'plans',
    });
  }

  // Payments
  for (const p of payments || []) {
    if (!ids.has(p.traineeId)) continue;
    if (!p.date) continue;
    events.push({
      id: `auto-payment-${p.id}`,
      ts: p.date,
      kind: 'payment',
      summary: `₪${p.amount} · ${p.method}${p.status && p.status !== 'Paid' ? ` · ${p.status}` : ''}`,
      autoSource: 'payments',
    });
  }

  // Completed coach_tasks linked to this trainee (passed in from the hook)
  for (const t of completedTasks || []) {
    if (!t.completed_at) continue;
    events.push({
      id: `auto-task-${t.id}`,
      ts: t.completed_at,
      kind: 'task',
      summary: `Task completed: ${t.title}`,
      autoSource: 'coach_tasks',
    });
  }

  return events;
}

// Merge manual rows + auto-events into one chronological feed.
// `manualRows` are from useTraineeActivity; `autoEvents` from deriveAutoEvents.
export function mergeFeed(manualRows, autoEvents) {
  const manual = (manualRows || []).map(r => ({
    id: r.id, ts: r.occurred_at, kind: r.kind, summary: r.summary,
    autoSource: null, isManual: true,
  }));
  return [...manual, ...(autoEvents || [])]
    .filter(e => e.ts)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

export { ACT_KINDS };
