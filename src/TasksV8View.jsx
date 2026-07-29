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

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b, toast, confirmToast, usePersistentState, asButton } from './ui';
import { useTheme } from './hooks/useTheme';
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
  if (diffDays === -1) return { label: 'YESTERDAY', color: 'var(--c-tm)', isOverdue: true };
  if (diffDays < -1) {
    const day = d.getDate();
    const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
    return { label: `${day} ${mon}`, color: 'var(--c-tm)', isOverdue: true };
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
// The explicit clock time on a due ("· due 2026-05-31 11:15" → "11:15"), or
// null when the task is date-only (so the row can show the time when set
// instead of just "TODAY"). Hour is zero-padded for display.
function dueTimeFromBody(body) {
  const m = (body || '').match(DUE_RE);
  if (!m || !m[2]) return null;
  const [h, mm] = m[2].split(':');
  return `${String(h).padStart(2, '0')}:${mm}`;
}
function stripDueSuffix(body) {
  return (body || '').replace(DUE_RE, '');
}
function stripPriorityPrefix(body) {
  return (body || '').replace(PRIORITY_RE, '');
}
// Rewrite the [PRIORITY] bracket in a body, keeping the owner prefix in place
// (normal → no bracket). Lets urgency be changed AFTER a task is created.
function setPriorityInBody(body, newPriority) {
  const stripped = (body || '').replace(PRIORITY_RE, '');
  if (!newPriority || newPriority === 'normal') return stripped;
  const m = stripped.match(/^((?:ohad\s*\+\s*yuval|yuval\s*\+\s*ohad|ohad|yuval)\s*:\s*)/i);
  const tag = `[${newPriority.toUpperCase()}] `;
  return m ? m[1] + tag + stripped.slice(m[0].length) : tag + stripped;
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
  if (key === 'manual') return 'General';
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

function applySort(rows, mode, dir, now, orderArr) {
  const a = [...rows];
  // Manual: order by the hand-arranged id list (drag-to-reorder). Ids not yet in
  // the list fall to the end by recency. Direction toggle doesn't apply.
  if (mode === 'manual') {
    const idx = new Map((orderArr || []).map((id, i) => [id, i]));
    a.sort((x, y) => {
      const ix = idx.has(x.id) ? idx.get(x.id) : Infinity;
      const iy = idx.has(y.id) ? idx.get(y.id) : Infinity;
      return ix !== iy ? ix - iy : (new Date(y.created_at) - new Date(x.created_at));
    });
    return a;
  }
  let cmp;
  if (mode === 'smart')       cmp = (x, y) => smartSortScore(x, now) - smartSortScore(y, now);
  else if (mode === 'newest') cmp = (x, y) => new Date(y.created_at) - new Date(x.created_at);
  else if (mode === 'status') cmp = (x, y) => (STATUS_RANK[x.status] ?? 9) - (STATUS_RANK[y.status] ?? 9);
  else if (mode === 'priority') cmp = (x, y) => (PRIORITY_RANK[x._priority] ?? 2) - (PRIORITY_RANK[y._priority] ?? 2);
  else if (mode === 'name')   cmp = (x, y) => (x.body || '').localeCompare(y.body || '');
  // "Due" (default) — sort by parsed due date, soonest first; no-due-date last;
  // tie-break by created_at. Previously fell through to created_at only. (audit)
  else if (mode === 'date')   cmp = (x, y) => { const dx = x._dueAt ? new Date(x._dueAt).getTime() : Infinity; const dy = y._dueAt ? new Date(y._dueAt).getTime() : Infinity; return (dx - dy) || (new Date(x.created_at) - new Date(y.created_at)); };
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
// Labels renamed 2026-06-06 (Ohad) — open→To Do, working→In Progress. ids are
// unchanged so existing rows + statusColors/STATUS_CYCLE keep working.
const STATUS_OPTIONS = [
  { id: 'open',      label: 'To Do',       glyph: '○' },
  { id: 'working',   label: 'In Progress', glyph: '◐' },
  { id: 'waiting',   label: 'Waiting',     glyph: '◯' },
  { id: 'stuck',     label: 'Stuck',       glyph: '⚠' },
  { id: 'done',      label: 'Done',        glyph: '●' },
  { id: 'cancelled', label: 'Cancelled',   glyph: '⊘' },
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
// One height for every in-row pill/tag (status, urgency, date, athlete, shared)
// so a row of tags lines up — no asymmetry (Ohad).
const TASK_PILL_H = 24;
function StatusPill({ status, theme, onSetStatus, readOnly = false }) {
  // Native <select> — bulletproof vs the old custom popover (which jumped, jammed,
  // and sometimes swallowed the click so the status never changed). onChange
  // always fires; the browser handles positioning, so no lag/pop/hover bugs.
  const opt = STATUS_OPTIONS.find(o => o.id === status) || STATUS_OPTIONS[0];
  const sc = statusColors(status, theme);
  const pillColor = sc ? sc.bg : 'var(--c-tm)';
  const filled = !!sc;
  const base = {
    boxSizing: 'border-box', height: TASK_PILL_H, width: 128, padding: '0 10px', borderRadius: 0,
    fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    textAlign: 'center', textAlignLast: 'center',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    border: `1px solid ${pillColor}`,
    background: filled ? pillColor : 'transparent',
    color: filled ? (sc.fg || '#FFFFFF') : pillColor,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', backgroundImage: 'none',
  };
  if (readOnly) {
    return (
      <span title="Read-only" style={{ ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', opacity: 0.65 }}>
        {opt.label}
      </span>
    );
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      <select
        className="task-select"
        value={status}
        onChange={(e) => onSetStatus(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        title="Change status"
        style={{ ...base, cursor: 'pointer' }}>
        {STATUS_OPTIONS.map(o => (
          <option key={o.id} value={o.id} style={{ background: '#fff', color: '#111' }}>{o.label}</option>
        ))}
      </select>
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

// Editable urgency picker — mirrors StatusPill so priority can be changed AFTER
// a task is created (Ohad). Rewrites the body's [PRIORITY] bracket via onSet.
const PRIORITY_PICK = [
  { id: 'urgent', label: 'Urgent', color: 'var(--c-rd)' },
  { id: 'high',   label: 'High',   color: YUVAL_COLOR },
  { id: 'normal', label: 'Normal', color: 'var(--c-tm)' },
  { id: 'low',    label: 'Low',    color: 'var(--c-td)' },
];
function PriorityPill({ priority, onSetPriority, readOnly = false }) {
  // Native <select> — same reliability fix as StatusPill.
  const cur = PRIORITY_PICK.find(p => p.id === priority) || PRIORITY_PICK[2];
  const base = {
    boxSizing: 'border-box', height: TASK_PILL_H, width: 96, padding: '0 8px', borderRadius: 0,
    fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
    textAlign: 'center', textAlignLast: 'center',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    border: `1px solid ${cur.color}`, background: 'transparent', color: cur.color,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', backgroundImage: 'none',
  };
  if (readOnly) return <span title={`Priority: ${cur.label}`} style={{ ...base, display: 'inline-flex', alignItems: 'center' }}>{cur.label.toUpperCase()}</span>;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      <select className="task-select" value={priority} onChange={(e) => onSetPriority(e.target.value)}
        onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
        title="Change urgency" style={{ ...base, cursor: 'pointer' }}>
        {PRIORITY_PICK.map(p => <option key={p.id} value={p.id} style={{ background: '#fff', color: '#111' }}>{p.label}</option>)}
      </select>
    </span>
  );
}

// Shared width for the three toolbar filter rows (owner tabs / sort / quick
// filters) so they END at the same x — buttons flex to fill it (Ohad).
const FILTER_GROUP_W = 528;
// Shared width for the RIGHT column (LIST/BOARD · STATUS/CATEGORY · SEARCH) so
// all three rows start AND end at the same x — buttons flex to fill (Ohad).
const HEADER_RIGHT_W = 210;
// Toolbar tab/filter buttons reuse the PLATFORM's established sort-tab idiom
// (PlansView "NAME / UPLOADED / LAST EDITED", :2650): separate bordered buttons,
// active = 1px accent border + accent text, inactive = 0.25px cyan hairline +
// muted text. Inactive keeps a hairline so it's never bare floating text (Ohad).
const segBtn = (active) => ({
  // Selected = SOLID cyan fill + white text (matches the nav's active tab — the
  // platform's clearest "selected" indicator). Inactive = white box + cyan
  // hairline (never grey-inside-grey). White boxes on the grey page (Ohad).
  background: active ? '#39BDFF' : 'var(--c-sf)', borderRadius: 0, boxSizing: 'border-box',
  border: `1px solid ${active ? '#39BDFF' : 'var(--c-cardBd)'}`,
  color: active ? '#FFFFFF' : 'var(--c-tm)',
  fontFamily: FN, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer',
});
// One segment of the owner segmented control. Monochrome: active = filled
// surface + white text, NOT a colour (Ohad: page too colourful — only status
// pills keep colour). `first` omits the left divider. Hover via .tfbtn.
function OwnerTab({ label, count, active, onClick }) {
  return (
    <button onClick={onClick} className="tfbtn" data-active={active ? '' : undefined} style={{
      ...segBtn(active), flex: 1, minWidth: 0, height: 30,
      fontSize: 10, letterSpacing: '0.12em', padding: '0 10px',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    }}>
      <span>{label}</span>
      <span style={{ opacity: 0.65, fontSize: 9, fontWeight: 700 }}>{count}</span>
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
    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)} className="tfbtn" data-active={value === it.id ? '' : undefined} style={{
          ...segBtn(value === it.id), flex: 1, height: 30,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, letterSpacing: '0.12em', padding: '0 14px',
        }}>{it.label}</button>
      ))}
    </div>
  );
}

const SORT_MODES = [
  { id: 'date',     label: 'Due' },
  { id: 'newest',   label: 'Newest' },
  { id: 'priority', label: 'Urgency' },
  { id: 'status',   label: 'Status' },
  { id: 'name',     label: 'A→Z' },
  { id: 'manual',   label: 'Manual' },   // hand-ordered; drag a card onto another to reorder
];
function SortBar({ sortBy, sortDir, onSortBy, onToggleDir, rightSlot }) {
  const seg = (active) => ({
    ...segBtn(active), height: 30, padding: '0 3px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, letterSpacing: '0.03em',
  });
  // When a mode is ACTIVE its button shows the direction as a word that flips on
  // click (↓ Newest ⇄ ↑ Oldest); inactive buttons show the plain mode name. No
  // separate direction button, so nothing appears/disappears + reflows (Ohad).
  // {a: leading vertical arrow (optional), t: label}. The arrow is split out
  // so it can be rendered in a flex-centred box — the raw ↑/↓ glyph sits low
  // in its em box and reads as detached/misaligned inline (Ohad).
  const activeDirParts = (mode) => {
    const d = sortDir === 'desc';
    switch (mode) {
      case 'date':     return d ? { a:'↑', t:'Latest'  } : { a:'↓', t:'Soonest' };
      case 'newest':   return d ? { a:'↓', t:'Newest'  } : { a:'↑', t:'Oldest'  };
      case 'priority': return d ? { a:'↑', t:'Low'     } : { a:'↓', t:'High'    };
      case 'status':   return d ? { a:'↑', t:'Done'    } : { a:'↓', t:'To-Do'   };
      case 'name':     return d ? { t:'Z → A' } : { t:'A → Z' };  // → is horizontal, sits fine inline
      case 'manual':   return { t:'Manual' };
      default:         return { t:mode };
    }
  };
  // Bare left-aligned row (no bordered container, no "SORT" prefix label) so
  // the first pill lines up exactly under the OWNER tabs above and the QUICK
  // filters below — all three toolbar rows share one left edge.
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12,
    }}>
      {/* sort modes + dir = one segmented control, same total width as the
          owner/quick rows. No gaps → each mode has room for its active label. */}
      <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: FILTER_GROUP_W }}>
        {SORT_MODES.map((m) => {
          const active = sortBy === m.id;
          return (
            <button key={m.id} onClick={() => active ? onToggleDir() : onSortBy(m.id)} className="tfbtn" data-active={active ? '' : undefined}
              title={active ? (m.id === 'manual' ? 'Manual order — drag tasks to arrange' : 'Click to flip the sort direction') : `Sort by ${m.label}`}
              style={{ ...seg(active), flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {active ? (() => { const { a, t } = activeDirParts(m.id); return (
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:4, minWidth:0 }}>
                  {a && <span aria-hidden="true" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:9, height:9, fontSize:9, lineHeight:1, flexShrink:0 }}>{a}</span>}
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{t}</span>
                </span>
              ); })() : m.label}
            </button>
          );
        })}
      </div>
      <span style={{ flex: 1 }} />
      {/* Right column, row 2 of 3 — the STATUS/CATEGORY group toggle lives
          here so the header stacks LIST/BOARD → STATUS/CATEGORY → SEARCH,
          one per row, all flush right (Ohad 2026-07-05). */}
      {rightSlot}
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
function QuickFilters({ value, onChange, counts, search, onSearch, resultCount, totalCount }) {
  const isFiltered = (search || '').trim() !== '';
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
    <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: FILTER_GROUP_W }}>
      {/* Hide chips with zero count (except 'all'). */}
      {QUICK_FILTERS.filter(f => f.id === 'all' || (counts[f.id] ?? 0) > 0).map((f) => {
        const active = value === f.id;
        const c = counts[f.id] ?? 0;
        return (
          <button key={f.id} onClick={() => onChange(f.id)} className="tfbtn" data-active={active ? '' : undefined} style={{
            ...segBtn(active), flex: 1, minWidth: 0, height: 30,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 10, letterSpacing: '0.10em', padding: '0 10px',
          }}>
            <span>{f.label}</span>
            <span style={{ opacity: 0.65, fontSize: 9 }}>{c}</span>
          </button>
        );
      })}
    </div>
    <span style={{ flex: 1 }} />
    {/* Right column, row 3 of 3 — search sits under LIST/BOARD and
        STATUS/CATEGORY so the three header rows share one right edge. */}
    {isFiltered && (
      <span style={{
        fontFamily: FN, fontSize: 10, fontWeight: 700,
        color: 'var(--c-ac)', letterSpacing: '0.06em',
        marginRight: 4, whiteSpace: 'nowrap',
      }}>{resultCount} of {totalCount}</span>
    )}
    <input
      type="text"
      value={search}
      onChange={(e) => onSearch(e.target.value)}
      placeholder="Search…"
      style={{
        height: 30, minHeight: 30, boxSizing: 'border-box', padding: '0 10px',
        borderRadius: 0, cursor: 'text',
        background: 'var(--c-sf)', color: 'var(--c-tx)',
        border: `1px solid var(--c-cardBd)`, fontFamily: FN, fontSize: 11, fontWeight: 500,
        letterSpacing: '0.04em', width: HEADER_RIGHT_W, outline: 'none', flexShrink: 0,
      }}
      autoComplete="off"
    />
    </div>
  );
}

// Smart composer — expands on focus to show assignee picker + due-date
// input + section selector inline. Collapses back when empty + blurred.
// yyyy-mm-dd → dd/mm/yyyy for display (Chromium's native date format is locale-
// bound + lang= is unreliable, so we paint our own dd/mm/yyyy over the native
// input and keep the native picker for input).
const fmtDMY = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
// Composer control grouping — a small uppercase label + its controls, so the
// expanded "add task" row reads as labelled sections instead of a button soup.
const cmpGroup = { display: 'inline-flex', alignItems: 'center', gap: 6 };
const cmpLabel = { fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-td)', textTransform: 'uppercase', marginRight: 2 };
// ---- vertical filter rail (Ohad's chosen Tasks toolbar, design 7) ----
function RailGroup({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--c-td)', textTransform: 'uppercase', padding: '0 14px', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
function RailOpt({ label, count, active, onClick, title }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', width: '100%', height: 28, border: 'none', padding: 0, cursor: 'pointer',
        background: active ? 'rgba(57,189,255,0.20)' : (hov ? 'var(--c-sf3, rgba(127,127,138,0.10))' : 'transparent'),
        color: active ? 'var(--c-ac)' : (hov ? 'var(--c-tx)' : 'var(--c-tm)'),
        fontFamily: FN, fontSize: 10, fontWeight: active ? 800 : 700, letterSpacing: '0.05em', textTransform: 'uppercase',
        transition: 'background .12s, color .12s',
      }}>
      <span style={{ width: 3, alignSelf: 'stretch', background: 'var(--c-ac)', opacity: active ? 1 : 0, flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: 'left', padding: '0 8px 0 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {count != null && <span style={{ paddingRight: 14, fontSize: 9, fontWeight: 700, opacity: active ? 0.9 : 0.55, flexShrink: 0 }}>{count}</span>}
    </button>
  );
}
// Active-sort label with direction arrow (mirrors SortBar.activeDirParts).
function sortRailLabel(mode, sortDir) {
  const d = sortDir === 'desc';
  switch (mode) {
    case 'date':     return d ? '↑ Latest' : '↓ Soonest';
    case 'newest':   return d ? '↓ Newest' : '↑ Oldest';
    case 'priority': return d ? '↑ Low'    : '↓ High';
    case 'status':   return d ? '↑ Done'   : '↓ To-Do';
    case 'name':     return d ? 'Z → A'    : 'A → Z';
    default:         return 'Manual';
  }
}

function SmartComposer({ onSubmit, defaultAssignee = 'ohad', trainees = [] }) {
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [due, setDue] = useState('');
  const [time, setTime] = useState(''); // 'HH:MM' — blank = 9:00 default
  const [priority, setPriority] = useState('normal'); // low | normal | high | urgent
  const [traineeId, setTraineeId] = useState(''); // '' = no link
  const [source, setSource] = useState('manual'); // 'manual' | 'center'
  const [focused, setFocused] = useState(false);
  const [rowHov, setRowHov] = useState(false);
  const inputRef = React.useRef(null);
  // Stay expanded while focus is anywhere inside the composer, OR once any
  // field has been touched. Without this, clicking the date / time / athlete
  // controls (which steal focus from the title input) collapsed the whole
  // composer mid-edit whenever the title was still empty.
  const expanded = focused || body.trim() !== '' || !!due || !!time || !!traineeId || priority !== 'normal';

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
    <div
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Collapse only on a real focus move to an element OUTSIDE the composer.
        // A null relatedTarget means focus went to a native popup (the <select>
        // dropdown, the date picker) or nowhere — NOT a dismissal — so keep the
        // composer open; otherwise opening those controls would collapse it.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      style={{
      borderBottom: `1px solid var(--c-cardBd)`,
      background: 'var(--c-sf2, transparent)',
      transition: 'padding 180ms ease',
    }}>
      <div
        onMouseEnter={() => setRowHov(true)} onMouseLeave={() => setRowHov(false)}
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', alignItems: 'center', gap: 11,
          height: 46, padding: '0 14px', cursor: 'text',
          background: (rowHov || focused) ? 'rgba(57,189,255,0.06)' : 'transparent',
          transition: 'background .12s',
        }}>
        {/* Cyan bordered + box — reads as a real "create" affordance, not grey text (Ohad). */}
        <span style={{
          width: 21, height: 21, border: '1.5px solid var(--c-ac)', color: 'var(--c-ac)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, lineHeight: 1, flexShrink: 0,
        }}>+</span>
        <input
          ref={inputRef}
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Add a task…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: FB, fontSize: 13, color: 'var(--c-tx)', padding: 0,
          }}
          autoComplete="off"
        />
        {body.trim() ? (
          <button
            onMouseDown={(e) => { e.preventDefault(); submit(); }}
            style={{
              background: 'var(--c-ac)', color: '#FFFFFF',
              border: 'none', fontFamily: FN, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.12em', padding: '5px 12px', height: 24,
              cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
            }}>add</button>
        ) : (
          <span style={{
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            color: 'var(--c-td)', textTransform: 'uppercase', opacity: 0.75, flexShrink: 0,
          }}>Enter to save</span>
        )}
      </div>
      {expanded && (
        <div style={{
          padding: '2px 12px 10px 24px',
          animation: 'tasks-v8-fade-in 180ms ease-out',
          display: 'flex', flexDirection: 'column', gap: 9,
        }}>
          {/* Row 1 — Assign + Due (grouped + labelled so it's not a button soup) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={cmpGroup}>
              <span style={cmpLabel}>Assign</span>
              {[['ohad','O',C.ac],['yuval','Y',YUVAL_COLOR],['shared','·','linear-gradient(135deg,'+C.ac+' 0% 50%,'+YUVAL_COLOR+' 50% 100%)']].map(([id,initial,color]) => (
                <button key={id}
                  onMouseDown={(e) => { e.preventDefault(); setAssignee(id); }}
                  title={id === 'shared' ? 'Shared (Ohad + Yuval)' : id === 'yuval' ? 'Yuval' : 'Ohad'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: '50%',
                    background: assignee === id ? color : 'transparent',
                    color: assignee === id ? '#FFFFFF' : 'var(--c-tm)',
                    border: assignee === id ? 'none' : `1px solid var(--c-cardBd)`,
                    fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  }}>{initial}</button>
              ))}
            </span>
            <span style={cmpGroup}>
              <span style={cmpLabel}>Due</span>
              {/* lang=en-GB → dd/mm/yyyy display; onClick showPicker → the WHOLE
                  field opens the picker, not just the calendar glyph. */}
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="date" value={due}
                  onChange={(e) => setDue(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); try { e.currentTarget.showPicker(); } catch { /* noop */ } }}
                  style={{ background: 'transparent', color: 'transparent', border: `1px solid var(--c-cardBd)`, fontFamily: FN, fontSize: 10, fontWeight: 600, padding: '3px 6px', height: 22, width: 120, borderRadius: 0, outline: 'none', cursor: 'pointer' }} />
                {/* dd/mm/yyyy overlay (native text is transparent; calendar icon stays) */}
                <span style={{ position: 'absolute', left: 7, fontFamily: FN, fontSize: 10, fontWeight: 600, color: due ? 'var(--c-tm)' : 'var(--c-td)', pointerEvents: 'none', letterSpacing: '0.02em' }}>{due ? fmtDMY(due) : 'DD/MM/YYYY'}</span>
              </span>
              <input
                type="time" value={time}
                onChange={(e) => setTime(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (due) { try { e.currentTarget.showPicker(); } catch { /* noop */ } } }}
                disabled={!due}
                title={due ? 'Time (default 09:00)' : 'Pick a date first'}
                style={{ background: 'transparent', color: due ? 'var(--c-tm)' : 'var(--c-td)', border: `1px solid var(--c-cardBd)`, fontFamily: FN, fontSize: 10, fontWeight: 600, padding: '3px 6px', height: 22, borderRadius: 0, outline: 'none', opacity: due ? 1 : 0.5, cursor: due ? 'pointer' : 'default' }} />
            </span>
          </div>
          {/* Row 2 — Urgency */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={cmpGroup}>
              <span style={cmpLabel}>Urgency</span>
              {[['low','LOW','var(--c-td)'],['normal','NORMAL','var(--c-tm)'],['high','HIGH',YUVAL_COLOR],['urgent','URGENT',C.rd]].map(([id, label, color]) => (
                <button key={id}
                  onMouseDown={(e) => { e.preventDefault(); setPriority(id); }}
                  title={`Priority: ${label}`}
                  style={{ background: priority === id ? color : 'transparent', color: priority === id ? '#FFFFFF' : color, border: `1px solid ${priority === id ? color : 'var(--c-cardBd)'}`, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '3px 8px', height: 22, cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>{label}</button>
              ))}
            </span>
          </div>
          {/* Row 3 — List + Athlete */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={cmpGroup}>
              <span style={cmpLabel}>List</span>
              {[['manual', 'General'], ['center', 'Performance Center']].map(([id, label]) => (
                <button key={id}
                  onMouseDown={(e) => { e.preventDefault(); setSource(id); }}
                  style={{ background: source === id ? 'rgba(57,189,255,0.094)' : 'transparent', color: source === id ? 'var(--c-ac)' : 'var(--c-tm)', border: `1px solid ${source === id ? 'var(--c-ac)' : 'var(--c-cardBd)'}`, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '3px 8px', height: 22, cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</button>
              ))}
            </span>
            {(trainees || []).length > 0 && (
              <span style={cmpGroup}>
                <span style={cmpLabel}>Athlete</span>
                <select value={traineeId} onChange={(e) => setTraineeId(e.target.value)} onMouseDown={(e) => e.stopPropagation()} title="Link this task to an athlete"
                  style={{ background: 'transparent', color: traineeId ? C.ac : 'var(--c-tm)', border: `1px solid ${traineeId ? C.ac : 'var(--c-cardBd)'}`, fontFamily: FN, fontSize: 10, fontWeight: 600, padding: '3px 6px', height: 22, borderRadius: 0, outline: 'none', maxWidth: 160, textOverflow: 'ellipsis' }}>
                  <option value="">— no athlete —</option>
                  {[...trainees].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.id}</option>
                  ))}
                </select>
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 600, color: 'var(--c-td)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Enter to add</span>
          </div>
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
      background: 'var(--c-sf)',
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
          fontFamily: FN, fontSize: 11, fontWeight: 700,
          color: 'var(--c-tx)', letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>Google Calendar</span>
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
        {/* canonical collapse affordance: white chevron on the RIGHT (billing style) */}
        <span aria-hidden style={{
          color: '#FFFFFF', fontSize: 12, lineHeight: 1, display: 'inline-block',
          transition: 'transform 120ms ease',
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>▾</span>
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
      {...asButton(onToggleCollapse)}
      aria-expanded={!collapsed}
      aria-label={`Toggle ${label} section`}
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
        letterSpacing: '0.18em', color: 'var(--c-tx)',
        textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        color: 'var(--c-td)', letterSpacing: '0.04em',
      }}>{count}</span>
      <span style={{ flex: 1 }} />
      {/* canonical collapse affordance: white chevron on the RIGHT (billing style) */}
      <span aria-hidden style={{
        color: '#FFFFFF', fontSize: 12, lineHeight: 1, display: 'inline-block',
        transition: 'transform 120ms ease',
        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
      }}>▾</span>
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
          minWidth: 104, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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

const cmtActionBtn = {
  background: 'transparent', border: '1px solid var(--c-cardBd)', color: 'var(--c-tm)',
  fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  padding: '2px 7px', cursor: 'pointer', borderRadius: 0,
};
function CommentsThread({ noteId, viewer }) {
  const { rows, loading, available, add, update, remove } = useCoachNoteComments(noteId);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  // Author is LOCKED to the signed-in viewer — you can only ever comment as
  // yourself. The old O/Y toggle let Ohad post as Yuval (and vice versa),
  // which misattributes every action. Identity comes from auth, not a button.
  const author = viewer === 'yuval' ? 'yuval' : 'ohad';
  const [busy, setBusy] = useState(false);
  // @-mention autocomplete. The placeholder advertised "@ohad @yuval to mention"
  // but nothing ever listened for '@' — mentions were only parsed at submit
  // time by a regex, so typing '@' did nothing (Ohad, 2026-07-22). This wires
  // the interactive menu. Candidates are the two coaches, matching the storage/
  // notify regex in coachNoteComments (MENTION_RE = /@(ohad|yuval)/).
  const taRef = useRef(null);
  const [mention, setMention] = useState(null); // { query, start, index } | null
  const MENTION_PEOPLE = [{ key: 'ohad', label: 'Ohad' }, { key: 'yuval', label: 'Yuval' }];
  const mentionMatches = mention
    ? MENTION_PEOPLE.filter(p => {
        const q = mention.query.toLowerCase();
        return p.key.startsWith(q) || p.label.toLowerCase().startsWith(q);
      })
    : [];
  const autosize = (el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; } };
  const detectMention = (value, caret) => {
    // '@' before the caret with only word-chars after it = an in-progress
    // mention. Anchored to start-or-whitespace so "a@b" (an email) never fires.
    const m = /(?:^|\s)@(\w*)$/.exec(value.slice(0, caret));
    setMention(m ? { query: m[1], start: caret - m[1].length - 1, index: 0 } : null);
  };
  const applyMention = (person) => {
    if (!person) return;
    const ta = taRef.current;
    const caret = ta ? ta.selectionStart : draft.length;
    const start = mention ? mention.start : draft.lastIndexOf('@');
    const before = draft.slice(0, start);
    const inserted = `@${person.key} `;
    const next = before + inserted + draft.slice(caret);
    setDraft(next);
    setMention(null);
    requestAnimationFrame(() => {
      if (taRef.current) {
        const pos = (before + inserted).length;
        taRef.current.focus();
        taRef.current.setSelectionRange(pos, pos);
        autosize(taRef.current);
      }
    });
  };
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
        const mine = c.author === author;          // only your own comments are editable
        const editing = editingId === c.id;
        const saveEdit = () => { update(c.id, editDraft); setEditingId(null); };
        return (
          <div key={c.id} style={{
            padding: '8px 10px', marginBottom: 6,
            border: `1px solid var(--c-cardBd)`,
            background: 'var(--c-sf)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 4, direction: 'ltr', gap: 8,
            }}>
              <AuthorChip author={c.author} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {mine && !editing && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditDraft(c.body || ''); }} style={cmtActionBtn}>Edit</button>
                    <button onClick={async (e) => { e.stopPropagation(); if (await confirmToast('Delete this comment?', { okLabel: 'Delete', cancelLabel: 'Keep' })) remove(c.id); }} style={{ ...cmtActionBtn, color: 'var(--c-rd)', borderColor: 'var(--c-rd)' }}>Delete</button>
                  </>
                )}
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 600, color: 'var(--c-td)', letterSpacing: '0.04em' }}>{relativeTime(c.created_at, now)}</span>
              </span>
            </div>
            {editing ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 4, direction: 'ltr', alignItems: 'flex-start' }}>
                {/* Multi-line edit (matches the composer): Enter = newline,
                    ⌘/Ctrl+Enter = save, Escape = cancel. */}
                <textarea value={editDraft} autoFocus rows={1}
                  onChange={(e) => { setEditDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditingId(null); }}
                  ref={(el) => { if (el && el.style.height === '') { el.style.height = Math.min(el.scrollHeight, 160) + 'px'; } }}
                  style={{ flex: 1, background: 'transparent', border: `1px solid var(--c-cardBd)`, fontFamily: FB, fontSize: 12, color: 'var(--c-tx)', padding: '6px 10px', borderRadius: 0, outline: 'none', resize: 'vertical', minHeight: 30, lineHeight: 1.4, boxSizing: 'border-box' }} />
                <button onClick={(e) => { e.stopPropagation(); saveEdit(); }} style={{ ...cmtActionBtn, background: 'var(--c-ac)', color: '#fff', border: 'none' }}>Save</button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} style={cmtActionBtn}>Cancel</button>
              </div>
            ) : (
              <div style={{
                fontFamily: heb ? FH : FB, fontSize: 13,
                color: 'var(--c-tx)', lineHeight: 1.5,
                direction: heb ? 'rtl' : 'ltr',
                textAlign: heb ? 'right' : 'left',
                whiteSpace: 'pre-wrap',
                // Break long unbroken strings (a pasted URL has no spaces, so
                // pre-wrap alone let it run past the card's right edge).
                overflowWrap: 'anywhere', wordBreak: 'break-word',
              }}>{c.body}</div>
            )}
            {Array.isArray(c.mentions) && c.mentions.length > 0 && !editing && (
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
        display: 'flex', gap: 6, alignItems: 'flex-start',
        marginTop: rows.length > 0 ? 8 : 0,
      }}>
        {/* Author is fixed to the viewer — a non-interactive identity chip
            stands in for the old toggle so it's clear who you're posting as. */}
        <span title={`Posting as ${author === 'yuval' ? 'Yuval' : 'Ohad'}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, width: 30, height: 30, borderRadius: 0,
            background: author === 'yuval' ? YUVAL_COLOR : 'var(--c-ac)',
            color: '#FFFFFF', fontFamily: FN, fontSize: 11, fontWeight: 700,
          }}>{author === 'yuval' ? 'Y' : 'O'}</span>
        {/* Multi-line comment box (Yuval: "Enter didn't work"). Enter now adds
            a newline; ⌘/Ctrl+Enter or the Send button posts. Auto-grows with
            content up to a cap, then scrolls. */}
        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
        <textarea value={draft} rows={1} ref={taRef}
          onChange={(e) => { setDraft(e.target.value); detectMention(e.target.value, e.target.selectionStart); autosize(e.target); }}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => setTimeout(() => setMention(null), 150)}
          onKeyDown={(e) => {
            // While the mention menu is open, arrows/enter/tab/esc drive it.
            if (mention && mentionMatches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMention(mm => ({ ...mm, index: (mm.index + 1) % mentionMatches.length })); return; }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setMention(mm => ({ ...mm, index: (mm.index - 1 + mentionMatches.length) % mentionMatches.length })); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mentionMatches[mention.index % mentionMatches.length]); return; }
              if (e.key === 'Escape')    { e.preventDefault(); setMention(null); return; }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(e); }
          }}
          placeholder="Add comment…  (Enter = new line · ⌘/Ctrl+Enter to send · @ohad @yuval to mention)"
          style={{
            flex: 1, background: 'transparent',
            border: `1px solid var(--c-cardBd)`,
            fontFamily: FB, fontSize: 12, color: 'var(--c-tx)',
            padding: '7px 10px', borderRadius: 0, outline: 'none',
            resize: 'vertical', minHeight: 30, lineHeight: 1.4, boxSizing: 'border-box',
          }} />
        {mention && mentionMatches.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 2, zIndex: 40, minWidth: 170, background: 'var(--c-sf)', border: '1px solid var(--c-cardBd)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>
            {mentionMatches.map((p, i) => (
              <button key={p.key} type="button"
                onMouseDown={(e) => { e.preventDefault(); applyMention(p); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', background: i === (mention.index % mentionMatches.length) ? 'var(--c-sf2)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: FB, fontSize: 12, color: 'var(--c-tx)' }}>
                <span style={{ width: 20, height: 20, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0, background: p.key === 'yuval' ? YUVAL_COLOR : 'var(--c-ac)', color: '#FFFFFF', fontFamily: FN, fontSize: 10, fontWeight: 700 }}>{p.key === 'yuval' ? 'Y' : 'O'}</span>
                <span>@{p.key} <span style={{ color: 'var(--c-td)', fontSize: 11 }}>· {p.label}</span></span>
              </button>
            ))}
          </div>
        )}
        </div>
        <button type="submit" disabled={busy || !draft.trim()}
          style={{
            background: draft.trim() ? 'var(--c-ac)' : 'var(--c-sf2)',
            color: draft.trim() ? '#FFFFFF' : 'var(--c-td)',
            border: 'none', padding: '0 14px', height: 30, flexShrink: 0,
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
          // For the "created" event, to_value is the ASSIGNEE, not a second
          // actor. Rendering it bare ("Ohad created the task · yuval") read as
          // if two people created it. Label it as an assignment instead.
          const ASSIGN_LABEL = { shared: 'Shared', yuval: 'Yuval', ohad: 'Ohad' };
          const change = ev.kind === 'created'
            ? (ev.to_value ? `for ${ASSIGN_LABEL[ev.to_value] || ev.to_value}` : '')
            : (ev.from_value && ev.to_value)
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

function ExpandedDetail({ row, displayBody, viewer, onSetCategory, onArchive, onDelete, readOnly = false }) {
  const heb = isHebrew(displayBody || '');
  // Filter internal-use tags (gevent/getag/glink/approved) out of the
  // visible tag list. (Dual-approval removed 2026-06-06 — any legacy
  // `approved:` tags are simply hidden.)
  const rawTags = (Array.isArray(row.tags) ? row.tags : []).filter(t =>
    !t.startsWith('gevent:') && !t.startsWith('getag:') && !t.startsWith('glink:') && !t.startsWith('approved:')
  );
  // Hide a bare namespace when a more specific child exists (drop 'center'
  // if 'center:property' is present) so the chips don't read redundant.
  const namespaces = new Set(rawTags.filter(t => t.includes(':')).map(t => t.split(':')[0]));
  const tags = rawTags.filter(t => !(namespaces.has(t) && !t.includes(':')));
  // 'center:property' → 'Center · Property' — no hashtag noise, no raw colon.
  const labelTag = (t) => t.split(':').map(p => p.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' · ');
  const cat = sourceKey(row);

  return (
    <div style={{
      padding: '10px 14px 14px 38px',
      background: 'var(--c-sf2, transparent)',
      borderBottom: `1px solid var(--c-cardBd)`,
      fontFamily: heb ? FH : FB,
      fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.6,
      direction: heb ? 'rtl' : 'ltr',
    }}>
      {/* Title is NOT repeated here — the row above shows it in full once
          expanded. Detail starts at tags / approval / calendar / comments. */}
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
      {readOnly && (
        <div style={{ marginTop: 10, direction: 'ltr' }}>
          <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 600, color: 'var(--c-td)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Read-only — belongs to the other coach</span>
        </div>
      )}
      {/* Move the task between General and Performance Center (Ohad). */}
      {!readOnly && onSetCategory && (cat === 'manual' || cat === 'center') && (
        <div style={{ marginTop: 10, direction: 'ltr', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Compact picker — was a "List" label + two buttons, too wide (Ohad). */}
          <select value={cat} onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); if (e.target.value !== cat) onSetCategory(row, e.target.value); }}
            title="Move this task to another list"
            style={{ background: 'var(--c-sf)', color: 'var(--c-tx)', border: `1px solid var(--c-cardBd)`, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '4px 22px 4px 8px', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>
            <option value="manual">General</option>
            <option value="center">Performance Center</option>
          </select>
        </div>
      )}
      {/* Per-task management (Yuval): Archive moves it to the Done/Cancelled
          pool at the bottom (recoverable); Delete removes it for good with a
          typed-free confirm. Both hidden on the other coach's read-only tasks. */}
      {!readOnly && (onArchive || onDelete) && (
        <div style={{ marginTop: 10, direction: 'ltr', display: 'flex', alignItems: 'center', gap: 8 }}>
          {onArchive && row.status !== 'cancelled' && (
            <button onClick={(e) => { e.stopPropagation(); onArchive(row); }}
              title="Archive — moves this task to the Done/Cancelled pool (recoverable)"
              style={{ background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 10px', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>⊘ Archive</button>
          )}
          {onDelete && (
            <button onClick={async (e) => { e.stopPropagation(); if (await confirmToast('Delete this task permanently? This cannot be undone.', { okLabel: 'Delete', cancelLabel: 'Keep' })) onDelete(row); }}
              title="Delete this task permanently"
              style={{ background: 'transparent', border: `1px solid var(--c-rd)`, color: 'var(--c-rd)', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 10px', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' }}>🗑 Delete</button>
          )}
        </div>
      )}
      {/* Comments + audit timeline (Phase 2). Both gracefully no-op
          when their migrations haven't been applied — Comments shows
          a hint, EventTimeline silently absents itself. */}
      <CommentsThread noteId={row.id} viewer={viewer} />
      <EventTimeline noteId={row.id} />
    </div>
  );
}

function TaskRow({ row, theme, showAvatar, expanded, onToggleExpand, onSetStatus, onSetPriority, onSetCategory, onDelete, now, search, viewer, readOnly = false, board = false, hideStatus = false, compact = false, narrow = false }) {
  // On phones, wrap the list row the same way board columns do — title on its
  // own line, meta + status pill below — so nothing gets clipped off-screen.
  const wrapRow = board || narrow;
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
  // No left-edge strip for overdue (Ohad: "remove it") — overdue is signalled by
  // the date chip itself. Today keeps the cyan edge; stuck keeps its accent.
  const edgeColor = isToday ? 'var(--c-ac)'
                  : isStuck ? 'var(--c-rd)'
                            : 'transparent';

  // Priority is shown for ALL four levels as an editable colored dot + label
  // (PriorityPill) sitting to the right of the date+time — click to change.

  // Athlete name when the task is linked to a trainee; nothing otherwise
  // (Ohad: "what athlete, or if none attached, don't show it").
  const athleteName = (row.target_kind === 'trainee' && row.target_label) ? row.target_label : null;
  // Only show the athlete chip when the TITLE doesn't already name them —
  // auto-alerts embed the name in the body, so the chip is redundant there (Ohad).
  const showAthlete = athleteName && !String(row._display || '').includes(athleteName);

  // Due shown as relative word + real date + time on ONE row (his spec:
  // "relative + date + time"), e.g. "TMRW · 7 Jun 09:00".
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const RELATIVE_WORDS = new Set(['TODAY','TMRW','YESTERDAY','SUN','MON','TUE','WED','THU','FRI','SAT']);
  let dateStr = null;
  if (hasDue) {
    const dd = new Date(row._dueAt);
    if (!isNaN(dd.getTime())) {
      const real = `${dd.getDate()} ${MON[dd.getMonth()]}`;
      dateStr = RELATIVE_WORDS.has(dm.label) ? `${dm.label} · ${real}` : real;
      if (row._dueTime) dateStr += ` ${row._dueTime}`;
    }
  }
  // Overdue is NOT coloured red (red = URGENT pill only). Instead it's highlighted
  // NON-colourfully: a FILLED chip (vs the outline of normal dates) + brighter,
  // bolder text — so "YESTERDAY" reads as a notification without adding a colour.
  const dateBorder = isToday ? 'var(--c-ac)' : isOverdue ? 'var(--c-tm)' : 'var(--c-cardBd)';
  const dateBg = isToday ? 'rgba(57,189,255,0.12)' : isOverdue ? 'var(--c-sf2)' : 'transparent';

  return (
    <React.Fragment>
      <div
        {...asButton(onToggleExpand)}
        data-taskid={row.id}
        aria-label="Expand task for comments + detail"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: compact ? 6 : 10,
          // Board columns (and phones) are narrow — wrap so the title gets its
          // own full line (via order:-1 below) instead of being crushed / the
          // status pill pushed off-screen.
          flexWrap: wrapRow ? 'wrap' : 'nowrap', rowGap: wrapRow ? (compact ? 5 : 7) : 0,
          padding: compact ? '4px 8px' : '7px 12px 7px 9px', cursor: 'pointer', minHeight: compact ? 26 : 32,
          borderBottom: `1px solid var(--c-cardBd)`,
          borderLeft: `3px solid ${edgeColor}`,
          background: expanded ? 'var(--c-sf2, transparent)'
                     : hover     ? 'var(--c-sf2, rgba(57,189,255,0.04))'
                                 : 'transparent',
          transition: 'background 120ms ease',
        }}
      >
        {/* Meta cluster — date+time, then priority (dot to its RIGHT), then
            athlete. Forced LTR internally so the order reads the same on
            Hebrew (RTL) and English rows. Each chip is no-wrap. */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, direction: 'ltr', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <PriorityPill priority={priority} onSetPriority={(p) => onSetPriority(row, p)} readOnly={readOnly} />
          {showAthlete && (
            <span title={`Athlete: ${athleteName}`} style={{
              boxSizing: 'border-box', height: TASK_PILL_H, display: 'inline-flex', alignItems: 'center',
              fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              // Muted (not cyan) so it reads as quiet metadata, not a loud tag (Ohad).
              // Fixed width keeps chips aligned; longer names ellipsize.
              color: 'var(--c-tm)', whiteSpace: 'nowrap', width: 104, justifyContent: 'center',
              overflow: 'hidden', textOverflow: 'ellipsis',
              border: `1px solid var(--c-cardBd)`, padding: '0 8px',
            }}>{athleteName}</span>
          )}
          {/* SHARED as a fixed COLUMN — the slot is reserved on EVERY row (even
              non-shared) so shared tags line up vertically (Ohad: "shared a column").
              The date sits to the RIGHT of this column. */}
          <span style={{ flexShrink: 0, width: 62, display: 'inline-flex', alignItems: 'center' }}>
            {row._owner === 'shared' && (
              <span title="Shared — Ohad + Yuval" style={{
                boxSizing: 'border-box', height: TASK_PILL_H, display: 'inline-flex', alignItems: 'center',
                fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                color: 'var(--c-gn)', opacity: 0.55, whiteSpace: 'nowrap',
                border: `1px solid var(--c-gn)`, padding: '0 8px', textTransform: 'uppercase',
              }}>Shared</span>
            )}
          </span>
          {dateStr && (
            <span style={{
              boxSizing: 'border-box', height: TASK_PILL_H, display: 'inline-flex', alignItems: 'center', gap: 4,
              fontFamily: FN, fontSize: 11, fontWeight: isOverdue ? 800 : 700, letterSpacing: '0.02em',
              color: isToday ? 'var(--c-ac)' : isOverdue ? 'var(--c-tx)' : dm.color,
              whiteSpace: 'nowrap', padding: '0 8px',
              border: `1px solid ${dateBorder}`, background: dateBg,
            }}>
              {isOverdue ? (
                // "OVERDUE · YESTERDAY" — OVERDUE solid white, the day faded white
                // (same opacity as the SHARED tag). Ohad's spec.
                <>OVERDUE<span style={{ opacity: 0.4 }}>·</span><span style={{ opacity: 0.55 }}>{dm.label}</span></>
              ) : dateStr}
            </span>
          )}
        </div>
        {showAvatar && <AssigneeDot owner={row._owner} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: heb ? 'flex-end' : 'flex-start',
          // Board + phone: title takes its own full line above the controls.
          ...(wrapRow ? { order: -1, flexBasis: '100%' } : null) }}>
          <div style={{
            maxWidth: '100%',
            fontFamily: heb ? FH : FB,
            fontSize: compact ? (heb ? 13 : 12) : (heb ? 14 : 13),
            fontWeight: 500,
            color: 'var(--c-tx)',
            direction: heb ? 'rtl' : 'ltr',
            textAlign: heb ? 'right' : 'left',
            // Truncate when collapsed in LIST; in board/expanded show the FULL
            // title (wrapped) so it's actually readable in the narrow column.
            ...((expanded || board)
              ? { whiteSpace: 'normal', wordBreak: 'break-word' }
              : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
          }}>
            <HighlightedText text={row._display} query={search} />
          </div>
        </div>
        {/* (Removed the hover "⋯" affordance — it showed cursor:pointer and a
            "More actions" tooltip but had no handler, so it read as a broken
            control. Re-add WITH an onClick when the quick-menu exists.) */}
        {/* Board: title takes line 1, so push the status pill to the card's right
            edge on line 2 (in LIST the title's flex already does this).
            hideStatus drops the pill in the STATUS board — the column header
            already states the status, so repeating it on every card is noise
            (Yuval: make the board status more readable). Status there is
            changed by dragging between columns / from the expanded detail. */}
        {!hideStatus && (
          <span style={{ display: 'inline-flex', marginLeft: board ? 'auto' : undefined }}>
            <StatusPill status={row.status} theme={theme} onSetStatus={(s) => onSetStatus(row, s)} readOnly={readOnly} />
          </span>
        )}
      </div>
      {expanded && (
        <div style={{
          animation: 'tasks-v8-slide-in 200ms ease-out',
        }}>
          <ExpandedDetail row={row} displayBody={row._display}
            viewer={viewer}
            onSetCategory={onSetCategory}
            onArchive={onSetStatus ? (r) => onSetStatus(r, 'cancelled') : undefined}
            onDelete={onDelete}
            readOnly={readOnly}
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
  const { rows, loading, update, create, remove } = useCoachNotes({ limit: 200 });
  // Subscribe to theme changes so StatusPill colors update live on a dark/light
  // toggle (was read once via getAttribute → went stale until next re-render).
  const { theme: liveTheme } = useTheme();
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
  // Board grouping (Monday-style): 'status' = a To Do→In Progress→Done kanban,
  // 'list' = the by-category columns. Drag a card between columns to change that
  // dimension. Persisted so the chosen board sticks.
  const [boardGroup, setBoardGroup] = usePersistentState('tasks-board-group', 'status');
  const draggedRowRef = useRef(null);            // row being dragged (ref → no dragstart re-render abort)
  // Manual order — hand-arranged id list for the 'Manual' sort (drag a card onto
  // another to reorder). Per-device (localStorage) for v1; can move to a synced
  // store key later. dropOnId highlights the card being dropped-before.
  const [taskOrder, setTaskOrder] = usePersistentState('tasks-manual-order', []);
  const [dropOnId, setDropOnId] = useState(null);
  const [dropKey, setDropKey] = useState(null);  // column currently highlighted as drop target
  const [quickAddKey, setQuickAddKey] = useState(null); // column whose inline "+ add" input is open
  const [quickAddText, setQuickAddText] = useState('');
  // Compact density for narrow / split-screen windows (Ohad runs the browser at
  // half-width next to his terminal). ≤1000px → tighter rows, chips, board columns.
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1000);
  // Phone width: list rows wrap (title + status get their own line) so the
  // fixed-width meta cluster can't push the status pill off-screen (Ohad).
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 560);
  // On a phone the filter rail stacks full-width ON TOP of the list, so you
  // scroll through the whole Whose/Show/Sort/Group panel before seeing a single
  // task. Collapse it behind the "Filters" header on narrow (tasks first); it
  // stays fully open on desktop. (Ohad, 2026-07-22)
  const [railOpen, setRailOpen] = useState(false);
  React.useEffect(() => {
    const onResize = () => { setCompact(window.innerWidth <= 1000); setNarrow(window.innerWidth <= 560); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [doneOpen, setDoneOpen] = usePersistentState('tasks-done', false);
  const [autoOpen, setAutoOpen] = usePersistentState('tasks-auto', false);
  const [quickFilter, setQuickFilter] = useState('all'); // all | today | overdue | stuck | nodate
  const [collapsedSections, setCollapsedSections] = usePersistentState('tasks-sections', {});
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalBusy, setGcalBusy] = useState(false);
  // `now` rolls over at local midnight so TODAY / overdue chips don't go
  // stale in a tab left open past 00:00. Timer is scheduled to the next
  // midnight (then re-armed), not a wasteful per-minute interval.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    const arm = () => {
      const d = new Date();
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 5);
      id = setTimeout(() => { setNow(new Date()); arm(); }, next - d);
    };
    arm();
    return () => clearTimeout(id);
  }, []);

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
  // Latest rows live in a ref so the poll effect doesn't depend on `rows`
  // — otherwise every task edit tore down the 60s interval and fired an
  // immediate events.list call against Google.
  const rowsRef = React.useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => {
    if (!gcalConnected) return;
    let cancelled = false;

    const reconcileIncoming = async (events) => {
      for (const event of events) {
        const localRow = rowsRef.current.find(r => getStoredEventId(r) === event.id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcalConnected]);

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
  const theme = liveTheme || (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'dark');

  // Dashboard → task deep-link. NotesWidget's compact mini-board stores the
  // clicked task's id in sessionStorage before routing here; once rows land
  // we jump to that task: right owner tab, section un-collapsed (auto/done
  // pools open if it lives there), row expanded + scrolled into view.
  const focusHandledRef = useRef(false);
  useEffect(() => {
    if (focusHandledRef.current || !rows.length) return;
    let pending = null;
    try { pending = sessionStorage.getItem('expo-pendingFocusTask'); } catch { /* noop */ }
    if (!pending) return;
    focusHandledRef.current = true;
    try { sessionStorage.removeItem('expo-pendingFocusTask'); } catch { /* noop */ }
    const row = rows.find(r => r.id === pending);
    if (!row) return;
    setOwner(ownerFromBody(row.body));
    setView('list');
    setQuickFilter('all');
    setSearch('');
    if (row.status === 'done' || row.status === 'cancelled') setDoneOpen(true);
    if (sourceKey(row) === 'auto') setAutoOpen(true);
    setCollapsedSections(p => ({ ...p, [sourceKey(row)]: false }));
    setExpandedRows(new Set([pending]));
    // Scroll after the expand + section-open renders settle.
    setTimeout(() => {
      try {
        document.querySelector(`[data-taskid="${CSS.escape(pending)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch { /* noop */ }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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
      _dueTime: dueTimeFromBody(r.body), // explicit HH:MM, or null if date-only
      _approvals: approvals, // null for non-shared, {ohad, yuval} for shared
      // _display = title only (owner + priority + due all stripped). This is
      // what the row, search, and Calendar sync should show / match against.
      _display: displayBodyOf(r.body),
    };
  }), [rows]);

  // A shared task ("Ohad + Yuval: …") belongs to BOTH partners, so it shows on
  // each person's own tab AND the dedicated Shared tab. Personal-tab counts
  // therefore include shared; the Shared tab counts shared only.
  // Tab counts = ACTIVE (open) tasks only — done/cancelled are terminal and
  // shouldn't inflate the badge (OHAD showing 100 incl. 90+ done made no sense).
  const counts = useMemo(() => {
    const active = (r) => r.status !== 'done' && r.status !== 'cancelled';
    return {
      ohad:   decorated.filter(r => active(r) && (r._owner === 'ohad'  || r._owner === 'shared')).length,
      yuval:  decorated.filter(r => active(r) && (r._owner === 'yuval' || r._owner === 'shared')).length,
      shared: decorated.filter(r => active(r) && r._owner === 'shared').length,
    };
  }, [decorated]);

  // On a personal tab (ohad/yuval) include shared tasks too; on the Shared tab
  // show only shared. Without this a shared task was invisible on the viewer's
  // default tab — Yuval never saw tasks Ohad shared with him.
  const ownerMatches = (r) => r._owner === owner || (owner !== 'shared' && r._owner === 'shared');

  // Read-only rules (UI guard — both are trusted staff at the data layer):
  //  1. A task that belongs solely to the OTHER partner is never editable here.
  //  2. A SHARED task is editable ONLY on the Shared tab — never from an
  //     individual (Ohad/Yuval) tab, even though it shows there. Editing a
  //     shared task should happen in the shared context, not "as" one partner.
  // Ohad + Yuval run the business together — both can edit EVERY task's status
  // and urgency (General/business tasks are shared work). No read-only guard.
  const isReadOnly = () => false;

  // Owner + open filter is the base. Search narrows further.
  // Terminal states (done, cancelled) drop to the bottom pool.
  const ownerBase = useMemo(
    () => decorated.filter(r => ownerMatches(r) && r.status !== 'done' && r.status !== 'cancelled'),
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
      byKey.set(k, applySort(list, sortBy, sortDir, now, taskOrder));
    }
    const result = [];
    if (byKey.has('center'))  result.push({ key: 'center',  rows: byKey.get('center')  });
    const trainees = [...byKey.entries()].filter(([k]) => k.startsWith('trainee:'));
    trainees.sort((a, b) => b[1].length - a[1].length);
    for (const [k, r] of trainees) result.push({ key: k, rows: r });
    if (byKey.has('manual'))  result.push({ key: 'manual',  rows: byKey.get('manual')  });
    if (byKey.has('auto'))    result.push({ key: 'auto',    rows: byKey.get('auto')    });
    return result;
  }, [quickFiltered, sortBy, sortDir, now, taskOrder]);

  // Status-kanban columns (board "Group: Status"): the 5 active statuses as
  // columns, owner-matched + searched, INCLUDING done so its column fills.
  // Cancelled is excluded (it stays in the bottom Done/Cancelled pool). Empty
  // columns are KEPT so a card can be dragged into an empty status.
  const statusSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Apply the quick-filter here too — the default view is status-grouped, and
    // the chips (Today/Overdue/Stuck/No-date) previously did nothing here. (audit)
    const quickMatch = (r) => {
      if (quickFilter === 'all') return true;
      const dm = dateMeta(r._dueAt || null, now);
      if (quickFilter === 'today')   return !!r._dueAt && dm.label === 'TODAY';
      if (quickFilter === 'overdue') return !!r._dueAt && dm.isOverdue;
      if (quickFilter === 'stuck')   return r.status === 'stuck';
      if (quickFilter === 'nodate')  return !r._dueAt;
      return true;
    };
    const src = decorated.filter(r => ownerMatches(r) && r.status !== 'cancelled'
      && (!q || (r._display || r.body || '').toLowerCase().includes(q))
      && quickMatch(r));
    const order = ['open', 'working', 'waiting', 'stuck', 'done'];
    const byStatus = new Map(order.map(s => [s, []]));
    for (const r of src) { const s = byStatus.has(r.status) ? r.status : 'open'; byStatus.get(s).push(r); }
    return order.map(s => ({ key: 'status:' + s, statusId: s, rows: applySort(byStatus.get(s), sortBy, sortDir, now, taskOrder) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decorated, owner, search, sortBy, sortDir, now, quickFilter, taskOrder]);

  // In the BOARD's category grouping, always render the two fixed columns
  // (Performance Center + General) even when empty — otherwise a category with
  // no tasks has no column, so you can't drag a card INTO it (Yuval: "can't
  // drag from general to athletic performance"). The list view keeps hiding
  // empty groups; only the board needs the empty drop targets.
  const boardSections = useMemo(() => {
    if (view === 'board' && boardGroup === 'status') return statusSections;
    if (view === 'board' && boardGroup === 'list') {
      const has = (k) => sections.some(s => s.key === k);
      const out = [...sections];
      if (!has('center')) out.unshift({ key: 'center', rows: [] });
      if (!has('manual')) {
        const autoIdx = out.findIndex(s => s.key === 'auto');
        const manualSection = { key: 'manual', rows: [] };
        if (autoIdx >= 0) out.splice(autoIdx, 0, manualSection);
        else out.push(manualSection);
      }
      return out;
    }
    return sections;
  }, [view, boardGroup, statusSections, sections]);

  // Drop a dragged card onto a column → change that column's dimension.
  const onDropToColumn = async (section) => {
    const row = draggedRowRef.current; draggedRowRef.current = null; setDropKey(null);
    if (!row) return;
    if (boardGroup === 'status' && section.statusId && section.statusId !== row.status) {
      await setStatus(row, section.statusId);
    } else if (boardGroup === 'list') {
      if (section.key === 'center' && sourceKey(row) !== 'center') await setCategory(row, 'center');
      else if (section.key === 'manual' && sourceKey(row) === 'center') await setCategory(row, '');
    }
  };

  // Drag a card ONTO another card → reorder it to just before that card. Only
  // changes the visible order under the 'Manual' sort; a cross-column drop in the
  // status board also moves the card to the target column's status first.
  const reorderOnto = async (targetRow, section) => {
    const d = draggedRowRef.current; draggedRowRef.current = null; setDropKey(null); setDropOnId(null);
    if (!d || d.id === targetRow.id) return;
    // Same section iff the dragged task is one of the target section's rows.
    const sameSection = section.rows.some(r => r.id === d.id);
    if (!sameSection) {
      // Cross-section drop = change the task's status (status grouping) or
      // category (list grouping) to the target lane's. This now works in the
      // LIST view too, not just the board: the default view is List grouped by
      // status, so dragging a card between the visible status lanes is the
      // natural gesture — the old "list drag only reorders" rule made that a
      // silent no-op and read as "dragging is broken" (Ohad, 2026-07-22). Status
      // can still be changed via the row's pill; drag is now an additional path.
      if (boardGroup === 'status' && section.statusId) await setStatus(d, section.statusId);
      else if (boardGroup === 'list') {
        if (section.key === 'center' && sourceKey(d) !== 'center') await setCategory(d, 'center');
        else if (section.key === 'manual' && sourceKey(d) === 'center') await setCategory(d, '');
      }
      return; // moved sections — don't also reorder / switch sort
    }
    // Reorder within the section, then switch to Manual so the hand-arrangement
    // sticks (a custom order can't survive Due/Newest/etc.).
    const allIds = decorated.map(r => r.id);
    let order = (taskOrder || []).filter(id => allIds.includes(id));   // prune deleted
    for (const id of allIds) if (!order.includes(id)) order.push(id);  // append any new
    order = order.filter(id => id !== d.id);
    const ti = order.indexOf(targetRow.id);
    if (ti < 0) order.push(d.id); else order.splice(ti, 0, d.id);
    setTaskOrder(order);
    if (sortBy !== 'manual') setSortBy('manual');
  };

  // Inline quick-add at a column footer (Monday "+ Add"): create a task pre-set
  // to that column's status (status mode) or category (list mode), owned by the
  // current tab. The input stays open for rapid multi-add; clears on each commit.
  const quickAdd = async (section) => {
    const title = quickAddText.trim();
    if (!title) return;
    const ownerPrefix = owner === 'yuval' ? 'Yuval: ' : owner === 'shared' ? 'Ohad + Yuval: ' : 'Ohad: ';
    const inCenter = boardGroup === 'list' && section.key === 'center';
    const row = await create({ body: ownerPrefix + title, targetKind: 'general', targetId: null, targetLabel: null, tags: inCenter ? ['center'] : [] });
    if (row) {
      recordNoteEvent({ noteId: row.id, actor: viewerOwner, kind: 'created', toValue: owner });
      if (boardGroup === 'status' && section.statusId && section.statusId !== 'open') {
        await setStatus({ ...row, status: 'open' }, section.statusId);
      }
    }
    setQuickAddText('');
  };

  // Multi-select + bulk actions: click a card's checkbox to (de)select; a bulk
  // bar then offers set-status / delete applied to all selected at once.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelect = () => setSelectedIds(new Set());
  const bulkStatus = async (target) => {
    const rows2 = decorated.filter(r => selectedIds.has(r.id));
    for (const r of rows2) { if (r.status !== target) await setStatus(r, target); }
    clearSelect();
  };
  const bulkDelete = async () => {
    const n = selectedIds.size;
    if (!n) return;
    if (!(await confirmToast(`Delete ${n} task${n === 1 ? '' : 's'}? This can't be undone.`, { okLabel: 'Delete', cancelLabel: 'Keep' }))) return;
    for (const id of [...selectedIds]) { await remove(id); }
    clearSelect();
  };
  // Single-task permanent delete (Yuval). Confirm lives in ExpandedDetail;
  // this just performs the removal.
  const handleDeleteTask = async (r) => { if (r?.id) await remove(r.id); };

  // Terminal pool — done AND cancelled live together at the bottom.
  const done = useMemo(
    () => decorated.filter(r => ownerMatches(r) && (r.status === 'done' || r.status === 'cancelled')),
    [decorated, owner]
  );

  const toggleRow = (id) => setExpandedRows(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const setPriority = async (row, p) => {
    const cur = row._priority || 'normal';
    if (cur === p) return;
    // Priority is encoded in the body bracket (no DB column yet) — rewrite it.
    await update(row.id, { body: setPriorityInBody(row.body, p) });
    recordNoteEvent({ noteId: row.id, actor: viewerOwner, kind: 'priority_changed', fromValue: cur, toValue: p });
  };
  // Move a task between General and Performance Center. Category = the 'center'
  // tag (sourceKey reads it); toggle it, preserving any other tags.
  const setCategory = async (row, cat) => {
    // Strip the WHOLE center-tag family, not just the literal 'center'. sourceKey
    // (line ~207) classifies a task as Performance Center if it has ANY of
    // 'gym' / 'center' / 'gym:*' / 'center:*' (the gym subsystem writes the
    // prefixed forms). The old filter removed only 'center', so moving a
    // gym-tagged task to General left a 'gym'/'center:*' tag behind → sourceKey
    // still returned 'center' → the row snapped back and the picker "did
    // nothing" (Ohad). Now General clears every center-family tag.
    const isCenterTag = (t) => typeof t === 'string' && (t === 'center' || t === 'gym' || t.startsWith('gym:') || t.startsWith('center:'));
    const others = Array.isArray(row.tags) ? row.tags.filter(t => !isCenterTag(t)) : [];
    const newTags = cat === 'center' ? [...others, 'center'] : others;
    await update(row.id, { tags: newTags.length ? newTags : null });
  };
  const setStatus = async (row, target) => {
    // No dual-approval / half-approved state (removed 2026-06-06). A shared
    // task is a single row with a single status — either partner changes it
    // and it applies for both immediately. coach_notes.status is TEXT with
    // no enum constraint, so all 6 states (open / working / waiting / stuck /
    // done / cancelled) persist literally. completed_at is stamped for the
    // two terminal states and cleared on reopen.
    const terminal = (target === 'done' || target === 'cancelled');
    const prev = row.status || 'open';
    if (prev === target) return;
    const patch = {
      status: target,
      completed_at: terminal ? new Date().toISOString() : null,
    };
    await update(row.id, patch);
    // Audit log — actor is the signed-in VIEWER (who actually clicked), not
    // the row's nominal owner, so "who changed the status" is accurate even
    // on shared tasks.
    const actor = viewerOwner;
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
      // Actor = who CREATED the task (the signed-in viewer), NOT who it's
      // assigned to. Using `assignee` here meant Yuval creating a task for
      // Ohad/shared/default was logged as "Ohad created it". Mirror the
      // status-change handler, which correctly attributes to viewerOwner.
      const actor = viewerOwner;
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
      if (e.metaKey || e.ctrlKey || e.altKey) return; // never hijack browser combos
      const k = e.key.toLowerCase();
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector('input[placeholder="Search…"]')?.focus();
      } else if (k === 'n' || k === 'c') {            // N / C = new task (focus composer)
        e.preventDefault();
        document.querySelector('input[placeholder="Add task…"]')?.focus();
      } else if (k === 'b') {                          // B = toggle Board / List
        e.preventDefault();
        setView(v => (v === 'board' ? 'list' : 'board'));
      } else if (e.key === 'Escape') {
        if (search) setSearch('');
        if (expandedRows.size) setExpandedRows(new Set());
        if (quickAddKey) { setQuickAddKey(null); setQuickAddText(''); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search, expandedRows, quickAddKey]);

  if (loading) return <div style={{ padding: 24, color: 'var(--c-tm)' }}>Loading…</div>;

  // For non-auto sections, render directly. Auto section collapses by default
  // because it's the engine noise (88+ rows) that drowns out real delegation.
  // The board's STATUS/LIST group toggle now drives the LIST view too: in Status
  // mode the list groups into To Do / In Progress / … sections (empty + Done
  // hidden — Done stays in the bottom pool) instead of by category.
  const listGroupedByStatus = boardGroup === 'status';
  const autoCat = sections.find(s => s.key === 'auto');
  const visibleSections = listGroupedByStatus
    // Status sections hold only MANUAL tasks; the auto-alerts get their own
    // titled section appended at the end (Ohad). (statusSections itself keeps
    // auto-tasks for the board's status columns — only the list splits them.)
    ? [
        ...statusSections
            .map(s => ({ ...s, rows: s.rows.filter(r => sourceKey(r) !== 'auto') }))
            .filter(s => s.statusId !== 'done' && s.rows.length > 0),
        ...(autoCat && autoCat.rows.length ? [autoCat] : []),
      ]
    : sections.filter(s => s.key !== 'auto');
  const autoSection = listGroupedByStatus ? null : autoCat;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 14px' }}>
      {/* Filter/sort/owner/view buttons: soft hover highlight (Ohad). Theme-aware
          — the old hardcoded white text/bg/border made every button vanish in
          light theme (white-on-white). Active state is handled inline. */}
      <style>{`
        .tfbtn{ transition: background .12s, color .12s, border-color .12s; }
        .tfbtn:hover{ color:var(--c-tx) !important; background:var(--c-sf2) !important; border-color:var(--c-tm) !important; }
        .tfbtn[data-active]:hover{ background:var(--c-sf2) !important; border-color:var(--c-tx) !important; }
      `}</style>
      {/* Single header row: TASKS + LIVE grouped on the left (LIVE vertically
          centred to the title), LIST/BOARD toggle on the right (Ohad). Keeping
          the toggle on this row above both columns still leaves the rail's top
          aligned with the list's first row (add-task). */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{
            margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--c-tx)',
          }}>Tasks</h2>
          {/* Live-sync indicator: Ohad + Yuval see each other's changes in real
              time (Supabase realtime on coach_notes) — no refresh needed. */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            color: 'var(--c-tm)', textTransform: 'uppercase',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-gn)' }} />
            Live
          </span>
        </div>
        <div style={{ width: 168 }}><ViewToggle value={view} onChange={setView} /></div>
      </div>

      {/* Two-column layout: left filter RAIL + content (Ohad's design 7).
          Filters live in a slim labelled left rail beside the list. Rail stacks
          on top when narrow. */}
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: narrow ? 10 : 16, alignItems: 'flex-start' }}>

        {/* LEFT: filter rail — sticky below the sticky header so the filters
            stay pinned as the (long) list scrolls; scrolls internally if it
            ever outgrows the viewport. Static + full-width when narrow. */}
        <div style={{
          width: narrow ? 'auto' : 204, flexShrink: 0,
          background: 'var(--c-sf2)', border: '1px solid var(--c-cardBd)',
          // Collapsed on mobile → just the toggle bar, no trailing empty box.
          padding: (narrow && !railOpen) ? '12px 0' : '14px 0 16px', display: 'flex', flexDirection: 'column', gap: 12,
          alignSelf: 'flex-start',
          position: narrow ? 'static' : 'sticky', top: narrow ? undefined : 66,
          maxHeight: narrow ? undefined : 'calc(100vh - 84px)', overflowY: narrow ? 'visible' : 'auto',
        }}>
          <div onClick={narrow ? () => setRailOpen(o => !o) : undefined}
            style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', color: 'var(--c-ac)', textTransform: 'uppercase', padding: (narrow && !railOpen) ? '0 16px' : '0 16px 10px', borderBottom: (narrow && !railOpen) ? 'none' : '1px solid var(--c-cardBd)', cursor: narrow ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>Filters</span>
            {narrow && <span aria-hidden style={{ fontSize: 11, lineHeight: 1, transform: railOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>▾</span>}
          </div>

          {(!narrow || railOpen) && (<>
          <RailGroup label="Whose">
            {/* Both partners see all three; tasks owned solely by the other
                render read-only. Default is the viewer's own (clamped on mount). */}
            <RailOpt label="Ohad"   count={counts.ohad}   active={owner === 'ohad'}   onClick={() => setOwner('ohad')} />
            <RailOpt label="Yuval"  count={counts.yuval}  active={owner === 'yuval'}  onClick={() => setOwner('yuval')} />
            <RailOpt label="Shared" count={counts.shared} active={owner === 'shared'} onClick={() => setOwner('shared')} />
          </RailGroup>

          <RailGroup label="Show">
            {QUICK_FILTERS.filter(f => f.id === 'all' || (quickCounts[f.id] ?? 0) > 0).map(f => (
              <RailOpt key={f.id} label={f.label} count={quickCounts[f.id] ?? 0} active={quickFilter === f.id} onClick={() => setQuickFilter(f.id)} />
            ))}
          </RailGroup>

          <RailGroup label="Sort">
            {SORT_MODES.map(m => {
              const on = sortBy === m.id;
              return <RailOpt key={m.id} label={on ? sortRailLabel(m.id, sortDir) : m.label} active={on}
                onClick={() => on ? setSortDir(d => d === 'asc' ? 'desc' : 'asc') : setSortBy(m.id)}
                title={on ? 'Click to flip the sort direction' : `Sort by ${m.label}`} />;
            })}
          </RailGroup>

          <RailGroup label="Group">
            <RailOpt label="By status"   active={boardGroup === 'status'} onClick={() => setBoardGroup('status')} />
            <RailOpt label="By category" active={boardGroup === 'list'}   onClick={() => setBoardGroup('list')} />
          </RailGroup>

          <div style={{ padding: '0 14px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
              style={{ width: '100%', height: 34, boxSizing: 'border-box', padding: '0 11px', borderRadius: 0, background: 'var(--c-sf)', color: 'var(--c-tx)', border: '1px solid var(--c-cardBd)', fontFamily: FN, fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', outline: 'none', textAlign: 'left' }} autoComplete="off" />
          </div>
          </>)}
        </div>

        {/* RIGHT: content — the list/board (view toggle now lives above). */}
        <div style={{ flex: 1, minWidth: 0 }}>

      {view === 'list' ? (
        <div style={{
          border: `1px solid var(--c-cardBd)`,
          background: 'var(--c-sf)',
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
                  label={section.statusId ? (STATUS_OPTIONS.find(o => o.id === section.statusId)?.label || section.statusId) : section.key === 'auto' ? 'Auto-Alerts' : sourceLabel(section.key, section.rows[0])}
                  count={section.rows.length}
                  color={section.statusId ? ({ open: '#5B6B7A', working: '#2C82C9', waiting: '#C9851E', stuck: '#C0392B', done: '#2E9E5B' }[section.statusId] || 'var(--c-ac)') : sourceColor(section.key)}
                  collapsed={isCollapsed}
                  onToggleCollapse={() => toggleSectionCollapse(section.key)}
                />
                <div style={{ display: 'grid', gridTemplateRows: isCollapsed ? '0fr' : '1fr', transition: 'grid-template-rows 260ms ease' }}><div style={{ overflow: 'hidden', minHeight: 0 }}>
                {section.rows.map(row => (
                  <div key={row.id}
                    draggable={!isReadOnly(row)}
                    onDragStart={e => { draggedRowRef.current = row; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', row.id); } catch { /* noop */ } }}
                    onDragEnd={() => { draggedRowRef.current = null; setDropOnId(null); }}
                    onDragOver={e => { if (draggedRowRef.current && draggedRowRef.current.id !== row.id) { e.preventDefault(); if (dropOnId !== row.id) setDropOnId(row.id); } }}
                    onDragLeave={() => { if (dropOnId === row.id) setDropOnId(null); }}
                    onDrop={e => { e.preventDefault(); reorderOnto(row, section); }}
                    style={{ cursor: isReadOnly(row) ? 'default' : 'grab', boxShadow: dropOnId === row.id ? 'inset 0 3px 0 -1px var(--c-ac)' : 'none' }}>
                    <TaskRow row={row} readOnly={isReadOnly(row)} compact={compact} narrow={narrow}
                      theme={theme} showAvatar={owner === 'shared'}
                      expanded={expandedRows.has(row.id)}
                      onToggleExpand={() => toggleRow(row.id)}
                      onSetStatus={setStatus} onSetPriority={setPriority} onSetCategory={setCategory} onDelete={handleDeleteTask}
                      now={now} search={search} viewer={viewerOwner}
                      gcalConnected={gcalConnected}
                      onSyncToCalendar={handleSyncToCalendar}
                      onDeleteFromCalendar={handleDeleteFromCalendar}
                    />
                  </div>
                ))}
                </div></div>
              </React.Fragment>
            );
          })}

          {/* Auto-tasks demoted — no section header. A single thin row at the
              bottom of the open list, click to expand. Engine noise stays
              tucked away unless explicitly summoned. */}
          {autoSection && (
            <React.Fragment>
              <div
                {...asButton(() => setAutoOpen(o => !o))}
                aria-expanded={autoOpen}
                aria-label="Toggle auto-alerts"
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
              <div style={{ display: 'grid', gridTemplateRows: autoOpen ? '1fr' : '0fr', transition: 'grid-template-rows 260ms ease' }}><div style={{ overflow: 'hidden', minHeight: 0 }}>
              {autoSection.rows.map(row => (
                <TaskRow key={row.id} row={row} readOnly={isReadOnly(row)} compact={compact} narrow={narrow}
                  theme={theme} showAvatar={owner === 'shared'}
                  expanded={expandedRows.has(row.id)}
                  onToggleExpand={() => toggleRow(row.id)}
                  onSetStatus={setStatus} onSetPriority={setPriority} onSetCategory={setCategory} onDelete={handleDeleteTask}
                  now={now} search={search} viewer={viewerOwner}
                  gcalConnected={gcalConnected}
                  onSyncToCalendar={handleSyncToCalendar}
                  onDeleteFromCalendar={handleDeleteFromCalendar}
                  />
              ))}
              </div></div>
            </React.Fragment>
          )}
        </div>
      ) : (
        // BOARD view — same data as cards. Uses auto-fill (not auto-fit) so
        // a single matching card doesn't stretch the full width on search.
        <div style={boardGroup === 'status'
          // Status kanban = columns that flex to fill the width and WRAP to a new
          // row on narrow screens — no horizontal scroll (Ohad).
          ? { display: 'flex', flexWrap: 'wrap', gap: 12, paddingBottom: 8, alignItems: 'flex-start' }
          // List grouping keeps the responsive wrapping grid.
          : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 14 }
        }>
          {boardSections.map(section => {
            const isStatus = !!section.statusId;
            // Saturated, white-text-safe header colours per status (To Do→Done).
            const STATUS_HEAD = { open: '#5B6B7A', working: '#2C82C9', waiting: '#C9851E', stuck: '#C0392B', done: '#2E9E5B' };
            const headBg = isStatus ? (STATUS_HEAD[section.statusId] || '#5B6B7A') : sourceColor(section.key);
            const headLabel = isStatus
              ? (STATUS_OPTIONS.find(o => o.id === section.statusId)?.label || section.statusId)
              : sourceLabel(section.key, section.rows[0]);
            const isDropTarget = dropKey === section.key;
            return (
            <div key={section.key}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropKey !== section.key) setDropKey(section.key); }}
              onDragLeave={e => { if (e.currentTarget === e.target && dropKey === section.key) setDropKey(null); }}
              onDrop={e => { e.preventDefault(); onDropToColumn(section); }}
              style={{
                border: `1px solid ${isDropTarget ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                background: isDropTarget ? 'var(--c-sf2)' : 'var(--c-sf)',
                borderRadius: 0, display: 'flex', flexDirection: 'column', transition: 'background 0.12s, border-color 0.12s',
                ...(isStatus ? { flex: '1 1 175px', minWidth: 175 } : {}),
              }}>
              <div style={{
                background: headBg, color: '#FFFFFF', padding: '10px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: `1px solid var(--c-cardBd)`,
              }}>
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{headLabel}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', opacity: 0.85 }}>{section.rows.length}</span>
              </div>
              <div style={{ maxHeight: 360, minHeight: (isStatus || boardGroup === 'list') ? 52 : undefined, overflowY: 'auto' }}>
                {section.rows.map(row => (
                  <div key={row.id}
                    draggable={!isReadOnly(row)}
                    onDragStart={e => { draggedRowRef.current = row; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', row.id); } catch { /* noop */ } }}
                    onDragEnd={() => { draggedRowRef.current = null; setDropKey(null); setDropOnId(null); }}
                    onDragOver={e => { if (draggedRowRef.current && draggedRowRef.current.id !== row.id) { e.preventDefault(); e.stopPropagation(); if (dropOnId !== row.id) setDropOnId(row.id); } }}
                    onDragLeave={e => { e.stopPropagation(); if (dropOnId === row.id) setDropOnId(null); }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); reorderOnto(row, section); }}
                    style={{ position: 'relative', cursor: isReadOnly(row) ? 'default' : 'grab', outline: selectedIds.has(row.id) ? '2px solid var(--c-ac)' : 'none', outlineOffset: -2, boxShadow: dropOnId === row.id ? 'inset 0 3px 0 -1px var(--c-ac)' : 'none' }}>
                    <button onClick={e => { e.stopPropagation(); toggleSelect(row.id); }} draggable={false} title="Select"
                      style={{ position: 'absolute', top: 6, left: 6, zIndex: 3, width: 15, height: 15, borderRadius: 0, border: `1px solid ${selectedIds.has(row.id) ? 'var(--c-ac)' : 'var(--c-cardBd)'}`, background: selectedIds.has(row.id) ? 'var(--c-ac)' : 'rgba(0,0,0,0.4)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#061016', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>{selectedIds.has(row.id) ? '✓' : ''}</button>
                    <TaskRow row={row} readOnly={isReadOnly(row)} compact={compact} narrow={narrow}
                      theme={theme} showAvatar={owner === 'shared'} board hideStatus={!!section.statusId}
                      expanded={expandedRows.has(row.id)}
                      onToggleExpand={() => toggleRow(row.id)}
                      onSetStatus={setStatus} onSetPriority={setPriority} onSetCategory={setCategory} onDelete={handleDeleteTask}
                      search={search} viewer={viewerOwner}
                      now={now} />
                  </div>
                ))}
                {(isStatus || boardGroup === 'list') && section.rows.length === 0 && (
                  <div style={{ padding: '16px 12px', textAlign: 'center', fontFamily: FN, fontSize: 9, letterSpacing: '0.12em', color: 'var(--c-td)', textTransform: 'uppercase' }}>Drop here</div>
                )}
              </div>
              {(isStatus || section.key === 'center' || section.key === 'manual') && (
                <div style={{ borderTop: `1px solid var(--c-cardBd)`, padding: 6 }}>
                  {quickAddKey === section.key ? (
                    <input autoFocus value={quickAddText}
                      onChange={e => setQuickAddText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); quickAdd(section); }
                        else if (e.key === 'Escape') { setQuickAddKey(null); setQuickAddText(''); }
                      }}
                      onBlur={() => { if (!quickAddText.trim()) setQuickAddKey(null); }}
                      placeholder="Task title — Enter to add, Esc to close"
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf2)', border: `1px solid var(--c-ac)`, color: 'var(--c-tx)', fontFamily: FB, fontSize: 12, padding: '7px 9px', borderRadius: 0, outline: 'none' }} />
                  ) : (
                    <button onClick={() => { setQuickAddKey(section.key); setQuickAddText(''); }}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--c-tm)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: '7px 6px', cursor: 'pointer', textAlign: 'left', textTransform: 'uppercase' }}>+ Add a task</button>
                  )}
                </div>
              )}
            </div>
            );
          })}
          {boardSections.length === 0 && (
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
          background: 'var(--c-sf)',
        }}>
          <div
            {...asButton(() => setDoneOpen(o => !o))}
            aria-expanded={doneOpen}
            aria-label="Toggle done history"
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
          <div style={{ display: 'grid', gridTemplateRows: doneOpen ? '1fr' : '0fr', transition: 'grid-template-rows 260ms ease' }}><div style={{ overflow: 'hidden', minHeight: 0 }}>
          {[...done]
            .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))
            .slice(0, 5)
            .map(row => {
              const _owner = ownerFromBody(row.body);
              const decoratedDone = {
                ...row,
                _owner,
                _priority: priorityFromBody(row.body),
                _dueAt: dueAtFromBody(row.body),
                _dueTime: dueTimeFromBody(row.body),
                _approvals: _owner === 'shared' ? approvalsFromTags(row.tags) : null,
                _display: displayBodyOf(row.body),
              };
              return (
                <TaskRow key={row.id} row={decoratedDone} readOnly={isReadOnly(decoratedDone)} compact={compact} narrow={narrow}
                  theme={theme} showAvatar={owner === 'shared'}
                  expanded={expandedRows.has(row.id)}
                  onToggleExpand={() => toggleRow(row.id)}
                  onSetStatus={setStatus} onSetPriority={setPriority} onSetCategory={setCategory} onDelete={handleDeleteTask}
                  now={now} search={search} viewer={viewerOwner}
                  gcalConnected={gcalConnected}
                  onSyncToCalendar={handleSyncToCalendar}
                  onDeleteFromCalendar={handleDeleteFromCalendar}
                  />
              );
            })}
          {done.length > 5 && (
            <div style={{
              padding: '10px 14px',
              fontFamily: FN, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.12em', color: 'var(--c-tm)',
              textTransform: 'uppercase', textAlign: 'center',
            }}>{done.length - 5} more done · view all in Phase 1</div>
          )}
          </div></div>
        </div>
      )}
        </div>{/* /content */}
      </div>{/* /rail+content flex row */}

      <div style={{
        marginTop: 22, padding: '10px 0',
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', color: 'var(--c-td)',
        textTransform: 'uppercase',
      }}>
        v8 · list-first (Linear/Things 3 pattern) · view toggle to board · auto-tasks collapsed
      </div>

      {selectedIds.size > 0 && (
        <div style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 1400, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'calc(100vw - 24px)', background: 'var(--c-sf2)', border: `1px solid var(--c-ac)`, borderRadius: 0, padding: '10px 14px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
          <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-tx)' }}>{selectedIds.size} SELECTED</span>
          <span style={{ width: 1, height: 18, background: 'var(--c-cardBd)' }} />
          <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-tm)' }}>SET</span>
          {STATUS_OPTIONS.filter(o => o.id !== 'cancelled').map(o => (
            <button key={o.id} onClick={() => bulkStatus(o.id)} title={`Set ${o.label}`}
              style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 8px', cursor: 'pointer', background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tx)', borderRadius: 0 }}>{o.label}</button>
          ))}
          <span style={{ width: 1, height: 18, background: 'var(--c-cardBd)' }} />
          <button onClick={bulkDelete} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', cursor: 'pointer', background: 'transparent', border: `1px solid var(--c-rd)`, color: 'var(--c-rd)', borderRadius: 0 }}>Delete</button>
          <button onClick={clearSelect} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--c-tm)', borderRadius: 0 }}>Clear</button>
        </div>
      )}
    </div>
  );
}
