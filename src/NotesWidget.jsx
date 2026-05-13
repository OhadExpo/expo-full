// Dashboard widget — global Tasks/Notes feed (pinned first, then recent).
// Click a note → routes back to its context via the onNavigate callback.
//
// Filter pills along the top scope the feed by target_kind (ALL / TRAINEE
// / INTAKE / REVIEW / GENERAL) so the coach can quickly drill into where
// a note came from.
//
// Same data source as NotesInline (useCoachNotes); the dashboard widget
// is unscoped, pulling across all target_kind/target_id combos.

import React, { useMemo, useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { isRefined5b, RefinedHeaderStrip } from './ui';
import { useCoachNotes, setPendingTaskPlanLink } from './coachNotes';
import useDraftAutosave from './hooks/useDraftAutosave';
import { AUTO_KIND_LABEL, AUTO_KIND_ACTION, whatsappMessageForTask } from './autoTasks';
import { normalizePhoneIL } from './whatsappButton';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

const TARGET_ICON = {
  trainee: '👤',
  intake: '📋',
  review: '🏋',
  general: '🗒',
};

const TARGET_LABEL = {
  trainee: 'TRAINEE',
  intake: 'INTAKE',
  review: 'REVIEW',
  general: 'GENERAL',
};

const FILTER_OPTIONS = [
  { id: 'all',      label: 'ALL' },
  { id: 'trainee',  label: 'TRAINEE' },
  { id: 'intake',   label: 'INTAKE' },
  { id: 'review',   label: 'REVIEW' },
  { id: 'general',  label: 'GENERAL' },
];

// Severity color per auto-kind — drives the pill border/left-stripe
// so the dashboard reads at a glance: red for safety/payment issues,
// orange for missed-week/at-risk, cyan for plan/intake/eval, green
// for everything else (manual).
const AUTO_KIND_TONE = {
  next_block_due:            'cyan',
  week_missed:               'orange',
  at_risk_silent:            'orange',
  form_video_pending_review: 'cyan',
  new_intake_pending:        'cyan',
  payment_overdue:           'red',
  eval_due_first_session:    'cyan',
};

const TONE_COLOR = {
  cyan:   'var(--c-ac)',
  orange: 'var(--c-or)',
  red:    'var(--c-rd)',
  green:  'var(--c-gn)',
};

// Single task card. Header row carries the auto-kind pill + target +
// timestamp (right-aligned). Body is the task description. Footer row
// carries the contextual action button (NEW PROGRAM / WHATSAPP / etc.)
// plus the ✓ done / 📌 pin / ✏️ edit / × delete controls. Three-row
// rhythm is identical across compact (dashboard) and full views so
// nothing visually drifts between surfaces.
function TaskCard({ note, heb, trainee, allowEdit, isEditing, editBody, onEditBody, onSaveEdit, onCancelEdit, onStartEdit, onToggleDone, onTogglePin, onRemove, actionButton }) {
  const n = note;
  const tone = n.auto_kind ? (AUTO_KIND_TONE[n.auto_kind] || 'cyan') : null;
  const stripeColor = tone ? TONE_COLOR[tone] : 'var(--c-cardBd)';
  const kindLabel = n.auto_kind ? (AUTO_KIND_LABEL[n.auto_kind] || 'AUTO') : null;
  const targetIcon = TARGET_ICON[n.target_kind] || '·';
  const targetLabel = TARGET_LABEL[n.target_kind] || 'NOTE';
  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`,
      borderLeft: `3px solid ${stripeColor}`,
      borderRadius: 0,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      {/* Header row — auto-kind pill + target + timestamp, then × on
          the far right so the destructive control sits where you'd
          expect to dismiss a card. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <input type="checkbox" checked={false} onChange={onToggleDone}
          title="Mark done"
          style={{ width: 14, height: 14, accentColor: 'var(--c-gn)', cursor: 'pointer', flexShrink: 0 }} />
        <button onClick={onTogglePin} title={n.pinned ? 'Unpin' : 'Pin'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: n.pinned ? 'var(--c-or)' : 'var(--c-td)', fontSize: 12,
            padding: 0, flexShrink: 0,
          }}>{n.pinned ? '📌' : '○'}</button>
        {kindLabel && (
          <span title={`Auto-generated: ${kindLabel}`}
            style={{
              fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              color: TONE_COLOR[tone], border: `1px solid ${TONE_COLOR[tone]}`,
              padding: '2px 8px',
            }}>⚙ {kindLabel}</span>
        )}
        {!kindLabel && (
          <span style={{
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            color: 'var(--c-td)', border: `1px solid var(--c-cardBd)`,
            padding: '2px 8px',
          }}>{targetIcon} {targetLabel}</span>
        )}
        {n.target_label && (
          <span style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-ac)', letterSpacing: '0.04em', fontWeight: 700 }}>
            {n.target_label}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.04em' }}>
          {new Date(n.created_at).toLocaleString()}
        </span>
        <button onClick={onRemove} title="Remove"
          style={{
            background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer',
            fontSize: 14, padding: '0 4px', flexShrink: 0,
          }}>×</button>
      </div>

      {/* Body — task description. Edit mode shows the textarea. */}
      {isEditing ? (
        <textarea value={editBody} onChange={e => onEditBody(e.target.value)} dir="auto"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSaveEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
          onBlur={onSaveEdit} autoFocus rows={Math.max(2, editBody.split('\n').length)}
          style={{
            width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-ac)`,
            borderRadius: 0, padding: '6px 8px', color: 'var(--c-tx)', fontSize: 13,
            outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8,
            direction: isHebrew(editBody) ? 'rtl' : 'ltr',
            fontFamily: isHebrew(editBody) ? FH : FB,
          }} />
      ) : (
        <div style={{
          fontSize: 13, color: 'var(--c-tx)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
          marginBottom: actionButton || allowEdit ? 10 : 0,
          direction: heb ? 'rtl' : 'ltr',
          fontFamily: heb ? FH : FB,
        }}>{n.body}</div>
      )}

      {/* Footer — contextual action + edit (when allowed). The ✕
          delete already lives on the header row so a long body keeps
          its destructive control above the fold. */}
      {(actionButton || (allowEdit && !isEditing)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          {actionButton}
          {allowEdit && !isEditing && (
            <button onClick={onStartEdit} title="Edit task"
              style={{
                background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
                cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 0,
                fontFamily: FN, fontWeight: 700, letterSpacing: '0.12em', height: 26,
                display: 'inline-flex', alignItems: 'center',
              }}>✏️ EDIT</button>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-built solution pill — cyan border, narrow chip, label like
// "→ NEW PROGRAM" / "→ REVIEW" / "→ INTAKE" / "→ ATHLETE". Used by every
// non-WhatsApp task action so the row reads uniformly.
function ActionPill({ label, onClick, color, title }) {
  const c = color || 'var(--c-ac)';
  return (
    <button onClick={onClick} title={title}
      style={{
        background: 'transparent', border: `1px solid ${c}`, color: c,
        fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        padding: '4px 10px', borderRadius: 0, cursor: 'pointer',
        whiteSpace: 'nowrap', height: 26, display: 'inline-flex', alignItems: 'center',
      }}>{label}</button>
  );
}

// Per-task action button — switches on auto_kind. WhatsApp variant uses
// WA brand green to differentiate from the cyan-bordered NEW PROGRAM /
// REVIEW family. Returns null when the task has no actionable handler
// (manual general task, or trainee data missing for WhatsApp).
function TaskActionButton({ note, trainee, onCreatePlan, onOpenReview, onOpenIntake, onOpenAthlete }) {
  const kind = note?.auto_kind;
  const action = kind ? AUTO_KIND_ACTION[kind] : null;
  // Manual task with a trainee target — same NEW PROGRAM affordance.
  if (!kind && note?.target_kind === 'trainee' && note?.target_id && onCreatePlan) {
    return <ActionPill label="→ NEW PROGRAM" title="Build a program from this task" onClick={() => onCreatePlan(note)} />;
  }
  switch (action) {
    case 'NEW_PROGRAM':
      if (!onCreatePlan) return null;
      return <ActionPill label="→ NEW PROGRAM" title="Open the plan editor pre-bound to this trainee" onClick={() => onCreatePlan(note)} />;
    case 'REVIEW': {
      if (!onOpenReview) return null;
      const woId = String(note.auto_ref || '').split('|')[0];
      if (!woId) return null;
      return <ActionPill label="→ REVIEW" title="Open this workout's review session" onClick={() => onOpenReview(woId)} />;
    }
    case 'WHATSAPP': {
      const phone = normalizePhoneIL(trainee?.phone);
      if (!phone) return <ActionPill color="var(--c-td)" label="→ WHATSAPP" title="No phone on file" onClick={() => {}} />;
      const msg = whatsappMessageForTask(note, trainee);
      return <ActionPill color="#128C7E"
        label="→ WHATSAPP"
        title={`Open WhatsApp to ${trainee?.name || 'trainee'}`}
        onClick={() => {
          try { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); } catch {}
        }} />;
    }
    case 'OPEN_INTAKE':
      if (!onOpenIntake) return null;
      return <ActionPill label="→ INTAKE" title="Open the intake review surface" onClick={onOpenIntake} />;
    case 'OPEN_ATHLETE':
      if (!onOpenAthlete || !note.target_id) return null;
      return <ActionPill label="→ ATHLETE" title="Open the trainee card" onClick={() => onOpenAthlete(note.target_id)} />;
    default:
      return null;
  }
}

export default function NotesWidget({ onNavigate, onOpenFullTasks, onCreatePlanForTask, onOpenIntakeTab, compact = false, trainees = [] }) {
  const { rows, create, update, togglePin, toggleDone, remove } = useCoachNotes({ limit: 60 });
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [linkTraineeId, setLinkTraineeId] = useState('');
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');

  const startEdit = (n) => { setEditingId(n.id); setEditBody(n.body); };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); };
  const saveEdit = async () => {
    const trimmed = editBody.trim();
    if (trimmed && editingId) {
      await update(editingId, { body: trimmed });
    }
    cancelEdit();
  };

  const onAdd = async () => {
    const b = body.trim();
    if (!b) return;
    // Suppress the imminent blur-fired flush — the explicit SAVE/Enter
    // already creates the row. Both firing produces a duplicate.
    draft.suppressNext();
    setBody(''); setLinkTraineeId(''); setAdding(false);
    if (linkTraineeId) {
      const t = trainees.find(x => x.id === linkTraineeId);
      await create({
        body: b,
        targetKind: 'trainee',
        targetId: linkTraineeId,
        targetLabel: t?.name || null,
      });
    } else {
      await create({ body: b, targetKind: 'general' });
    }
  };

  // Draft autosave on the "+ TASK" textbox — typing then clicking away,
  // switching tabs, or unmounting commits the draft as a task instead of
  // losing it.
  const draft = useDraftAutosave(body, setBody, async (draftBody) => {
    if (linkTraineeId) {
      const t = trainees.find(x => x.id === linkTraineeId);
      const r = await create({ body: draftBody, targetKind: 'trainee', targetId: linkTraineeId, targetLabel: t?.name || null });
      if (r) setLinkTraineeId('');
      return !!r;
    }
    const r = await create({ body: draftBody, targetKind: 'general' });
    return !!r;
  });

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'general') return rows.filter(r => !r.target_kind || r.target_kind === 'general');
    return rows.filter(r => r.target_kind === filter);
  }, [rows, filter]);

  // Pill counts reflect OPEN tasks only — "TASKS (3)" matching the visible
  // unchecked list reads correctly. The earlier counter included done
  // rows, inflating the badge against what the eye sees.
  const counts = useMemo(() => {
    const open = rows.filter(r => r.status !== 'done');
    const c = { all: open.length, trainee: 0, intake: 0, review: 0, general: 0 };
    for (const r of open) {
      if (!r.target_kind || r.target_kind === 'general') c.general++;
      else if (c[r.target_kind] != null) c[r.target_kind]++;
    }
    return c;
  }, [rows]);

  // Open tasks float to the top; done tasks pool at the bottom under a
  // collapsed "DONE" group. Pinned-open before unpinned-open.
  const openRows = filtered.filter(r => r.status !== 'done');
  const doneRows = filtered.filter(r => r.status === 'done');
  const pinned = openRows.filter(r => r.pinned);
  const recent = openRows.filter(r => !r.pinned).slice(0, compact ? 3 : 10);
  const visible = compact
    ? [...pinned, ...recent].slice(0, 5)
    : [...pinned, ...recent];
  const visibleDone = compact ? doneRows.slice(0, 2) : doneRows.slice(0, 20);

  const startCreatePlan = (n) => {
    if (!onCreatePlanForTask || n.target_kind !== 'trainee' || !n.target_id) return;
    setPendingTaskPlanLink({
      taskId: n.id,
      traineeId: n.target_id,
      traineeLabel: n.target_label || '',
      taskBody: n.body,
    });
    onCreatePlanForTask(n.target_id);
  };

  const handleClick = (n) => {
    if (!onNavigate) return;
    if (n.target_kind && n.target_id) onNavigate(n.target_kind, n.target_id);
  };

  const refined = isRefined5b();
  const PAD = 14;

  return (
    <div style={{
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`, borderRadius: 0, padding: PAD,
      boxShadow: C.cardShadow,
    }}>
      {compact ? (
        // Compact (Dashboard) — header lives in the cyan strip on top to
        // match the visual rhythm of every other dashboard card.
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={10}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : 'var(--c-tx)' }}>
              📌 Tasks ({counts.all})
            </span>
            <button onClick={() => setAdding(!adding)}
              style={{
                background: 'transparent',
                border: `1px solid ${refined ? '#FFFFFF' : 'var(--c-ac)'}`,
                color: refined ? '#FFFFFF' : 'var(--c-ac)',
                padding: '3px 10px', borderRadius: 0, fontFamily: 'inherit', fontSize: 10,
                fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
              }}>{adding ? 'CLOSE' : '+ TASK'}</button>
          </div>
        </RefinedHeaderStrip>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: FN, color: 'var(--c-ac)', letterSpacing: '0.18em', fontWeight: 700 }}>
            📌 TASKS ({counts.all})
          </div>
          <button onClick={() => setAdding(!adding)}
            style={{
              background: 'transparent', border: `1px solid var(--c-ac)`, color: 'var(--c-ac)',
              padding: '3px 8px', borderRadius: 0, fontFamily: FN, fontSize: 9,
              fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
            }}>{adding ? 'CLOSE' : '+ TASK'}</button>
        </div>
      )}

      {/* Context filter pills — full view only; the compact Dashboard
          surface stays summary-only and routes to the full view via the
          OPEN FULL TASKS button at the bottom. */}
      {!compact && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {FILTER_OPTIONS.map(opt => {
            const active = filter === opt.id;
            const n = counts[opt.id] ?? 0;
            return (
              <button key={opt.id} onClick={() => setFilter(opt.id)}
                style={{
                  padding: '3px 8px', borderRadius: 0,
                  border: `1px solid ${active ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                  background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
                  color: active ? 'var(--c-ac)' : 'var(--c-tm)',
                  fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  cursor: 'pointer',
                }}>{opt.label} {n > 0 ? `· ${n}` : ''}</button>
            );
          })}
        </div>
      )}

      {adding && (
        <div style={{ marginBottom: 12 }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} dir="auto"
            onBlur={draft.onBlur}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onAdd(); }}
            placeholder="Quick thought… (⌘/Ctrl + Enter to save · auto-saves on blur)"
            rows={2}
            style={{
              width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
              borderRadius: 0, padding: '8px 10px', color: 'var(--c-tx)', fontSize: 13,
              outline: 'none', boxSizing: 'border-box', resize: 'vertical',
              direction: isHebrew(body) ? 'rtl' : 'ltr',
              fontFamily: isHebrew(body) ? FH : FB,
            }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
            {trainees.length > 0 ? (
              <select value={linkTraineeId} onChange={e => setLinkTraineeId(e.target.value)}
                style={{
                  flex: '0 1 220px', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
                  borderRadius: 0, padding: '6px 8px', color: 'var(--c-tx)',
                  fontFamily: FN, fontSize: 11, outline: 'none',
                }}>
                <option value="">— Link to trainee (optional) —</option>
                {trainees.filter(t => t.status !== 'Archived').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : <span />}
            <button onClick={onAdd} disabled={!body.trim()}
              style={{
                padding: '6px 12px', borderRadius: 0,
                border: `1px solid ${body.trim() ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                background: 'transparent', color: body.trim() ? 'var(--c-ac)' : 'var(--c-td)',
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                cursor: body.trim() ? 'pointer' : 'default',
              }}>SAVE</button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--c-td)', padding: '14px 0', textAlign: 'center' }}>
          {filter === 'all'
            ? 'Nothing yet. Drop a task above, or add from trainee cards / intake / review.'
            : `No tasks in ${filter}. Try a different filter or "+ TASK" above.`}
        </div>
      ) : (
        visible.map(n => {
          const heb = isHebrew(n.body);
          const allowEdit = !compact;
          const trainee = (n.target_kind === 'trainee' && n.target_id)
            ? trainees.find(t => t.id === n.target_id)
            : null;
          return (
            <TaskCard
              key={n.id}
              note={n}
              heb={heb}
              trainee={trainee}
              allowEdit={allowEdit}
              isEditing={editingId === n.id && allowEdit}
              editBody={editBody}
              onEditBody={setEditBody}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onStartEdit={() => startEdit(n)}
              onToggleDone={() => toggleDone(n.id)}
              onTogglePin={() => togglePin(n.id)}
              onRemove={() => remove(n.id)}
              actionButton={
                <TaskActionButton
                  note={n}
                  trainee={trainee}
                  onCreatePlan={onCreatePlanForTask ? () => startCreatePlan(n) : null}
                  onOpenReview={onNavigate ? (woId) => onNavigate('review', woId) : null}
                  onOpenIntake={onOpenIntakeTab || null}
                  onOpenAthlete={onNavigate ? (id) => onNavigate('trainee', id) : null}
                />
              }
            />
          );
        })
      )}

      {/* DONE pool */}
      {visibleDone.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed var(--c-cardBd)` }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>
            ✓ DONE ({doneRows.length}{visibleDone.length < doneRows.length ? ` · showing ${visibleDone.length}` : ''})
          </div>
          {visibleDone.map(n => {
            const heb = isHebrew(n.body);
            return (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', opacity: 0.55,
                borderBottom: `1px solid var(--c-cardBd)`,
              }}>
                <input type="checkbox" checked={true} onChange={() => toggleDone(n.id)}
                  style={{ width: 14, height: 14, accentColor: 'var(--c-gn)', cursor: 'pointer', flexShrink: 0, marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.08em', marginBottom: 2 }}>
                    {TARGET_ICON[n.target_kind] || '·'} {TARGET_LABEL[n.target_kind] || 'NOTE'}
                    {n.target_label && <span style={{ color: 'var(--c-ac)', marginLeft: 6 }}>· {n.target_label}</span>}
                    {n.completed_at && <span style={{ color: 'var(--c-tm)', marginLeft: 6 }}>· done {new Date(n.completed_at).toLocaleDateString()}</span>}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.4, whiteSpace: 'pre-wrap', textDecoration: 'line-through',
                    direction: heb ? 'rtl' : 'ltr',
                    fontFamily: heb ? FH : FB,
                  }}>{n.body}</div>
                  {n.linked_plan_id && (
                    <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-ac)', letterSpacing: '0.08em', marginTop: 2, fontWeight: 700 }}>
                      ✓ COMPLETED BY PLAN
                    </div>
                  )}
                </div>
                <button onClick={() => remove(n.id)} title="Remove"
                  style={{ background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {compact && onOpenFullTasks && (counts.all > visible.length || counts.all > 0) && (
        <button onClick={onOpenFullTasks}
          style={{
            width: '100%', marginTop: 10, padding: '8px 0', background: 'transparent',
            border: `1px solid var(--c-ac)`, color: 'var(--c-ac)',
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          }}>OPEN FULL TASKS ({counts.all}) →</button>
      )}
    </div>
  );
}
