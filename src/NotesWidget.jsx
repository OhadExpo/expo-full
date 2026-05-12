// Dashboard widget — global Notes feed (pinned first, then recent).
// Click a note → routes back to its context via the onNavigate callback.
//
// Same data source as NotesInline (useCoachNotes), but unscoped — pulls
// across all target_kind/target_id combos so the coach sees their day-
// to-day note stream in one place.

import React, { useState } from 'react';
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

export default function NotesWidget({ onNavigate }) {
  const { rows, create, togglePin, remove } = useCoachNotes({ limit: 30 });
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');

  const onAdd = async () => {
    const b = body.trim();
    if (!b) return;
    await create({ body: b, targetKind: 'general' });
    setBody(''); setAdding(false);
  };

  const pinned = rows.filter(r => r.pinned);
  const recent = rows.filter(r => !r.pinned).slice(0, 10);
  const visible = [...pinned, ...recent];

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
          📌 NOTES ({rows.length})
        </div>
        <button onClick={() => setAdding(!adding)}
          style={{
            background: 'transparent', border: `1px solid var(--c-ac)`, color: 'var(--c-ac)',
            padding: '3px 8px', borderRadius: 0, fontFamily: FN, fontSize: 9,
            fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
          }}>{adding ? 'CLOSE' : '+ NOTE'}</button>
      </div>

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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
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
          No notes yet. Drop one above, or add notes from trainee cards / intake / review.
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
              <div onClick={() => handleClick(n)}
                style={{ flex: 1, minWidth: 0, cursor: clickable ? 'pointer' : 'default' }}>
                <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.08em', marginBottom: 2 }}>
                  {TARGET_ICON[n.target_kind] || '·'} {TARGET_LABEL[n.target_kind] || 'NOTE'}
                  {n.target_label && <span style={{ color: 'var(--c-ac)', marginLeft: 6 }}>· {n.target_label}</span>}
                  <span style={{ color: 'var(--c-tm)', marginLeft: 6 }}>· {new Date(n.created_at).toLocaleString()}</span>
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--c-tx)', lineHeight: 1.4, whiteSpace: 'pre-wrap',
                  direction: heb ? 'rtl' : 'ltr',
                  fontFamily: heb ? FH : FB,
                }}>{n.body}</div>
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
    </div>
  );
}
