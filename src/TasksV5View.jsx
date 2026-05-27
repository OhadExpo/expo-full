// TASKS — V5 PROTOTYPE — SOURCE CARDS.
//
// Gated behind `?ui=v5` on /coach/tasks. Treats the task surface as a
// dashboard of cards, one card per ORIGIN (where the task came from):
//   - Performance Center
//   - One card per trainee with open tasks (Roey / Diego / Amit etc.)
//   - Auto-tasks (the 7-rule engine output)
//   - Manual (free-form notes)
//
// Each card has a coloured header strip (matching the source's identity)
// + a stacked list of its open tasks. Tasks inside a card are minimal:
// title + assignee dot + small date. Click card to expand to full list.
//
// Why this shape: Ohad's folder-based mental model. Every piece of
// content lives in ONE place. Cards = folders. Tasks = files inside.

import React, { useState, useMemo } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';

const isHebrew = (s) => /[֐-׿]/.test(s || '');
const YUVAL_COLOR = '#FFA02E';

function ownerFromBody(body) {
  const b = (body || '').trim();
  if (/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad)\s*:/i.test(b)) return 'shared';
  if (/^ohad\s*:/i.test(b)) return 'ohad';
  if (/^yuval\s*:/i.test(b)) return 'yuval';
  return 'ohad';
}
function stripOwnerPrefix(body) {
  return (body || '').replace(/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad|ohad|yuval)\s*:\s*/i, '');
}

// Source bucket per row. Used to group into cards.
function sourceKey(row) {
  if (row.auto_kind) return 'auto';
  const tags = Array.isArray(row.tags) ? row.tags : [];
  if (tags.some(t => t === 'gym' || t === 'center' || t.startsWith('gym:') || t.startsWith('center:'))) return 'center';
  if (row.target_kind === 'trainee' && row.target_id) return `trainee:${row.target_id}`;
  return 'manual';
}

function sourceLabel(key, sampleRow) {
  if (key === 'center') return 'Performance Center';
  if (key === 'auto')   return 'Auto-tasks';
  if (key === 'manual') return 'Manual';
  if (key.startsWith('trainee:')) return sampleRow?.target_label || 'Athlete';
  return key;
}

function sourceColor(key) {
  if (key === 'center') return C.ac;             // brand cyan
  if (key === 'auto')   return 'var(--c-tm)';    // muted (lower priority)
  if (key === 'manual') return 'var(--c-rd)';    // red (your own notes)
  if (key.startsWith('trainee:')) return YUVAL_COLOR; // amber for trainees
  return 'var(--c-tm)';
}

function compactDate(iso, now) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay - startOfToday) / 86400000);
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'TMRW';
  if (diffDays === -1) return 'YDAY';
  if (diffDays > 1 && diffDays <= 6) return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  const day = d.getDate();
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  return `${day} ${mon}`;
}

function AssigneeDot({ owner }) {
  if (owner === 'shared') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        background: `linear-gradient(135deg, ${C.ac} 0% 50%, ${YUVAL_COLOR} 50% 100%)`,
        color: '#FFFFFF', fontFamily: FN, fontSize: 8, fontWeight: 700,
        flexShrink: 0,
      }}>·</span>
    );
  }
  const isYuval = owner === 'yuval';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: '50%',
      background: isYuval ? YUVAL_COLOR : C.ac,
      color: '#FFFFFF', fontFamily: FN, fontSize: 8, fontWeight: 700, flexShrink: 0,
    }}>{isYuval ? 'Y' : 'O'}</span>
  );
}

function SourceCard({ sourceKey: srcKey, label, color, rows, now, expanded, onToggle }) {
  // Show up to 3 rows when collapsed; show all when expanded.
  const visible = expanded ? rows : rows.slice(0, 3);
  const hidden = rows.length - visible.length;

  return (
    <div style={{
      border: `1px solid var(--c-cardBd)`,
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      borderRadius: 0,
      display: 'flex', flexDirection: 'column',
      minHeight: 200,
    }}>
      <div style={{
        background: color,
        color: '#FFFFFF',
        padding: '10px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `1px solid var(--c-cardBd)`,
      }}>
        <span style={{
          fontFamily: FN, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>{label}</span>
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.06em', opacity: 0.85,
        }}>{rows.length}</span>
      </div>
      <div style={{ flex: 1 }}>
        {visible.map(row => {
          const heb = isHebrew(row._display || '');
          return (
            <div key={row.id} style={{
              padding: '9px 12px',
              borderBottom: `1px solid var(--c-cardBd)`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <AssigneeDot owner={row._owner} />
              <div style={{
                flex: 1, minWidth: 0,
                fontFamily: heb ? FH : FB,
                fontSize: heb ? 13 : 12,
                fontWeight: 500,
                color: 'var(--c-tx)',
                direction: heb ? 'rtl' : 'ltr',
                textAlign: heb ? 'right' : 'left',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{row._display}</div>
              <span style={{
                fontFamily: FN, fontSize: 9, fontWeight: 700,
                color: 'var(--c-tm)', letterSpacing: '0.04em',
                flexShrink: 0,
              }}>{compactDate(row.created_at, now)}</span>
            </div>
          );
        })}
        {hidden > 0 && (
          <button onClick={onToggle} style={{
            display: 'block', width: '100%',
            background: 'transparent', border: 'none',
            padding: '10px 12px',
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            color: 'var(--c-ac)', letterSpacing: '0.12em',
            cursor: 'pointer', textAlign: 'center',
            textTransform: 'uppercase',
          }}>+ {hidden} more</button>
        )}
        {expanded && rows.length > 3 && (
          <button onClick={onToggle} style={{
            display: 'block', width: '100%',
            background: 'transparent', border: 'none',
            padding: '10px 12px',
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            color: 'var(--c-tm)', letterSpacing: '0.12em',
            cursor: 'pointer', textAlign: 'center',
            textTransform: 'uppercase',
          }}>collapse ▴</button>
        )}
      </div>
    </div>
  );
}

export default function TasksV5View() {
  const { rows, loading } = useCoachNotes({ limit: 200 });
  const [expanded, setExpanded] = useState({}); // { sourceKey: bool }
  const now = useMemo(() => new Date(), []);

  const decorated = useMemo(() => rows.map(r => {
    const owner = ownerFromBody(r.body);
    return { ...r, _owner: owner, _display: stripOwnerPrefix(r.body) };
  }), [rows]);

  // Bucket into source cards. Only open tasks.
  const cards = useMemo(() => {
    const byKey = new Map();
    const open = decorated.filter(r => r.status !== 'done');
    for (const r of open) {
      const k = sourceKey(r);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }
    // Build card list. Priority order: center → trainees → manual → auto.
    const result = [];
    if (byKey.has('center'))  result.push({ key: 'center',  rows: byKey.get('center')  });
    // Trainee cards sorted by row count desc
    const trainees = [...byKey.entries()].filter(([k]) => k.startsWith('trainee:'));
    trainees.sort((a, b) => b[1].length - a[1].length);
    for (const [k, r] of trainees) result.push({ key: k, rows: r });
    if (byKey.has('manual'))  result.push({ key: 'manual',  rows: byKey.get('manual')  });
    if (byKey.has('auto'))    result.push({ key: 'auto',    rows: byKey.get('auto')    });
    return result;
  }, [decorated]);

  if (loading) return <div style={{ padding: 24, color: 'var(--c-tm)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 14px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <h2 style={{
          margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--c-tx)',
        }}>Tasks — sources</h2>
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 600,
          color: 'var(--c-td)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>v5 · cards</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14,
      }}>
        {cards.map(card => (
          <SourceCard key={card.key}
            sourceKey={card.key}
            label={sourceLabel(card.key, card.rows[0])}
            color={sourceColor(card.key)}
            rows={card.rows}
            now={now}
            expanded={!!expanded[card.key]}
            onToggle={() => setExpanded(p => ({ ...p, [card.key]: !p[card.key] }))}
          />
        ))}
        {cards.length === 0 && (
          <div style={{
            padding: '40px 14px', textAlign: 'center',
            fontFamily: FN, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.12em', color: 'var(--c-td)',
            textTransform: 'uppercase',
            gridColumn: '1 / -1',
          }}>No open tasks.</div>
        )}
      </div>

      <div style={{
        marginTop: 22, padding: '10px 0',
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', color: 'var(--c-td)',
        textTransform: 'uppercase',
      }}>
        v5 · source cards · Performance Center / per-trainee / Manual / Auto
      </div>
    </div>
  );
}
