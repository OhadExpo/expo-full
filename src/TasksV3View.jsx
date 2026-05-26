// TASKS — V3 PROTOTYPE.
//
// Gated behind `?ui=v3` on /coach/tasks. v2 stays parallel at `?ui=v2`.
//
// Built from the evidence in Ohad's folders + the existing Athletes page
// sort pattern. Three structural moves vs v2:
//
//   1. Sort UI mirrors the Athletes page exactly — inline mode pills +
//      direction toggle wrapped in a bordered strip with a SORT label.
//      No dropdown. Matches existing app vocabulary.
//
//   2. Each row carries a SOURCE line — "from auto · רון יונקר" /
//      "from Performance Center · Property" / "from manual" — under the
//      title in muted type. Tasks become anchored to their origin
//      (meeting / trainee / project / free-form) instead of floating
//      contextless.
//
//   3. List splits into two pools:
//        - YOUR PLATE: real delegated work (auto_kind IS NULL). Top.
//        - ALERTS: auto-generated reactions (auto_kind IS NOT NULL).
//          Collapsible footer, hidden by default — surfaces only when
//          you want them. The 7-rule engine generates 88/100 rows
//          which currently drown out the 12 real delegated tasks.
//
// Backend schema is unchanged from v2. Stubs:
//   - status from existing `status` field (open|done)
//   - assignee parsed from body prefix
//   - due date = created_at proxy

import React, { useState, useMemo } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';

const isHebrew = (s) => /[֐-׿]/.test(s || '');
const YUVAL_COLOR = '#FFA02E';

// ────────────────────────────────────────────────────────────────────
// Helpers (duplicated from v2; v3 stays self-contained so v2 keeps
// working untouched. Move to a shared module if we promote v3 later.)
// ────────────────────────────────────────────────────────────────────

function statusColors(status, theme) {
  const dark = theme === 'dark' || theme === '1' || theme === '2' || theme === '3' || theme === '4';
  if (status === 'done')    return dark ? { bg: '#00A85D', fg: '#FFFFFF' } : { bg: '#00CA72', fg: '#FFFFFF' };
  if (status === 'working') return dark ? { bg: '#D9A800', fg: '#000000' } : { bg: '#FFCC00', fg: '#000000' };
  if (status === 'stuck')   return dark ? { bg: '#C81F4D', fg: '#FFFFFF' } : { bg: '#FB275D', fg: '#FFFFFF' };
  return dark ? { bg: '#3A3A42', fg: '#E0E0E5' } : { bg: '#D5D6DC', fg: '#1A1A22' };
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

function ownerFromBody(body) {
  const b = (body || '').trim();
  if (/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad)\s*:/i.test(b)) return 'shared';
  if (/^ohad\s*:/i.test(b)) return 'ohad';
  if (/^yuval\s*:/i.test(b)) return 'yuval';
  return null;
}

function stripOwnerPrefix(body) {
  return (body || '').replace(/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad|ohad|yuval)\s*:\s*/i, '');
}

// Derive a human "source" string per row: where this task came from.
// Auto-tasks → "auto · {trainee}" or "auto · {auto_kind}".
// Manual trainee task → trainee name.
// Performance Center seeded → "Performance Center · {sub}" if tagged.
// General manual → "manual".
function rowSource(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const isCenter = tags.some(t => t === 'gym' || t === 'center' || t.startsWith('gym:') || t.startsWith('center:'));
  if (row.auto_kind) {
    // auto-task — surface the trainee if linked, else the kind.
    if (row.target_label) return `auto · ${row.target_label}`;
    return `auto · ${row.auto_kind.replace(/_/g, ' ')}`;
  }
  if (isCenter) {
    let sub = null;
    for (const t of tags) {
      if (t.startsWith('gym:') || t.startsWith('center:')) { sub = (t.split(':')[1] || '').toUpperCase(); break; }
    }
    return sub ? `Performance Center · ${sub}` : 'Performance Center';
  }
  if (row.target_kind === 'trainee' && row.target_label) return row.target_label;
  return 'manual';
}

// Split predicate — auto-tasks (engine-generated) vs manual (delegated).
function isAuto(row) { return !!row.auto_kind; }

// ────────────────────────────────────────────────────────────────────
// Atoms
// ────────────────────────────────────────────────────────────────────

function AssigneeDot({ owner }) {
  if (owner === 'shared') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        background: `linear-gradient(135deg, ${C.ac} 0% 50%, ${YUVAL_COLOR} 50% 100%)`,
        color: '#FFFFFF', fontFamily: FN, fontSize: 9, fontWeight: 700, flexShrink: 0,
      }}>·</span>
    );
  }
  const isYuval = owner === 'yuval';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: '50%',
      background: isYuval ? YUVAL_COLOR : C.ac,
      color: '#FFFFFF', fontFamily: FN, fontSize: 9, fontWeight: 700, flexShrink: 0,
    }}>{isYuval ? 'Y' : 'O'}</span>
  );
}

function StatusPill({ status, theme }) {
  const text = status === 'done' ? 'DONE' :
               status === 'working' ? 'WORKING' :
               status === 'stuck' ? 'STUCK' : null;
  if (!text) return null; // 'open' has no pill — being in the open list IS the signal
  const c = statusColors(status, theme);
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

// Sort bar — exact pattern from TraineesView. Bordered strip, SORT
// label, then inline mode pills, then a direction-toggle pill.
const SORT_MODES = [
  { id: 'date',   label: 'Due' },
  { id: 'newest', label: 'Newest' },
  { id: 'status', label: 'Status' },
  { id: 'name',   label: 'A→Z' },
];

function SortBar({ sortBy, sortDir, onSortBy, onToggleDir, search, onSearch }) {
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

// ────────────────────────────────────────────────────────────────────
// Row + expanded detail
// ────────────────────────────────────────────────────────────────────

function googleCalendarUrl(row, displayBody) {
  const due = new Date(row.created_at);
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, '0');
  const d = String(due.getDate()).padStart(2, '0');
  const start = `${y}${m}${d}T090000`;
  const end = `${y}${m}${d}T100000`;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const tagLine = tags.length ? `\n\nTags: ${tags.map(t => '#' + t).join(' ')}` : '';
  const description = `From EXPO Tasks — ${row.id}${tagLine}\n\nhttps://expo-app.co.il/coach/tasks?ui=v3`;
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
  const source = rowSource(row);

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
        display: 'flex', flexDirection: 'column', gap: 3,
        direction: heb ? 'rtl' : 'ltr',
      }}>
        <div style={{
          fontFamily: heb ? FH : FB,
          fontSize: heb ? 15 : 13,
          fontWeight: 500,
          color: 'var(--c-tx)',
          textAlign: heb ? 'right' : 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: expanded ? 'normal' : 'nowrap',
        }}>{displayBody}</div>
        <div style={{
          fontFamily: FN, fontSize: 10, fontWeight: 600,
          color: 'var(--c-td)', letterSpacing: '0.04em',
          textAlign: heb ? 'right' : 'left',
          textTransform: 'lowercase',
        }}>from {source}</div>
      </div>
      <StatusPill status={row.status} theme={theme} />
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
        <a href={calUrl} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', color: 'var(--c-ac)',
            border: '1px solid var(--c-ac)',
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', padding: '5px 12px',
            textDecoration: 'none', borderRadius: 0,
            textTransform: 'uppercase',
          }}>📅 Open in Google Calendar</a>
        <span style={{ fontSize: 10, color: 'var(--c-td)', fontFamily: FN, letterSpacing: '0.04em' }}>
          one-click handoff · full OAuth sync in Phase 5
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sort + filter logic
// ────────────────────────────────────────────────────────────────────

const STATUS_RANK = { stuck: 0, working: 1, open: 2, done: 3 };
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
// Main view
// ────────────────────────────────────────────────────────────────────

export default function TasksV3View() {
  const { rows, loading } = useCoachNotes({ limit: 200 });
  const [owner, setOwner] = useState('ohad');
  const [expanded, setExpanded] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [showAlerts, setShowAlerts] = useState(false);
  const now = useMemo(() => new Date(), []);
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'dark';

  const decorated = useMemo(() => rows.map(r => {
    const o = ownerFromBody(r.body) || 'ohad';
    return { ...r, _owner: o, _display: stripOwnerPrefix(r.body) };
  }), [rows]);

  const counts = useMemo(() => ({
    ohad:   decorated.filter(r => r._owner === 'ohad').length,
    yuval:  decorated.filter(r => r._owner === 'yuval').length,
    shared: decorated.filter(r => r._owner === 'shared').length,
  }), [decorated]);

  // Filter to owner + open, then split into plate (manual) vs alerts (auto).
  const { plate, alerts } = useMemo(() => {
    let base = decorated.filter(r => r._owner === owner && r.status !== 'done');
    const q = search.trim().toLowerCase();
    if (q) base = base.filter(r => (r._display || r.body || '').toLowerCase().includes(q));
    const sorted = applySort(base, sortBy, sortDir);
    return {
      plate:  sorted.filter(r => !isAuto(r)),
      alerts: sorted.filter(r =>  isAuto(r)),
    };
  }, [decorated, owner, search, sortBy, sortDir]);

  const done = useMemo(
    () => decorated.filter(r => r._owner === owner && r.status === 'done'),
    [decorated, owner]
  );

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
          onClick={() => window.alert('Inline composer ships in Phase 1. Use legacy /coach/tasks for now.')}
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

      <div style={{ padding: '0 14px' }}>
        <SortBar
          sortBy={sortBy} sortDir={sortDir}
          onSortBy={setSortBy}
          onToggleDir={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          search={search} onSearch={setSearch}
        />
      </div>

      {/* YOUR PLATE — real delegated work */}
      <div style={{
        border: `1px solid var(--c-cardBd)`,
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
        borderRadius: 0, marginBottom: 14,
      }}>
        <div style={{
          padding: '10px 14px',
          background: 'var(--c-sf2, transparent)',
          borderBottom: `1px solid var(--c-cardBd)`,
          fontFamily: FN, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.18em', color: 'var(--c-tx)',
          textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Your plate</span>
          <span style={{ fontSize: 10, color: 'var(--c-td)' }}>{plate.length}</span>
        </div>
        {plate.length === 0 && (
          <div style={{
            padding: '28px 14px', textAlign: 'center',
            fontFamily: FN, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.12em', color: 'var(--c-td)',
            textTransform: 'uppercase',
          }}>{search ? 'No matches' : 'All clear'}</div>
        )}
        {plate.map(row => (
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
      </div>

      {/* ALERTS — auto-generated. Collapsed by default. */}
      {alerts.length > 0 && (
        <div style={{
          border: `1px solid var(--c-cardBd)`,
          background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
          borderRadius: 0, marginBottom: 14,
        }}>
          <div
            onClick={() => setShowAlerts(s => !s)}
            style={{
              padding: '10px 14px',
              background: 'var(--c-sf2, transparent)',
              borderBottom: showAlerts ? `1px solid var(--c-cardBd)` : 'none',
              fontFamily: FN, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.18em', color: 'var(--c-tx)',
              textTransform: 'uppercase', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
            <span>{showAlerts ? '▾' : '▸'} Alerts</span>
            <span style={{ fontSize: 10, color: 'var(--c-td)' }}>{alerts.length} · auto-generated</span>
          </div>
          {showAlerts && alerts.map(row => (
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
        </div>
      )}

      {done.length > 0 && (
        <div style={{
          padding: '10px 14px',
          border: `1px solid var(--c-cardBd)`,
          background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
          fontFamily: FN, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.18em', color: 'var(--c-td)',
          textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Done · {done.length}</span>
          <span style={{ opacity: 0.6 }}>collapsed ▾</span>
        </div>
      )}

      <div style={{
        marginTop: 18, padding: '10px 14px',
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', color: 'var(--c-td)',
        textTransform: 'uppercase',
      }}>
        v3 prototype · sort bar + source line + plate/alerts split · v2 still at ?ui=v2
      </div>
    </div>
  );
}
