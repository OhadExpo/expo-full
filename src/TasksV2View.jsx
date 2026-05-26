// TASKS — Option 5 visual prototype.
//
// Gated behind `?ui=v2` on /coach/tasks. Read-only prototype that renders
// existing coach_notes rows in the Option 5 layout (single continuous list
// with a NOW line, full-bleed Monday-style status pills, assignee dot,
// inline expand on row tap, 3-segment ALL/ATHLETES/CENTER filter).
//
// Backend schema (assigned_to / due_at / 4-state status / activity log)
// lands in a separate Phase 1 commit. Until then:
//   - status comes from existing `status` field (open|done)
//   - assignee is hardcoded to Ohad (no field yet)
//   - due date uses `created_at` as a proxy
//   - context label uses target_kind + target_label
//   - tag `#center` puts a task in CENTER bucket
//
// Throw this file away if Ohad rejects the look.

import React, { useState, useMemo } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

// Monday status colors, slightly desaturated for dark mode (per design doc).
// Returns { bg, fg } for the pill background and text.
function statusColors(status, theme) {
  const dark = theme === 'dark' || theme === '1' || theme === '2' || theme === '3' || theme === '4';
  if (status === 'done') {
    return dark ? { bg: '#00A85D', fg: '#FFFFFF' } : { bg: '#00CA72', fg: '#FFFFFF' };
  }
  if (status === 'working') {
    return dark ? { bg: '#D9A800', fg: '#000000' } : { bg: '#FFCC00', fg: '#000000' };
  }
  if (status === 'stuck') {
    return dark ? { bg: '#C81F4D', fg: '#FFFFFF' } : { bg: '#FB275D', fg: '#FFFFFF' };
  }
  // open / not started
  return dark ? { bg: '#3A3A42', fg: '#E0E0E5' } : { bg: '#D5D6DC', fg: '#1A1A22' };
}

// Map existing 'open'|'done' to Monday's 4-state. Until Phase 1 ships the
// `status_label` column, everything is either OPEN or DONE.
function statusLabel(row) {
  if (row.status === 'done') return { key: 'done', text: 'DONE' };
  return { key: 'open', text: 'OPEN' };
}

// Compact relative date — TODAY / FRI / 4 JUN / —.
function compactDate(iso, now) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay - startOfToday) / 86400000);
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'TOMORROW';
  if (diffDays === -1) return 'YESTERDAY';
  if (diffDays > 1 && diffDays <= 6) {
    const wd = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
    return wd;
  }
  const day = d.getDate();
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  return `${day} ${mon}`;
}

function isCenterTask(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return tags.some(t => t === 'center' || t.startsWith('center:'));
}

function centerCategory(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  for (const t of tags) {
    if (t.startsWith('center:')) return t.slice('center:'.length).toUpperCase();
  }
  return null;
}

// Assignee dot — 16px colored circle with first letter. Until Phase 1 adds
// the `assigned_to` column, everything is owned by Ohad.
function AssigneeDot({ initial, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: '50%', background: color,
      color: '#FFFFFF', fontFamily: FN, fontSize: 9, fontWeight: 700,
      letterSpacing: 0, flexShrink: 0,
    }}>{initial}</span>
  );
}

function StatusPill({ status, theme }) {
  const { key, text } = statusLabel({ status });
  const c = statusColors(key, theme);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: c.bg, color: c.fg,
      fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      padding: '0 8px', height: 22, width: 96, borderRadius: 0, flexShrink: 0,
      textTransform: 'uppercase',
    }}>{text}</span>
  );
}

function TaskRow({ row, now, theme, expanded, onToggle }) {
  const heb = isHebrew(row.body || '');
  const date = compactDate(row.created_at, now);
  const center = isCenterTask(row);
  const cat = centerCategory(row);
  // Context label — CENTER tasks show category, ATHLETES tasks show trainee.
  let context = null;
  if (center) context = cat ? `CENTER · ${cat}` : 'CENTER';
  else if (row.target_kind === 'trainee' && row.target_label) context = row.target_label;

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', cursor: 'pointer',
        borderBottom: `1px solid var(--c-cardBd)`,
        background: expanded ? 'var(--c-sf2, transparent)' : 'transparent',
        transition: 'background 120ms ease',
      }}
    >
      <AssigneeDot initial="O" color={C.ac} />
      <div style={{
        flex: 1, minWidth: 0,
        fontFamily: heb ? FH : FB,
        fontSize: heb ? 15 : 13,
        fontWeight: 500,
        color: 'var(--c-tx)',
        direction: heb ? 'rtl' : 'ltr',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: expanded ? 'normal' : 'nowrap',
      }}>{row.body}</div>
      {context && (
        <span style={{
          fontFamily: FN, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--c-td)', flexShrink: 0,
          textTransform: 'uppercase',
        }}>{context}</span>
      )}
      <StatusPill status={row.status} theme={theme} />
      <span style={{
        fontFamily: FN, fontSize: 11, fontWeight: 600,
        color: date === 'TODAY' ? 'var(--c-ac)' : 'var(--c-tm)',
        letterSpacing: '0.04em', width: 64, textAlign: 'right',
        flexShrink: 0,
      }}>{date}</span>
    </div>
  );
}

// Build a Google Calendar event-creation URL pre-filled with the task's
// title, date, and description. Opens a new tab into Google Calendar's
// event editor — Ohad clicks Save and the event lands. One-click handoff
// until Phase 5 ships the real OAuth + events.insert pipeline.
function googleCalendarUrl(row) {
  const due = new Date(row.created_at);
  // Default to 9am-10am on the due date (1h block).
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, '0');
  const d = String(due.getDate()).padStart(2, '0');
  const start = `${y}${m}${d}T090000`;
  const end = `${y}${m}${d}T100000`;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const tagLine = tags.length ? `\n\nTags: ${tags.map(t => '#' + t).join(' ')}` : '';
  const description = `From EXPO Tasks — ${row.id}${tagLine}\n\nhttps://expo-app.co.il/coach/tasks?ui=v2`;
  const params = new URLSearchParams({
    text: row.body || 'EXPO Task',
    dates: `${start}/${end}`,
    details: description,
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

function ExpandedDetail({ row }) {
  const heb = isHebrew(row.body || '');
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const calUrl = googleCalendarUrl(row);
  return (
    <div style={{
      padding: '12px 14px 16px 44px',
      background: 'var(--c-sf2, transparent)',
      borderBottom: `1px solid var(--c-cardBd)`,
      fontFamily: heb ? FH : FB,
      fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.6,
      direction: heb ? 'rtl' : 'ltr',
    }}>
      <div style={{ marginBottom: 8, color: 'var(--c-tx)' }}>{row.body}</div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, direction: 'ltr' }}>
          {tags.map(t => (
            <span key={t} style={{
              fontFamily: FN, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', color: 'var(--c-ac)',
              border: `1px solid var(--c-cardBd)`, padding: '2px 6px',
              textTransform: 'uppercase',
            }}>#{t}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', direction: 'ltr' }}>
        <a
          href={calUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', color: 'var(--c-ac)',
            border: '1px solid var(--c-ac)',
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '5px 12px',
            textDecoration: 'none', borderRadius: 0,
            textTransform: 'uppercase',
          }}>
          📅 Open in Google Calendar
        </a>
        <span style={{ fontSize: 10, color: 'var(--c-td)', fontFamily: FN, letterSpacing: '0.04em' }}>
          one-click handoff · full OAuth sync in Phase 5
        </span>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--c-td)' }}>
        Phase 1 will add: 4-state status (Not Started / Working / Stuck / Done), assignee picker, due-date picker, comments thread, activity log.
      </div>
    </div>
  );
}

function FilterButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--c-ac)' : 'transparent',
        color: active ? '#FFFFFF' : 'var(--c-tm)',
        border: `1px solid ${active ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
        fontFamily: FN, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.12em', padding: '6px 14px',
        cursor: 'pointer', borderRadius: 0,
        textTransform: 'uppercase', display: 'inline-flex',
        alignItems: 'center', gap: 6,
      }}>
      <span>{label}</span>
      <span style={{ opacity: 0.7, fontSize: 10 }}>{count}</span>
    </button>
  );
}

export default function TasksV2View() {
  const { rows, loading } = useCoachNotes({ limit: 100 });
  const [filter, setFilter] = useState('all'); // 'all' | 'athletes' | 'center'
  const [expanded, setExpanded] = useState(null);
  const now = useMemo(() => new Date(), []);
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'dark';

  const counts = useMemo(() => {
    const athletes = rows.filter(r => r.target_kind === 'trainee').length;
    const center = rows.filter(r => isCenterTask(r)).length;
    return { all: rows.length, athletes, center };
  }, [rows]);

  // Apply 3-segment filter, then split into above/below NOW relative to
  // `created_at` (placeholder until `due_at` column lands).
  const { above, below } = useMemo(() => {
    let base = rows;
    if (filter === 'athletes') base = base.filter(r => r.target_kind === 'trainee');
    else if (filter === 'center') base = base.filter(r => isCenterTask(r));
    // Done at the bottom collapsed pool; open tasks split by NOW.
    const open = base.filter(r => r.status !== 'done');
    const cutoff = now.getTime();
    const ab = open.filter(r => new Date(r.created_at).getTime() < cutoff - 86400000 * 2);
    const bl = open.filter(r => new Date(r.created_at).getTime() >= cutoff - 86400000 * 2);
    // Sort: above NOW = oldest first (overdue feel); below NOW = newest first.
    ab.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    bl.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { above: ab, below: bl };
  }, [rows, filter, now]);

  const done = useMemo(() => rows.filter(r => r.status === 'done'), [rows]);

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--c-tm)' }}>Loading…</div>;
  }

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
        }}>Tasks</h2>
        <button
          onClick={() => window.alert('Phase 1 adds inline composer — for now use the legacy /coach/tasks view (no ?ui=v2) to create tasks')}
          style={{
            background: 'var(--c-ac)', color: '#FFFFFF',
            border: 'none', fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '6px 14px',
            cursor: 'pointer', borderRadius: 0,
          }}>+ TASK</button>
      </div>

      <div style={{
        display: 'flex', gap: 6, marginBottom: 18, padding: '0 14px',
        flexWrap: 'wrap',
      }}>
        <FilterButton label="ALL" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterButton label="ATHLETES" count={counts.athletes} active={filter === 'athletes'} onClick={() => setFilter('athletes')} />
        <FilterButton label="CENTER" count={counts.center} active={filter === 'center'} onClick={() => setFilter('center')} />
      </div>

      <div style={{
        border: `1px solid var(--c-cardBd)`,
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
        borderRadius: 0,
      }}>
        {above.map(row => (
          <React.Fragment key={row.id}>
            <TaskRow row={row} now={now} theme={theme}
              expanded={expanded === row.id}
              onToggle={() => setExpanded(expanded === row.id ? null : row.id)} />
            {expanded === row.id && <ExpandedDetail row={row} />}
          </React.Fragment>
        ))}

        {/* NOW line — the only structural divider on the page */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 14px',
          background: 'var(--c-sf2, transparent)',
          borderTop: `1px solid var(--c-ac)`,
          borderBottom: `1px solid var(--c-ac)`,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--c-ac)', opacity: 0.4 }} />
          <span style={{
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.24em', color: 'var(--c-ac)',
            textTransform: 'uppercase',
          }}>Now</span>
          <div style={{ flex: 1, height: 1, background: 'var(--c-ac)', opacity: 0.4 }} />
        </div>

        {below.map(row => (
          <React.Fragment key={row.id}>
            <TaskRow row={row} now={now} theme={theme}
              expanded={expanded === row.id}
              onToggle={() => setExpanded(expanded === row.id ? null : row.id)} />
            {expanded === row.id && <ExpandedDetail row={row} />}
          </React.Fragment>
        ))}

        {/* Done pool — collapsed footer */}
        {done.length > 0 && (
          <div style={{
            padding: '10px 14px',
            borderTop: `1px solid var(--c-cardBd)`,
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.18em', color: 'var(--c-td)',
            textTransform: 'uppercase',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Done · {done.length}</span>
            <span style={{ opacity: 0.6 }}>collapsed ▾</span>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 18, padding: '10px 14px',
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', color: 'var(--c-td)',
        textTransform: 'uppercase',
      }}>
        Prototype · v2 layout · backend schema lands in Phase 1
      </div>
    </div>
  );
}
