// CRM data layer for the trainee card.
//
// - useTraineeActivity(traineeId)       — manual coach-logged events from trainee_activity table
// - useCompletedTasksForTrainee(id)     — done coach_notes linked to this trainee
// - deriveCadence(td, clientWorkouts)   — expected vs actual session gap (the "at risk" signal)
// - deriveAutoEvents(...)               — merges workouts/plans/payments/completed-tasks
//                                          into the activity feed so coaches don't double-log.
// - mergeFeed(manual, auto)             — chronological merge for display.
//
// All writes go through Supabase. Reads are scoped to the trainee_id passed in.
// For couples (parent + __0 + __1), the caller is responsible for deciding
// whether to query parent-or-children — typically: activity per-member, with
// both surfaces visible when viewing a couple.

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

// Note: useTraineeNextActions + the trainee_next_actions table were
// retired 2026-05-13 — coach_notes (the unified Tasks system, via
// NotesInline on the trainee card) absorbed the per-trainee todo
// queue. The table is left in the DB dormant; cleanup migration is a
// separate pass once we're sure nothing else references it.

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
// useCompletedTasksForTrainee — fetches done coach_notes linked to this
// trainee. The activity feed merges these in as 'task' events, and the
// linked_plan_id field powers the "from task: <body>" suffix on the
// plan auto-event so the chain is visible.
// ───────────────────────────────────────────────────────────────────────
export function useCompletedTasksForTrainee(traineeId) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!traineeId) { setRows([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from('coach_notes')
        .select('id, body, completed_at, linked_plan_id, status')
        .eq('target_kind', 'trainee')
        .eq('target_id', traineeId)
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

// Note: promoteNextActionToTask was retired 2026-05-13 with the consolidation.
// The Dashboard widget + NotesInline on the trainee card now handle
// both personal-todo and delegation use cases via coach_notes — no
// promotion step needed.

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
  // If a completed task is linked to this plan (via linked_plan_id), append
  // "from task: <body>" so the chain task→plan is visible end-to-end.
  const tasksByLinkedPlan = new Map();
  for (const t of completedTasks || []) {
    if (t.linked_plan_id) tasksByLinkedPlan.set(t.linked_plan_id, t);
  }
  for (const p of planIndex || []) {
    if (!ids.has(p.traineeId)) continue;
    if (!p.createdAt) continue;
    const linkedTask = tasksByLinkedPlan.get(p.id);
    events.push({
      id: `auto-plan-${p.id}`,
      ts: p.createdAt,
      kind: 'plan',
      summary: linkedTask
        ? `Started ${p.name} · from task: "${linkedTask.body}"`
        : `Started ${p.name}`,
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

  // Completed coach_notes (tasks) linked to this trainee. Skip ones that
  // also have linked_plan_id — those already showed up inline on the plan
  // event above, so a separate "task done" row would be a duplicate.
  for (const t of completedTasks || []) {
    if (!t.completed_at) continue;
    if (t.linked_plan_id) continue;
    events.push({
      id: `auto-task-${t.id}`,
      ts: t.completed_at,
      kind: 'task',
      summary: `Task completed: ${t.body}`,
      autoSource: 'coach_notes',
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
