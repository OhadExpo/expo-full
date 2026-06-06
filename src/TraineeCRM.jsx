// CRM surface for the trainee card. Renders three sections, top to bottom:
//
//   1. Cadence pill  — derived from td.format vs the latest logged session.
//   2. NEXT ACTIONS  — NotesInline scoped to this trainee. Tasks tagged to
//                      this trainee live in coach_notes and surface here.
//                      "→ NEW PROGRAM" on a task opens the plan editor
//                      pre-bound to this trainee; on save the task gets
//                      linked_plan_id set and auto-flips to done.
//   3. Activity Feed — manual log (trainee_activity) merged with auto-events
//                      from workouts/plans/payments/completed-tasks. Plan
//                      events show "from task: <body>" when a task is the
//                      origin so the chain is visible.
//
// Stays minimal: a single column inserted above the existing Billing block.
// Hebrew detection on user-entered summary text flips direction:rtl + FH font.
//
// Couples (trainee.members[]): the parent ID drives cadence + tasks; the
// activity feed pulls from all member IDs so per-member context is visible
// in one place. The caller passes the canonical trainee object.

import React, { useMemo, useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { isRefined5b, RefinedHeaderStrip, useEscClose, usePersistentState } from './ui';
import CoachMessages from './CoachMessages';
import {
  useTraineeActivity, useCompletedTasksForTrainee,
  deriveHealth, deriveTenure,
  deriveAutoEvents, mergeFeed, ACT_KINDS,
} from './crmData';
import NotesInline from './NotesInline';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

// Category colour per activity kind — replaces emojis (brand is cyan/mono,
// no emojis). Contact = cyan, messaging = green, money/training = green,
// notes = muted. Rendered as a small dot, matching the CadencePill.
const KIND_COLOR = {
  whatsapp: C.gn, sms: C.gn, call: C.ac, meeting: C.ac,
  email: C.ac, instagram: C.ac, note: C.tm,
  session: C.gn, plan: C.ac, payment: C.gn, task: C.ac,
};

const KIND_LABEL = {
  whatsapp: 'WhatsApp', call: 'Call', meeting: 'Meeting', note: 'Note',
  email: 'Email', instagram: 'IG DM', sms: 'SMS',
  session: 'Session', plan: 'Plan', payment: 'Payment', task: 'Task',
};

const cadenceColor = (level) => ({
  'on-track': C.gn, 'slipping': C.or, 'at-risk': C.rd, 'inactive': C.td, 'unknown': C.tm,
}[level] || C.tm);

const DIM_LABEL = { session: 'TRAIN', contact: 'CONTACT', payment: 'PAY' };

// Composite health pill — worst of session / contact / payment (#1), with a
// breakdown chip per dimension so the coach sees WHICH channel went cold.
function HealthPill({ health }) {
  const col = cadenceColor(health.level);
  const dims = [
    ['session', health.session],
    ['contact', health.contact],
    ['payment', health.payment],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
        padding: '6px 12px', border: `1px solid ${col}`,
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
        fontFamily: FN, fontSize: 11, color: col, letterSpacing: '0.06em', fontWeight: 700,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
        {health.label}
      </div>
      {/* Per-dimension breakdown. 'unknown' dims are muted, not alarming. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dims.map(([key, d]) => {
          const c = cadenceColor(d.level);
          const muted = d.level === 'unknown';
          return (
            <span key={key} title={d.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              color: muted ? C.td : c, padding: '2px 7px',
              border: `1px solid ${muted ? C.cardBd : c}`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: muted ? C.td : c }} />
              {DIM_LABEL[key]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Compact stats strip: last trained vs last talked (#2) + tenure (#5).
function StatsStrip({ health, tenure }) {
  const d = health.session.daysSinceLast;
  const c = health.contact.days;
  const Stat = ({ label, value, tone }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: '0.12em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontFamily: FN, fontSize: 12, color: tone || C.tx, letterSpacing: '0.04em', fontWeight: 700 }}>{value}</span>
    </div>
  );
  return (
    <div style={{
      display: 'flex', gap: 18, padding: '8px 12px', flexWrap: 'wrap',
      border: `1px solid ${C.cardBd}`, background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
    }}>
      <Stat label="LAST TRAINED" value={d == null ? '—' : `${d}d ago`} tone={cadenceColor(health.session.level)} />
      <Stat label="LAST TALKED" value={c == null ? '—' : `${c}d ago`} tone={cadenceColor(health.contact.level)} />
      {tenure && <Stat label="CLIENT" value={tenure.label} />}
    </div>
  );
}

function ActivityFeed({ trainee, activity, clientWorkouts, payments, planIndex, bareMode = false }) {
  const { rows: manualRows, remove, update } = activity;
  const completedTasks = useCompletedTasksForTrainee(trainee?.id);
  const autoEvents = useMemo(
    () => deriveAutoEvents(trainee, clientWorkouts, payments, planIndex, completedTasks),
    [trainee, clientWorkouts, payments, planIndex, completedTasks],
  );
  const merged = useMemo(() => mergeFeed(manualRows, autoEvents), [manualRows, autoEvents]);

  // Inline edit (#4) — a typo in a logged activity no longer means delete +
  // retype. Only manual rows are editable; auto-events are computed.
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const startEdit = (ev) => { setEditId(ev.id); setEditText(ev.summary); };
  const cancelEdit = () => { setEditId(null); setEditText(''); };
  const saveEdit = async () => {
    const s = editText.trim();
    if (s && editId) await update(editId, { summary: s });
    cancelEdit();
  };

  // Collapsed default: 3 rows. Was 8 — every trainee page got a
  // 400-480px tower of activity by default which crowded out the rest
  // of the trainee detail. 3 keeps "what happened most recently"
  // visible without dominating; SHOW ALL still opens up to 60.
  const [showAll, setShowAll] = useState(false);
  const COLLAPSED_LIMIT = 3;
  const visible = showAll ? merged.slice(0, 60) : merged.slice(0, COLLAPSED_LIMIT);

  const refined = isRefined5b();
  const PAD = 14;
  // Inner list — empty state + visible event rows + show-all button.
  // bareMode returns this directly so the parent can render its own
  // header strip + composer.
  const body = (
    <>
      {merged.length === 0 && (
        <div style={{ fontSize: 12, color: C.td, padding: '14px 0', textAlign: 'center' }}>
          No activity yet.
        </div>
      )}

      {visible.map(ev => {
        const isManual = !!ev.isManual;
        const heb = isHebrew(ev.summary);
        return (
          <div key={ev.id} style={{
            display: 'flex', gap: 10, padding: '8px 0',
            borderBottom: `1px solid ${C.cardBd}`,
          }}>
            <div style={{ flexShrink: 0, width: 14, display: 'flex', justifyContent: 'center', paddingTop: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: KIND_COLOR[ev.kind] || C.tm, flexShrink: 0 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontFamily: FN, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 3 }}>
                <span style={{ color: KIND_COLOR[ev.kind] || C.tm }}>{KIND_LABEL[ev.kind] || ev.kind.toUpperCase()}</span>
                <span style={{ color: C.td }}> · {new Date(ev.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {new Date(ev.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                {!isManual && <span style={{ marginLeft: 6, color: C.tm }}>· AUTO</span>}
              </div>
              {editId === ev.id ? (
                <textarea value={editText} onChange={e => setEditText(e.target.value)} dir="auto" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  onBlur={saveEdit} rows={Math.max(2, editText.split('\n').length)}
                  style={{
                    width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0,
                    padding: '6px 8px', color: C.tx, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                    resize: 'vertical', fontFamily: heb ? FH : FB,
                  }} />
              ) : (
                <div dir="auto" style={{
                  fontSize: 12, color: C.tx, lineHeight: 1.4,
                  fontFamily: FB,
                }}>{ev.summary}</div>
              )}
            </div>
            {isManual && editId !== ev.id && (
              <div style={{ display: 'flex', gap: 2, alignSelf: 'flex-start', flexShrink: 0 }}>
                <button onClick={() => startEdit(ev)} title="Edit"
                  style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 11, padding: '0 4px' }}>✏</button>
                <button onClick={() => remove(ev.id)} title="Remove"
                  style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
              </div>
            )}
          </div>
        );
      })}

      {merged.length > COLLAPSED_LIMIT && !showAll && (
        <button onClick={() => setShowAll(true)}
          style={{
            width: '100%', marginTop: 10, padding: '6px 0', background: 'transparent',
            border: `1px solid ${C.cardBd}`, color: C.tm, fontFamily: FN, fontSize: 10,
            fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          }}>SHOW ALL {merged.length}</button>
      )}
    </>
  );

  // bareMode renders just the inner list; the parent owns the card +
  // header + the unified "+ LOG" composer (CoachHistoryCard).
  if (bareMode) return body;

  // Standalone — kept for backward compatibility but no longer the
  // primary mount path. TraineeCRM uses bareMode + the unified card.
  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: PAD, marginBottom: 12,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={10}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
            ACTIVITY ({merged.length})
          </span>
        </div>
      </RefinedHeaderStrip>
      {body}
    </div>
  );
}

// Combined "+ LOG" composer — one form creates an activity row AND
// optionally a follow-up task in coach_notes. The user's spec:
// "logging a phone call notes + task for next week".
function CombinedLogModal({ trainee, addActivity, onClose, onSaved }) {
  const [kind, setKind] = useState('whatsapp');
  const [summary, setSummary] = useState('');
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [alsoTask, setAlsoTask] = useState(false);
  const [taskBody, setTaskBody] = useState('');
  const [saving, setSaving] = useState(false);
  useEscClose(true, () => { if (!saving) onClose(); }); // Escape closes (not mid-save)

  const submit = async () => {
    const s = summary.trim();
    if (!s) return;
    setSaving(true);
    try {
      await addActivity({
        traineeId: trainee.id,
        kind,
        summary: s,
        occurredAt: new Date(when).toISOString(),
      });
      if (alsoTask && taskBody.trim()) {
        const { supabase } = await import('./supabase');
        await supabase.from('coach_notes').insert({
          id: 'note_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4),
          body: taskBody.trim(),
          target_kind: 'trainee',
          target_id: trainee.id,
          target_label: trainee.name || null,
          pinned: false,
          status: 'open',
          created_at: new Date().toISOString(),
        });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.warn('Log save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Log activity" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 60,
      backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.bg, border: `1px solid ${C.cardBd}`, borderRadius: 0,
        padding: 22, maxWidth: 480, width: '100%', maxHeight: '80vh', overflow: 'auto',
      }}>
        <div style={{ fontSize: 11, fontFamily: FN, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 14 }}>
          + LOG WHAT HAPPENED
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {ACT_KINDS.map(k => (
            <button key={k} onClick={() => setKind(k)}
              style={{
                padding: '6px 10px', borderRadius: 0,
                border: `1px solid ${kind === k ? C.ac : C.cardBd}`,
                background: 'transparent', color: kind === k ? C.ac : C.tm,
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <textarea value={summary} onChange={e => setSummary(e.target.value)} dir="auto"
          placeholder="What happened?"
          rows={4}
          style={{
            width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
            borderRadius: 0, padding: '10px 12px', color: C.tx, fontSize: 13,
            outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
            fontFamily: FB,
          }} />
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
          style={{
            width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
            borderRadius: 0, padding: '8px 10px', color: C.tx, fontFamily: FN, fontSize: 12,
            outline: 'none', boxSizing: 'border-box', marginBottom: 12,
          }} />
        {/* Follow-up task — same form, one extra checkbox. The spec is
            "phone call notes + task for next week" → activity + task
            in a single submit. */}
        <div style={{ borderTop: `1px solid ${C.cardBd}`, paddingTop: 10, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={alsoTask} onChange={e => setAlsoTask(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: C.ac, cursor: 'pointer' }} />
            <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em', fontWeight: 700 }}>
              ALSO CREATE A FOLLOW-UP TASK
            </span>
          </label>
          {alsoTask && (
            <textarea value={taskBody} onChange={e => setTaskBody(e.target.value)} dir="auto"
              placeholder="Follow-up task — e.g. 'Check in next week about his shoulder'"
              rows={2}
              style={{
                width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.ac}`,
                borderRadius: 0, padding: '8px 10px', color: C.tx, fontSize: 13,
                outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                fontFamily: isHebrew(taskBody) ? FH : FB,
              }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 0, border: `1px solid ${C.cardBd}`,
              background: 'transparent', color: C.tm, fontFamily: FN, fontSize: 11,
              fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
            }}>CANCEL</button>
          <button onClick={submit} disabled={!summary.trim() || saving}
            style={{
              padding: '8px 16px', borderRadius: 0,
              border: `1px solid ${summary.trim() ? C.ac : C.cardBd}`,
              background: 'transparent', color: summary.trim() ? C.ac : C.td,
              fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              cursor: summary.trim() ? 'pointer' : 'default',
            }}>{saving ? 'SAVING…' : alsoTask ? 'LOG + TASK →' : 'LOG →'}</button>
        </div>
      </div>
    </div>
  );
}

// CoachHistoryCard — the unified card the spec asks for. One header
// strip + "+ LOG" button at the top, then two sub-sections inside:
//   1. NEXT ACTIONS (NotesInline in bareMode)
//   2. ACTIVITY    (ActivityFeed in bareMode)
// The combined "+ LOG" composer writes to BOTH systems in one submit.
function CoachHistoryCard({ trainee, activity, clientWorkouts, payments, planIndex, onCreatePlanForTask, onOpenIntakeTab }) {
  const [showLog, setShowLog] = useState(false);
  // Collapsible — the cyan strip title is the toggle (the + LOG button stays
  // independent). Persisted per trainee.
  const [open, setOpen] = usePersistentState(`crm-hist-${trainee.id}`, true);
  // Tabbed CRM body (chosen 2026-05-23): one of ACTIONS / ACTIVITY visible
  // at a time so the two sub-sections don't compete visually.
  const [tab, setTab] = useState('actions');
  const { add: addActivity, refetch } = activity;

  const refined = isRefined5b();
  const PAD = 14;

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)}
      style={{
        padding: '6px 2px', marginRight: 22, border: 'none', background: 'transparent',
        borderBottom: `2px solid ${tab === id ? C.ac : 'transparent'}`,
        color: tab === id ? C.ac : C.tm,
        fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
        cursor: 'pointer', borderRadius: 0, marginBottom: -1,
      }}>{label}</button>
  );

  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: PAD, marginBottom: 12,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={open ? 10 : 0}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
              COACH HISTORY
            </span>
            <span aria-hidden style={{ color: refined ? '#FFFFFF' : C.tx, fontSize: 12, lineHeight: 1, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease' }}>▾</span>
          </div>
          <button onClick={() => setShowLog(true)}
            style={{
              background: 'transparent',
              border: `1px solid ${refined ? '#FFFFFF' : C.ac}`,
              color: refined ? '#FFFFFF' : C.ac,
              padding: '3px 10px', borderRadius: 0, fontFamily: FN, fontSize: 10,
              fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', flexShrink: 0,
            }}>+ LOG</button>
        </div>
      </RefinedHeaderStrip>

      {open && (<>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: `1px solid ${C.cardBd}` }}>
        <TabBtn id="actions" label="ACTIONS" />
        <TabBtn id="activity" label="ACTIVITY" />
      </div>

      {tab === 'actions' ? (
        <NotesInline
          label="NEXT ACTIONS"
          targetKind="trainee"
          targetId={trainee.id}
          targetLabel={trainee.name || null}
          onCreatePlanForTask={onCreatePlanForTask}
          onOpenIntakeTab={onOpenIntakeTab}
          trainee={trainee}
          bareMode
        />
      ) : (
        <ActivityFeed
          trainee={trainee}
          activity={activity}
          clientWorkouts={clientWorkouts}
          payments={payments}
          planIndex={planIndex}
          bareMode
        />
      )}
      </>)}

      {showLog && (
        <CombinedLogModal
          trainee={trainee}
          addActivity={addActivity}
          onClose={() => setShowLog(false)}
          onSaved={() => refetch()} />
      )}
    </div>
  );
}

function SubSection({ title, marginTop = 0, children }) {
  return (
    <div style={{ marginTop }}>
      <div style={{
        fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.18em',
        fontWeight: 700, paddingBottom: 6, marginBottom: 8,
        borderBottom: `1px solid var(--c-cardBd)`,
      }}>{title}</div>
      {children}
    </div>
  );
}

export default function TraineeCRM({ trainee, clientWorkouts, payments, planIndex, onCreatePlanForTask, onOpenIntakeTab }) {
  // Rules-of-Hooks: hook calls must come before any early return so the
  // hook count stays stable across renders.
  // Activity is fetched once here and threaded down to the history card +
  // feed (was fetched twice) so the composite health pill, the "last talked"
  // stat, and the feed all read the same rows.
  const allIds = useMemo(() => {
    const ids = [];
    if (trainee?.id) ids.push(trainee.id);
    if (Array.isArray(trainee?.members)) trainee.members.forEach(m => m?.id && ids.push(m.id));
    return ids;
  }, [trainee]);
  const activity = useTraineeActivity(allIds);
  const health = useMemo(
    () => deriveHealth(trainee, clientWorkouts, activity.rows, payments),
    [trainee, clientWorkouts, activity.rows, payments],
  );
  const tenure = useMemo(() => deriveTenure(trainee), [trainee]);
  if (!trainee) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <HealthPill health={health} />
        <StatsStrip health={health} tenure={tenure} />
        {trainee?.status && trainee.status !== 'Active' && (
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em',
            fontWeight: 700, padding: '6px 10px', border: `1px solid ${C.cardBd}`,
          }}>STATUS · {trainee.status.toUpperCase()}</div>
        )}
      </div>
      <CoachHistoryCard
        trainee={trainee}
        activity={activity}
        clientWorkouts={clientWorkouts}
        payments={payments}
        planIndex={planIndex}
        onCreatePlanForTask={onCreatePlanForTask}
        onOpenIntakeTab={onOpenIntakeTab}
      />
      {/* CoachMessages moved out of TraineeCRM 2026-05-16 — now lives
          at top level in TraineeDetail as the dedicated MESSAGES section
          (Ohad spec, between CRM and Workouts). */}
    </div>
  );
}
