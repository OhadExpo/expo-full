// Inline tasks panel — drops on the trainee CRM ("NEXT ACTIONS" label),
// intake submission detail, and WorkoutReview workout card. Scoped to one
// context via (targetKind, targetId). Renders the list, supports
// done-toggle / pin / delete / inline-edit / "→ NEW PROGRAM" handoff,
// and renders RTL when the body is Hebrew.

import React, { useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { fmtPrettyDate } from './dates';
import { isRefined5b, RefinedHeaderStrip, confirmToast } from './ui';
import { useCoachNotes, setPendingTaskPlanLink } from './coachNotes';
import useDraftAutosave from './hooks/useDraftAutosave';
import { AUTO_KIND_LABEL, AUTO_KIND_ACTION, whatsappMessageForTask } from './autoTasks';
import { normalizePhoneIL } from './whatsappButton';
import { ExplainInfoButton } from './components/AutoTaskExplain';

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
  whatsapp_combined:         'purple',   // NEEDS OUTREACH — distinct from the cyan SHARED badge (Ohad)
};
const TONE_COLOR = {
  cyan:   'var(--c-ac)',
  orange: 'var(--c-or)',
  red:    'var(--c-rd)',
  green:  'var(--c-gn)',
  purple: 'var(--c-pu)',
};

const isHebrew = (s) => /[֐-׿]/.test(s || '');

// Solution pill shape shared by all action buttons on the task card —
// keeps every "→ NEW PROGRAM / WHATSAPP / REVIEW / INTAKE / RUN EVAL"
// affordance the same height + padding so the footer row reads as one
// rhythm per [[new-ui-box-dimensions]].
// Uniform width across → WHATSAPP / NEW PROGRAM / REVIEW / INTAKE so every
// task row's action button reads as the same shape. 132 px comfortably fits
// "→ NEW PROGRAM" (the longest label) at fontSize 10 + 0.12em tracking + the
// 4px 10px padding used here.
function pillBtn(color) {
  return {
    background: 'transparent', border: `1px solid ${color}`, color,
    fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
    padding: '4px 10px', borderRadius: 0, cursor: 'pointer',
    whiteSpace: 'nowrap', height: 26, width: 132,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

export default function NotesInline({
  targetKind, targetId, targetLabel, compact = false,
  label = 'NOTES', onCreatePlanForTask, onOpenIntakeTab,
  // Trainee record (TraineeDetail passes it) so WhatsApp tasks can
  // resolve the phone + name into a wa.me deeplink. Optional — the
  // WhatsApp action renders a "no phone" disabled state when missing.
  trainee = null,
  // When true, skip the outer card + header strip and render only the
  // task list + composer. Used by TraineeCRM to merge NEXT ACTIONS
  // into the same card as ACTIVITY under a single "COACH HISTORY"
  // header.
  bareMode = false,
}) {
  const { rows, create, update, togglePin, toggleDone, remove } =
    useCoachNotes({ targetKind, targetId });
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');

  // F-35 — parse "#tag1 #tag2" / "tag1, tag2" → normalized lowercase list.
  const parseTags = (s) => {
    if (!s) return [];
    const out = [];
    const seen = new Set();
    String(s).split(/[\s,#]+/).forEach(raw => {
      const t = raw.trim().toLowerCase();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    });
    return out;
  };

  // Draft autosave: typed-but-not-clicked drafts are saved on blur, tab
  // switch, page hide, or unmount instead of being dropped.
  const draft = useDraftAutosave(body, setBody, async (draftBody) => {
    const r = await create({ body: draftBody, targetKind, targetId, targetLabel, tags: parseTags(tagsInput) });
    return !!r;
  });

  const onAdd = async () => {
    const b = body.trim();
    if (!b) {
      // Tags-only submit (Enter on the tags input when the body textarea
      // is empty). Refuse with a visible nudge instead of silent-failing,
      // and focus the body so the coach can finish the note.
      if (tagsInput.trim()) {
        try {
          const { toast } = await import('./ui');
          toast('Add the note text first — tags attach to a note, not on their own.', 'warn', { ttl: 3500 });
        } catch {}
        try { document.querySelector('.notes-inline-input')?.focus?.(); } catch {}
      }
      return;
    }
    // Suppress the imminent blur-fired flush — the explicit ADD click
    // already covers it. Without this, blur + click both create a row.
    draft.suppressNext();
    const tags = parseTags(tagsInput);
    setBody(''); setTagsInput('');
    await create({ body: b, targetKind, targetId, targetLabel, tags });
  };

  const startEdit = (n) => { setEditingId(n.id); setEditBody(n.body); };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); };
  const saveEdit = async () => {
    const trimmed = editBody.trim();
    if (trimmed && editingId) await update(editingId, { body: trimmed });
    cancelEdit();
  };

  // 'cancelled' is terminal like 'done' — archived to history, not active.
  const isTerminal = (r) => r.status === 'done' || r.status === 'cancelled';
  const open = rows.filter(r => !isTerminal(r));
  const doneRows = rows.filter(isTerminal);
  const done = doneRows.slice(0, 3);
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
  // bareMode = render only the body (no outer card / no header strip).
  // Used by TraineeCRM to merge NEXT ACTIONS into a unified COACH
  // HISTORY card alongside ACTIVITY.
  const Outer = ({ children }) => bareMode
    ? <div>{children}</div>
    : (
      <div style={{
        background: 'var(--c-sf)',
        border: `1px solid var(--c-cardBd)`, borderRadius: 0,
        padding: PAD, marginBottom: 12,
        boxShadow: C.cardShadow,
      }}>{children}</div>
    );
  return (
    <Outer>
      {/* Placeholder uses var(--c-td) — the muted grey we use for "inactive"
          / "no data" labels elsewhere. Browser default renders placeholder
          as a faded version of color, which on the white-on-dark textarea
          came out as a bluish-cyan that read like a clickable cyan accent. */}
      <style>{`
        .notes-inline-input::placeholder { color: var(--c-td); opacity: 1; }
      `}</style>
      {/* Cyan header strip — only when standalone. In bareMode the
          parent (TraineeCRM "COACH HISTORY") renders the umbrella
          header and a smaller "NEXT ACTIONS (N)" sub-header.        */}
      {!bareMode && (
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
      )}

      {visibleOpen.length === 0 && done.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--c-td)', marginBottom: 8 }}>
          Nothing queued. Add one below.
        </div>
      )}

      {visibleOpen.map(n => {
        const heb = isHebrew(n.body);
        const editingThis = editingId === n.id;
        const tone = n.auto_kind ? (AUTO_KIND_TONE[n.auto_kind] || 'cyan') : null;
        // Stale follow-up nudge: a manual task open 7+ days is being ignored.
        // Give it an orange stripe + flag so it stops blending in. Auto-tasks
        // already carry their own severity tone, so this only applies to
        // hand-written ones.
        const staleDays = (!n.auto_kind && n.created_at)
          ? Math.floor((Date.now() - new Date(n.created_at).getTime()) / 86400000) : 0;
        const isStale = staleDays >= 7;
        const stripeColor = tone ? TONE_COLOR[tone] : (isStale ? TONE_COLOR.orange : 'var(--c-cardBd)');
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
              }} style={pillBtn('var(--c-ac)')}>→ RUN EVALUATION</button>
            );
          }
          if (kindAction === 'OPEN_WAITLIST' && typeof window !== 'undefined') {
            // NotesInline is athlete-scoped, so the WAITLIST action just
            // routes Ohad over to the waitlist surface where he can mark
            // the lead consumed.
            return (
              <button onClick={() => { try { window.location.hash = '#/coach/waitlist'; } catch {} }}
                title="Open the /coach/waitlist surface to consume this lead"
                style={pillBtn('var(--c-ac)')}>→ WAITLIST</button>
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
                  width: 26, minWidth: 26, textAlign: 'center',
                }}>{n.pinned ? '📌' : '○'}</button>
              {kindLabel && (
                <>
                  <span title={`Auto-generated: ${kindLabel}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                      color: stripeColor, border: `1px solid ${stripeColor}`, padding: '2px 8px',
                    }}>⚙ {kindLabel}</span>
                  <ExplainInfoButton note={n} trainee={trainee} color={stripeColor} />
                </>
              )}
              {isStale && (
                <span title={`Open ${staleDays} days — follow up`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    color: 'var(--c-or)', border: `1px solid var(--c-or)`, padding: '2px 8px',
                  }}>⚠ FOLLOW UP {staleDays}d</span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.04em' }}>
                {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button onClick={async () => {
                  // Cancel ≠ delete — archive to history instead of wiping it.
                  if (await confirmToast('Cancel this task? It moves to history (not deleted).', { okLabel: 'Cancel task', cancelLabel: 'Keep' })) {
                    update(n.id, { status: 'cancelled', completed_at: new Date().toISOString() });
                  }
                }} title="Cancel (archive to history)"
                style={{ background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }} aria-label="Cancel task">×</button>
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
              // dir="auto" delegates to the browser's bidi algorithm so a
              // mixed Hebrew/English sentence renders naturally without
              // flipping the whole line when one language dominates.
              <div dir="auto" style={{
                fontSize: 13, color: 'var(--c-tx)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                marginBottom: actionBtn || !editingThis ? 10 : 0,
                fontFamily: FB,
              }}>{n.body}</div>
            )}

            {/* F-35 — tag chips */}
            {Array.isArray(n.tags) && n.tags.length > 0 && !editingThis && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: actionBtn ? 8 : 0 }}>
                {n.tags.map(t => (
                  <span key={t} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.08em', fontWeight: 700,
                    border: `1px solid var(--c-cardBd)`, padding: '2px 7px',
                  }}>#{t}</span>
                ))}
              </div>
            )}

            {/* Footer — EDIT on bottom-left, contextual action on
                bottom-right, fully separated via space-between so the
                two controls never visually collide. */}
            {(actionBtn || !editingThis) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {!editingThis ? (
                  <button onClick={() => startEdit(n)} title="Edit task"
                    style={{
                      background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
                      cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 0,
                      fontFamily: FN, fontWeight: 700, letterSpacing: '0.12em', height: 26,
                      display: 'inline-flex', alignItems: 'center',
                    }}>EDIT</button>
                ) : <span />}
                {actionBtn || <span />}
              </div>
            )}
          </div>
        );
      })}

      {done.length > 0 && (
        <div style={{ marginTop: open.length > 0 ? 8 : 0, paddingTop: 8, borderTop: open.length > 0 ? `1px dashed var(--c-cardBd)` : 'none' }}>
          {/* Same "✓ HISTORY (N)" header + per-row "done DATE" metadata + row
              dividers + centered strikethrough + confirm-before-delete that
              NotesWidget (Dashboard Tasks) already has (Ohad 2026-07-04: bring
              Coach History's design in line with it). Target-kind/label are
              dropped here — this list is already scoped to one trainee, so
              repeating "TRAINEE · <name>" on every row would be redundant. */}
          <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>
            ✓ HISTORY ({doneRows.length}{done.length < doneRows.length ? ` · showing ${done.length}` : ''})
          </div>
          {done.map(n => {
            return (
              <div key={n.id} style={{
                // No wrapper opacity — line-through + muted color (--c-tm)
                // are enough "this is closed" signal in both themes. Prior
                // opacity:0.55 double-dimmed the row and made the
                // strikethrough body unreadable on white in light mode.
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: `1px solid var(--c-cardBd)`,
              }}>
                <input type="checkbox" checked={true}
                  title={n.status === 'cancelled' ? 'Reopen (un-cancel)' : 'Reopen'}
                  onChange={() => n.status === 'cancelled'
                    ? update(n.id, { status: 'open', completed_at: null })
                    : toggleDone(n.id)}
                  style={{ width: 14, height: 14, accentColor: n.status === 'cancelled' ? 'var(--c-tm)' : 'var(--c-gn)', cursor: 'pointer', flexShrink: 0 }} />
                {/* One clean spine matching the dashboard history ruling (Ohad
                    2026-08-12): strikethrough body CENTERED · DONE date right.
                    dir="auto" keeps each glyph's direction correct, but the block
                    is centred so a mixed Heb/En task no longer flips the whole row
                    right and strands the checkbox. (No athlete-name zone here —
                    it's a single athlete's page, unlike the cross-athlete dash.) */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span dir="auto" style={{
                    flex: 1, minWidth: 0, fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.4, textDecoration: 'line-through',
                    textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FB,
                  }}>{n.body}</span>
                  <span style={{ flexShrink: 0, fontFamily: FN, fontSize: 9, color: n.status === 'cancelled' ? 'var(--c-or)' : 'var(--c-td)', letterSpacing: '0.08em', fontWeight: n.status === 'cancelled' ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {n.status === 'cancelled'
                      ? 'CANCELLED'
                      : n.completed_at && <span>done {fmtPrettyDate(n.completed_at)}</span>}
                    {n.linked_plan_id && <span style={{ color: 'var(--c-ac)', marginLeft: 6, fontWeight: 700 }}>· ✓ PLAN</span>}
                  </span>
                </div>
                <button onClick={async () => {
                    if (await confirmToast('Delete this completed task? This cannot be undone.', { okLabel: 'Delete', cancelLabel: 'Cancel' })) {
                      remove(n.id);
                    }
                  }} title="Remove" aria-label="Delete task"
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
        {/* F-35 — tags input. Same shape as NotesWidget so the
            knowledge base entries from either surface look identical
            and the search/filter at /coach/tasks finds them all. */}
        <input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          placeholder="#tags  (optional — e.g. rehab, shoulder, post-surgery)"
          style={{
            width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
            borderRadius: 0, padding: '6px 10px', color: 'var(--c-tx)', fontFamily: FN, fontSize: 11,
            outline: 'none', boxSizing: 'border-box', marginTop: 6, letterSpacing: '0.04em',
          }} />
      </div>
    </Outer>
  );
}
