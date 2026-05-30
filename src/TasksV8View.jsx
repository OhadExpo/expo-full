// TASKS — V8 PROTOTYPE — list-first, source-grouped.
//
// Gated behind `?ui=v8`. Switches the resting state from card grid to
// single-column list. Source becomes a section header (Linear/Things 3
// pattern), not a separate card. Lists are scale-invariant — sparse
// search results look like a normal list of 1 row instead of an
// awkward giant card with one item.
//
// Backed by parallel research: Linear, Things 3, Akiflow, Todoist,
// Apple Reminders, Notion all default to single column. Card grids
// fail on (a) sparse search, (b) variable item counts per card,
// (c) item-comparison across cards. Tasks have no thumbnail so the
// card grid pays the cost without the visual benefit.
//
// Layout:
//   - Owner tabs: OHAD / YUVAL / SHARED (primary filter)
//   - View toggle: LIST (default) / BOARD (the v6/v7 card grid)
//   - Sort bar (Athletes-page pattern) + search + result count
//   - List of section-grouped rows. Section header = source (cyan
//     bar for Performance Center, amber per-trainee, red for Manual,
//     muted for Auto-tasks).
//   - Each row: assignee dot (if shared) + title + status pill + due
//   - Tap row → expand inline (Things 3 pattern). Tap status pill →
//     cycle status. Overdue dates render red.
//   - Done pool collapsed at the bottom.

import React, { useState, useMemo, useEffect } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b, toast } from './ui';
import { useCoachNoteComments, useCoachNoteEvents, recordNoteEvent } from './coachNoteComments';
import { supabase } from './supabase';
import {
  isCalendarConnected,
  connectGoogleCalendar,
  consumeCalendarCallback,
  disconnectCalendar,
  reconcileRow,
  unlinkAndDeleteEvent,
  getStoredEventId,
  getStoredHtmlLink,
  pullChangesSinceLastSync,
  getLastSyncedAt,
  clearSyncToken,
  stripStatusPrefix,
  statusFromSummary,
  getTokenScopes,
  subscribeAndCacheProviderToken,
  GoogleCalendarAuthError,
  fetchGoogleTasks,
  GoogleTasksScopeError,
} from './googleCalendarSync';

const isHebrew = (s) => /[֐-׿]/.test(s || '');
const YUVAL_COLOR = '#FFA02E';

// Inject the slide-in keyframes for expanded row detail panels once.
// Lives outside React render; only the first <TasksV8View /> mount runs it.
if (typeof document !== 'undefined' && !document.getElementById('tasks-v8-anim')) {
  const style = document.createElement('style');
  style.id = 'tasks-v8-anim';
  style.textContent = `
    @keyframes tasks-v8-slide-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes tasks-v8-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ────────────────────────────────────────────────────────────────────
// helpers (statusColors, dateMeta, owner detection, source detection)
// ────────────────────────────────────────────────────────────────────

function statusColors(status, theme) {
  const dark = theme === 'dark' || theme === '1' || theme === '2' || theme === '3' || theme === '4';
  if (status === 'done')      return dark ? { bg: '#00A85D', fg: '#FFFFFF' } : { bg: '#00CA72', fg: '#FFFFFF' };
  if (status === 'working')   return dark ? { bg: '#D9A800', fg: '#000000' } : { bg: '#FFCC00', fg: '#000000' };
  if (status === 'stuck')     return dark ? { bg: '#C81F4D', fg: '#FFFFFF' } : { bg: '#FB275D', fg: '#FFFFFF' };
  if (status === 'waiting')   return dark ? { bg: '#5A6376', fg: '#FFFFFF' } : { bg: '#8892A6', fg: '#FFFFFF' };
  if (status === 'cancelled') return dark ? { bg: '#3D3D3D', fg: '#9A9A9A' } : { bg: '#E0E0E0', fg: '#666666' };
  return null;
}

function dateMeta(iso, now) {
  if (!iso) return { label: '—', color: 'var(--c-tm)', isOverdue: false };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: '—', color: 'var(--c-tm)', isOverdue: false };
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay - startOfToday) / 86400000);
  if (diffDays === 0)  return { label: 'TODAY', color: 'var(--c-ac)', isOverdue: false };
  if (diffDays === 1)  return { label: 'TMRW',  color: 'var(--c-tm)', isOverdue: false };
  if (diffDays === -1) return { label: 'YDAY',  color: 'var(--c-rd)', isOverdue: true };
  if (diffDays < -1) {
    const day = d.getDate();
    const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
    return { label: `${day} ${mon}`, color: 'var(--c-rd)', isOverdue: true };
  }
  if (diffDays > 1 && diffDays <= 6) return { label: ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()], color: 'var(--c-tm)', isOverdue: false };
  const day = d.getDate();
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  return { label: `${day} ${mon}`, color: 'var(--c-tm)', isOverdue: false };
}

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

// ── Body-encoded fields — Phase 1 step 1 (schema-free) ─────────────────
// Until coach_notes gains real due_at + priority columns, we encode them
// inline in the body string. ALL row processing must read them through
// these parsers so OVERDUE/priority/sort behave consistently with what
// the composer wrote.
//
// Wire format: `Owner: [URGENT] actual title · due 2026-06-01 14:30`
//   - owner prefix (above)
//   - optional priority bracket: URGENT / HIGH / LOW (NORMAL = absent)
//   - body
//   - optional `· due YYYY-MM-DD` or `· due YYYY-MM-DD HH:MM`

const PRIORITY_RE = /\[(URGENT|HIGH|LOW)\]\s+/i;
const DUE_RE      = /\s*·\s*due\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*$/i;
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

function priorityFromBody(body) {
  const stripped = stripOwnerPrefix(body || '');
  const m = stripped.match(PRIORITY_RE);
  return m ? m[1].toLowerCase() : 'normal';
}
function dueAtFromBody(body) {
  const m = (body || '').match(DUE_RE);
  if (!m) return null;
  const [, date, time] = m;
  // Local-time interpretation — the same convention the Calendar sync uses.
  const iso = time ? `${date}T${time}:00` : `${date}T09:00:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function stripDueSuffix(body) {
  return (body || '').replace(DUE_RE, '');
}
function stripPriorityPrefix(body) {
  return (body || '').replace(PRIORITY_RE, '');
}
// Composite: strip owner + priority + due → just the actual title
function displayBodyOf(body) {
  return stripDueSuffix(stripPriorityPrefix(stripOwnerPrefix(body || ''))).trim();
}

// ── Dual-checkmark for shared tasks ────────────────────────────────────
// A shared task (owner === 'shared') needs BOTH Ohad's and Yuval's sign-off
// before it moves to "done". Each approval is recorded as a tag on the
// row: `approved:ohad` / `approved:yuval`. When both are present, the
// row auto-promotes to status='done'. Reopening clears both tags.
const APPROVAL_TAG_PREFIX = 'approved:';
const APPROVAL_TAG = { ohad: 'approved:ohad', yuval: 'approved:yuval' };
function approvalsFromTags(tags) {
  const t = Array.isArray(tags) ? tags : [];
  return { ohad: t.includes(APPROVAL_TAG.ohad), yuval: t.includes(APPROVAL_TAG.yuval) };
}
function stripApprovals(tags) {
  return (Array.isArray(tags) ? tags : []).filter(t => !t.startsWith(APPROVAL_TAG_PREFIX));
}
function withApproval(tags, who, value) {
  const cleaned = stripApprovals(tags);
  const other = who === 'ohad' ? 'yuval' : 'ohad';
  const existing = approvalsFromTags(tags);
  const out = [...cleaned];
  if (value || existing[who])  out.push(APPROVAL_TAG[who]);   // preserve / set this approval
  if (existing[other])          out.push(APPROVAL_TAG[other]); // preserve other's approval
  // De-dupe
  return [...new Set(out)];
}

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
  if (key === 'center') return C.ac;
  if (key === 'auto')   return 'var(--c-tm)';
  if (key === 'manual') return 'var(--c-rd)';
  if (key.startsWith('trainee:')) return YUVAL_COLOR;
  return 'var(--c-tm)';
}

const STATUS_RANK = { stuck: 0, working: 1, waiting: 2, open: 3, done: 4, cancelled: 5 };
const STATUS_CYCLE = ['open', 'working', 'waiting', 'stuck', 'done', 'cancelled'];
function nextStatus(s) {
  const i = STATUS_CYCLE.indexOf(s);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

// "Smart" sort: urgency-first. Stuck > Overdue > Today > Urgent priority
// > Working > Open by due date > No date. Matches how a coach naturally
// prioritizes a morning triage — "what's burning, what's due, what can
// wait". Reads parsed _dueAt / _priority decorations.
function smartSortScore(row, now) {
  const dueIso = row._dueAt || null;
  const dm = dateMeta(dueIso, now);
  const pr = row._priority || 'normal';
  if (row.status === 'stuck')   return 0;
  if (dueIso && dm.isOverdue)   return 1;
  if (dueIso && dm.label === 'TODAY') return 2;
  if (pr === 'urgent')          return 3;
  if (row.status === 'working') return 4;
  if (pr === 'high')            return 5;
  // remaining: open + future, ordered by due date if known, else created_at.
  const t = new Date(dueIso || row.created_at).getTime();
  return 10 + t / 1e10; // monotonic, smaller = earlier
}

function applySort(rows, mode, dir, now) {
  const a = [...rows];
  let cmp;
  if (mode === 'smart')       cmp = (x, y) => smartSortScore(x, now) - smartSortScore(y, now);
  else if (mode === 'newest') cmp = (x, y) => new Date(y.created_at) - new Date(x.created_at);
  else if (mode === 'status') cmp = (x, y) => (STATUS_RANK[x.status] ?? 9) - (STATUS_RANK[y.status] ?? 9);
  else if (mode === 'name')   cmp = (x, y) => (x.body || '').localeCompare(y.body || '');
  else                        cmp = (x, y) => new Date(x.created_at) - new Date(y.created_at);
  a.sort(cmp);
  if (dir === 'desc') a.reverse();
  return a;
}

// ────────────────────────────────────────────────────────────────────
// atoms
// ────────────────────────────────────────────────────────────────────

function AssigneeDot({ owner, size = 14 }) {
  if (owner === 'shared') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${C.ac} 0% 50%, ${YUVAL_COLOR} 50% 100%)`,
        color: '#FFFFFF', fontFamily: FN, fontSize: Math.round(size * 0.55), fontWeight: 700, flexShrink: 0,
      }}>·</span>
    );
  }
  const isYuval = owner === 'yuval';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: isYuval ? YUVAL_COLOR : C.ac,
      color: '#FFFFFF', fontFamily: FN, fontSize: Math.round(size * 0.55), fontWeight: 700, flexShrink: 0,
    }}>{isYuval ? 'Y' : 'O'}</span>
  );
}

// Linear-style status ICON, six states per Yuval's spec:
//   ○ open  ◐ working  ◯ waiting  ⚠ stuck  ● done  ⊘ cancelled
// Replaces the old 4-state text pill. Click opens a 6-option popover.
const STATUS_OPTIONS = [
  { id: 'open',      label: 'Open',      glyph: '○' },
  { id: 'working',   label: 'Working',   glyph: '◐' },
  { id: 'waiting',   label: 'Waiting',   glyph: '◯' },
  { id: 'stuck',     label: 'Stuck',     glyph: '⚠' },
  { id: 'done',      label: 'Done',      glyph: '●' },
  { id: 'cancelled', label: 'Cancelled', glyph: '⊘' },
];
function StatusIconGlyph({ status, theme, size = 16 }) {
  const opt = STATUS_OPTIONS.find(o => o.id === status) || STATUS_OPTIONS[0];
  const c = statusColors(status, theme);
  const color = c ? c.bg : 'var(--c-tm)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, color, fontSize: size, lineHeight: 1,
      fontFamily: FN, fontWeight: 700, flexShrink: 0,
    }}>{opt.glyph}</span>
  );
}
function StatusPill({ status, theme, onSetStatus }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        title="Click to change status"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', padding: 0,
          width: 22, height: 22, cursor: 'pointer', flexShrink: 0,
        }}>
        <StatusIconGlyph status={status} theme={theme} size={16} />
      </button>
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 2,
            background: 'var(--c-sf)', border: '1px solid var(--c-cardBd)',
            zIndex: 100, minWidth: 140, boxShadow: 'var(--c-cardShadow)',
          }}>
          {STATUS_OPTIONS.map(o => {
            const sc = statusColors(o.id, theme);
            const glyphColor = sc ? sc.bg : 'var(--c-tm)';
            const isCurrent = o.id === status;
            return (
              <button key={o.id}
                onMouseDown={(e) => { e.preventDefault(); onSetStatus(o.id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  background: isCurrent ? 'var(--c-sf2, transparent)' : 'transparent',
                  border: 'none', textAlign: 'left', padding: '7px 12px',
                  fontFamily: FN, fontSize: 11, fontWeight: 600,
                  color: isCurrent ? 'var(--c-ac)' : 'var(--c-tx)',
                  cursor: 'pointer',
                }}>
                <span style={{
                  display: 'inline-flex', width: 16, justifyContent: 'center',
                  color: glyphColor, fontSize: 14, fontWeight: 700,
                }}>{o.glyph}</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}>{o.label}</span>
                {isCurrent && <span style={{ marginLeft: 'auto', color: 'var(--c-ac)' }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

// Wrap each occurrence of `query` (case-insensitive) inside `text` with a
// highlighted span so search matches pop visually.
function HighlightedText({ text, query, style }) {
  if (!query) return <span style={style}>{text}</span>;
  const lower = (text || '').toLowerCase();
  const q = query.toLowerCase();
  if (!lower.includes(q)) return <span style={style}>{text}</span>;
  const parts = [];
  let i = 0;
  let idx;
  while ((idx = lower.indexOf(q, i)) !== -1) {
    if (idx > i) parts.push(<span key={`p${i}`}>{text.slice(i, idx)}</span>);
    parts.push(<mark key={`m${idx}`} style={{
      background: 'rgba(57,189,255,0.18)', color: 'inherit',
      padding: '0 2px', borderRadius: 2,
    }}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
  }
  if (i < text.length) parts.push(<span key={`p${i}`}>{text.slice(i)}</span>);
  return <span style={style}>{parts}</span>;
}

function OwnerTab({ label, count, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      background: active ? (color || 'var(--c-ac)') : 'transparent',
      color: active ? '#FFFFFF' : 'var(--c-tm)',
      border: `1px solid ${active ? (color || 'var(--c-ac)') : 'var(--c-cardBd)'}`,
      fontFamily: FN, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.12em', padding: '0 14px', height: 28,
      cursor: 'pointer', borderRadius: 0,
      textTransform: 'uppercase', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box',
    }}>
      <span>{label}</span>
      <span style={{ opacity: 0.78, fontSize: 10 }}>{count}</span>
    </button>
  );
}

// View toggle — Notion pattern. Same data, different shape.
function ViewToggle({ value, onChange }) {
  const items = [
    { id: 'list',  label: 'List'  },
    { id: 'board', label: 'Board' },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      border: `1px solid var(--c-cardBd)`,
      borderRadius: 0, height: 28, boxSizing: 'border-box',
    }}>
      {items.map((it, i) => (
        <button key={it.id} onClick={() => onChange(it.id)} style={{
          background: value === it.id ? 'rgba(57,189,255,0.094)' : 'transparent',
          color: value === it.id ? C.ac : C.tm,
          border: 'none',
          borderLeft: i === 0 ? 'none' : `1px solid var(--c-cardBd)`,
          fontFamily: FN, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', padding: '0 14px', height: 26,
          cursor: 'pointer', textTransform: 'uppercase',
        }}>{it.label}</button>
      ))}
    </div>
  );
}

const SORT_MODES = [
  { id: 'date',   label: 'Due' },
  { id: 'newest', label: 'Newest' },
  { id: 'status', label: 'Status' },
  { id: 'name',   label: 'A→Z' },
];
function SortBar({ sortBy, sortDir, onSortBy, onToggleDir, search, onSearch, resultCount, totalCount }) {
  const BOX_H = 28;
  const boxBase = {
    minHeight: BOX_H, height: BOX_H, padding: '0 12px', borderRadius: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: FN, fontWeight: 700, cursor: 'pointer', boxSizing: 'border-box',
  };
  const pill = (active) => ({
    ...boxBase,
    border: `1px solid ${active ? C.ac : C.cardBd}`,
    background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
    color: active ? C.ac : C.tm,
    fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
  });
  const isFiltered = search.trim() !== '';
  // Bare left-aligned row (no bordered container, no "SORT" prefix label) so
  // the first pill lines up exactly under the OWNER tabs above and the QUICK
  // filters below — all three toolbar rows share one left edge.
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12,
    }}>
      {SORT_MODES.map(m => (
        <button key={m.id} onClick={() => onSortBy(m.id)} style={pill(sortBy === m.id)}>
          {m.label}
        </button>
      ))}
      <button onClick={onToggleDir} style={{
        ...boxBase, marginLeft: 6,
        border: `1px solid ${C.cardBd}`, background: 'transparent', color: C.tm,
        fontSize: 10, letterSpacing: '0.12em',
      }}>{sortDir === 'asc' ? '↓' : '↑'}</button>
      <span style={{ flex: 1 }} />
      {isFiltered && (
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700,
          color: C.ac, letterSpacing: '0.06em',
          marginRight: 4,
        }}>{resultCount} of {totalCount}</span>
      )}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search…"
        style={{
          ...boxBase, padding: '0 10px', cursor: 'text',
          background: 'transparent', color: C.tx,
          border: `1px solid ${C.cardBd}`, fontSize: 11, fontWeight: 500,
          letterSpacing: '0.04em', width: 180, outline: 'none',
        }}
        autoComplete="off"
      />
    </div>
  );
}

// Quick filter chips — one-click narrowing. Single-select (radio-style).
const QUICK_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'today',    label: 'Today' },
  { id: 'overdue',  label: 'Overdue' },
  { id: 'stuck',    label: 'Stuck' },
  { id: 'nodate',   label: 'No date' },
];
function QuickFilters({ value, onChange, counts }) {
  return (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap',
    }}>
      {QUICK_FILTERS.map(f => {
        const active = value === f.id;
        const c = counts[f.id] ?? 0;
        // Hide chips that have zero count, except 'all' which always shows.
        if (f.id !== 'all' && c === 0) return null;
        return (
          <button key={f.id} onClick={() => onChange(f.id)} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
            color: active ? 'var(--c-ac)' : 'var(--c-tm)',
            border: `1px solid ${active ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '0 12px', height: 28,
            cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
            boxSizing: 'border-box',
          }}>
            <span>{f.label}</span>
            <span style={{ opacity: 0.65, fontSize: 9 }}>{c}</span>
          </button>
        );
      })}
    </div>
  );
}

// Smart composer — expands on focus to show assignee picker + due-date
// input + section selector inline. Collapses back when empty + blurred.
function SmartComposer({ onSubmit, defaultAssignee = 'ohad', trainees = [] }) {
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [due, setDue] = useState('');
  const [time, setTime] = useState(''); // 'HH:MM' — blank = 9:00 default
  const [priority, setPriority] = useState('normal'); // low | normal | high | urgent
  const [traineeId, setTraineeId] = useState(''); // '' = no link
  const [source, setSource] = useState('manual'); // 'manual' | 'center'
  const [focused, setFocused] = useState(false);
  const inputRef = React.useRef(null);
  const expanded = focused || body.trim() !== '';

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const linkedTrainee = traineeId
      ? (trainees || []).find(t => t.id === traineeId) || null
      : null;
    await onSubmit({ body: trimmed, assignee, due, time, priority, source,
      traineeId: linkedTrainee?.id || '',
      traineeLabel: linkedTrainee?.name || '' });
    setBody(''); setDue(''); setTime(''); setPriority('normal');
    setTraineeId(''); setSource('manual');
    setAssignee(defaultAssignee);
    setFocused(false);
  };

  return (
    <div style={{
      borderBottom: `1px solid var(--c-cardBd)`,
      background: 'var(--c-sf2, transparent)',
      transition: 'padding 180ms ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
      }}>
        <span style={{
          fontFamily: FN, fontSize: 12, fontWeight: 700,
          color: 'var(--c-ac)', flexShrink: 0,
        }}>+</span>
        <input
          ref={inputRef}
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Add task…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: FB, fontSize: 13, color: 'var(--c-tx)',
            padding: '4px 0',
          }}
          autoComplete="off"
        />
        {body.trim() && (
          <button
            onMouseDown={(e) => { e.preventDefault(); submit(); }}
            style={{
              background: 'var(--c-ac)', color: '#FFFFFF',
              border: 'none', fontFamily: FN, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.12em', padding: '4px 10px', height: 22,
              cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
            }}>add</button>
        )}
      </div>
      {expanded && (
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          padding: '0 12px 8px 24px',
          animation: 'tasks-v8-fade-in 180ms ease-out',
        }}>
          {/* Assignee picker — 3 buttons */}
          {[['ohad','O',C.ac],['yuval','Y',YUVAL_COLOR],['shared','·','linear-gradient(135deg,'+C.ac+' 0% 50%,'+YUVAL_COLOR+' 50% 100%)']].map(([id,initial,color]) => (
            <button key={id}
              onMouseDown={(e) => { e.preventDefault(); setAssignee(id); }}
              title={id === 'shared' ? 'Both Ohad + Yuval' : id === 'yuval' ? 'Yuval' : 'Ohad'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: '50%',
                background: assignee === id ? color : 'transparent',
                color: assignee === id ? '#FFFFFF' : 'var(--c-tm)',
                border: assignee === id ? 'none' : `1px solid var(--c-cardBd)`,
                fontFamily: FN, fontSize: 10, fontWeight: 700,
                cursor: 'pointer',
              }}>{initial}</button>
          ))}
          {/* Due date input */}
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent', color: 'var(--c-tm)',
              border: `1px solid var(--c-cardBd)`,
              fontFamily: FN, fontSize: 10, fontWeight: 600,
              padding: '3px 6px', height: 22, borderRadius: 0,
              outline: 'none',
            }} />
          {/* Time input — blank = 9:00 default. Only meaningful with a date. */}
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={!due}
            title={due ? 'Calendar time (default 09:00)' : 'Pick a date first'}
            style={{
              background: 'transparent',
              color: due ? 'var(--c-tm)' : 'var(--c-td)',
              border: `1px solid var(--c-cardBd)`,
              fontFamily: FN, fontSize: 10, fontWeight: 600,
              padding: '3px 6px', height: 22, borderRadius: 0,
              outline: 'none',
              opacity: due ? 1 : 0.5,
            }} />
          {/* Priority — 4 button row, NORMAL is default (transparent) */}
          {[
            ['low',    'LOW',    'var(--c-td)'],
            ['normal', 'NORMAL', 'var(--c-tm)'],
            ['high',   'HIGH',   YUVAL_COLOR],
            ['urgent', 'URGENT', C.rd],
          ].map(([id, label, color]) => (
            <button key={id}
              onMouseDown={(e) => { e.preventDefault(); setPriority(id); }}
              title={`Priority: ${label}`}
              style={{
                background: priority === id ? color : 'transparent',
                color: priority === id ? '#FFFFFF' : color,
                border: `1px solid ${priority === id ? color : 'var(--c-cardBd)'}`,
                fontFamily: FN, fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em', padding: '3px 8px', height: 22,
                cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
              }}>{label}</button>
          ))}
          {/* Trainee link — picker that sets target_kind:'trainee' so the
              task appears under the athlete's source section AND on their
              TraineeDetail page. Blank = unlinked. */}
          {(trainees || []).length > 0 && (
            <select
              value={traineeId}
              onChange={(e) => setTraineeId(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              title="Link this task to an athlete"
              style={{
                background: 'transparent',
                color: traineeId ? C.ac : 'var(--c-tm)',
                border: `1px solid ${traineeId ? C.ac : 'var(--c-cardBd)'}`,
                fontFamily: FN, fontSize: 10, fontWeight: 600,
                padding: '3px 6px', height: 22, borderRadius: 0,
                outline: 'none', maxWidth: 160,
                textOverflow: 'ellipsis',
              }}
            >
              <option value="">— no athlete —</option>
              {[...trainees].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(t => (
                <option key={t.id} value={t.id}>{t.name || t.id}</option>
              ))}
            </select>
          )}
          {/* Source selector — Manual / Performance Center */}
          {[['manual', 'Manual'], ['center', 'Performance Center']].map(([id, label]) => (
            <button key={id}
              onMouseDown={(e) => { e.preventDefault(); setSource(id); }}
              style={{
                background: source === id ? 'rgba(57,189,255,0.094)' : 'transparent',
                color: source === id ? 'var(--c-ac)' : 'var(--c-tm)',
                border: `1px solid ${source === id ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                fontFamily: FN, fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em', padding: '3px 8px', height: 22,
                cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
              }}>{label}</button>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: FN, fontSize: 9, fontWeight: 600,
            color: 'var(--c-td)', letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>Enter to add</span>
        </div>
      )}
    </div>
  );
}

// Expandable Google Calendar iframe card. Collapsed by default — shows
// a thin strip with the label + a chevron. Click to reveal the iframe
// from Google's embed surface. The user must be signed into Google in
// the same browser for the calendar to render (which they will be, since
// the GIS connect flow above primed that session).
// Native Google Tasks list. The Calendar embed iframe can't show Tasks
// (Google strips that layer), so we pull them via the Tasks API and render
// them here. Self-diagnosing: a scope/auth failure shows an actionable hint
// instead of failing silently. Read-only.
function GoogleTasksPanel({ connected }) {
  const [tasks, setTasks] = useState(null);
  const [err, setErr] = useState(null); // { kind: 'scope'|'other', msg }
  const [loading, setLoading] = useState(false);
  const refined = isRefined5b();

  const load = React.useCallback(() => {
    setLoading(true); setErr(null);
    fetchGoogleTasks({ maxResults: 50 })
      .then((list) => { setTasks(list); setErr(null); })
      .catch((e) => {
        if (e instanceof GoogleTasksScopeError) {
          setErr({ kind: 'scope', msg: 'Reconnect Google Calendar above (one tap) to grant Tasks access — Google needs to re-confirm the new permission.' });
        } else {
          setErr({ kind: 'other', msg: e?.message || 'Could not load Google Tasks.' });
        }
        setTasks(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (connected) load();
    else { setTasks(null); setErr(null); }
  }, [connected, load]);

  if (!connected) return null; // Connect lives in the header bar

  return (
    <div style={{
      border: `1px solid var(--c-cardBd)`,
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      marginBottom: 12, padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: (err || (tasks && tasks.length)) ? 10 : 0 }}>
        <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: 'var(--c-tx)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>✓ Google Tasks</span>
        <span style={{ flex: 1 }} />
        <button onClick={load} disabled={loading} title="Refresh Google Tasks"
          style={{
            fontFamily: FN, fontSize: 9, fontWeight: 700, color: 'var(--c-tm)',
            letterSpacing: '0.12em', textTransform: 'uppercase', background: 'transparent',
            border: `1px solid var(--c-cardBd)`, padding: '3px 8px', cursor: loading ? 'wait' : 'pointer',
          }}>{loading ? '…' : '↻ Refresh'}</button>
      </div>
      {err && (
        <div style={{ fontFamily: FB, fontSize: 12, lineHeight: 1.5, color: err.kind === 'scope' ? 'var(--c-ac)' : 'var(--c-rd)' }}>{err.msg}</div>
      )}
      {!err && tasks && tasks.length === 0 && (
        <div style={{ fontFamily: FB, fontSize: 12, color: 'var(--c-td)' }}>No open Google Tasks.</div>
      )}
      {!err && tasks && tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: FB, fontSize: 13, color: 'var(--c-tx)' }}>
              <span style={{ color: 'var(--c-ac)', fontSize: 11, lineHeight: 1.4 }}>○</span>
              <span style={{ flex: 1 }}>{t.title}</span>
              {t.due && <span style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', whiteSpace: 'nowrap' }}>{new Date(t.due).toLocaleDateString()}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarEmbedCard() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data?.user?.email || 'ohadyproductions@gmail.com');
    }).catch(() => {
      if (!cancelled) setEmail('ohadyproductions@gmail.com');
    });
    return () => { cancelled = true; };
  }, []);
  const src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(email || 'ohadyproductions@gmail.com')}&ctz=Asia%2FJerusalem&mode=WEEK&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0&showTz=0`;
  // Google Calendar's embed URL strips the Tasks layer (Google decision —
  // not a parameter we can flip). Surface a direct link to the full view
  // where Tasks ARE visible, opened in a new tab.
  const fullCalendarHref = 'https://calendar.google.com/calendar/u/0/r';
  return (
    <div style={{
      border: `1px solid var(--c-cardBd)`,
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      marginBottom: 12,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Collapse calendar' : 'Expand calendar'}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '10px 14px', textAlign: 'left',
        }}>
        <span style={{
          fontFamily: FN, fontSize: 12, fontWeight: 700,
          color: 'var(--c-tm)',
          transition: 'transform 120ms ease',
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>▾</span>
        <span style={{
          fontFamily: FN, fontSize: 11, fontWeight: 700,
          color: 'var(--c-tx)', letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>📅 Google Calendar</span>
        <span style={{ flex: 1 }} />
        <a href={fullCalendarHref} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open full Google Calendar (with Tasks layer + multi-calendar) in a new tab"
          style={{
            fontFamily: FN, fontSize: 9, fontWeight: 700,
            color: 'var(--c-ac)', letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none',
            border: '1px solid var(--c-ac)', padding: '3px 8px',
          }}>↗ Full View</a>
        <span style={{
          fontFamily: FN, fontSize: 9, fontWeight: 600,
          color: 'var(--c-td)', letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>{open ? 'Collapse' : 'Expand'}</span>
      </button>
      {open && (
        <div style={{
          borderTop: `1px solid var(--c-cardBd)`,
          background: 'var(--c-bg)',
          animation: 'tasks-v8-slide-in 200ms ease-out',
        }}>
          <iframe
            title="Google Calendar"
            src={src}
            style={{
              border: 0, width: '100%', height: 600,
              display: 'block',
            }}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

// Section header — clickable to collapse. Small colored dot + chevron +
// name + count. No heavy top border. Visual restraint = calmer list.
function SectionHeader({ label, count, color, collapsed, onToggleCollapse }) {
  return (
    <div
      onClick={onToggleCollapse}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', cursor: 'pointer',
        borderBottom: `1px solid var(--c-cardBd)`,
        background: 'var(--c-sf2, transparent)',
      }}>
      <span style={{
        display: 'inline-block', width: 8, height: 8, background: color, borderRadius: '50%',
      }} />
      <span style={{
        fontFamily: FN, fontSize: 10, fontWeight: 700,
        color: 'var(--c-tm)', flexShrink: 0,
        transition: 'transform 120ms ease',
        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
      }}>▾</span>
      <span style={{
        fontFamily: FN, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.18em', color: 'var(--c-tx)',
        textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        color: 'var(--c-td)', letterSpacing: '0.04em',
      }}>{count}</span>
    </div>
  );
}

// Author chip for comments + audit rows. Mirrors the assignee-dot vibe
// but with a label since the timeline reads as prose, not a tag scan.
function AuthorChip({ author }) {
  const isYuval = author === 'yuval';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: FN, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: isYuval ? YUVAL_COLOR : 'var(--c-ac)',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        background: isYuval ? YUVAL_COLOR : 'var(--c-ac)',
        color: '#FFFFFF', fontSize: 8,
      }}>{isYuval ? 'Y' : 'O'}</span>
      {isYuval ? 'Yuval' : 'Ohad'}
    </span>
  );
}

const EVENT_VERB = {
  created:           'created the task',
  status_changed:    'changed status',
  assigned:          'reassigned',
  due_changed:       'changed due',
  body_edited:       'edited body',
  priority_changed:  'changed priority',
  linked:            'linked',
  reopened:          'reopened',
};

function relativeTime(iso, now) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Inline SQL for the three pending migrations — same as the files in
// scripts/migrations/. Pasted into the bundle so the "copy" button is
// instant (no fetch, no CSP fuss). Update if the source SQL changes.
const PENDING_MIGRATION_SQL = `-- EXPO Phase 1 + 2 migrations (2026-05-28)
-- Paste in Supabase Studio → SQL Editor → Run. Idempotent.

-- 1. coach_notes task-fields (assigned_to / due_at / priority)
BEGIN;
ALTER TABLE public.coach_notes
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS due_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority    TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE public.coach_notes
  DROP CONSTRAINT IF EXISTS coach_notes_assigned_to_chk;
ALTER TABLE public.coach_notes
  ADD CONSTRAINT coach_notes_assigned_to_chk
  CHECK (assigned_to IS NULL OR assigned_to IN ('ohad','yuval','shared'));
ALTER TABLE public.coach_notes
  DROP CONSTRAINT IF EXISTS coach_notes_priority_chk;
ALTER TABLE public.coach_notes
  ADD CONSTRAINT coach_notes_priority_chk
  CHECK (priority IN ('low','normal','high','urgent'));
CREATE INDEX IF NOT EXISTS coach_notes_assigned_to_idx
  ON public.coach_notes (assigned_to, status, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_notes_due_at_idx
  ON public.coach_notes (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_notes_priority_open_idx
  ON public.coach_notes (priority, due_at) WHERE status = 'open';
COMMIT;

-- 2. coach_note_comments
CREATE TABLE IF NOT EXISTS public.coach_note_comments (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES public.coach_notes(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL,
  mentions    TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_note_comments
  DROP CONSTRAINT IF EXISTS coach_note_comments_author_chk;
ALTER TABLE public.coach_note_comments
  ADD CONSTRAINT coach_note_comments_author_chk
  CHECK (author IN ('ohad','yuval'));
CREATE INDEX IF NOT EXISTS coach_note_comments_note_idx
  ON public.coach_note_comments (note_id, created_at);
ALTER TABLE public.coach_note_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach_note_comments_trainer_all" ON public.coach_note_comments;
CREATE POLICY "coach_note_comments_trainer_all" ON public.coach_note_comments
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_note_comments TO authenticated;

-- 3. coach_note_events
CREATE TABLE IF NOT EXISTS public.coach_note_events (
  id          BIGSERIAL PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES public.coach_notes(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  from_value  TEXT,
  to_value    TEXT,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_note_events_note_idx
  ON public.coach_note_events (note_id, created_at);
ALTER TABLE public.coach_note_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coach_note_events_trainer_all" ON public.coach_note_events;
CREATE POLICY "coach_note_events_trainer_all" ON public.coach_note_events
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');
GRANT SELECT, INSERT ON public.coach_note_events TO authenticated;
GRANT USAGE ON SEQUENCE public.coach_note_events_id_seq TO authenticated;
`;

// Surfaced when comments are unavailable (migration not applied). One
// click copies the SQL → Ohad opens Studio (link below) → pastes →
// runs. Two clicks total to unlock comments + audit log + Phase 1 cols.
function MigrationPendingHint() {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(PENDING_MIGRATION_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      toast(`Copy failed: ${err.message || err}`, 'error', { ttl: 4000 });
    }
  };
  const studioHref = 'https://supabase.com/dashboard/project/gtcbfglttoiyfsnfbhdy/sql/new';
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px',
      background: 'var(--c-sf2, transparent)',
      border: `1px dashed var(--c-cardBd)`,
      direction: 'ltr',
    }}>
      <div style={{
        fontFamily: FN, fontSize: 10, fontWeight: 700,
        color: 'var(--c-tm)', letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 6,
      }}>Comments + audit log pending</div>
      <div style={{
        fontFamily: FB, fontSize: 12, color: 'var(--c-tx)',
        marginBottom: 8, lineHeight: 1.5,
      }}>Two clicks to unlock the full Phase 1+2 schema (priority / due_at / assigned_to columns + comments thread + audit timeline).</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={onCopy} style={{
          background: copied ? 'var(--c-gn)' : 'var(--c-ac)', color: '#FFFFFF',
          border: 'none', fontFamily: FN, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', padding: '6px 12px', cursor: 'pointer',
          borderRadius: 0, textTransform: 'uppercase',
        }}>{copied ? '✓ Copied' : '1. Copy SQL'}</button>
        <a href={studioHref} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'transparent', color: 'var(--c-ac)',
            border: '1px solid var(--c-ac)',
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '6px 12px',
            textDecoration: 'none', borderRadius: 0,
            textTransform: 'uppercase',
          }}>2. Open Studio →</a>
      </div>
    </div>
  );
}

function CommentsThread({ noteId, defaultAuthor }) {
  const { rows, loading, available, add } = useCoachNoteComments(noteId);
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState(defaultAuthor || 'ohad');
  const [busy, setBusy] = useState(false);
  if (!available) {
    // Migration not applied — render an actionable hint with a one-click
    // copy + a direct link to Supabase Studio SQL Editor. Avoids the
    // 'open repo → find file → paste into Studio' chain.
    return <MigrationPendingHint />;
  }
  const submit = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const t = draft.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await add({ author, body: t });
    setBusy(false);
    if (ok) setDraft('');
  };
  const now = Date.now();
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontFamily: FN, fontSize: 9, fontWeight: 700,
        letterSpacing: '0.12em', color: 'var(--c-tm)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>Comments {rows.length > 0 ? `· ${rows.length}` : ''}</div>
      {rows.map(c => {
        const heb = isHebrew(c.body || '');
        return (
          <div key={c.id} style={{
            padding: '8px 10px', marginBottom: 6,
            border: `1px solid var(--c-cardBd)`,
            background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 4, direction: 'ltr',
            }}>
              <AuthorChip author={c.author} />
              <span style={{
                fontFamily: FN, fontSize: 9, fontWeight: 600,
                color: 'var(--c-td)', letterSpacing: '0.04em',
              }}>{relativeTime(c.created_at, now)}</span>
            </div>
            <div style={{
              fontFamily: heb ? FH : FB, fontSize: 13,
              color: 'var(--c-tx)', lineHeight: 1.5,
              direction: heb ? 'rtl' : 'ltr',
              textAlign: heb ? 'right' : 'left',
              whiteSpace: 'pre-wrap',
            }}>{c.body}</div>
            {Array.isArray(c.mentions) && c.mentions.length > 0 && (
              <div style={{ marginTop: 4, direction: 'ltr' }}>
                {c.mentions.map(m => (
                  <span key={m} style={{
                    display: 'inline-block', marginRight: 6,
                    fontFamily: FN, fontSize: 9, fontWeight: 700,
                    color: m === 'yuval' ? YUVAL_COLOR : 'var(--c-ac)',
                    letterSpacing: '0.04em',
                  }}>@{m}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <form onSubmit={submit} style={{
        display: 'flex', gap: 6, alignItems: 'stretch',
        marginTop: rows.length > 0 ? 8 : 0,
      }}>
        {/* Author toggle — 2-letter pill so Ohad can comment as Yuval (or vice versa
            once Yuval has his own auth identity) without re-logging in. */}
        <div style={{ display: 'flex', flexShrink: 0 }}>
          {['ohad','yuval'].map(a => (
            <button key={a} type="button"
              onMouseDown={(e) => { e.preventDefault(); setAuthor(a); }}
              title={a === 'ohad' ? 'Comment as Ohad' : 'Comment as Yuval'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 30, borderRadius: 0,
                background: author === a ? (a === 'yuval' ? YUVAL_COLOR : 'var(--c-ac)') : 'transparent',
                color: author === a ? '#FFFFFF' : 'var(--c-tm)',
                border: author === a ? 'none' : `1px solid var(--c-cardBd)`,
                fontFamily: FN, fontSize: 10, fontWeight: 700,
                cursor: 'pointer',
              }}>{a === 'yuval' ? 'Y' : 'O'}</button>
          ))}
        </div>
        <input type="text" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Add comment…  (use @ohad or @yuval to mention)"
          style={{
            flex: 1, background: 'transparent',
            border: `1px solid var(--c-cardBd)`,
            fontFamily: FB, fontSize: 12, color: 'var(--c-tx)',
            padding: '6px 10px', borderRadius: 0, outline: 'none',
          }} />
        <button type="submit" disabled={busy || !draft.trim()}
          style={{
            background: draft.trim() ? 'var(--c-ac)' : 'var(--c-sf2)',
            color: draft.trim() ? '#FFFFFF' : 'var(--c-td)',
            border: 'none', padding: '0 14px', height: 30,
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: draft.trim() && !busy ? 'pointer' : 'default',
          }}>Send</button>
      </form>
      {loading && rows.length === 0 && (
        <div style={{
          fontFamily: FN, fontSize: 9, fontWeight: 600,
          color: 'var(--c-td)', letterSpacing: '0.04em',
          textTransform: 'uppercase', marginTop: 6,
        }}>Loading…</div>
      )}
    </div>
  );
}

function EventTimeline({ noteId }) {
  const { rows, available } = useCoachNoteEvents(noteId);
  // Quiet when migration is pending — no point in showing an empty
  // "Activity" header. Comments component already surfaces the hint.
  if (!available || rows.length === 0) return null;
  const now = Date.now();
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontFamily: FN, fontSize: 9, fontWeight: 700,
        letterSpacing: '0.12em', color: 'var(--c-tm)',
        textTransform: 'uppercase', marginBottom: 6,
      }}>Activity</div>
      <div style={{ direction: 'ltr' }}>
        {rows.map(ev => {
          const verb = EVENT_VERB[ev.kind] || ev.kind;
          const change = (ev.from_value && ev.to_value)
            ? `${ev.from_value} → ${ev.to_value}`
            : (ev.to_value || ev.detail || '');
          return (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'baseline',
              gap: 8, fontSize: 11, lineHeight: 1.6,
              color: 'var(--c-tm)', fontFamily: FB,
              padding: '2px 0',
            }}>
              <AuthorChip author={ev.actor} />
              <span>{verb}</span>
              {change && (
                <span style={{
                  fontFamily: FN, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.04em', color: 'var(--c-tx)',
                }}>{change}</span>
              )}
              <span style={{
                marginLeft: 'auto',
                fontFamily: FN, fontSize: 9, fontWeight: 600,
                color: 'var(--c-td)', letterSpacing: '0.04em',
              }}>{relativeTime(ev.created_at, now)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Pill bar shown in the expanded view of a shared task. Lets the coach
// flip each side's approval explicitly (matters while Yuval doesn't yet
// have his own auth — once he does, his side becomes self-service and
// this UI degrades to a status indicator instead of a control).
function SharedApprovalBar({ row, onSetApproval }) {
  if (row._owner !== 'shared') return null;
  const approvals = row._approvals || { ohad: false, yuval: false };
  const Pill = ({ who, label, color, approved }) => (
    <button onClick={(e) => { e.stopPropagation(); onSetApproval(row, who, !approved); }}
      title={approved ? `Revoke ${label}'s approval` : `Approve as ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: approved ? color : 'transparent',
        color: approved ? '#FFFFFF' : color,
        border: `1px solid ${color}`,
        fontFamily: FN, fontSize: 9, fontWeight: 700,
        letterSpacing: '0.12em', padding: '4px 10px',
        cursor: 'pointer', borderRadius: 0,
        textTransform: 'uppercase',
      }}>{approved ? '✓' : '○'} {label}</button>
  );
  const bothApproved = approvals.ohad && approvals.yuval;
  return (
    <div style={{ marginTop: 10, direction: 'ltr',
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        fontFamily: FN, fontSize: 9, fontWeight: 700,
        letterSpacing: '0.12em', color: 'var(--c-tm)',
        textTransform: 'uppercase',
      }}>Dual approval</span>
      <Pill who="ohad"  label="Ohad"  color="var(--c-ac)"   approved={approvals.ohad} />
      <Pill who="yuval" label="Yuval" color={YUVAL_COLOR}    approved={approvals.yuval} />
      <span style={{
        fontFamily: FN, fontSize: 9, fontWeight: 600,
        color: bothApproved ? 'var(--c-gn)' : 'var(--c-td)',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>{bothApproved ? 'Both approved · task is done'
         : approvals.ohad || approvals.yuval ? `Waiting for ${approvals.ohad ? 'Yuval' : 'Ohad'}`
         : 'Needs both signoffs'}</span>
    </div>
  );
}

function ExpandedDetail({ row, displayBody, gcalConnected, onSyncToCalendar, onDeleteFromCalendar, onSetSharedApproval }) {
  const heb = isHebrew(displayBody || '');
  // Filter internal-use tags (gevent/getag/glink/approved) out of the
  // visible tag list. Approvals are shown via SharedApprovalBar.
  const rawTags = (Array.isArray(row.tags) ? row.tags : []).filter(t =>
    !t.startsWith('gevent:') && !t.startsWith('getag:') && !t.startsWith('glink:') && !t.startsWith('approved:')
  );
  // Hide a bare namespace when a more specific child exists (drop 'center'
  // if 'center:property' is present) so the chips don't read redundant.
  const namespaces = new Set(rawTags.filter(t => t.includes(':')).map(t => t.split(':')[0]));
  const tags = rawTags.filter(t => !(namespaces.has(t) && !t.includes(':')));
  // 'center:property' → 'Center · Property' — no hashtag noise, no raw colon.
  const labelTag = (t) => t.split(':').map(p => p.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' · ');
  const syncedEventId = getStoredEventId(row);
  const syncedHtmlLink = getStoredHtmlLink(row);

  return (
    <div style={{
      padding: '10px 14px 14px 38px',
      background: 'var(--c-sf2, transparent)',
      borderBottom: `1px solid var(--c-cardBd)`,
      fontFamily: heb ? FH : FB,
      fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.6,
      direction: heb ? 'rtl' : 'ltr',
    }}>
      <div style={{ marginBottom: 6, color: 'var(--c-tx)' }}>{displayBody}</div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, direction: 'ltr' }}>
          {tags.map(t => (
            <span key={t} style={{
              fontFamily: FN, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.1em', color: 'var(--c-ac)',
              background: 'rgba(57,189,255,0.12)', padding: '3px 8px',
            }}>{labelTag(t)}</span>
          ))}
        </div>
      )}
      <SharedApprovalBar row={row} onSetApproval={onSetSharedApproval} />
      <div style={{ marginTop: 10, direction: 'ltr', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {gcalConnected ? (
          syncedEventId ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); onSyncToCalendar(row); }}
                title="Update this event in Google Calendar"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent', color: 'var(--c-gn)',
                  border: '1px solid var(--c-gn)',
                  fontFamily: FN, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', padding: '4px 10px',
                  cursor: 'pointer', borderRadius: 0,
                  textTransform: 'uppercase',
                }}>↻ Update in Calendar</button>
              <button onClick={(e) => { e.stopPropagation(); onDeleteFromCalendar(row); }}
                title="Remove this event from Google Calendar"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent', color: 'var(--c-rd)',
                  border: '1px solid var(--c-rd)',
                  fontFamily: FN, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', padding: '4px 10px',
                  cursor: 'pointer', borderRadius: 0,
                  textTransform: 'uppercase',
                }}>✕ Remove from Calendar</button>
              <a href={syncedHtmlLink || `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent('Task ID: ' + row.id)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent', color: 'var(--c-ac)',
                  border: '1px solid var(--c-ac)',
                  fontFamily: FN, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', padding: '4px 10px',
                  textDecoration: 'none', borderRadius: 0,
                  textTransform: 'uppercase',
                }}>↗ Open in Calendar</a>
            </>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onSyncToCalendar(row); }}
              title="Add this task to Google Calendar"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--c-ac)', color: '#FFFFFF',
                border: 'none',
                fontFamily: FN, fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em', padding: '4px 10px',
                cursor: 'pointer', borderRadius: 0,
                textTransform: 'uppercase',
              }}>📅 Add to Calendar</button>
          )
        ) : (
          <span style={{
            fontFamily: FN, fontSize: 9, fontWeight: 600,
            color: 'var(--c-td)', letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>Connect Google Calendar at the top to sync this task</span>
        )}
      </div>
      {/* Comments + audit timeline (Phase 2). Both gracefully no-op
          when their migrations haven't been applied — Comments shows
          a hint, EventTimeline silently absents itself. */}
      <CommentsThread noteId={row.id} defaultAuthor={row._owner === 'yuval' ? 'yuval' : 'ohad'} />
      <EventTimeline noteId={row.id} />
    </div>
  );
}

function TaskRow({ row, theme, showAvatar, expanded, onToggleExpand, onSetStatus, now, search, gcalConnected, onSyncToCalendar, onDeleteFromCalendar, onSetSharedApproval }) {
  const heb = isHebrew(row._display || '');
  // Date pill reads the parsed _dueAt (from inline `· due …`) and falls
  // back to created_at only as a last resort — without a real due date,
  // the pill shouldn't claim "OVERDUE" or "TODAY".
  const dm = dateMeta(row._dueAt || null, now);
  const hasDue = !!row._dueAt;
  const isToday = hasDue && dm.label === 'TODAY';
  const isOverdue = hasDue && dm.isOverdue;
  const isStuck = row.status === 'stuck';
  const priority = row._priority || 'normal';
  const [hover, setHover] = useState(false);
  // Urgency edge — 3px coloured left bar pulled from the date metadata.
  // Drives "scan from across the room" recognition without restructuring
  // the list (vs. lifting items into a separate "Today" section).
  const edgeColor = isOverdue ? 'var(--c-rd)'
                  : isToday   ? 'var(--c-ac)'
                  : isStuck   ? 'var(--c-rd)'
                              : 'transparent';
  return (
    <React.Fragment>
      <div
        onClick={onToggleExpand}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 12px 7px 9px', cursor: 'pointer', minHeight: 32,
          borderBottom: `1px solid var(--c-cardBd)`,
          borderLeft: `3px solid ${edgeColor}`,
          background: expanded ? 'var(--c-sf2, transparent)'
                     : hover     ? 'var(--c-sf2, rgba(57,189,255,0.04))'
                                 : 'transparent',
          transition: 'background 120ms ease',
        }}
      >
        {showAvatar && <AssigneeDot owner={row._owner} />}
        {/* Priority indicator — single-character glyph in the colour of the
            priority. Absent for NORMAL so the row doesn't pay rent for the
            common case. URGENT = filled red dot, HIGH = orange dot, LOW =
            hollow grey dot. */}
        {priority !== 'normal' && (
          <span title={`Priority: ${priority.toUpperCase()}`} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: priority === 'urgent' ? 'var(--c-rd)'
                      : priority === 'high'   ? YUVAL_COLOR
                                              : 'transparent',
            border: priority === 'low' ? `1.5px solid var(--c-td)` : 'none',
            flexShrink: 0,
          }} />
        )}
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily: heb ? FH : FB,
          fontSize: heb ? 14 : 13,
          fontWeight: 500,
          color: 'var(--c-tx)',
          direction: heb ? 'rtl' : 'ltr',
          textAlign: heb ? 'right' : 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <HighlightedText text={row._display} query={search} />
        </div>
        {/* Hover-revealed quick action — Linear pattern. Doesn't do anything
            yet (Phase 1 hooks up a quick-menu), just signals interactivity. */}
        <span style={{
          fontFamily: FN, fontSize: 14, fontWeight: 700, color: 'var(--c-td)',
          opacity: hover ? 1 : 0, transition: 'opacity 120ms ease',
          width: 14, textAlign: 'center', cursor: 'pointer',
          flexShrink: 0,
        }} title="More actions (Phase 1)">⋯</span>
        {/* Half-approved badge — shared tasks where exactly one of the
            two has signed off. Lives just LEFT of the status pill so
            it's visible in the same scan as the status glyph. */}
        {row._owner === 'shared' && row._approvals && (row._approvals.ohad !== row._approvals.yuval) && row.status !== 'done' && row.status !== 'cancelled' && (
          <span title={`Approved by ${row._approvals.ohad ? 'Ohad' : 'Yuval'} · waiting for ${row._approvals.ohad ? 'Yuval' : 'Ohad'}`}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: '50%',
              border: `1px solid ${row._approvals.ohad ? 'var(--c-ac)' : YUVAL_COLOR}`,
              fontFamily: FN, fontSize: 9, fontWeight: 700,
              color: row._approvals.ohad ? 'var(--c-ac)' : YUVAL_COLOR,
              flexShrink: 0,
            }}>½</span>
        )}
        <StatusPill status={row.status} theme={theme} onSetStatus={(s) => onSetStatus(row, s)} />
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700,
          color: hasDue ? dm.color : 'var(--c-td)',
          letterSpacing: '0.04em',
          width: 56, textAlign: 'right',
          flexShrink: 0,
        }}>{hasDue ? dm.label : '—'}</span>
      </div>
      {expanded && (
        <div style={{
          animation: 'tasks-v8-slide-in 200ms ease-out',
        }}>
          <ExpandedDetail row={row} displayBody={row._display}
            gcalConnected={gcalConnected}
            onSyncToCalendar={onSyncToCalendar}
            onDeleteFromCalendar={onDeleteFromCalendar}
            onSetSharedApproval={onSetSharedApproval}
          />
        </div>
      )}
    </React.Fragment>
  );
}

// ────────────────────────────────────────────────────────────────────
// main view
// ────────────────────────────────────────────────────────────────────

export default function TasksV8View({ trainees = [], onSelectTrainee }) {
  const { rows, loading, update, create } = useCoachNotes({ limit: 200 });
  // viewerOwner is the partner currently looking at the surface. Used to
  // hide the OTHER partner's private queue tab + clamp the initial owner
  // selection to a tab they can actually see. Default 'ohad' until Yuval
  // has his own auth — the comparison checks email containing 'yuval'.
  const [viewerOwner, setViewerOwner] = useState('ohad');
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const email = (data?.user?.email || '').toLowerCase();
      setViewerOwner(email.includes('yuval') ? 'yuval' : 'ohad');
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Default landing tab = the viewer's own queue.
  const [owner, setOwner] = useState('ohad');
  useEffect(() => {
    // Coerce owner away from the hidden tab on mount + when viewer changes.
    if (viewerOwner === 'yuval' && owner === 'ohad')  setOwner('yuval');
    if (viewerOwner === 'ohad'  && owner === 'yuval') setOwner('ohad');
  }, [viewerOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState('list'); // 'list' | 'board'
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all'); // all | today | overdue | stuck | nodate
  const [collapsedSections, setCollapsedSections] = useState({});
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalBusy, setGcalBusy] = useState(false);
  const now = useMemo(() => new Date(), []);

  const toggleSectionCollapse = (key) => setCollapsedSections(p => ({ ...p, [key]: !p[key] }));

  // Calendar connection: check connection state on mount. The GIS-based
  // flow uses a popup so there's no redirect callback to consume — just
  // read the token cache.
  useEffect(() => {
    isCalendarConnected().then(setGcalConnected);
  }, []);

  const handleConnectGcal = async () => {
    setGcalBusy(true);
    const token = await connectGoogleCalendar();
    setGcalBusy(false);
    if (token) {
      const verified = await isCalendarConnected();
      setGcalConnected(verified);
      if (verified) {
        toast('Google Calendar connected · syncing existing tasks…', 'success', { ttl: 4000 });
        // Batch-sync every open task that doesn't already have a Google
        // event ID. Without this the per-task "Add to Calendar" button
        // had to be clicked once per row; with it, the existing backlog
        // lands in Calendar in the background as soon as the coach
        // clicks Connect. Throttled to 4 concurrent so we don't hit
        // Google's rate limit on a large backlog.
        try {
          const unsynced = (rows || []).filter(r =>
            r.status !== 'done' && r.status !== 'cancelled' && !getStoredEventId(r)
          );
          if (unsynced.length > 0) {
            let done = 0, fail = 0;
            const CONCURRENCY = 4;
            for (let i = 0; i < unsynced.length; i += CONCURRENCY) {
              const slice = unsynced.slice(i, i + CONCURRENCY);
              await Promise.all(slice.map(async (r) => {
                try {
                  await syncRowToCalendar({ ...r, _owner: ownerFromBody(r.body) },
                    { displayBody: displayBodyOf(r.body) });
                  done++;
                } catch { fail++; }
              }));
            }
            if (fail === 0) {
              toast(`Synced ${done} existing task${done === 1 ? '' : 's'} to Calendar ✓`, 'success', { ttl: 4000 });
            } else {
              toast(`Synced ${done}, ${fail} failed — reopen the row to retry`, 'warning', { ttl: 5000 });
            }
          }
        } catch (err) {
          console.warn('Backlog sync failed:', err);
        }
      } else {
        toast('Connection succeeded but verification call failed', 'error', { ttl: 6000 });
      }
    } else {
      toast('Calendar connection cancelled or failed', 'info', { ttl: 4000 });
    }
  };
  const handleDisconnectGcal = () => {
    disconnectCalendar();
    clearSyncToken();
    setGcalConnected(false);
    setLastSyncedAt(null);
    toast('Disconnected from Google Calendar', 'info', { ttl: 3000 });
  };

  const handleSyncToCalendar = async (row) => {
    if (!gcalConnected) {
      toast('Connect Google Calendar first', 'info', { ttl: 3000 });
      return;
    }
    try {
      const result = await reconcileRow(row, { displayBody: displayBodyOf(row.body) });
      if (result && result.tags) await update(row.id, { tags: result.tags });
      toast(result?.htmlLink ? 'Task added to Google Calendar' : 'Task synced to Google Calendar', 'success', { ttl: 3000 });
    } catch (err) {
      if (err instanceof GoogleCalendarAuthError) {
        setGcalConnected(false);
        toast('Calendar session expired — click Connect at the top', 'error', { ttl: 6000 });
      } else {
        toast(`Sync failed: ${err.message || err}`, 'error', { ttl: 6000 });
      }
    }
  };

  const handleDeleteFromCalendar = async (row) => {
    if (!gcalConnected) return;
    try {
      const result = await unlinkAndDeleteEvent(row);
      if (result && result.tags) await update(row.id, { tags: result.tags });
      toast('Event removed from Google Calendar', 'success', { ttl: 3000 });
    } catch (err) {
      if (err instanceof GoogleCalendarAuthError) {
        setGcalConnected(false);
        toast('Calendar session expired — click Connect at the top', 'error', { ttl: 6000 });
      } else {
        toast(`Remove failed: ${err.message || err}`, 'error', { ttl: 6000 });
      }
    }
  };

  // ── Pull side: Google → EXPO via polling ──────────────────────────
  // Bidirectional sync without server-side state. Polls Google's
  // events.list every 60s while v8 is open and Calendar is connected.
  // For each remote event with a matching local row (by gevent:ID tag):
  //   - cancelled → mark local row done + clear sync tags
  //   - updated   → mirror summary change (title) and status prefix
  // Suppresses errors during polling (logs to console) so a transient
  // network failure doesn't toast-spam the user.
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  useEffect(() => {
    if (!gcalConnected) return;
    let cancelled = false;

    const reconcileIncoming = async (events) => {
      for (const event of events) {
        const localRow = rows.find(r => getStoredEventId(r) === event.id);
        if (!localRow) continue;
        // Cancelled remotely → close locally.
        if (event.status === 'cancelled') {
          await update(localRow.id, {
            status: 'done',
            completed_at: new Date().toISOString(),
            tags: (localRow.tags || []).filter(t => !t.startsWith('gevent:') && !t.startsWith('getag:')),
          });
          continue;
        }
        // Updated remotely → mirror the title back. Preserve the EXPO
        // body prefix ("Yuval: ", "Ohad + Yuval: ", "Ohad: ") so the
        // assignee chip stays correct.
        const newSummary = stripStatusPrefix(event.summary || '');
        const currentDisplay = stripOwnerPrefix(localRow.body);
        if (newSummary && newSummary !== currentDisplay) {
          const owner = ownerFromBody(localRow.body);
          const prefix = owner === 'shared' ? 'Ohad + Yuval: '
                       : owner === 'yuval'  ? 'Yuval: '
                       : 'Ohad: ';
          await update(localRow.id, { body: prefix + newSummary });
        }
        // Mirror status from the bracketed prefix if present (e.g.
        // user typed [DONE] manually in Calendar).
        const remoteStatus = statusFromSummary(event.summary);
        if (remoteStatus === 'done' && localRow.status !== 'done') {
          await update(localRow.id, { status: 'done', completed_at: new Date().toISOString() });
        }
      }
    };

    const poll = async () => {
      try {
        const events = await pullChangesSinceLastSync();
        if (cancelled) return;
        if (events.length) await reconcileIncoming(events);
        setLastSyncedAt(getLastSyncedAt());
      } catch (err) {
        if (err instanceof GoogleCalendarAuthError) {
          if (!cancelled) {
            setGcalConnected(false);
            toast('Calendar session expired — click Connect at the top', 'error', { ttl: 6000 });
          }
          return;
        }
        console.warn('Calendar pull failed (silent):', err);
      }
    };

    // First pull immediately on mount/connection; then every 60s.
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [gcalConnected, rows]);

  // Format a relative "Synced 30s ago" indicator.
  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return null;
    const seconds = Math.round((Date.now() - lastSyncedAt.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)}h ago`;
  }, [lastSyncedAt, now]);

  // Sync a row to Calendar — called from setStatus / onComposerSubmit /
  // future delete. Swallows GoogleCalendarAuthError into a reconnect
  // prompt; other errors propagate to a toast.
  const syncRowToCalendar = async (row, opts = {}) => {
    if (!gcalConnected) return;
    try {
      const result = await reconcileRow(row, opts);
      if (result && result.tags) {
        // Persist new tag set (with gevent: / getag:) onto the row.
        await update(row.id, { tags: result.tags });
      }
    } catch (err) {
      if (err instanceof GoogleCalendarAuthError) {
        toast('Calendar session expired — click Reconnect at the top', 'error', { ttl: 6000 });
        setGcalConnected(false);
      } else {
        console.error('Calendar sync failed:', err);
        toast(`Calendar sync failed: ${err.message || err}`, 'error', { ttl: 6000 });
      }
    }
  };
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'dark';

  const decorated = useMemo(() => rows.map(r => {
    const o = ownerFromBody(r.body);
    const p = priorityFromBody(r.body);
    const dueAt = dueAtFromBody(r.body);
    const approvals = o === 'shared' ? approvalsFromTags(r.tags) : null;
    return {
      ...r,
      _owner: o,
      _priority: p,
      _dueAt: dueAt,
      _approvals: approvals, // null for non-shared, {ohad, yuval} for shared
      // _display = title only (owner + priority + due all stripped). This is
      // what the row, search, and Calendar sync should show / match against.
      _display: displayBodyOf(r.body),
    };
  }), [rows]);

  const counts = useMemo(() => ({
    ohad:   decorated.filter(r => r._owner === 'ohad').length,
    yuval:  decorated.filter(r => r._owner === 'yuval').length,
    shared: decorated.filter(r => r._owner === 'shared').length,
  }), [decorated]);

  // Owner + open filter is the base. Search narrows further.
  // Terminal states (done, cancelled) drop to the bottom pool.
  const ownerBase = useMemo(
    () => decorated.filter(r => r._owner === owner && r.status !== 'done' && r.status !== 'cancelled'),
    [decorated, owner]
  );

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ownerBase;
    return ownerBase.filter(r => (r._display || r.body || '').toLowerCase().includes(q));
  }, [ownerBase, search]);

  // Quick-filter counts (computed off ownerBase so chips show real numbers
  // even before user picks the filter). Uses parsed _dueAt → so OVERDUE
  // and TODAY are truthful once tasks have inline due metadata.
  const quickCounts = useMemo(() => {
    const c = { all: ownerBase.length, today: 0, overdue: 0, stuck: 0, nodate: 0 };
    for (const r of ownerBase) {
      const dm = dateMeta(r._dueAt || null, now);
      if (r._dueAt) {
        if (dm.label === 'TODAY') c.today++;
        if (dm.isOverdue) c.overdue++;
      } else {
        c.nodate++;
      }
      if (r.status === 'stuck') c.stuck++;
    }
    return c;
  }, [ownerBase, now]);

  // Apply quick filter on top of search. Same parsed _dueAt as the chips.
  const quickFiltered = useMemo(() => {
    if (quickFilter === 'all') return searched;
    return searched.filter(r => {
      const dm = dateMeta(r._dueAt || null, now);
      if (quickFilter === 'today')   return !!r._dueAt && dm.label === 'TODAY';
      if (quickFilter === 'overdue') return !!r._dueAt && dm.isOverdue;
      if (quickFilter === 'stuck')   return r.status === 'stuck';
      if (quickFilter === 'nodate')  return !r._dueAt;
      return true;
    });
  }, [searched, quickFilter, now]);

  // Group by source then sort within each group. Order: Center → trainees
  // (by row count desc) → Manual → Auto-tasks. Sourced from quickFiltered
  // so the chip selection narrows the list before grouping.
  const sections = useMemo(() => {
    const byKey = new Map();
    for (const r of quickFiltered) {
      const k = sourceKey(r);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }
    for (const [k, list] of byKey.entries()) {
      byKey.set(k, applySort(list, sortBy, sortDir, now));
    }
    const result = [];
    if (byKey.has('center'))  result.push({ key: 'center',  rows: byKey.get('center')  });
    const trainees = [...byKey.entries()].filter(([k]) => k.startsWith('trainee:'));
    trainees.sort((a, b) => b[1].length - a[1].length);
    for (const [k, r] of trainees) result.push({ key: k, rows: r });
    if (byKey.has('manual'))  result.push({ key: 'manual',  rows: byKey.get('manual')  });
    if (byKey.has('auto'))    result.push({ key: 'auto',    rows: byKey.get('auto')    });
    return result;
  }, [quickFiltered, sortBy, sortDir, now]);

  // Terminal pool — done AND cancelled live together at the bottom.
  const done = useMemo(
    () => decorated.filter(r => r._owner === owner && (r.status === 'done' || r.status === 'cancelled')),
    [decorated, owner]
  );

  const toggleRow = (id) => setExpandedRows(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  // Toggle one half of the dual-approval on a shared task. Lets the
  // expanded-row UI add Yuval's signoff explicitly while Yuval doesn't
  // yet have his own auth identity (Ohad clicks the "Approve as Yuval"
  // pill on Yuval's behalf during pairing); once Yuval has his own
  // login the actor will derive from auth.user().email.
  const setSharedApproval = async (row, who, value) => {
    if (row._owner !== 'shared') return;
    const nextTags = withApproval(row.tags, who, value);
    const approvals = approvalsFromTags(nextTags);
    const bothApproved = approvals.ohad && approvals.yuval;
    const patch = { tags: nextTags.length ? nextTags : null };
    if (bothApproved) {
      patch.status = 'done';
      patch.completed_at = new Date().toISOString();
    } else if (row.status === 'done') {
      // No longer both approved — bounce back to open.
      patch.status = 'open';
      patch.completed_at = null;
    }
    await update(row.id, patch);
    const actor = who;
    if (bothApproved) {
      recordNoteEvent({ noteId: row.id, actor, kind: 'status_changed', fromValue: row.status || 'open', toValue: 'done', detail: 'both approved' });
      toast('Both approved — task done ✓', 'success', { ttl: 3000 });
    } else if (value) {
      recordNoteEvent({ noteId: row.id, actor, kind: 'status_changed', fromValue: row.status || 'open', toValue: 'half_approved', detail: `${who} approved · waiting for ${who === 'ohad' ? 'Yuval' : 'Ohad'}` });
      toast(`${who === 'ohad' ? 'Ohad' : 'Yuval'} approved · waiting for ${who === 'ohad' ? 'Yuval' : 'Ohad'}`, 'info', { ttl: 3500 });
    } else {
      recordNoteEvent({ noteId: row.id, actor, kind: 'reopened', toValue: 'open', detail: `${who} revoked approval` });
    }
  };

  const setStatus = async (row, target) => {
    // Shared tasks need dual-approval to reach 'done'. Single 'done' click
    // from the status popover adds the clicker's approval (defaults to
    // 'ohad' until Yuval's own auth lands); the other half lives on the
    // "Approve as Yuval" pill in the expanded row.
    if (row._owner === 'shared' && target === 'done') {
      const approvals = approvalsFromTags(row.tags);
      const me = 'ohad'; // TODO: derive from auth.user() once Yuval signs in separately
      if (!approvals[me]) {
        await setSharedApproval(row, me, true);
        return;
      }
      // Already approved by me — fall through to set the other side
      // OR if both are set, normal terminal logic handles it below.
    }
    // coach_notes.status is TEXT with no enum constraint, so all 6 states
    // (open / working / waiting / stuck / done / cancelled) persist as
    // their literal value. completed_at is stamped for the two terminal
    // states (done / cancelled) and cleared when reopening.
    const terminal = (target === 'done' || target === 'cancelled');
    const prev = row.status || 'open';
    if (prev === target) return;
    const patch = {
      status: target,
      completed_at: terminal ? new Date().toISOString() : null,
    };
    // Reopening a shared task wipes pending approvals so a fresh review
    // round starts clean. Going to done keeps the approval tags as the
    // audit record of who signed off.
    if (row._owner === 'shared' && !terminal) {
      patch.tags = stripApprovals(row.tags);
      if (patch.tags.length === 0) patch.tags = null;
    }
    await update(row.id, patch);
    // Audit log — actor is the row's owner today; will key off auth
    // identity once Yuval has his own login.
    const actor = row._owner === 'yuval' ? 'yuval' : 'ohad';
    const kind = (terminal === false && (prev === 'done' || prev === 'cancelled'))
      ? 'reopened'
      : 'status_changed';
    recordNoteEvent({ noteId: row.id, actor, kind, fromValue: prev, toValue: target });
    // Mirror to Google Calendar: terminal → [DONE]/[CANCELLED] prefix
    // patch; transient (waiting / stuck / working) → status-prefixed
    // title patch so the calendar event reflects the latest state.
    const rowWithIntent = { ...row, status: target };
    await syncRowToCalendar(rowWithIntent, { displayBody: displayBodyOf(row.body) });
  };
  // SmartComposer hands us structured input (assignee, due, source). Until
  // Phase 1 schema, we encode assignee as body prefix and source as a tag.
  // due is parked in body for now since coach_notes has no due_at column.
  const onComposerSubmit = async ({ body, assignee, due, time, priority, source, traineeId, traineeLabel }) => {
    if (!body || !body.trim()) return;
    // Body wire format: `Owner: [PRIORITY] body · due YYYY-MM-DD HH:MM`
    // Owner prefix → ownerFromBody. Priority bracket → priorityFromBody
    // (NORMAL is implicit, never written). Due suffix → dueAtFromBody.
    const ownerPrefix = assignee === 'yuval' ? 'Yuval: '
                      : assignee === 'shared' ? 'Ohad + Yuval: '
                      : 'Ohad: ';
    const priorityTag = (priority && priority !== 'normal')
      ? `[${priority.toUpperCase()}] ` : '';
    let prefixed = ownerPrefix + priorityTag + body;
    if (due) prefixed += ` · due ${due}${time ? ' ' + time : ''}`;
    const tags = source === 'center' ? ['center'] : [];
    // Trainee link uses the existing target_kind infra so the same row
    // shows up in the athlete's CRM-tasks feed and on TraineeDetail.
    const targetKind  = traineeId ? 'trainee' : 'general';
    const targetId    = traineeId || null;
    const targetLabel = traineeId ? (traineeLabel || null) : null;
    const createdRow = await create({ body: prefixed, targetKind, targetId, targetLabel, tags });
    if (createdRow) {
      const actor = assignee === 'yuval' ? 'yuval' : 'ohad';
      const detail = [
        priority !== 'normal' ? `priority=${priority}` : null,
        due ? `due=${due}${time ? ' ' + time : ''}` : null,
        traineeId ? `trainee=${traineeLabel || traineeId}` : null,
      ].filter(Boolean).join(' · ') || null;
      recordNoteEvent({ noteId: createdRow.id, actor, kind: 'created', toValue: assignee, detail });
    }
    // Sync to Calendar if connected. Pass the title-only displayBody so
    // the calendar event doesn't show `Ohad: [URGENT] …` to the attendee.
    if (createdRow && gcalConnected) {
      const syncRow = { ...createdRow, status: 'open' };
      const opts = { displayBody: body };
      if (due) opts.dueAt = new Date(due + 'T09:00:00').toISOString();
      if (time && /^\d{1,2}:\d{2}$/.test(time)) opts.dueTime = time;
      await syncRowToCalendar(syncRow, opts);
    }
  };

  // Keyboard shortcuts — the Linear seven. Hidden affordance, dramatic
  // perceived-quality lift per the micro-interactions research.
  //   / focus search · Esc clear · X toggle done on focused row
  // (J/K and Enter row navigation are stubbed; need row refs to be useful)
  React.useEffect(() => {
    const onKey = (e) => {
      // Don't hijack when typing in inputs/textareas.
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        const inp = document.querySelector('input[placeholder="Search…"]');
        inp?.focus();
      } else if (e.key === 'Escape') {
        if (search) setSearch('');
        if (expandedRows.size) setExpandedRows(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search, expandedRows]);

  if (loading) return <div style={{ padding: 24, color: 'var(--c-tm)' }}>Loading…</div>;

  // For non-auto sections, render directly. Auto section collapses by default
  // because it's the engine noise (88+ rows) that drowns out real delegation.
  const visibleSections = sections.filter(s => s.key !== 'auto');
  const autoSection = sections.find(s => s.key === 'auto');

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 14px' }}>
      {/* Title + Google Calendar connect state */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, gap: 12, flexWrap: 'wrap',
      }}>
        <h2 style={{
          margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--c-tx)',
        }}>Tasks</h2>
        {gcalConnected ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleDisconnectGcal}
              title="Disconnect Google Calendar"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'transparent', color: 'var(--c-gn)',
                border: '1px solid var(--c-gn)',
                fontFamily: FN, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em', padding: '5px 11px',
                cursor: 'pointer', borderRadius: 0,
                textTransform: 'uppercase',
              }}>📅 Calendar Synced ✓</button>
            {lastSyncedLabel && (
              <span style={{
                fontFamily: FN, fontSize: 9, fontWeight: 600,
                color: 'var(--c-td)', letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>↻ {lastSyncedLabel}</span>
            )}
          </div>
        ) : (
          <button
            onClick={handleConnectGcal}
            disabled={gcalBusy}
            title="Connect Google Calendar — tasks will sync automatically"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--c-ac)', color: '#FFFFFF',
              border: 'none', fontFamily: FN, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.12em', padding: '6px 12px',
              cursor: gcalBusy ? 'wait' : 'pointer', borderRadius: 0,
              textTransform: 'uppercase', opacity: gcalBusy ? 0.6 : 1,
            }}>📅 Connect Google Calendar</button>
        )}
      </div>

      <CalendarEmbedCard />
      <GoogleTasksPanel connected={gcalConnected} />

      {/* Owner tabs + view toggle */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12,
        flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Viewer-perspective owner tabs. Ohad sees Ohad + Shared (his
              queue); Yuval will see Yuval + Shared once he has his own
              auth identity. The OTHER's tab is hidden — there's no
              productive reason to look at someone else's private queue.
              Until Yuval logs in separately, viewer is always 'ohad'. */}
          {viewerOwner !== 'yuval' && (
            <OwnerTab label="Ohad"   count={counts.ohad}   active={owner === 'ohad'}   onClick={() => setOwner('ohad')}   color={C.ac} />
          )}
          {viewerOwner === 'yuval' && (
            <OwnerTab label="Yuval"  count={counts.yuval}  active={owner === 'yuval'}  onClick={() => setOwner('yuval')}  color={YUVAL_COLOR} />
          )}
          <OwnerTab label="Shared" count={counts.shared} active={owner === 'shared'} onClick={() => setOwner('shared')} />
        </div>
        <ViewToggle value={view} onChange={setView} />
      </div>

      <SortBar
        sortBy={sortBy} sortDir={sortDir}
        onSortBy={setSortBy}
        onToggleDir={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
        search={search} onSearch={setSearch}
        resultCount={quickFiltered.length} totalCount={ownerBase.length}
      />

      <QuickFilters value={quickFilter} onChange={setQuickFilter} counts={quickCounts} />

      {view === 'list' ? (
        <div style={{
          border: `1px solid var(--c-cardBd)`,
          background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
          borderRadius: 0,
        }}>
          <SmartComposer onSubmit={onComposerSubmit} defaultAssignee={owner === 'shared' ? 'ohad' : owner} trainees={trainees} />

          {visibleSections.length === 0 && !autoSection && (
            <div style={{
              padding: '36px 14px', textAlign: 'center',
              fontFamily: FN, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.12em', color: 'var(--c-td)',
              textTransform: 'uppercase',
            }}>
              {search ? `No matches for "${search}"` :
               quickFilter !== 'all' ? `No ${quickFilter.toUpperCase()} tasks for ${owner}` :
               `No tasks for ${owner}`}
              {search && (
                <button
                  onClick={async () => {
                    const q = search;
                    setSearch('');
                    await onComposerSubmit({ body: q, assignee: owner === 'shared' ? 'ohad' : owner, due: '', time: '', priority: 'normal', source: 'manual', traineeId: '', traineeLabel: '' });
                  }}
                  style={{
                    display: 'block', margin: '14px auto 0',
                    background: 'transparent', border: '1px solid var(--c-ac)',
                    color: 'var(--c-ac)',
                    fontFamily: FN, fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.12em', padding: '6px 14px',
                    cursor: 'pointer', borderRadius: 0,
                    textTransform: 'uppercase',
                  }}>+ Create task "{search}"</button>
              )}
            </div>
          )}
          {visibleSections.map(section => {
            const isCollapsed = !!collapsedSections[section.key];
            return (
              <React.Fragment key={section.key}>
                <SectionHeader
                  label={sourceLabel(section.key, section.rows[0])}
                  count={section.rows.length}
                  color={sourceColor(section.key)}
                  collapsed={isCollapsed}
                  onToggleCollapse={() => toggleSectionCollapse(section.key)}
                />
                {!isCollapsed && section.rows.map(row => (
                  <TaskRow key={row.id} row={row}
                    theme={theme} showAvatar={owner === 'shared'}
                    expanded={expandedRows.has(row.id)}
                    onToggleExpand={() => toggleRow(row.id)}
                    onSetStatus={setStatus}
                    now={now} search={search}
                  gcalConnected={gcalConnected}
                  onSyncToCalendar={handleSyncToCalendar}
                  onDeleteFromCalendar={handleDeleteFromCalendar}
                  onSetSharedApproval={setSharedApproval} />
                ))}
              </React.Fragment>
            );
          })}

          {/* Auto-tasks demoted — no section header. A single thin row at the
              bottom of the open list, click to expand. Engine noise stays
              tucked away unless explicitly summoned. */}
          {autoSection && (
            <React.Fragment>
              <div
                onClick={() => setAutoOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px',
                  borderBottom: autoOpen ? `1px solid var(--c-cardBd)` : 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}>
                <span style={{
                  fontFamily: FN, fontSize: 10, fontWeight: 600,
                  color: 'var(--c-tm)', letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}>{autoOpen ? '▾' : '▸'} {autoSection.rows.length} auto-alerts</span>
              </div>
              {autoOpen && autoSection.rows.map(row => (
                <TaskRow key={row.id} row={row}
                  theme={theme} showAvatar={owner === 'shared'}
                  expanded={expandedRows.has(row.id)}
                  onToggleExpand={() => toggleRow(row.id)}
                  onSetStatus={setStatus}
                  now={now} search={search}
                  gcalConnected={gcalConnected}
                  onSyncToCalendar={handleSyncToCalendar}
                  onDeleteFromCalendar={handleDeleteFromCalendar}
                  onSetSharedApproval={setSharedApproval} />
              ))}
            </React.Fragment>
          )}
        </div>
      ) : (
        // BOARD view — same data as cards. Uses auto-fill (not auto-fit) so
        // a single matching card doesn't stretch the full width on search.
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
          gap: 14,
        }}>
          {sections.map(section => (
            <div key={section.key} style={{
              border: `1px solid var(--c-cardBd)`,
              background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
              borderRadius: 0,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                background: sourceColor(section.key), color: '#FFFFFF',
                padding: '10px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: `1px solid var(--c-cardBd)`,
              }}>
                <span style={{
                  fontFamily: FN, fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                }}>{sourceLabel(section.key, section.rows[0])}</span>
                <span style={{
                  fontFamily: FN, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.06em', opacity: 0.85,
                }}>{section.rows.length}</span>
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {section.rows.map(row => (
                  <TaskRow key={row.id} row={row}
                    theme={theme} showAvatar={owner === 'shared'}
                    expanded={expandedRows.has(row.id)}
                    onToggleExpand={() => toggleRow(row.id)}
                    onSetStatus={setStatus}
                    search={search}
                    gcalConnected={gcalConnected}
                    onSyncToCalendar={handleSyncToCalendar}
                    onDeleteFromCalendar={handleDeleteFromCalendar}
                    onSetSharedApproval={setSharedApproval}
                    now={now} />
                ))}
              </div>
            </div>
          ))}
          {sections.length === 0 && (
            <div style={{
              gridColumn: '1 / -1',
              padding: '36px 14px', textAlign: 'center',
              fontFamily: FN, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.12em', color: 'var(--c-td)',
              textTransform: 'uppercase',
            }}>{search ? `No matches for "${search}"` : `No tasks for ${owner}`}</div>
          )}
        </div>
      )}

      {done.length > 0 && (
        <div style={{
          marginTop: 14,
          border: `1px solid var(--c-cardBd)`,
          background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
        }}>
          <div
            onClick={() => setDoneOpen(o => !o)}
            style={{
              padding: '10px 14px',
              fontFamily: FN, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.18em', color: 'var(--c-td)',
              textTransform: 'uppercase', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: doneOpen ? `1px solid var(--c-cardBd)` : 'none',
            }}>
            <span>{doneOpen ? '▾' : '▸'} Done · {done.length}</span>
            <span style={{ opacity: 0.6, fontSize: 9 }}>
              {doneOpen ? `Showing latest ${Math.min(done.length, 5)}` : 'Click to expand'}
            </span>
          </div>
          {doneOpen && [...done]
            .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))
            .slice(0, 5)
            .map(row => {
              const _owner = ownerFromBody(row.body);
              const decoratedDone = {
                ...row,
                _owner,
                _priority: priorityFromBody(row.body),
                _dueAt: dueAtFromBody(row.body),
                _approvals: _owner === 'shared' ? approvalsFromTags(row.tags) : null,
                _display: displayBodyOf(row.body),
              };
              return (
                <TaskRow key={row.id} row={decoratedDone}
                  theme={theme} showAvatar={owner === 'shared'}
                  expanded={expandedRows.has(row.id)}
                  onToggleExpand={() => toggleRow(row.id)}
                  onSetStatus={setStatus}
                  now={now} search={search}
                  gcalConnected={gcalConnected}
                  onSyncToCalendar={handleSyncToCalendar}
                  onDeleteFromCalendar={handleDeleteFromCalendar}
                  onSetSharedApproval={setSharedApproval} />
              );
            })}
          {doneOpen && done.length > 5 && (
            <div style={{
              padding: '10px 14px',
              fontFamily: FN, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.12em', color: 'var(--c-tm)',
              textTransform: 'uppercase', textAlign: 'center',
            }}>{done.length - 5} more done · view all in Phase 1</div>
          )}
        </div>
      )}

      <div style={{
        marginTop: 22, padding: '10px 0',
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', color: 'var(--c-td)',
        textTransform: 'uppercase',
      }}>
        v8 · list-first (Linear/Things 3 pattern) · view toggle to board · auto-tasks collapsed
      </div>
    </div>
  );
}
