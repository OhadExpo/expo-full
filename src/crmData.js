// CRM data layer for the trainee card.
//
// - useTraineeActivity(traineeId)       — manual coach-logged events from trainee_activity table
//                                          ({ rows, add, remove, update, refetch }).
// - useCompletedTasksForTrainee(id)     — done coach_notes linked to this trainee
// - deriveCadence(td, clientWorkouts)   — expected vs actual session gap, couple-aware.
// - deriveContactSilence(manualRows)    — days since last two-way touch (not 'note' memos).
// - derivePaymentRisk(td, payments)     — unpaid latest charge / stale monthly cycle.
// - deriveTenure(td)                    — "client since" as a compact 1y 2mo label.
// - deriveHealth(td, cw, manual, pay)   — composite of session+contact+payment; worst wins.
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

// Which kinds count as an actual two-way touch (for "last talked" / contact
// silence). A 'note' is a coach memo, not a contact, so it's excluded.
const CONTACT_KINDS = new Set(['whatsapp', 'call', 'meeting', 'email', 'instagram', 'sms']);

// Severity ordering so the composite health pill can take "worst of" across
// the three dimensions. 'unknown' is neutral — a dimension with no data must
// NOT make a client look healthier OR sicker than they are.
const LEVEL_RANK = { 'on-track': 1, 'slipping': 2, 'inactive': 3, 'at-risk': 4, 'unknown': 0 };
const worseLevel = (a, b) => (LEVEL_RANK[a] || 0) >= (LEVEL_RANK[b] || 0) ? a : b;

const DAY = 86400000;
const daysSince = (d) => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / DAY) : null;
};

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

  // Inline-edit an existing activity row. Only summary + kind + occurred_at
  // are editable — trainee_id is fixed. A typo no longer means delete + retype.
  const update = useCallback(async (id, { summary, kind, occurredAt }) => {
    const patch = {};
    if (typeof summary === 'string') patch.summary = summary.trim();
    if (kind && ACT_KINDS.includes(kind)) patch.kind = kind;
    if (occurredAt) patch.occurred_at = occurredAt;
    if (Object.keys(patch).length === 0) return false;
    const { error } = await supabase.from('trainee_activity').update(patch).eq('id', id);
    if (error) { console.warn('activity update failed:', error.message); return false; }
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    return true;
  }, []);

  return { rows, loading, refetch, add, remove, update };
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
function sessionsPerWeekFor(td) {
  const format = String(td?.format || '').toLowerCase();
  const m = format.match(/(\d+(?:\.\d+)?)\s*x/);
  let spw = m ? (parseFloat(m[1]) || 2) : 2;
  if (spw <= 0) spw = 2;
  return spw;
}

// Cadence for a single set of athlete IDs against their last logged session.
function cadenceForIds(ids, clientWorkouts, sessionsPerWeek) {
  const want = new Set(ids);
  const last = (clientWorkouts || [])
    .filter(w => want.has(w.clientId))
    .map(w => new Date(w.date).getTime())
    .filter(t => Number.isFinite(t))
    .sort((a, b) => b - a)[0];

  const expectedGap = 7 / sessionsPerWeek;
  if (last == null) {
    return { daysSinceLast: null, expectedGap, level: 'inactive' };
  }
  const daysSinceLast = Math.floor((Date.now() - last) / DAY);
  let level = 'on-track';
  if (daysSinceLast > expectedGap * 3) level = 'at-risk';
  else if (daysSinceLast > expectedGap * 1.5) level = 'slipping';
  return { daysSinceLast, expectedGap, level };
}

export function deriveCadence(td, clientWorkouts) {
  const sessionsPerWeek = sessionsPerWeekFor(td);

  // Couples (#6): a "1x/week couple" used to count BOTH members' sessions
  // together, so one active partner masked a silent one. Compute cadence
  // per member and surface the worst-off — the silent partner is the signal.
  const members = Array.isArray(td?.members) ? td.members.filter(m => m?.id) : [];
  if (members.length > 0) {
    const perMember = members.map(m => ({
      name: m.name || '',
      ...cadenceForIds([m.id], clientWorkouts, sessionsPerWeek),
    }));
    // Worst = highest severity, then most days silent within that severity.
    const worst = perMember.reduce((acc, cur) => {
      if (!acc) return cur;
      const w = worseLevel(acc.level, cur.level);
      if (w !== acc.level) return cur;
      if (w === cur.level && (cur.daysSinceLast || 0) > (acc.daysSinceLast || 0)) return cur;
      return acc;
    }, null);
    const who = worst?.name ? worst.name.split(' ')[0] : 'member';
    let label;
    if (worst.level === 'inactive') label = `${who.toUpperCase()} · NO SESSIONS LOGGED`;
    else if (worst.level === 'on-track') label = `BOTH ON TRACK · last ${worst.daysSinceLast}d`;
    else if (worst.level === 'slipping') label = `${who.toUpperCase()} BEHIND · ${worst.daysSinceLast}d`;
    else label = `${who.toUpperCase()} AT RISK · ${worst.daysSinceLast}d`;
    return { sessionsPerWeek, daysSinceLast: worst.daysSinceLast, expectedGap: worst.expectedGap,
             behind: 0, label, level: worst.level, perMember };
  }

  const c = cadenceForIds(td?.id ? [td.id] : [], clientWorkouts, sessionsPerWeek);
  let label;
  if (c.level === 'inactive') label = 'NO SESSIONS LOGGED';
  else if (c.level === 'on-track') label = `ON TRACK · last session ${c.daysSinceLast}d ago`;
  else if (c.level === 'slipping') label = `1 SESSION BEHIND · ${c.daysSinceLast}d`;
  else label = `AT RISK · ${c.daysSinceLast}d since last session`;
  const behind = c.daysSinceLast != null ? Math.max(0, (c.daysSinceLast / c.expectedGap) - 1) : 0;
  return { sessionsPerWeek, daysSinceLast: c.daysSinceLast, expectedGap: c.expectedGap, behind, label, level: c.level };
}

// ───────────────────────────────────────────────────────────────────────
// Composite health — the CRM's reason to exist: catch a client going cold
// across ANY channel, not just session cadence. Three dimensions:
//
//   session — deriveCadence (above), couple-aware.
//   contact — days since the last logged two-way touch (call/WhatsApp/…).
//   payment — an unpaid latest charge, or a monthly client whose last paid
//             charge has gone stale.
//
// Each dimension can be 'unknown' (no data) which stays neutral — absence of
// logging must not read as a red flag. The pill shows the WORST dimension.
// ───────────────────────────────────────────────────────────────────────

// Days since the last actual contact (excludes 'note' memos). Returns null
// when nothing has ever been logged — never logging ≠ silence.
export function deriveContactSilence(manualRows) {
  const last = (manualRows || [])
    .filter(r => CONTACT_KINDS.has(r.kind))
    .map(r => new Date(r.occurred_at).getTime())
    .filter(t => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  if (last == null) return { days: null, level: 'unknown', label: 'NO CONTACT LOGGED' };
  const days = Math.floor((Date.now() - last) / DAY);
  let level = 'on-track';
  if (days > 30) level = 'at-risk';
  else if (days > 14) level = 'slipping';
  const label = level === 'on-track'
    ? `IN TOUCH · ${days}d ago`
    : `NO CONTACT ${days}d`;
  return { days, level, label };
}

// Payment risk from the bit_payment_requests-backed rows + the monthly rate.
export function derivePaymentRisk(td, payments) {
  const ids = new Set();
  if (td?.id) ids.add(td.id);
  if (Array.isArray(td?.members)) td.members.forEach(m => m?.id && ids.add(m.id));
  const mine = (payments || []).filter(p => ids.has(p.traineeId) && p.date)
    .slice().sort((a, b) => new Date(a.date) - new Date(b.date));

  // `mine` is already sorted ascending by real date (line above), so the last
  // Paid entry is the latest. The old `.sort()` here was lexicographic on the
  // date STRING — correct only for ISO yyyy-mm-dd, wrong for dd/mm/yyyy (picked
  // the wrong "last paid" and corrupted the UNPAID/DUE day-counts). (logic audit)
  const lastPaid = mine.filter(p => p.status === 'Paid').map(p => p.date).pop()
    || td?.lastPayment || null;

  // An explicit non-Paid status on the most recent charge = outstanding.
  const latest = mine[mine.length - 1];
  if (latest && latest.status && latest.status !== 'Paid') {
    return { level: 'at-risk', label: `PAYMENT ${String(latest.status).toUpperCase()}`, lastPaid };
  }

  // Monthly client whose last paid charge has gone stale (rough 1-month
  // cycle + grace). No monthly rate or no history → unknown (neutral).
  const monthly = parseFloat(td?.monthly) || 0;
  if (monthly > 0 && lastPaid) {
    const d = daysSince(lastPaid);
    if (d != null && d > 50) return { level: 'at-risk', label: `UNPAID ${d}d`, lastPaid };
    if (d != null && d > 38) return { level: 'slipping', label: `PAYMENT DUE ${d}d`, lastPaid };
    return { level: 'on-track', label: 'PAID', lastPaid };
  }
  return { level: 'unknown', label: 'NO BILLING DATA', lastPaid };
}

// Tenure ("client since") as a compact "1y 2m" / "3m" / "12d" label (#5).
export function deriveTenure(td) {
  const start = td?.startDate || td?.since || null;
  if (!start) return null;
  const d = daysSince(start);
  if (d == null || d < 0) return null;
  if (d < 31) return { days: d, label: `${d}d` };
  const months = Math.floor(d / 30.4);
  if (months < 12) return { days: d, label: `${months}mo` };
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return { days: d, label: rem ? `${years}y ${rem}mo` : `${years}y` };
}

// Compose the three dimensions into one health verdict. The pill takes the
// worst; the breakdown row shows all three.
export function deriveHealth(td, clientWorkouts, manualRows, payments) {
  const session = deriveCadence(td, clientWorkouts);
  const contact = deriveContactSilence(manualRows);
  const payment = derivePaymentRisk(td, payments);

  const level = [session.level, contact.level, payment.level].reduce(worseLevel, 'unknown');
  // Label = the worst dimension's own label, so the pill says WHY it's flagged.
  let label = 'HEALTHY';
  if (level === 'unknown') label = session.label; // fall back to cadence text
  else {
    const ranked = [session, contact, payment]
      .filter(x => x.level === level)
      .sort((a, b) => (b.days || b.daysSinceLast || 0) - (a.days || a.daysSinceLast || 0));
    label = ranked[0]?.label || session.label;
  }
  return { level, label, session, contact, payment };
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
      summary: `${w.planName ? `${w.planName} · ` : ''}${w.dayName || 'Workout'} · W${w.week || '?'} · ${setsDone}/${totalSets} sets`,
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
      summary: `₪${p.amount}${p.method ? ` · ${p.method}` : ''}${p.status && p.status !== 'Paid' ? ` · ${p.status}` : ''}`,
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
