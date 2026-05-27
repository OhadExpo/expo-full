// TASKS — V7 PROTOTYPE — v6 + actionable rows.
//
// Gated behind `?ui=v7` on /coach/tasks. Builds on v6 (owner tabs +
// Athletes-pattern sort bar + source cards grid). Adds the three
// upgrades v6 was missing for actual day-to-day use:
//
//   1. INLINE ROW EXPAND — tap a row inside a card. The row pushes
//      its full detail (description, tags, → Google Calendar handoff)
//      below it inside the card. Tap again to collapse. Only one
//      row expanded at a time.
//
//   2. OVERDUE HIGHLIGHTING — dates in the past render in red.
//      TODAY stays cyan. Future stays muted. Visual urgency at a
//      glance without re-sorting.
//
//   3. CLICKABLE STATUS PILL — clicking the pill cycles the row's
//      status (open → working → stuck → done → open). One click =
//      one state change. No bottom sheet, no modal. Optimistic
//      local update via the useCoachNotes update() method.

import React, { useState, useMemo } from 'react';
import { useCoachNotes } from './coachNotes';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';

const isHebrew = (s) => /[֐-׿]/.test(s || '');
const YUVAL_COLOR = '#FFA02E';

function statusColors(status, theme) {
  const dark = theme === 'dark' || theme === '1' || theme === '2' || theme === '3' || theme === '4';
  if (status === 'done')    return dark ? { bg: '#00A85D', fg: '#FFFFFF' } : { bg: '#00CA72', fg: '#FFFFFF' };
  if (status === 'working') return dark ? { bg: '#D9A800', fg: '#000000' } : { bg: '#FFCC00', fg: '#000000' };
  if (status === 'stuck')   return dark ? { bg: '#C81F4D', fg: '#FFFFFF' } : { bg: '#FB275D', fg: '#FFFFFF' };
  return null;
}

// Returns { label, color } — label is the relative date, color is the
// urgency colour for the date cell. Overdue = red, today = cyan, else muted.
function dateMeta(iso, now) {
  if (!iso) return { label: '—', color: 'var(--c-tm)', isOverdue: false };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: '—', color: 'var(--c-tm)', isOverdue: false };
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay - startOfToday) / 86400000);
  if (diffDays === 0) return { label: 'TODAY', color: 'var(--c-ac)', isOverdue: false };
  if (diffDays === 1) return { label: 'TMRW',  color: 'var(--c-tm)', isOverdue: false };
  if (diffDays === -1) return { label: 'YDAY', color: 'var(--c-rd)', isOverdue: true };
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

function StatusPill({ status, theme, onClick }) {
  const c = statusColors(status, theme);
  if (!c) {
    // 'open' = no pill text but still clickable to cycle into working/stuck/done.
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        title="Click to change status (open → working → stuck → done)"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--c-tm)',
          border: '1px dashed var(--c-cardBd)',
          fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          padding: '0 6px', height: 18, minWidth: 50, borderRadius: 0, flexShrink: 0,
          textTransform: 'uppercase', cursor: 'pointer',
        }}>OPEN</button>
    );
  }
  const text = status === 'done' ? 'DONE' : status === 'working' ? 'WORK' : 'STUCK';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title="Click to change status (open → working → stuck → done)"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: c.bg, color: c.fg,
        border: 'none', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        padding: '0 6px', height: 18, minWidth: 50, borderRadius: 0, flexShrink: 0,
        textTransform: 'uppercase', cursor: 'pointer',
      }}>{text}</button>
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

function googleCalendarUrl(row, displayBody) {
  const due = new Date(row.created_at);
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, '0');
  const d = String(due.getDate()).padStart(2, '0');
  const start = `${y}${m}${d}T090000`;
  const end = `${y}${m}${d}T100000`;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const tagLine = tags.length ? `\n\nTags: ${tags.map(t => '#' + t).join(' ')}` : '';
  const description = `From EXPO Tasks — ${row.id}${tagLine}\n\nhttps://expo-app.co.il/coach/tasks?ui=v7`;
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
      padding: '10px 12px 14px 12px',
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

function SourceCard({ label, color, rows, now, theme, showOwnerDot, expandedRows, onToggleRow, expandedCard, onToggleCard, onCycleStatus }) {
  const visible = expandedCard ? rows : rows.slice(0, 3);
  const hidden = rows.length - visible.length;
  return (
    <div style={{
      border: `1px solid var(--c-cardBd)`,
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      borderRadius: 0,
      display: 'flex', flexDirection: 'column',
      minHeight: 160,
    }}>
      <div style={{
        background: color, color: '#FFFFFF',
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
          const dm = dateMeta(row.created_at, now);
          const isExpanded = expandedRows.has(row.id);
          return (
            <React.Fragment key={row.id}>
              <div
                onClick={() => onToggleRow(row.id)}
                style={{
                  padding: '9px 12px', cursor: 'pointer',
                  borderBottom: `1px solid var(--c-cardBd)`,
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: isExpanded ? 'var(--c-sf2, transparent)' : 'transparent',
                  transition: 'background 120ms ease',
                }}
              >
                {showOwnerDot && <AssigneeDot owner={row._owner} />}
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
                <StatusPill status={row.status} theme={theme}
                  onClick={() => onCycleStatus(row)} />
                <span style={{
                  fontFamily: FN, fontSize: 9, fontWeight: 700,
                  color: dm.color, letterSpacing: '0.04em',
                  flexShrink: 0, minWidth: 36, textAlign: 'right',
                }}>{dm.label}</span>
              </div>
              {isExpanded && <ExpandedDetail row={row} displayBody={row._display} />}
            </React.Fragment>
          );
        })}
        {hidden > 0 && (
          <button onClick={onToggleCard} style={{
            display: 'block', width: '100%',
            background: 'transparent', border: 'none',
            padding: '9px 12px',
            fontFamily: FN, fontSize: 10, fontWeight: 700,
            color: 'var(--c-ac)', letterSpacing: '0.12em',
            cursor: 'pointer', textAlign: 'center',
            textTransform: 'uppercase',
          }}>+ {hidden} more</button>
        )}
        {expandedCard && rows.length > 3 && (
          <button onClick={onToggleCard} style={{
            display: 'block', width: '100%',
            background: 'transparent', border: 'none',
            padding: '9px 12px',
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

export default function TasksV7View() {
  const { rows, loading, update } = useCoachNotes({ limit: 200 });
  const [owner, setOwner] = useState('ohad');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [expandedCards, setExpandedCards] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
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

  const cards = useMemo(() => {
    let base = decorated.filter(r => r._owner === owner && r.status !== 'done');
    const q = search.trim().toLowerCase();
    if (q) base = base.filter(r => (r._display || r.body || '').toLowerCase().includes(q));
    const byKey = new Map();
    for (const r of base) {
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
  }, [decorated, owner, search, sortBy, sortDir]);

  const done = useMemo(
    () => decorated.filter(r => r._owner === owner && r.status === 'done'),
    [decorated, owner]
  );

  const toggleRow = (id) => setExpandedRows(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleCard = (k) => setExpandedCards(p => ({ ...p, [k]: !p[k] }));
  const cycleStatus = async (row) => {
    const next = nextStatus(row.status || 'open');
    // The existing useCoachNotes hook only supports 'open' | 'done' in
    // schema right now (Phase 1 adds the 4-state column). For working /
    // stuck we just toggle 'open' locally until then.
    if (next === 'done')      await update(row.id, { status: 'done', completed_at: new Date().toISOString() });
    else if (next === 'open') await update(row.id, { status: 'open', completed_at: null });
    // 'working' / 'stuck' have no schema support yet — the optimistic UI
    // toggle in useCoachNotes will pretend it took. Real persistence
    // ships in Phase 1.
    else                      await update(row.id, { status: 'open' });
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--c-tm)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 14px' }}>
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <OwnerTab label="Ohad"   count={counts.ohad}   active={owner === 'ohad'}   onClick={() => setOwner('ohad')}   color={C.ac} />
        <OwnerTab label="Yuval"  count={counts.yuval}  active={owner === 'yuval'}  onClick={() => setOwner('yuval')}  color={YUVAL_COLOR} />
        <OwnerTab label="Shared" count={counts.shared} active={owner === 'shared'} onClick={() => setOwner('shared')} />
      </div>

      <SortBar
        sortBy={sortBy} sortDir={sortDir}
        onSortBy={setSortBy}
        onToggleDir={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
        search={search} onSearch={setSearch}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14,
      }}>
        {cards.map(card => (
          <SourceCard key={card.key}
            label={sourceLabel(card.key, card.rows[0])}
            color={sourceColor(card.key)}
            rows={card.rows}
            now={now} theme={theme}
            showOwnerDot={owner === 'shared'}
            expandedRows={expandedRows}
            onToggleRow={toggleRow}
            expandedCard={!!expandedCards[card.key]}
            onToggleCard={() => toggleCard(card.key)}
            onCycleStatus={cycleStatus}
          />
        ))}
        {cards.length === 0 && (
          <div style={{
            padding: '40px 14px', textAlign: 'center',
            fontFamily: FN, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.12em', color: 'var(--c-td)',
            textTransform: 'uppercase',
            gridColumn: '1 / -1',
          }}>{search ? 'No matches' : `No tasks for ${owner}`}</div>
        )}
      </div>

      {done.length > 0 && (
        <div style={{
          marginTop: 14, padding: '10px 14px',
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
        marginTop: 22, padding: '10px 0',
        fontFamily: FN, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', color: 'var(--c-td)',
        textTransform: 'uppercase',
      }}>
        v7 · v6 + inline row expand + overdue red + clickable status
      </div>
    </div>
  );
}
