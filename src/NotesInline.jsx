// Inline tasks panel — drops on the trainee CRM ("NEXT ACTIONS" label),
// intake submission detail, and WorkoutReview workout card. Scoped to one
// context via (targetKind, targetId). Renders the list, supports
// done-toggle / pin / delete / inline-edit / "→ NEW PROGRAM" handoff,
// and renders RTL when the body is Hebrew.

import React, { useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { isRefined5b, RefinedHeaderStrip } from './ui';
import { useCoachNotes, setPendingTaskPlanLink } from './coachNotes';
import useDraftAutosave from './hooks/useDraftAutosave';
import { AUTO_KIND_LABEL, AUTO_KIND_ACTION, whatsappMessageForTask } from './autoTasks';
import { normalizePhoneIL } from './whatsappButton';

// Severity tone for each auto-task kind. Drives the pill color +
// 3px left stripe so risk reads at-a-glance. Mirrors the rule in
// NotesWidget so dashboard and trainee-card cards look identical.
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

const isHebrew = (s) => /[֐-׿]/.test(s || '');

// Solution pill shape shared by all action buttons on the task card —
// keeps every "→ NEW PROGRAM / WHATSAPP / REVIEW / INTAKE / RUN EVAL"
// affordance the same height + padding so the footer row reads as one
// rhythm per [[new-ui-box-dimensions]].
function pillBtn(color) {
  return {
    background: 'transparent', border: `1px solid ${color}`, color,
    fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
    padding: '4px 10px', borderRadius: 0, cursor: 'pointer',
    whiteSpace: 'nowrap', height: 26,
    display: 'inline-flex', alignItems: 'center',
  };
}

export default function NotesInline({
  targetKind, targetId, targetLabel, compact = false,
  label = 'NOTES', onCreatePlanForTask, onOpenIntakeTab,
  // Trainee record (TraineeDetail passes it) so WhatsApp tasks can
  // resolve the phone + name into a wa.me deeplink. Optional — the
  // WhatsApp action renders a "no phone" disabled state when missing.
  trainee = null,
}) {
  const { rows, create, update, togglePin, toggleDone, remove } =
    useCoachNotes({ targetKind, targetId });
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');

  // Draft autosave: typed-but-not-clicked drafts are saved on blur, tab
  // switch, page hide, or unmount instead of being dropped.
  const draft = useDraftAutosave(body, setBody, async (draftBody) => {
    const r = await create({ body: draftBody, targetKind, targetId, targetLabel });
    return !!r;
  });

  const onAdd = async () => {
    const b = body.trim();
    if (!b) return;
    // Suppress the imminent blur-fired flush — the explicit ADD click
    // already covers it. Without this, blur + click both create a row.
    draft.suppressNext();
    setBody('');
    await create({ body: b, targetKind, targetId, targetLabel });
  };

  const startEdit = (n) => { setEditingId(n.id); setEditBody(n.body); };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); };
  const saveEdit = async () => {
    const trimmed = editBody.trim();
    if (trimmed && editingId) await update(editingId, { body: trimmed });
    cancelEdit();
  };

  const open = rows.filter(r => r.status !== 'done');
  const done = rows.filter(r => r.status === 'done').slice(0, 3);
  const visibleOpen = compact ? open.slice(0, 3) : open;
  const showCreatePlanBtn = !!onCreatePlanForTask && targetKind === 'trainee';

  const startCreatePlan = (n) => {
    if (!showCreatePlanBtn) return;
    setPendingTaskPlanLink({
      taskId: n.id,
      traineeId: targetId,
      traineeLabel: targetLabel || '',
      taskBody: n.body,
    });
    onCreatePlanForTask?.(targetId);
  };

  const refined = isRefined5b();
  // PAD = 14 matches the canonical Card padding the rest of the
  // trainee-card sections use, so every cyan strip is the same size.
  const PAD = 14;
  return (
    <div style={{
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`, borderRadius: 0,
      padding: PAD, marginBottom: 12,
      boxShadow: C.cardShadow,
    }}>
      {/* Placeholder uses var(--c-td) — the muted grey we use for "inactive"
          / "no data" labels elsewhere. Browser default renders placeholder
          as a faded version of color, which on the white-on-dark textarea
          came out as a bluish-cyan that read like a clickable cyan accent. */}
      <style>{`
        .notes-inline-input::placeholder { color: var(--c-td); opacity: 1; }
      `}</style>
      {/* Cyan header strip — uses the SAME header vocabulary as the
          existing Card component (fontSize 13, letterSpacing 0.04em,
          uppercase, 700) so every card on the trainee-detail page reads
          as one family. */}
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={8}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : 'var(--c-tx)' }}>
            {label} ({open.length})
          </span>
          {rows.some(r => r.pinned) && (
            <span style={{ fontFamily: FN, fontSize: 10, color: refined ? '#FFFFFF' : 'var(--c-or)', letterSpacing: '0.08em', fontWeight: 700 }}>
              📌 {rows.filter(r => r.pinned).length} pinned
            </span>
          )}
        </div>
      </RefinedHeaderStrip>

      {visibleOpen.length === 0 && done.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--c-td)', marginBottom: 8 }}>
          Nothing queued. Add one below.
        </div>
      )}

      {visibleOpen.map(n => {
        const heb = isHebrew(n.body);
        const editingThis = editingId === n.id;
        const tone = n.auto_kind ? (AUTO_KIND_TONE[n.auto_kind] || 'cyan') : null;
        const stripeColor = tone ? TONE_COLOR[tone] : 'var(--c-cardBd)';
        const kindLabel = n.auto_kind ? (AUTO_KIND_LABEL[n.auto_kind] || 'AUTO') : null;
        const kindAction = n.auto_kind ? AUTO_KIND_ACTION[n.auto_kind] : null;
        // Build the per-task action button. Manual trainee tasks fall
        // through to NEW PROGRAM. Others switch on the rule kind.
        const renderActionBtn = () => {
          if (!n.auto_kind && showCreatePlanBtn) {
            return (
              <button onClick={() => startCreatePlan(n)}
                title="Create a program from this task — auto-marks done on save"
                style={pillBtn('var(--c-ac)')}>→ NEW PROGRAM</button>
            );
          }
          if (kindAction === 'NEW_PROGRAM' && showCreatePlanBtn) {
            return (
              <button onClick={() => startCreatePlan(n)} style={pillBtn('var(--c-ac)')}>→ NEW PROGRAM</button>
            );
          }
          if (kindAction === 'REVIEW' && n.auto_ref) {
            const woId = String(n.auto_ref).split('|')[0];
            return (
              <button onClick={() => {
                try { sessionStorage.setItem('expo-pendingReviewWorkout', woId); } catch {}
                window.location.href = '/coach/review';
              }} style={pillBtn('var(--c-ac)')}>→ REVIEW</button>
            );
          }
          if (kindAction === 'WHATSAPP') {
            const phone = normalizePhoneIL(trainee?.phone);
            if (!phone) {
              return <button disabled style={pillBtn('var(--c-td)')} title="No phone on file">→ WHATSAPP</button>;
            }
            const msg = whatsappMessageForTask(n, trainee);
            return (
              <button onClick={() => {
                try { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); } catch {}
              }} title={`Open WhatsApp to ${trainee?.name || ''}`}
                style={pillBtn('#128C7E')}>→ WHATSAPP</button>
            );
          }
          if (kindAction === 'OPEN_INTAKE' && onOpenIntakeTab) {
            return <button onClick={onOpenIntakeTab} style={pillBtn('var(--c-ac)')}>→ INTAKE</button>;
          }
          if (kindAction === 'OPEN_ATHLETE') {
            // We're already on the athlete card. Scroll to the eval
            // section instead of trying to re-navigate.
            return (
              <button onClick={() => {
                try {
                  const el = document.querySelector('[data-eval-anchor]');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch {}
              }} style={pillBtn('var(--c-ac)')}>→ RUN EVAL</button>
            );
          }
          return null;
        };
        const actionBtn = renderActionBtn();
        return (
          <div key={n.id} style={{
            background: 'var(--c-sf)',
            border: `1px solid var(--c-cardBd)`,
            borderLeft: `3px solid ${stripeColor}`,
            borderRadius: 0,
            padding: '10px 12px',
            marginBottom: 8,
          }}>
            {/* Header row — controls + auto-kind pill + timestamp + × */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <input type="checkbox" checked={false} onChange={() => toggleDone(n.id)}
                title="Mark done"
                style={{ width: 14, height: 14, accentColor: 'var(--c-gn)', cursor: 'pointer', flexShrink: 0 }} />
              <button onClick={() => togglePin(n.id)} title={n.pinned ? 'Unpin' : 'Pin'}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: n.pinned ? 'var(--c-or)' : 'var(--c-td)', fontSize: 12, padding: 0, flexShrink: 0,
                }}>{n.pinned ? '📌' : '○'}</button>
              {kindLabel && (
                <span title={`Auto-generated: ${kindLabel}`}
                  style={{
                    fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    color: stripeColor, border: `1px solid ${stripeColor}`, padding: '2px 8px',
                  }}>⚙ {kindLabel}</span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.04em' }}>
                {new Date(n.created_at).toLocaleString()}
              </span>
              <button onClick={() => remove(n.id)} title="Remove"
                style={{ background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
            </div>

            {/* Body */}
            {editingThis ? (
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} dir="auto"
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                onBlur={saveEdit} autoFocus rows={Math.max(2, editBody.split('\n').length)}
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
                marginBottom: actionBtn || !editingThis ? 10 : 0,
                direction: heb ? 'rtl' : 'ltr',
                fontFamily: heb ? FH : FB,
              }}>{n.body}</div>
            )}

            {/* Footer — contextual action + edit */}
            {(actionBtn || !editingThis) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                {actionBtn}
                {!editingThis && (
                  <button onClick={() => startEdit(n)} title="Edit task"
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
      })}

      {done.length > 0 && (
        <div style={{ marginTop: open.length > 0 ? 8 : 0, paddingTop: 8, borderTop: open.length > 0 ? `1px dashed var(--c-cardBd)` : 'none' }}>
          {done.map(n => {
            const heb = isHebrew(n.body);
            return (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', opacity: 0.55,
              }}>
                <input type="checkbox" checked={true} onChange={() => toggleDone(n.id)}
                  style={{ width: 14, height: 14, accentColor: 'var(--c-gn)', cursor: 'pointer', flexShrink: 0, marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.5, whiteSpace: 'pre-wrap', textDecoration: 'line-through',
                    direction: heb ? 'rtl' : 'ltr', fontFamily: heb ? FH : FB,
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

      <div style={{ marginTop: 10 }}>
        <textarea className="notes-inline-input" value={body} onChange={e => setBody(e.target.value)} dir="auto"
          onBlur={draft.onBlur}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onAdd(); }}
          placeholder="Add a note…"
          rows={2}
          style={{
            width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`, borderRadius: 0,
            padding: '8px 10px', color: 'var(--c-tx)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
            resize: 'vertical',
            direction: isHebrew(body) ? 'rtl' : 'ltr',
            fontFamily: isHebrew(body) ? FH : FB,
          }} />
      </div>
    </div>
  );
}
