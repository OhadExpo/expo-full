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
import { isRefined5b } from './ui';
import { useCoachNotes } from './coachNotes';

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

export default function NotesWidget({ onNavigate, onOpenFullTasks, compact = false, trainees = [] }) {
  const { rows, create, update, togglePin, remove } = useCoachNotes({ limit: 60 });
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
    setBody(''); setLinkTraineeId(''); setAdding(false);
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'general') return rows.filter(r => !r.target_kind || r.target_kind === 'general');
    return rows.filter(r => r.target_kind === filter);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c = { all: rows.length, trainee: 0, intake: 0, review: 0, general: 0 };
    for (const r of rows) {
      if (!r.target_kind || r.target_kind === 'general') c.general++;
      else if (c[r.target_kind] != null) c[r.target_kind]++;
    }
    return c;
  }, [rows]);

  const pinned = filtered.filter(r => r.pinned);
  const recent = filtered.filter(r => !r.pinned).slice(0, compact ? 3 : 10);
  const visible = compact ? [...pinned, ...recent].slice(0, 5) : [...pinned, ...recent];

  const handleClick = (n) => {
    if (!onNavigate) return;
    if (n.target_kind && n.target_id) onNavigate(n.target_kind, n.target_id);
  };

  return (
    <div style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`, borderRadius: 0, padding: 14,
    }}>
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
          <textarea value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onAdd(); }}
            placeholder="Quick thought… (⌘/Ctrl + Enter to save)"
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
          const clickable = !!(n.target_kind && n.target_id && onNavigate);
          return (
            <div key={n.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 0', borderBottom: `1px solid var(--c-cardBd)`,
            }}>
              <button onClick={() => togglePin(n.id)} title={n.pinned ? 'Unpin' : 'Pin'}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: n.pinned ? 'var(--c-or)' : 'var(--c-td)', fontSize: 12,
                  padding: 0, flexShrink: 0,
                }}>{n.pinned ? '📌' : '○'}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div onClick={() => handleClick(n)}
                  style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.08em', marginBottom: 2, cursor: clickable ? 'pointer' : 'default' }}>
                  {TARGET_ICON[n.target_kind] || '·'} {TARGET_LABEL[n.target_kind] || 'NOTE'}
                  {n.target_label && <span style={{ color: 'var(--c-ac)', marginLeft: 6 }}>· {n.target_label}</span>}
                  <span style={{ color: 'var(--c-tm)', marginLeft: 6 }}>· {new Date(n.created_at).toLocaleString()}</span>
                </div>
                {editingId === n.id ? (
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={saveEdit} autoFocus rows={Math.max(2, editBody.split('\n').length)}
                    style={{
                      width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-ac)`,
                      borderRadius: 0, padding: '6px 8px', color: 'var(--c-tx)', fontSize: 12,
                      outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                      direction: isHebrew(editBody) ? 'rtl' : 'ltr',
                      fontFamily: isHebrew(editBody) ? FH : FB,
                    }} />
                ) : (
                  <div onClick={() => startEdit(n)}
                    title="Click to edit"
                    style={{
                      fontSize: 12, color: 'var(--c-tx)', lineHeight: 1.4, whiteSpace: 'pre-wrap', cursor: 'text',
                      direction: heb ? 'rtl' : 'ltr',
                      fontFamily: heb ? FH : FB,
                    }}>{n.body}</div>
                )}
              </div>
              <button onClick={() => remove(n.id)} title="Remove"
                style={{
                  background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer',
                  fontSize: 14, padding: '0 4px', flexShrink: 0,
                }}>×</button>
            </div>
          );
        })
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
