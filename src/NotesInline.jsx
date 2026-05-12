// Inline notes panel — drops on the trainee CRM, intake submission
// detail, and WorkoutReview workout card. Scoped to one context via
// (targetKind, targetId). Shows the list, lets the coach add/pin/delete,
// and renders RTL when the body is Hebrew.

import React, { useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';
import { useCoachNotes } from './coachNotes';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

export default function NotesInline({ targetKind, targetId, targetLabel, compact = false }) {
  const { rows, create, togglePin, remove } = useCoachNotes({ targetKind, targetId });
  const [body, setBody] = useState('');

  const onAdd = async () => {
    const b = body.trim();
    if (!b) return;
    await create({ body: b, targetKind, targetId, targetLabel });
    setBody('');
  };

  const visible = compact ? rows.slice(0, 3) : rows;

  return (
    <div style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`, borderRadius: 0,
      padding: 12, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontFamily: FN, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>
          NOTES ({rows.length})
        </div>
        {rows.some(r => r.pinned) && (
          <div style={{ fontSize: 9, fontFamily: FN, color: 'var(--c-or)', letterSpacing: '0.08em', fontWeight: 700 }}>
            📌 {rows.filter(r => r.pinned).length} pinned
          </div>
        )}
      </div>

      {visible.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--c-td)', marginBottom: 8 }}>
          No notes yet.
        </div>
      )}

      {visible.map(n => {
        const heb = isHebrew(n.body);
        return (
          <div key={n.id} style={{
            padding: '6px 0', borderBottom: `1px solid var(--c-cardBd)`,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <button onClick={() => togglePin(n.id)}
              title={n.pinned ? 'Unpin' : 'Pin'}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: n.pinned ? 'var(--c-or)' : 'var(--c-td)', fontSize: 12, padding: 0, flexShrink: 0,
              }}>{n.pinned ? '📌' : '○'}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, color: 'var(--c-tx)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                direction: heb ? 'rtl' : 'ltr',
                fontFamily: heb ? FH : FB,
              }}>{n.body}</div>
              <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.06em', marginTop: 2 }}>
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
            <button onClick={() => remove(n.id)} title="Remove"
              style={{ background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <textarea value={body} onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onAdd(); }}
          placeholder="+ note (⌘/Ctrl + Enter to save)"
          rows={2}
          style={{
            flex: 1, background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`, borderRadius: 0,
            padding: '8px 10px', color: 'var(--c-tx)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
            resize: 'vertical',
            direction: isHebrew(body) ? 'rtl' : 'ltr',
            fontFamily: isHebrew(body) ? FH : FB,
          }} />
        <button onClick={onAdd} disabled={!body.trim()}
          style={{
            padding: '8px 14px', borderRadius: 0,
            border: `1px solid ${body.trim() ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
            background: 'transparent', color: body.trim() ? 'var(--c-ac)' : 'var(--c-td)',
            fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            cursor: body.trim() ? 'pointer' : 'default',
          }}>ADD</button>
      </div>
    </div>
  );
}
