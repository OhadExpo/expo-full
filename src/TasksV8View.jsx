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

import React, { useState, useMemo } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';

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
  if (status === 'done')    return dark ? { bg: '#00A85D', fg: '#FFFFFF' } : { bg: '#00CA72', fg: '#FFFFFF' };
  if (status === 'working') return dark ? { bg: '#D9A800', fg: '#000000' } : { bg: '#FFCC00', fg: '#000000' };
  if (status === 'stuck')   return dark ? { bg: '#C81F4D', fg: '#FFFFFF' } : { bg: '#FB275D', fg: '#FFFFFF' };
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

const STATUS_RANK = { stuck: 0, working: 1, open: 2, done: 3 };
const STATUS_CYCLE = ['open', 'working', 'stuck', 'done'];
function nextStatus(s) {
  const i = STATUS_CYCLE.indexOf(s);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}
function applySort(rows, mode, dir) {
  const a = [...rows];
  let cmp;
  if (mode === 'newest')      cmp = (x, y) => new Date(y.created_at) - new Date(x.created_at);
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

// Status pill with popover — click opens a small picker with all 4 states
// so the user can skip non-adjacent transitions (e.g. OPEN → DONE directly).
const STATUS_OPTIONS = [
  { id: 'open',    label: 'OPEN'  },
  { id: 'working', label: 'WORK'  },
  { id: 'stuck',   label: 'STUCK' },
  { id: 'done',    label: 'DONE'  },
];
function StatusPill({ status, theme, onSetStatus }) {
  const [open, setOpen] = useState(false);
  const c = statusColors(status, theme);
  const isOpenState = !c;
  const text = isOpenState ? 'OPEN' : status === 'done' ? 'DONE' : status === 'working' ? 'WORK' : 'STUCK';
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        title="Click to change status"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: isOpenState ? 'transparent' : c.bg,
          color: isOpenState ? 'var(--c-tm)' : c.fg,
          border: isOpenState ? '1px dashed var(--c-cardBd)' : 'none',
          fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          padding: '0 6px', height: 18, width: 56, borderRadius: 0, flexShrink: 0,
          textTransform: 'uppercase', cursor: 'pointer',
        }}>{text}</button>
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 2,
            background: 'var(--c-sf)', border: '1px solid var(--c-cardBd)',
            zIndex: 100, minWidth: 120, boxShadow: 'var(--c-cardShadow)',
          }}>
          {STATUS_OPTIONS.map(o => {
            const sc = statusColors(o.id, theme);
            const isCurrent = o.id === status;
            return (
              <button key={o.id}
                onMouseDown={(e) => { e.preventDefault(); onSetStatus(o.id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: isCurrent ? 'var(--c-sf2, transparent)' : 'transparent',
                  border: 'none', textAlign: 'left', padding: '7px 10px',
                  fontFamily: FN, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: isCurrent ? 'var(--c-ac)' : 'var(--c-tx)',
                  cursor: 'pointer', textTransform: 'uppercase',
                }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: sc ? sc.bg : 'transparent',
                  border: sc ? 'none' : '1px dashed var(--c-cardBd)',
                  flexShrink: 0,
                }} />
                <span>{o.label}</span>
                {isCurrent && <span style={{ marginLeft: 'auto', color: 'var(--c-ac)' }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

function OwnerTab({ label, count, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      background: active ? (color || 'var(--c-ac)') : 'transparent',
      color: active ? '#FFFFFF' : 'var(--c-tm)',
      border: `1px solid ${active ? (color || 'var(--c-ac)') : 'var(--c-cardBd)'}`,
      fontFamily: FN, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.14em', padding: '7px 16px',
      cursor: 'pointer', borderRadius: 0,
      textTransform: 'uppercase', display: 'inline-flex',
      alignItems: 'center', gap: 8,
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
      borderRadius: 0,
    }}>
      {items.map((it, i) => (
        <button key={it.id} onClick={() => onChange(it.id)} style={{
          background: value === it.id ? 'rgba(57,189,255,0.094)' : 'transparent',
          color: value === it.id ? C.ac : C.tm,
          border: 'none',
          borderLeft: i === 0 ? 'none' : `1px solid var(--c-cardBd)`,
          fontFamily: FN, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', padding: '0 14px', height: 28,
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
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 14,
      padding: '8px 10px',
      background: isRefined5b() ? 'transparent' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0,
    }}>
      <span style={{
        fontFamily: FN, fontSize: 9, color: C.tm,
        letterSpacing: '0.18em', fontWeight: 700, marginRight: 6,
      }}>SORT</span>
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
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
            color: active ? 'var(--c-ac)' : 'var(--c-tm)',
            border: `1px solid ${active ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '5px 10px', height: 24,
            cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
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
function SmartComposer({ onSubmit, defaultAssignee = 'ohad' }) {
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [due, setDue] = useState('');
  const [source, setSource] = useState('manual'); // 'manual' | 'center'
  const [focused, setFocused] = useState(false);
  const inputRef = React.useRef(null);
  const expanded = focused || body.trim() !== '';

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    await onSubmit({ body: trimmed, assignee, due, source });
    setBody(''); setDue(''); setSource('manual');
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

// Section header — minimal chrome. Small colored dot + name + count.
// No heavy top border. Visual restraint = calmer list.
function SectionHeader({ label, count, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
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
    </div>
  );
}

function googleCalendarUrl(row, displayBody) {
  const due = new Date(row.created_at);
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, '0');
  const d = String(due.getDate()).padStart(2, '0');
  const start = `${y}${m}${d}T090000`;
  const end = `${y}${m}${d}T100000`;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const tagLine = tags.length ? `\n\nTags: ${tags.map(t => '#' + t).join(' ')}` : '';
  const description = `From EXPO Tasks — ${row.id}${tagLine}\n\nhttps://expo-app.co.il/coach/tasks?ui=v8`;
  const params = new URLSearchParams({
    text: displayBody || row.body || 'EXPO Task',
    dates: `${start}/${end}`,
    details: description,
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

function ExpandedDetail({ row, displayBody }) {
  const heb = isHebrew(displayBody || '');
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const calUrl = googleCalendarUrl(row, displayBody);
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
              letterSpacing: '0.08em', color: 'var(--c-ac)',
              border: `1px solid var(--c-cardBd)`, padding: '2px 6px',
              textTransform: 'uppercase',
            }}>#{t}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, direction: 'ltr' }}>
        <a href={calUrl} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', color: 'var(--c-ac)',
            border: '1px solid var(--c-ac)',
            fontFamily: FN, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.12em', padding: '4px 10px',
            textDecoration: 'none', borderRadius: 0,
            textTransform: 'uppercase',
          }}>📅 Open in Google Calendar</a>
      </div>
    </div>
  );
}

function TaskRow({ row, theme, showAvatar, expanded, onToggleExpand, onSetStatus, now }) {
  const heb = isHebrew(row._display || '');
  const dm = dateMeta(row.created_at, now);
  const isToday = dm.label === 'TODAY';
  const isOverdue = dm.isOverdue;
  const isStuck = row.status === 'stuck';
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
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily: heb ? FH : FB,
          fontSize: heb ? 14 : 13,
          fontWeight: 500,
          color: 'var(--c-tx)',
          direction: heb ? 'rtl' : 'ltr',
          textAlign: heb ? 'right' : 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{row._display}</div>
        {/* Hover-revealed quick action — Linear pattern. Doesn't do anything
            yet (Phase 1 hooks up a quick-menu), just signals interactivity. */}
        <span style={{
          fontFamily: FN, fontSize: 14, fontWeight: 700, color: 'var(--c-td)',
          opacity: hover ? 1 : 0, transition: 'opacity 120ms ease',
          width: 14, textAlign: 'center', cursor: 'pointer',
          flexShrink: 0,
        }} title="More actions (Phase 1)">⋯</span>
        <StatusPill status={row.status} theme={theme} onSetStatus={(s) => onSetStatus(row, s)} />
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700,
          color: dm.color, letterSpacing: '0.04em',
          width: 56, textAlign: 'right',
          flexShrink: 0,
        }}>{dm.label}</span>
      </div>
      {expanded && (
        <div style={{
          animation: 'tasks-v8-slide-in 200ms ease-out',
        }}>
          <ExpandedDetail row={row} displayBody={row._display} />
        </div>
      )}
    </React.Fragment>
  );
}

// ────────────────────────────────────────────────────────────────────
// main view
// ────────────────────────────────────────────────────────────────────

export default function TasksV8View() {
  const { rows, loading, update, create } = useCoachNotes({ limit: 200 });
  const [owner, setOwner] = useState('ohad');
  const [view, setView] = useState('list'); // 'list' | 'board'
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all'); // all | today | overdue | stuck | nodate
  const now = useMemo(() => new Date(), []);
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'dark';

  const decorated = useMemo(() => rows.map(r => {
    const o = ownerFromBody(r.body);
    return { ...r, _owner: o, _display: stripOwnerPrefix(r.body) };
  }), [rows]);

  const counts = useMemo(() => ({
    ohad:   decorated.filter(r => r._owner === 'ohad').length,
    yuval:  decorated.filter(r => r._owner === 'yuval').length,
    shared: decorated.filter(r => r._owner === 'shared').length,
  }), [decorated]);

  // Owner + open filter is the base. Search narrows further.
  const ownerBase = useMemo(
    () => decorated.filter(r => r._owner === owner && r.status !== 'done'),
    [decorated, owner]
  );

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ownerBase;
    return ownerBase.filter(r => (r._display || r.body || '').toLowerCase().includes(q));
  }, [ownerBase, search]);

  // Quick-filter counts (computed off ownerBase so chips show real numbers
  // even before user picks the filter).
  const quickCounts = useMemo(() => {
    const c = { all: ownerBase.length, today: 0, overdue: 0, stuck: 0, nodate: 0 };
    for (const r of ownerBase) {
      const dm = dateMeta(r.created_at, now);
      if (dm.label === 'TODAY') c.today++;
      if (dm.isOverdue) c.overdue++;
      if (r.status === 'stuck') c.stuck++;
      // 'no date' = tasks without a meaningful due_at. Until Phase 1 we
      // don't have due_at; treat as 0.
    }
    return c;
  }, [ownerBase, now]);

  // Apply quick filter on top of search.
  const quickFiltered = useMemo(() => {
    if (quickFilter === 'all') return searched;
    return searched.filter(r => {
      const dm = dateMeta(r.created_at, now);
      if (quickFilter === 'today')   return dm.label === 'TODAY';
      if (quickFilter === 'overdue') return dm.isOverdue;
      if (quickFilter === 'stuck')   return r.status === 'stuck';
      if (quickFilter === 'nodate')  return false; // Phase 1 lights this up
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
      byKey.set(k, applySort(list, sortBy, sortDir));
    }
    const result = [];
    if (byKey.has('center'))  result.push({ key: 'center',  rows: byKey.get('center')  });
    const trainees = [...byKey.entries()].filter(([k]) => k.startsWith('trainee:'));
    trainees.sort((a, b) => b[1].length - a[1].length);
    for (const [k, r] of trainees) result.push({ key: k, rows: r });
    if (byKey.has('manual'))  result.push({ key: 'manual',  rows: byKey.get('manual')  });
    if (byKey.has('auto'))    result.push({ key: 'auto',    rows: byKey.get('auto')    });
    return result;
  }, [quickFiltered, sortBy, sortDir]);

  const done = useMemo(
    () => decorated.filter(r => r._owner === owner && r.status === 'done'),
    [decorated, owner]
  );

  const toggleRow = (id) => setExpandedRows(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const setStatus = async (row, target) => {
    // The existing coach_notes schema only persists 'open' | 'done'.
    // 'working' and 'stuck' will land in Phase 1 with the status_label
    // column. For now we map: done → done, anything else → open. The
    // visual change is immediate via optimistic update in useCoachNotes,
    // but reload may revert non-{open,done} states until schema lands.
    if (target === 'done')      await update(row.id, { status: 'done', completed_at: new Date().toISOString() });
    else if (target === 'open') await update(row.id, { status: 'open', completed_at: null });
    else                        await update(row.id, { status: 'open' });
  };
  // SmartComposer hands us structured input (assignee, due, source). Until
  // Phase 1 schema, we encode assignee as body prefix and source as a tag.
  // due is parked in body for now since coach_notes has no due_at column.
  const onComposerSubmit = async ({ body, assignee, due, source }) => {
    if (!body || !body.trim()) return;
    let prefixed;
    if (assignee === 'yuval') prefixed = `Yuval: ${body}`;
    else if (assignee === 'shared') prefixed = `Ohad + Yuval: ${body}`;
    else prefixed = `Ohad: ${body}`;
    if (due) prefixed += ` · due ${due}`;
    const tags = source === 'center' ? ['center'] : [];
    await create({ body: prefixed, targetKind: 'general', tags });
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
      {/* Title + + TASK */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <h2 style={{
          margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--c-tx)',
        }}>Tasks</h2>
        <button
          onClick={() => window.alert('Inline composer ships in Phase 1.')}
          style={{
            background: 'var(--c-ac)', color: '#FFFFFF',
            border: 'none', fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '6px 14px',
            cursor: 'pointer', borderRadius: 0,
          }}>+ TASK</button>
      </div>

      {/* Owner tabs + view toggle */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12,
        flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <OwnerTab label="Ohad"   count={counts.ohad}   active={owner === 'ohad'}   onClick={() => setOwner('ohad')}   color={C.ac} />
          <OwnerTab label="Yuval"  count={counts.yuval}  active={owner === 'yuval'}  onClick={() => setOwner('yuval')}  color={YUVAL_COLOR} />
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
          <SmartComposer onSubmit={onComposerSubmit} defaultAssignee={owner === 'shared' ? 'ohad' : owner} />

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
                    await onComposerSubmit({ body: q, assignee: owner === 'shared' ? 'ohad' : owner, due: '', source: 'manual' });
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
          {visibleSections.map(section => (
            <React.Fragment key={section.key}>
              <SectionHeader
                label={sourceLabel(section.key, section.rows[0])}
                count={section.rows.length}
                color={sourceColor(section.key)}
              />
              {section.rows.map(row => (
                <TaskRow key={row.id} row={row}
                  theme={theme} showAvatar={owner === 'shared'}
                  expanded={expandedRows.has(row.id)}
                  onToggleExpand={() => toggleRow(row.id)}
                  onSetStatus={setStatus}
                  now={now} />
              ))}
            </React.Fragment>
          ))}

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
                  now={now} />
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
        <div
          onClick={() => setDoneOpen(o => !o)}
          style={{
            marginTop: 14, padding: '10px 14px',
            border: `1px solid var(--c-cardBd)`,
            background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.18em', color: 'var(--c-td)',
            textTransform: 'uppercase', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
          <span>{doneOpen ? '▾' : '▸'} Done · {done.length}</span>
          <span style={{ opacity: 0.6 }}>{doneOpen ? 'click to collapse' : 'click to expand'}</span>
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
