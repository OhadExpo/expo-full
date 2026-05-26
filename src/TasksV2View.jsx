// TASKS — Option 5 visual prototype (v2 iteration).
//
// Gated behind `?ui=v2` on /coach/tasks. Read-only prototype that renders
// existing coach_notes rows in the new layout:
//   - Top tabs by owner: OHAD / YUVAL / SHARED (3 segmented buttons)
//   - Within each tab: sections by sub-category (ATHLETES / GYM / OPS)
//   - Each section header: count + sort dropdown
//   - Within each section: rows with Monday status pill, date, sub-tag chip
//   - Inline expand on row tap
//   - Done pool collapsed at bottom
//
// Backend schema (assigned_to / due_at / 4-state status / activity log)
// lands in a separate Phase 1 commit. Until then:
//   - status comes from existing `status` field (open|done)
//   - assignee parsed from body prefix ("Ohad:" / "Yuval:") for demo data
//     (real `assigned_to` column ships in Phase 1)
//   - due date uses `created_at` as a proxy
//   - GYM bucket: tasks tagged #center, #center:*, #gym, or #gym:*
//   - ATHLETES bucket: target_kind === 'trainee' (existing data)
//   - OPS bucket: everything else
//
// Throw this file away if Ohad rejects the look.

import React, { useState, useMemo } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

// Yuval's color. Cyan is Ohad's. Picking warm amber for Yuval so the two
// partners scan distinct on a row.
const YUVAL_COLOR = '#FFA02E';

// Monday status colors, slightly desaturated for dark mode.
function statusColors(status, theme) {
  const dark = theme === 'dark' || theme === '1' || theme === '2' || theme === '3' || theme === '4';
  if (status === 'done')    return dark ? { bg: '#00A85D', fg: '#FFFFFF' } : { bg: '#00CA72', fg: '#FFFFFF' };
  if (status === 'working') return dark ? { bg: '#D9A800', fg: '#000000' } : { bg: '#FFCC00', fg: '#000000' };
  if (status === 'stuck')   return dark ? { bg: '#C81F4D', fg: '#FFFFFF' } : { bg: '#FB275D', fg: '#FFFFFF' };
  return dark ? { bg: '#3A3A42', fg: '#E0E0E5' } : { bg: '#D5D6DC', fg: '#1A1A22' };
}

function statusLabel(row) {
  if (row.status === 'done') return { key: 'done', text: 'DONE' };
  return { key: 'open', text: 'OPEN' };
}

function compactDate(iso, now) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay - startOfToday) / 86400000);
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'TOMORROW';
  if (diffDays === -1) return 'YESTERDAY';
  if (diffDays > 1 && diffDays <= 6) return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  const day = d.getDate();
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  return `${day} ${mon}`;
}

// Parse owner from a seeded demo body prefix ("Ohad:" / "Yuval:" /
// "Ohad + Yuval:"). Returns 'ohad' | 'yuval' | 'shared' | null.
// Phase 1 replaces this with the real `assigned_to` column.
function ownerFromBody(body) {
  const b = (body || '').trim();
  if (/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad)\s*:/i.test(b)) return 'shared';
  if (/^ohad\s*:/i.test(b)) return 'ohad';
  if (/^yuval\s*:/i.test(b)) return 'yuval';
  return null;
}

// Strip the "Ohad: " / "Yuval: " prefix from display body once we've
// extracted it into the assignee chip. Cleaner row read.
function stripOwnerPrefix(body) {
  return (body || '').replace(/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad|ohad|yuval)\s*:\s*/i, '');
}

function AssigneeDot({ owner }) {
  if (owner === 'shared') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        background: `linear-gradient(135deg, ${C.ac} 0% 50%, ${YUVAL_COLOR} 50% 100%)`,
        color: '#FFFFFF', fontFamily: FN, fontSize: 9, fontWeight: 700,
        flexShrink: 0,
      }} title="Ohad + Yuval">·</span>
    );
  }
  const isYuval = owner === 'yuval';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: '50%',
      background: isYuval ? YUVAL_COLOR : C.ac,
      color: '#FFFFFF', fontFamily: FN, fontSize: 9, fontWeight: 700,
      letterSpacing: 0, flexShrink: 0,
    }}>{isYuval ? 'Y' : 'O'}</span>
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
      padding: '0 8px', height: 22, width: 84, borderRadius: 0, flexShrink: 0,
      textTransform: 'uppercase',
    }}>{text}</span>
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
  const description = `From EXPO Tasks — ${row.id}${tagLine}\n\nhttps://expo-app.co.il/coach/tasks?ui=v2`;
  const params = new URLSearchParams({
    text: displayBody || row.body || 'EXPO Task',
    dates: `${start}/${end}`,
    details: description,
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

function TaskRow({ row, owner, displayBody, now, theme, showAvatar, expanded, onToggle }) {
  const heb = isHebrew(displayBody || '');
  const date = compactDate(row.created_at, now);
  // Status pill renders ONLY when colored (working/stuck/done). Plain 'open'
  // status doesn't need a pill — being in the open list IS the signal.
  const showPill = row.status === 'working' || row.status === 'stuck' || row.status === 'done';

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', cursor: 'pointer',
        borderBottom: `1px solid var(--c-cardBd)`,
        background: expanded ? 'var(--c-sf2, transparent)' : 'transparent',
        transition: 'background 120ms ease',
      }}
    >
      {showAvatar && <AssigneeDot owner={owner} />}
      <div style={{
        flex: 1, minWidth: 0,
        fontFamily: heb ? FH : FB,
        fontSize: heb ? 15 : 13,
        fontWeight: 500,
        color: 'var(--c-tx)',
        direction: heb ? 'rtl' : 'ltr',
        textAlign: heb ? 'right' : 'left',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: expanded ? 'normal' : 'nowrap',
      }}>{displayBody}</div>
      {showPill && <StatusPill status={row.status} theme={theme} />}
      <span style={{
        fontFamily: FN, fontSize: 11, fontWeight: 600,
        color: date === 'TODAY' ? 'var(--c-ac)' : 'var(--c-tm)',
        letterSpacing: '0.04em', width: 76, textAlign: 'right',
        flexShrink: 0,
      }}>{date}</span>
    </div>
  );
}

function ExpandedDetail({ row, displayBody }) {
  const heb = isHebrew(displayBody || '');
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const calUrl = googleCalendarUrl(row, displayBody);
  return (
    <div style={{
      padding: '12px 14px 16px 44px',
      background: 'var(--c-sf2, transparent)',
      borderBottom: `1px solid var(--c-cardBd)`,
      fontFamily: heb ? FH : FB,
      fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.6,
      direction: heb ? 'rtl' : 'ltr',
    }}>
      <div style={{ marginBottom: 8, color: 'var(--c-tx)' }}>{displayBody}</div>
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
        Phase 1 will add: 4-state status, assignee picker, due-date picker, comments thread, activity log.
      </div>
    </div>
  );
}

function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: active ? 'var(--c-ac)' : 'transparent',
        color: active ? '#FFFFFF' : 'var(--c-tm)',
        border: `1px solid ${active ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
        fontFamily: FN, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.12em', padding: '5px 11px',
        cursor: 'pointer', borderRadius: 0,
        textTransform: 'uppercase',
      }}>
      <span>{label}</span>
      <span style={{ opacity: active ? 0.85 : 0.7, fontSize: 10 }}>{count}</span>
    </button>
  );
}

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find(o => o.key === value) || SORT_OPTIONS[0];
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'transparent', border: '1px solid var(--c-cardBd)',
          color: 'var(--c-tm)', fontFamily: FN, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', padding: '5px 10px',
          cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
        }}>⇅ {current.label} ▾</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 2,
          background: 'var(--c-sf)', border: '1px solid var(--c-cardBd)',
          zIndex: 100, minWidth: 130,
        }}>
          {SORT_OPTIONS.map(o => (
            <button key={o.key}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.key); setOpen(false); }}
              style={{
                display: 'block', width: '100%',
                background: o.key === value ? 'var(--c-sf2)' : 'transparent',
                border: 'none', textAlign: 'left', padding: '7px 12px',
                fontFamily: FN, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em',
                color: o.key === value ? 'var(--c-ac)' : 'var(--c-tm)',
                cursor: 'pointer', textTransform: 'uppercase',
              }}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchInput({ value, onChange }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search…"
      style={{
        background: 'transparent', border: '1px solid var(--c-cardBd)',
        color: 'var(--c-tx)', fontFamily: FN, fontSize: 11, fontWeight: 500,
        letterSpacing: '0.04em', padding: '5px 10px', borderRadius: 0,
        outline: 'none', width: 180, height: 28, boxSizing: 'border-box',
      }}
      autoComplete="off"
    />
  );
}

function OwnerTab({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
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

function sortByDate(rows)   { return [...rows].sort((x, y) => new Date(x.created_at) - new Date(y.created_at)); }
function sortByNewest(rows) { return [...rows].sort((x, y) => new Date(y.created_at) - new Date(x.created_at)); }
function sortByName(rows)   { return [...rows].sort((x, y) => (x.body || '').localeCompare(y.body || '')); }
const STATUS_RANK = { stuck: 0, working: 1, open: 2, done: 3 };
function sortByStatus(rows) { return [...rows].sort((x, y) => (STATUS_RANK[x.status] ?? 9) - (STATUS_RANK[y.status] ?? 9)); }

function applySort(rows, key) {
  if (key === 'newest') return sortByNewest(rows);
  if (key === 'name')   return sortByName(rows);
  if (key === 'status') return sortByStatus(rows);
  return sortByDate(rows);
}

const SORT_OPTIONS = [
  { key: 'date',   label: 'Due date' },
  { key: 'newest', label: 'Newest' },
  { key: 'status', label: 'Status' },
  { key: 'name',   label: 'A→Z' },
];

// Bucket helpers — the implicit categorization. Used to derive filter
// chips from data + render the inline sub-tag chip on each row.
function rowBucket(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  if (tags.some(t => t === 'gym' || t === 'center' || t.startsWith('gym:') || t.startsWith('center:'))) return 'gym';
  if (row.target_kind === 'trainee') return 'athletes';
  return 'ops';
}
function rowGymSubtag(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  for (const t of tags) {
    if (t.startsWith('gym:') || t.startsWith('center:')) return (t.split(':')[1] || '').toUpperCase();
  }
  return null;
}
function rowInlineChip(row) {
  const b = rowBucket(row);
  if (b === 'gym') {
    const sub = rowGymSubtag(row);
    return sub ? `GYM · ${sub}` : 'GYM';
  }
  if (b === 'athletes' && row.target_label) return row.target_label;
  if (b === 'athletes') return 'ATHLETE';
  return null;
}

export default function TasksV2View() {
  const { rows, loading } = useCoachNotes({ limit: 200 });
  const [owner, setOwner] = useState('ohad'); // 'ohad' | 'yuval' | 'shared'
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [activeBuckets, setActiveBuckets] = useState(new Set()); // empty = show all
  const [activeGymSubs, setActiveGymSubs] = useState(new Set());  // empty = show all gym
  const now = useMemo(() => new Date(), []);
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'dark';

  // Decorate every row with derived owner + displayBody (prefix-stripped).
  const decorated = useMemo(() => rows.map(r => {
    const o = ownerFromBody(r.body) || 'ohad'; // default unowned → Ohad (Phase 1 reads real column)
    return { ...r, _owner: o, _display: stripOwnerPrefix(r.body) };
  }), [rows]);

  const counts = useMemo(() => ({
    ohad:   decorated.filter(r => r._owner === 'ohad').length,
    yuval:  decorated.filter(r => r._owner === 'yuval').length,
    shared: decorated.filter(r => r._owner === 'shared').length,
  }), [decorated]);

  // Owner's open tasks. Filter chips + search apply, sort applies last.
  const ownerOpen = useMemo(
    () => decorated.filter(r => r._owner === owner && r.status !== 'done'),
    [decorated, owner]
  );

  // Bucket counts for the chip row (always computed before filtering so the
  // counts reflect the full set, not the filtered subset).
  const bucketCounts = useMemo(() => {
    const c = { athletes: 0, gym: 0, ops: 0 };
    for (const r of ownerOpen) c[rowBucket(r)] += 1;
    return c;
  }, [ownerOpen]);

  const gymSubCounts = useMemo(() => {
    const c = {};
    for (const r of ownerOpen) {
      if (rowBucket(r) === 'gym') {
        const sub = rowGymSubtag(r);
        if (sub) c[sub] = (c[sub] || 0) + 1;
      }
    }
    return c;
  }, [ownerOpen]);

  const filteredOpen = useMemo(() => {
    let rows = ownerOpen;
    if (activeBuckets.size > 0) {
      rows = rows.filter(r => activeBuckets.has(rowBucket(r)));
    }
    if (activeGymSubs.size > 0) {
      rows = rows.filter(r => {
        if (rowBucket(r) !== 'gym') return false;
        const sub = rowGymSubtag(r);
        return sub && activeGymSubs.has(sub);
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => (r._display || r.body || '').toLowerCase().includes(q));
    }
    return applySort(rows, sortKey);
  }, [ownerOpen, activeBuckets, activeGymSubs, search, sortKey]);

  const done = useMemo(
    () => decorated.filter(r => r._owner === owner && r.status === 'done'),
    [decorated, owner]
  );

  const toggleBucket = (k) => {
    setActiveBuckets(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      // Clear gym-sub filter if user leaves the gym bucket selection.
      if (k === 'gym' && next.has('gym') === false) setActiveGymSubs(new Set());
      return next;
    });
  };
  const toggleGymSub = (k) => {
    setActiveGymSubs(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    // Selecting a gym sub-tag implies the GYM bucket is active.
    setActiveBuckets(prev => {
      if (prev.has('gym')) return prev;
      const next = new Set(prev);
      next.add('gym');
      return next;
    });
  };

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
        }}>Tasks</h2>
        <button
          onClick={() => window.alert('Inline composer ships in Phase 1. For now use the legacy /coach/tasks view (no ?ui=v2) to create tasks.')}
          style={{
            background: 'var(--c-ac)', color: '#FFFFFF',
            border: 'none', fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '6px 14px',
            cursor: 'pointer', borderRadius: 0,
          }}>+ TASK</button>
      </div>

      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, padding: '0 14px',
        flexWrap: 'wrap',
      }}>
        <OwnerTab label="Ohad"   count={counts.ohad}   active={owner === 'ohad'}   onClick={() => setOwner('ohad')}   color={C.ac} />
        <OwnerTab label="Yuval"  count={counts.yuval}  active={owner === 'yuval'}  onClick={() => setOwner('yuval')}  color={YUVAL_COLOR} />
        <OwnerTab label="Shared" count={counts.shared} active={owner === 'shared'} onClick={() => setOwner('shared')} />
      </div>

      <div style={{
        display: 'flex', gap: 8, marginBottom: 18, padding: '0 14px',
        flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {bucketCounts.athletes > 0 && (
            <FilterChip label="Athletes" count={bucketCounts.athletes}
              active={activeBuckets.has('athletes')} onClick={() => toggleBucket('athletes')} />
          )}
          {bucketCounts.gym > 0 && (
            <FilterChip label="Gym" count={bucketCounts.gym}
              active={activeBuckets.has('gym')} onClick={() => toggleBucket('gym')} />
          )}
          {bucketCounts.ops > 0 && (
            <FilterChip label="Ops" count={bucketCounts.ops}
              active={activeBuckets.has('ops')} onClick={() => toggleBucket('ops')} />
          )}
          {activeBuckets.has('gym') && Object.keys(gymSubCounts).length > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginLeft: 6, paddingLeft: 8,
              borderLeft: '1px solid var(--c-cardBd)',
            }}>
              {Object.entries(gymSubCounts).map(([sub, count]) => (
                <FilterChip key={sub} label={sub} count={count}
                  active={activeGymSubs.has(sub)} onClick={() => toggleGymSub(sub)} />
              ))}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchInput value={search} onChange={setSearch} />
          <SortDropdown value={sortKey} onChange={setSortKey} />
        </div>
      </div>

      <div style={{
        border: `1px solid var(--c-cardBd)`,
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
        borderRadius: 0,
      }}>
        {filteredOpen.map(row => (
          <React.Fragment key={row.id}>
            <TaskRow
              row={row} owner={row._owner} displayBody={row._display}
              now={now} theme={theme}
              showAvatar={owner === 'shared'}
              expanded={expanded === row.id}
              onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
            />
            {expanded === row.id && <ExpandedDetail row={row} displayBody={row._display} />}
          </React.Fragment>
        ))}

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

        {filteredOpen.length === 0 && done.length === 0 && (
          <div style={{
            padding: '32px 14px', textAlign: 'center',
            fontFamily: FN, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.12em', color: 'var(--c-td)',
            textTransform: 'uppercase',
          }}>{search || activeBuckets.size || activeGymSubs.size ? 'No matches' : `No tasks for ${owner}.`}</div>
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
