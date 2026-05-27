// TASKS — V4 PROTOTYPE — CONVERSATION FEED.
//
// Gated behind `?ui=v4` on /coach/tasks. Treats the task surface as a
// chat thread: each task is a message bubble in a vertical chronological
// feed. WhatsApp/Slack-familiar shape. Right-aligned (cyan) for Ohad's
// tasks, left-aligned (amber) for Yuval's, centered (neutral) for
// shared/general. Date dividers separate groups (TODAY / YESTERDAY /
// FRI / 24 MAY). Bottom bar is a stub composer.
//
// Why this shape: Ohad lives in WhatsApp for delegation today. A
// conversation-style feed is the muscle memory he already has — sender
// + body + time, scroll to read, type at bottom to add.

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

function rowSource(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const isCenter = tags.some(t => t === 'gym' || t === 'center' || t.startsWith('gym:') || t.startsWith('center:'));
  if (row.auto_kind) {
    if (row.target_label) return `auto · ${row.target_label}`;
    return `auto · ${row.auto_kind.replace(/_/g, ' ')}`;
  }
  if (isCenter) {
    for (const t of tags) {
      if (t.startsWith('gym:') || t.startsWith('center:')) {
        return `Performance Center · ${(t.split(':')[1] || '').toUpperCase()}`;
      }
    }
    return 'Performance Center';
  }
  if (row.target_kind === 'trainee' && row.target_label) return row.target_label;
  return 'manual';
}

function dayKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(iso, now) {
  const d = new Date(iso);
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const diff = Math.round((startOfDay - startOfToday) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  if (diff === -1) return 'YESTERDAY';
  if (diff > 1 && diff <= 6) return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][d.getDay()];
  if (diff < -1 && diff >= -6) return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][d.getDay()];
  const day = d.getDate();
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  return `${day} ${mon}`;
}

function timeLabel(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function MessageBubble({ row, owner, displayBody }) {
  const heb = isHebrew(displayBody || '');
  const source = rowSource(row);
  const done = row.status === 'done';
  // Alignment: Ohad right, Yuval left, shared/general center
  const align = owner === 'yuval' ? 'flex-start' : owner === 'shared' ? 'center' : 'flex-end';
  // Bubble color: cyan for Ohad, amber for Yuval, neutral for shared/general
  const bg = owner === 'yuval' ? YUVAL_COLOR : owner === 'shared' ? 'var(--c-sf2, var(--c-sf))' : C.ac;
  const fg = owner === 'shared' ? 'var(--c-tx)' : '#FFFFFF';
  return (
    <div style={{
      display: 'flex', justifyContent: align,
      padding: '4px 14px',
    }}>
      <div style={{
        maxWidth: '70%', minWidth: 120,
        background: bg, color: fg,
        padding: '8px 12px',
        borderRadius: 0,
        border: owner === 'shared' ? `1px solid var(--c-cardBd)` : 'none',
        opacity: done ? 0.55 : 1,
        textDecoration: done ? 'line-through' : 'none',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', marginBottom: 4,
          opacity: 0.78, fontFamily: FN,
          textAlign: heb ? 'right' : 'left',
        }}>{owner === 'ohad' ? 'OHAD' : owner === 'yuval' ? 'YUVAL' : 'SHARED'} · {source}</div>
        <div style={{
          fontFamily: heb ? FH : FB,
          fontSize: heb ? 14 : 13,
          fontWeight: 500, lineHeight: 1.4,
          direction: heb ? 'rtl' : 'ltr',
          textAlign: heb ? 'right' : 'left',
          marginBottom: 4,
        }}>{displayBody}</div>
        <div style={{
          fontSize: 9, fontWeight: 600, opacity: 0.7,
          fontFamily: FN, letterSpacing: '0.06em',
          textAlign: heb ? 'right' : 'left',
        }}>{timeLabel(row.created_at)}</div>
      </div>
    </div>
  );
}

function DateDivider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 14px 8px',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--c-cardBd)' }} />
      <span style={{
        fontFamily: FN, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.18em', color: 'var(--c-tm)',
        textTransform: 'uppercase',
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--c-cardBd)' }} />
    </div>
  );
}

export default function TasksV4View() {
  const { rows, loading } = useCoachNotes({ limit: 200 });
  const now = useMemo(() => new Date(), []);

  const decorated = useMemo(() => rows.map(r => {
    const owner = ownerFromBody(r.body);
    return { ...r, _owner: owner, _display: stripOwnerPrefix(r.body) };
  }), [rows]);

  // Open tasks only — done tasks are archive, not part of the ongoing
  // conversation. Sort chronologically (oldest first like a chat thread).
  const sorted = useMemo(
    () => decorated
      .filter(r => r.status !== 'done')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [decorated]
  );

  // Group by day for the divider headers.
  const grouped = useMemo(() => {
    const groups = []; // [{ key, label, rows[] }]
    let current = null;
    for (const r of sorted) {
      const k = dayKey(r.created_at);
      if (!current || current.key !== k) {
        current = { key: k, label: dayLabel(r.created_at, now), rows: [] };
        groups.push(current);
      }
      current.rows.push(r);
    }
    return groups;
  }, [sorted, now]);

  if (loading) return <div style={{ padding: 24, color: 'var(--c-tm)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, padding: '0 14px',
      }}>
        <h2 style={{
          margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--c-tx)',
        }}>Tasks — conversation</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontFamily: FN, fontSize: 10, fontWeight: 600,
            color: 'var(--c-td)', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>v4 · feed</span>
        </div>
      </div>

      <div style={{
        border: `1px solid var(--c-cardBd)`,
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
        borderRadius: 0,
        paddingBottom: 8,
        minHeight: 400,
      }}>
        {grouped.map(g => (
          <React.Fragment key={g.key}>
            <DateDivider label={g.label} />
            {g.rows.map(row => (
              <MessageBubble key={row.id} row={row}
                owner={row._owner} displayBody={row._display} />
            ))}
          </React.Fragment>
        ))}
        {grouped.length === 0 && (
          <div style={{
            padding: '40px 14px', textAlign: 'center',
            fontFamily: FN, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.12em', color: 'var(--c-td)',
            textTransform: 'uppercase',
          }}>No tasks yet.</div>
        )}
      </div>

      {/* Composer stub — Phase 1 wires the actual create. */}
      <div style={{
        marginTop: 12,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px',
        border: `1px solid var(--c-cardBd)`,
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      }}>
        <input
          type="text"
          placeholder="Type a task… ('Yuval: …' or 'Ohad: …' to assign)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') window.alert('Inline composer ships in Phase 1.');
          }}
          style={{
            flex: 1, background: 'transparent',
            border: 'none', outline: 'none',
            fontFamily: FB, fontSize: 13, color: 'var(--c-tx)',
            padding: '6px 4px',
          }}
          autoComplete="off"
        />
        <button
          onClick={() => window.alert('Inline composer ships in Phase 1.')}
          style={{
            background: 'var(--c-ac)', color: '#FFFFFF',
            border: 'none', fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '6px 12px',
            cursor: 'pointer', borderRadius: 0,
            textTransform: 'uppercase',
          }}>send</button>
      </div>

      <div style={{
        marginTop: 18, padding: '10px 14px',
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', color: 'var(--c-td)',
        textTransform: 'uppercase',
      }}>
        v4 · conversation feed · Ohad cyan (right) · Yuval amber (left) · Shared centered
      </div>
    </div>
  );
}
