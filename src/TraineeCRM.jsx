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
import { isRefined5b, RefinedHeaderStrip } from './ui';
import {
  useTraineeActivity, useCompletedTasksForTrainee,
  deriveCadence, deriveAutoEvents, mergeFeed, ACT_KINDS,
} from './crmData';
import NotesInline from './NotesInline';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

const KIND_ICON = {
  whatsapp: '🟢', call: '☎', meeting: '🤝', note: '🗒',
  email: '✉', instagram: '📷', sms: '💬',
  session: '🏋', plan: '📋', payment: '₪', task: '✓',
};

const KIND_LABEL = {
  whatsapp: 'WhatsApp', call: 'Call', meeting: 'Meeting', note: 'Note',
  email: 'Email', instagram: 'IG DM', sms: 'SMS',
  session: 'Session', plan: 'Plan', payment: 'Payment', task: 'Task',
};

const cadenceColor = (level) => ({
  'on-track': C.gn, 'slipping': C.or, 'at-risk': C.rd, 'inactive': C.td,
}[level] || C.tm);

function CadencePill({ cadence }) {
  const col = cadenceColor(cadence.level);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', border: `1px solid ${col}`,
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      fontFamily: FN, fontSize: 11, color: col, letterSpacing: '0.06em', fontWeight: 700,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0,
      }} />
      {cadence.label}
    </div>
  );
}

function ActivityFeed({ trainee, clientWorkouts, payments, planIndex }) {
  // Activity log scopes to the parent trainee ID AND any member IDs for couples.
  const allIds = useMemo(() => {
    const ids = [];
    if (trainee?.id) ids.push(trainee.id);
    if (Array.isArray(trainee?.members)) trainee.members.forEach(m => m?.id && ids.push(m.id));
    return ids;
  }, [trainee]);

  const { rows: manualRows, add, remove } = useTraineeActivity(allIds);
  const completedTasks = useCompletedTasksForTrainee(trainee?.id);
  const autoEvents = useMemo(
    () => deriveAutoEvents(trainee, clientWorkouts, payments, planIndex, completedTasks),
    [trainee, clientWorkouts, payments, planIndex, completedTasks],
  );
  const merged = useMemo(() => mergeFeed(manualRows, autoEvents), [manualRows, autoEvents]);

  const [showAll, setShowAll] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKind, setNewKind] = useState('whatsapp');
  const [newSummary, setNewSummary] = useState('');
  const [newWhen, setNewWhen] = useState(() => new Date().toISOString().slice(0, 16));

  const visible = showAll ? merged.slice(0, 60) : merged.slice(0, 8);

  const onSave = async () => {
    const s = newSummary.trim();
    if (!s) return;
    await add({
      traineeId: trainee.id,
      kind: newKind,
      summary: s,
      occurredAt: new Date(newWhen).toISOString(),
    });
    setNewSummary(''); setShowAddModal(false);
  };

  const refined = isRefined5b();
  const PAD = 14;
  return (
    <div style={{
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: PAD, marginBottom: 12,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={10}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
            ACTIVITY ({merged.length})
          </span>
          <button onClick={() => setShowAddModal(true)}
            style={{
              background: 'transparent',
              border: `1px solid ${refined ? '#FFFFFF' : C.ac}`,
              color: refined ? '#FFFFFF' : C.ac,
              padding: '3px 10px', borderRadius: 0, fontFamily: FN, fontSize: 10,
              fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            }}>+ LOG INTERACTION</button>
        </div>
      </RefinedHeaderStrip>

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
            <div style={{ flexShrink: 0, fontSize: 14, width: 22, textAlign: 'center' }}>
              {KIND_ICON[ev.kind] || '•'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontFamily: FN, color: C.td, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 2 }}>
                {KIND_LABEL[ev.kind] || ev.kind.toUpperCase()} · {new Date(ev.ts).toLocaleString()}
                {!isManual && <span style={{ marginLeft: 6, color: C.tm }}>· AUTO</span>}
              </div>
              <div style={{
                fontSize: 12, color: C.tx, lineHeight: 1.4,
                direction: heb ? 'rtl' : 'ltr',
                fontFamily: heb ? FH : FB,
              }}>{ev.summary}</div>
            </div>
            {isManual && (
              <button onClick={() => remove(ev.id)} title="Remove"
                style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 14, padding: '0 4px', alignSelf: 'flex-start' }}>×</button>
            )}
          </div>
        );
      })}

      {merged.length > 8 && !showAll && (
        <button onClick={() => setShowAll(true)}
          style={{
            width: '100%', marginTop: 10, padding: '6px 0', background: 'transparent',
            border: `1px solid ${C.cardBd}`, color: C.tm, fontFamily: FN, fontSize: 10,
            fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          }}>SHOW ALL {merged.length}</button>
      )}

      {showAddModal && (
        <div onClick={() => setShowAddModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.bg, border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: 20, maxWidth: 420, width: '100%',
          }}>
            <div style={{ fontSize: 10, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12 }}>
              LOG INTERACTION
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {ACT_KINDS.map(k => (
                <button key={k} onClick={() => setNewKind(k)}
                  style={{
                    padding: '6px 10px', borderRadius: 0,
                    border: `1px solid ${newKind === k ? C.ac : C.cardBd}`,
                    background: 'transparent', color: newKind === k ? C.ac : C.tm,
                    fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    cursor: 'pointer',
                  }}>{KIND_ICON[k]} {KIND_LABEL[k]}</button>
              ))}
            </div>
            <textarea value={newSummary} onChange={e => setNewSummary(e.target.value)} dir="auto"
              placeholder="What happened?"
              rows={4}
              style={{
                width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
                borderRadius: 0, padding: '10px 12px', color: C.tx, fontSize: 13,
                outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
                direction: isHebrew(newSummary) ? 'rtl' : 'ltr',
                fontFamily: isHebrew(newSummary) ? FH : FB,
              }} />
            <input type="datetime-local" value={newWhen} onChange={e => setNewWhen(e.target.value)}
              style={{
                width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
                borderRadius: 0, padding: '8px 10px', color: C.tx, fontFamily: FN, fontSize: 12,
                outline: 'none', boxSizing: 'border-box', marginBottom: 12,
              }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: 0, border: `1px solid ${C.cardBd}`,
                  background: 'transparent', color: C.tm, fontFamily: FN, fontSize: 11,
                  fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
                }}>CANCEL</button>
              <button onClick={onSave} disabled={!newSummary.trim()}
                style={{
                  padding: '8px 16px', borderRadius: 0,
                  border: `1px solid ${newSummary.trim() ? C.ac : C.cardBd}`,
                  background: 'transparent', color: newSummary.trim() ? C.ac : C.td,
                  fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                  cursor: newSummary.trim() ? 'pointer' : 'default',
                }}>SAVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TraineeCRM({ trainee, clientWorkouts, payments, planIndex, onCreatePlanForTask }) {
  // Rules-of-Hooks: hook calls must come before any early return so the
  // hook count stays stable across renders.
  const cadence = useMemo(() => deriveCadence(trainee, clientWorkouts), [trainee, clientWorkouts]);
  if (!trainee) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <CadencePill cadence={cadence} />
        {trainee?.status && trainee.status !== 'Active' && (
          <div style={{
            fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em',
            fontWeight: 700, padding: '6px 10px', border: `1px solid ${C.cardBd}`,
          }}>STATUS · {trainee.status.toUpperCase()}</div>
        )}
      </div>
      <NotesInline
        label="NEXT ACTIONS"
        targetKind="trainee"
        targetId={trainee.id}
        targetLabel={trainee.name || null}
        onCreatePlanForTask={onCreatePlanForTask}
      />
      <ActivityFeed
        trainee={trainee}
        clientWorkouts={clientWorkouts}
        payments={payments}
        planIndex={planIndex}
      />
    </div>
  );
}
