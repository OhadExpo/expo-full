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
import { AUTO_KIND_LABEL } from './autoTasks';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

export default function NotesInline({
  targetKind, targetId, targetLabel, compact = false,
  label = 'NOTES', onCreatePlanForTask,
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
  const PAD = 12;
  return (
    <div style={{
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`, borderRadius: 0,
      padding: PAD, marginBottom: 12,
      boxShadow: C.cardShadow,
    }}>
      {/* Cyan header strip — matches Athletic Evaluation + Dashboard tasks
          + every other section card on the trainee detail page. */}
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={8}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontFamily: FN, color: refined ? '#FFFFFF' : 'var(--c-ac)', letterSpacing: '0.18em', fontWeight: 700 }}>
            {label} ({open.length})
          </div>
          {rows.some(r => r.pinned) && (
            <div style={{ fontSize: 10, fontFamily: FN, color: refined ? '#FFFFFF' : 'var(--c-or)', letterSpacing: '0.08em', fontWeight: 700 }}>
              📌 {rows.filter(r => r.pinned).length} pinned
            </div>
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
        return (
          <div key={n.id} style={{
            padding: '6px 0', borderBottom: `1px solid var(--c-cardBd)`,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <input type="checkbox" checked={false} onChange={() => toggleDone(n.id)}
              title="Mark done"
              style={{ width: 14, height: 14, accentColor: 'var(--c-gn)', cursor: 'pointer', flexShrink: 0, marginTop: 3 }} />
            <button onClick={() => togglePin(n.id)} title={n.pinned ? 'Unpin' : 'Pin'}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: n.pinned ? 'var(--c-or)' : 'var(--c-td)', fontSize: 12, padding: 0, flexShrink: 0,
              }}>{n.pinned ? '📌' : '○'}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingId === n.id ? (
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  onBlur={saveEdit} autoFocus rows={Math.max(2, editBody.split('\n').length)}
                  style={{
                    width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-ac)`,
                    borderRadius: 0, padding: '6px 8px', color: 'var(--c-tx)', fontSize: 12,
                    outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                    direction: isHebrew(editBody) ? 'rtl' : 'ltr',
                    fontFamily: isHebrew(editBody) ? FH : FB,
                  }} />
              ) : (
                <div onClick={() => startEdit(n)} title="Click to edit"
                  style={{
                    fontSize: 12, color: 'var(--c-tx)', lineHeight: 1.5, whiteSpace: 'pre-wrap', cursor: 'text',
                    direction: heb ? 'rtl' : 'ltr',
                    fontFamily: heb ? FH : FB,
                  }}>{n.body}</div>
              )}
              <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.06em', marginTop: 2 }}>
                {n.auto_kind && (
                  <span title={`Auto-generated: ${AUTO_KIND_LABEL[n.auto_kind] || n.auto_kind}`}
                    style={{ color: 'var(--c-ac)', fontWeight: 700, marginRight: 6, border: `1px solid var(--c-ac)`, padding: '0 4px' }}>
                    ⚙ {AUTO_KIND_LABEL[n.auto_kind] || 'AUTO'}
                  </span>
                )}
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
            {showCreatePlanBtn && (
              <button onClick={() => startCreatePlan(n)} title="Create a program from this task — auto-marks done on save"
                style={{
                  background: 'transparent', border: `1px solid var(--c-ac)`, color: 'var(--c-ac)',
                  fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '2px 6px', borderRadius: 0, cursor: 'pointer', flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}>→ NEW PROGRAM</button>
            )}
            <button onClick={() => remove(n.id)} title="Remove"
              style={{ background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
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
        <textarea value={body} onChange={e => setBody(e.target.value)}
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
