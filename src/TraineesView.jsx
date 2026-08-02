import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import { C, FN, FB, uid, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES } from './theme';
import { Btn, Input, Select, TextArea, Badge, Card, Modal, ConfirmDialog, EmptyState, EmailsInput, baseInput, isRefined5b, useEscClose, toast } from './ui';
import { emailsToArr, emailsToStore, subMemberId, traineeIdsFor } from './traineeUtils';
import { WhatsAppCheckInButton } from './whatsappButton';

// Clickable status pill for the athlete cards — same control as the trainee
// page (Ohad: "click card status to change it"). stopPropagation everywhere so
// using the menu never triggers the card's onClick (which opens the trainee).
const SM_COLOR = { Active: C.gn, 'On Hold': C.or, Inactive: C.td, Trial: C.ac, Archived: C.rd };
const SM_CHOICES = ['Active', 'On Hold', 'Inactive', 'Trial'];
function CardStatusMenu({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const color = SM_COLOR[status] || C.tm;
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} title="Change status"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, minWidth: 92, height: 26, boxSizing: 'border-box', background: isRefined5b() ? '#FFFFFF' : 'transparent', border: `1px solid ${color}`, color, borderRadius: 0, padding: '0 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {/* center the label+caret as a unit; cancel the trailing letter-space
            after the last glyph so the group is optically centred, not shifted
            left by ~1px (space-between used to pin the label left / caret right,
            which read as mis-aligned in the box). */}
        <span style={{ marginRight: '-0.12em' }}>{status}</span><span style={{ fontSize: 8, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 200, background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, minWidth: 124, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          {SM_CHOICES.map(s => (
            <button key={s} onClick={e => { e.stopPropagation(); onChange(s); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', background: s === status ? 'var(--c-sf)' : 'transparent', border: 'none', borderLeft: `3px solid ${s === status ? (SM_COLOR[s] || C.ac) : 'transparent'}`, color: SM_COLOR[s] || C.tx, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
import { supabase } from './supabase';

const isCouple = (t) => t.members && t.members.length === 2;

// Trainee-card email cell. 1–2 emails render inline as today. 3+ collapses
// to "first, second  +N" with a click-to-expand toggle so the card stays a
// single neat line for the common case. Click stops propagation so toggling
// doesn't also open the trainee detail view.
function EmailsCell({ email, style }) {
  const arr = emailsToArr(email).filter(Boolean);
  const [expanded, setExpanded] = useState(false);
  if (arr.length === 0) return null;
  if (arr.length <= 2) {
    return <div style={{ ...style, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{arr.join(', ')}</div>;
  }
  const visible = expanded ? arr : arr.slice(0, 2);
  return (
    <div style={{
      ...style,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      flexWrap: expanded ? 'wrap' : 'nowrap',
    }}>
      <span style={expanded
        ? { wordBreak: 'break-all', lineHeight: 1 }
        : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, lineHeight: 1 }
      }>{visible.join(', ')}</span>
      <span
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        style={{ color: C.ac, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1, minWidth: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {expanded ? 'LESS' : `+${arr.length - 2}`}
      </span>
    </div>
  );
}

const ONLINE_THRESHOLD = 2 * 60 * 1000; // 2 minutes
const isOnline = (tid, presence) => {
  if (!presence || !presence[tid]) return false;
  return (Date.now() - presence[tid]) < ONLINE_THRESHOLD;
};

// Heebo (the Hebrew font) has a smaller x-height than the English fonts we
// use (Nord/JetBrains Mono). At the same nominal font-size Hebrew letterforms
// render visibly shorter than Latin. Bumping the Hebrew label by +3px so the
// two languages have the same visual cap-height side-by-side.
const HE_BUMP_PX = 3;
const hasHebrew = (s) => /[֐-׿]/.test(String(s || ''));
const hebSize = (base) => base + (HE_BUMP_PX);

// Roll the trainee's (and their sub-member rows for couples) payment ledger
// into a single status pill: PAID / OVERDUE / NEVER PAID / NO PLAN. Mirrors
// DashboardView's overdue logic so the card and the dashboard never disagree.
const OVERDUE_DAYS = 30;
const getPaymentStatus = (t, payments) => {
  const monthly = parseFloat(t.monthly) || 0;
  if (monthly <= 0) return null; // not a recurring-billing client — don't show
  const ids = new Set(traineeIdsFor(t.id));
  const tPay = (payments || []).filter(p => ids.has(p.traineeId) && p.status === 'Paid');
  const latest = tPay.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const fallback = t.lastPayment ? new Date(t.lastPayment) : null;
  const latestDate = latest ? new Date(latest.date) : (fallback && !isNaN(fallback.getTime()) ? fallback : null);
  if (!latestDate) return { label: 'NEVER PAID', color: C.rd, sub: null };
  const days = Math.floor((Date.now() - latestDate.getTime()) / 86400000);
  if (days >= OVERDUE_DAYS) return { label: `OVERDUE · ${days}D`, color: C.rd, sub: fmtPrettyDate(latestDate) };
  return { label: `PAID · ${days}D AGO`, color: C.gn, sub: fmtPrettyDate(latestDate) };
};

// Last workout label for the card: pulls from BOTH coach-logged workouts and
// portal-logged client_workouts so a trainee who only trains via portal
// (Amit) still surfaces activity. Returns null when the trainee has no logs.
// Latest workout timestamp (ms since epoch) used by the sort comparator.
// Returns 0 when the trainee has never trained so they pool at the
// "least recent" end with stable ordering.
const getLastWorkoutMs = (t, workouts, clientWorkouts) => {
  const ids = new Set(traineeIdsFor(t.id));
  const all = [
    ...(workouts || []).filter(w => ids.has(w.traineeId) && w.status === 'completed'),
    ...(clientWorkouts || []).filter(w => ids.has(w.clientId)),
  ];
  let max = 0;
  for (const w of all) {
    const ts = new Date(w.date).getTime();
    if (Number.isFinite(ts) && ts > max) max = ts;
  }
  return max;
};

// Payment severity scalar for sorting:
//   3 = NEVER PAID          (red — needs to pay)
//   2 = OVERDUE              (red)
//   1 = PAID but billed      (green — sort below the urgent ones)
//   0 = not billable / no monthly rate
const paymentSeverity = (t, payments) => {
  const s = getPaymentStatus(t, payments);
  if (!s) return 0;
  if (s.label === 'NEVER PAID') return 3;
  if (s.label.startsWith('OVERDUE')) return 2;
  return 1;
};

const getLastWorkoutLabel = (t, workouts, clientWorkouts) => {
  const ms = getLastWorkoutMs(t, workouts, clientWorkouts);
  if (!ms) return null;
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  return `${days}D AGO`;
};

// Tiny BW sparkline for the trainee card. Plots up to the last 8 bw_log
// entries oldest→newest. Returns null when fewer than 2 points exist
// (a single dot has no shape).
function CardBWSparkline({ entries }) {
  if (!entries || entries.length < 2) return null;
  const W = 96, H = 22, PAD = 2;
  const values = entries.map(e => e.bw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;
  const span = (max - min) || 1;
  const xStep = (W - PAD * 2) / (entries.length - 1);
  const polyline = entries.map((e, i) => {
    const x = PAD + i * xStep;
    // A flat line (no change) is drawn through the MIDDLE of the box so it
    // lines up with the kg text's vertical center — otherwise the span
    // fallback parked it at the bottom edge, sitting below the text.
    const y = flat ? H / 2 : PAD + (1 - (e.bw - min) / span) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = entries[entries.length - 1].bw;
  const first = entries[0].bw;
  const delta = last - first;
  const deltaColor = delta < 0 ? C.gn : delta > 0 ? C.or : C.tm;
  // Layout: kg + delta hold their natural widths; the sparkline svg fills
  // the leftover space and shrinks (preserveAspectRatio=none) when the
  // parent column is too narrow — needed for couple-member columns.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', height: H, width: '100%', maxWidth: W, minWidth: 32, flexShrink: 1 }}
        aria-label="Bodyweight trend">
        <polyline points={polyline} fill="none" stroke={C.ac} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.tx, flexShrink: 0 }}>
        {last.toFixed(1)}<span style={{ color: C.tm }}>kg</span>
      </span>
      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: deltaColor, flexShrink: 0 }}>
        {delta > 0 ? '+' : ''}{delta.toFixed(1)}
      </span>
    </div>
  );
}

// Card layout: 4 labeled blocks — IDENTITY / TRAINING / BODYWEIGHT / FINANCIALS.
// Each block answers one scan question, separated by a hairline so the eye
// anchors on labels rather than parsing a single dense row.
const MidDot = () => <span style={{ color: C.tm, opacity: 0.5, fontSize: 11 }}>·</span>;

function CardSection({ label, children, center = false }) {
  return (
    <div style={{ marginTop: 18, paddingTop: 0 }}>
      <div style={{
        // Card subtitles use the theme-aware cyan-text token: bright brand cyan
        // (#39BDFF) in dark, deeper cyan (#08668F) on the white card in light —
        // the same token every cyan-on-white text now routes through.
        fontFamily: FN, fontSize: 9, color: C.acText, letterSpacing: 1.5, fontWeight: 700,
        textTransform: 'uppercase', marginBottom: 6,
        textAlign: center ? 'center' : 'left',
      }}>{label}</div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center',
        justifyContent: center ? 'center' : 'flex-start',
      }}>{children}</div>
    </div>
  );
}

function TrainingBlock({ format, sessionsRemaining, programs, lastWk, center = false }) {
  // Two fixed rows so card structure is uniform regardless of text length:
  //   row 1 — FORMAT · SESSIONS LEFT
  //   row 2 — N PROGRAMS
  //   row 3 (optional) — LAST WORKOUT · ...
  // Programs always starts on its own row even when there's space on row 1,
  // so neighbouring cards line up vertically.
  const justify = center ? 'center' : 'flex-start';
  const hasSessions = sessionsRemaining != null && sessionsRemaining > 0;
  if (!format && !hasSessions && !(programs > 0) && !lastWk) return null;
  return (
    <CardSection label="Training" center={center}>
      {/* Reserve 3 rows so the section is the same height on every card —
          keeps the Bodyweight divider + graph below it aligned across the
          grid regardless of which optional rows a given athlete has. */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 50 }}>
        {/* Row 1: format stands alone (e.g. GYM, SINGLE). Row 2: sessions-left
            + programs share one row. */}
        {format && (
          <div style={{ display: 'flex', justifyContent: justify }}>
            <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' }}>{format}</span>
          </div>
        )}
        {(hasSessions || programs > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', justifyContent: justify }}>
            {hasSessions && (
              <span style={{ fontFamily: FN, fontSize: 11, color: sessionsRemaining <= 2 ? C.rd : C.gn, fontWeight: 700 }}>{sessionsRemaining} SESSIONS LEFT</span>
            )}
            {hasSessions && programs > 0 && <MidDot />}
            {programs > 0 && (
              <span style={{ fontFamily: FN, fontSize: 11, color: C.tx, fontWeight: 700 }}>{programs} PROGRAMS</span>
            )}
          </div>
        )}
        {lastWk && (
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1, fontWeight: 600, textAlign: center ? 'center' : 'left' }}>
            LAST WORKOUT · {lastWk}
          </div>
        )}
      </div>
    </CardSection>
  );
}

function FinancialsBlock({ pay, monthly, center = false }) {
  // Always render the block — even when there's no pay history and no
  // monthly rate — so cards line up section-for-section. Empty state shows
  // a dim "NOT BILLABLE" so the slot is still visible.
  const items = [];
  if (pay) items.push(
    <span key="pay" style={{ fontFamily: FN, fontSize: 11, color: pay.color, fontWeight: 700, letterSpacing: 1 }}>{pay.label}</span>
  );
  if (monthly > 0) items.push(
    <span key="mo" style={{ fontFamily: FN, fontSize: 11, color: C.tx, fontWeight: 700, letterSpacing: 1 }}>₪{monthly}/MO</span>
  );
  if (items.length === 0) {
    return (
      <CardSection label="Financials" center={center}>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, letterSpacing: 1, opacity: 0.55 }}>NOT BILLABLE</span>
      </CardSection>
    );
  }
  const interleaved = items.flatMap((n, i) => i === 0 ? [n] : [<MidDot key={`d${i}`} />, n]);
  return <CardSection label="Financials" center={center}>{interleaved}</CardSection>;
}

// Always render a BW block — even if no entries yet — so cards have a
// uniform 4-section rhythm. Empty state shows a dim flatline + "NO LOGS
// YET" so the coach knows the slot exists but hasn't been used.
function BodyweightBlock({ entries, center = false, label = null }) {
  const hasData = entries && entries.length >= 2;
  const W = 96, H = 22;
  return (
    <CardSection label="Bodyweight" center={center}>
      <div style={{ width: '100%', display: 'flex', justifyContent: center ? 'center' : 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {label && (
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 1, fontWeight: 700, textAlign: center ? 'center' : 'left' }}>{label}</div>
          )}
          {hasData ? (
            <CardBWSparkline entries={entries} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, opacity: 0.55 }}>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                style={{ display: 'block', height: H, width: '100%', maxWidth: W, minWidth: 32, flexShrink: 1 }}
                aria-label="Bodyweight trend (no data)">
                <line x1="2" y1={H/2} x2={W-2} y2={H/2} stroke={C.tm} strokeWidth="1" strokeDasharray="2 3" />
              </svg>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.tm, flexShrink: 0 }}>
                NO LOGS YET
              </span>
            </div>
          )}
        </div>
      </div>
    </CardSection>
  );
}

const getBwEntries = (t, bwLog) => {
  const ids = new Set(traineeIdsFor(t.id));
  return (bwLog || [])
    .filter(b => ids.has(b.clientId) && Number.isFinite(parseFloat(b.bw)))
    .map(b => ({ ...b, bw: parseFloat(b.bw) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-8);
};
const OnlineDot = () => (
  <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:C.gn,boxShadow:`0 0 6px ${C.gn}`,flexShrink:0}} />
);

// Get plan counts per member for couples: parent ID plans count for both
// (shared assignment), sub-ID plans count for that member only. Returns
// per-member totals — the shared count is added to BOTH members on
// purpose because a plan assigned to the parent ID is visible to both.
const getMemberPlanCounts = (t, planCounts) => {
  if (!isCouple(t)) return [planCounts?.[t.id] || 0];
  const sub0 = planCounts?.[subMemberId(t.id, 0)] || 0;
  const sub1 = planCounts?.[subMemberId(t.id, 1)] || 0;
  // planCounts[parent] is ROLLED UP in App.jsx (parent-own + sub0 + sub1), so the
  // shared (parent-ID) plans = that total minus each member's own. Adding the raw
  // rolled-up value back onto each sub double-counted every member's plans.
  const shared = Math.max(0, (planCounts?.[t.id] || 0) - sub0 - sub1);
  return [shared + sub0, shared + sub1];
};

const defaultTrainee = () => ({
  id: uid(), name: "", email: "", phone: "", age: "", weight: "", height: "",
  injuries: "", goals: "", format: "In-Person Private", status: "Active",
  package: "8 Sessions", sessionsRemaining: 8, startDate: new Date().toISOString().slice(0,10),
  notes: "", packagePrice: "",
});

// Sort preferences persist across sessions so a coach who prefers
// "payment desc + Hebrew first" doesn't reset every time.
const SORT_KEY = 'expo-athletes-sort-v1';
const loadSortPrefs = () => {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && typeof j === 'object') return j;
  } catch {}
  return null;
};
const saveSortPrefs = (prefs) => {
  try { localStorage.setItem(SORT_KEY, JSON.stringify(prefs)); } catch {}
};

// Left-rail section label — small uppercase FN, matches the app's control vocab.
function RailLabel({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: C.td, textTransform: 'uppercase' }}>{children}</div>
      {right}
    </div>
  );
}
// Full-width option pill with a right-aligned muted count. active = accent
// border + tint + accent text; inactive = cardBd border + muted text.
function RailOption({ label, count, active, onClick, accent = C.ac, tint = 'rgba(57,189,255,0.094)', title }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box',
      minHeight: 30, height: 30, padding: '0 10px', borderRadius: 0, cursor: 'pointer',
      border: `1px solid ${active ? accent : C.cardBd}`, background: active ? tint : 'transparent',
      color: active ? accent : C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}</span>
      {count != null && <span style={{ fontSize: 10, marginLeft: 8, flexShrink: 0, color: active ? accent : C.td, opacity: active ? 0.85 : 0.7 }}>{count}</span>}
    </button>
  );
}

export default function TraineesView({ trainees, setTrainees, planCounts, payments, workouts, clientWorkouts, bwLog, portalVis, presence, onSelect, onPreview }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultTrainee());
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  // Roster segmentation state. STATUS is single-select (default All); the
  // "Archived" value is what drives the old showArchived-based card styling &
  // drag-guard, derived below. FORMAT is single-select. attnFlags are the
  // multi-toggle "needs attention" alert filters (AND-combined).
  const [statusFilter, setStatusFilter] = useState('All');
  const [formatFilter, setFormatFilter] = useState('All');
  const [attnFlags, setAttnFlags] = useState({ pay: false, dormant: false, lowSessions: false, noProgram: false });
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [purgeHistory, setPurgeHistory] = useState(false);
  const [purging, setPurging] = useState(false);
  // Escape-to-close for the hand-rolled permanent-delete confirm overlay.
  useEscClose(!!deleteConfirm, () => {setDeleteConfirm(null);setDeleteTyped("")});
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);
  // Sort state — initialized from localStorage so the coach's last choice
  // sticks across sessions. Defaults: by NAME, ascending, Hebrew first
  // (matches Ohad's mostly-Hebrew roster).
  // Multi-key sort: NAME + STATUS (and the rest) can be active at the SAME time
  // (Ohad), applied in click-priority order, each with its own direction.
  // Migrates from the old single sortBy/sortDir shape.
  const _initialSort = loadSortPrefs() || {};
  const [sortKeys, setSortKeys] = useState(
    Array.isArray(_initialSort.sortKeys) && _initialSort.sortKeys.length ? _initialSort.sortKeys
      : (_initialSort.sortBy ? [_initialSort.sortBy] : ['name'])
  );
  const [sortDirs, setSortDirs] = useState(
    _initialSort.sortDirs && typeof _initialSort.sortDirs === 'object' ? _initialSort.sortDirs
      : (_initialSort.sortBy ? { [_initialSort.sortBy]: _initialSort.sortDir || 'asc' } : { name: 'asc' })
  );
  // Roster is mostly Hebrew → always Hebrew-first. The LANG toggle was
  // removed from the toolbar (Ohad: cleaner/aligned), so this is fixed.
  const [langOrder] = useState('he-first');
  useEffect(() => {
    saveSortPrefs({ sortKeys, sortDirs, langOrder });
  }, [sortKeys, sortDirs, langOrder]);
  // Manual drag order — Ohad drags athlete cards to arrange them (first/second/…).
  // When ON, the grid sorts by this id list; clicking any sort button exits it.
  const [athleteOrder, setAthleteOrder] = useState(() => { try { return JSON.parse(localStorage.getItem('expo-athlete-order') || '[]'); } catch { return []; } });
  const persistOrder = (o) => { setAthleteOrder(o); try { localStorage.setItem('expo-athlete-order', JSON.stringify(o)); } catch { /* noop */ } };
  const [manualSort, setManualSort] = useState(false);
  const draggedAthleteRef = React.useRef(null);
  const [dropOnAthlete, setDropOnAthlete] = useState(null);
  // On a phone the filter rail stacked full-width ON TOP of the athlete cards,
  // so you scrolled through the whole Search / Status / Format / Needs-Attention
  // / Sort panel before reaching a single athlete. Collapse it behind a
  // "FILTERS" toggle on narrow (cards first), mirroring the programs page; on
  // desktop the rail stays a 210px sticky side column, fully open. (Ohad 2026-08 mobile pass)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 760);
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(()=>{
    if(!addMenuOpen) return;
    const close = (e)=>{ if(addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false); };
    document.addEventListener('mousedown',close);
    return ()=>document.removeEventListener('mousedown',close);
  },[addMenuOpen]);         // step 3: type name to confirm

  const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac, Archived: C.rd };
  const active = trainees.filter(t => t.status !== "Archived");
  const archived = trainees.filter(t => t.status === "Archived");
  // Archived is a STATUS value → derive the old showArchived flag from it so the
  // dashed-card styling, drag-guard and action rows keep working unchanged.
  const showArchived = statusFilter === 'Archived';

  // --- segmentation predicates -------------------------------------------
  const matchesSearch = (t) => {
    const s = search.toLowerCase();
    if (!s) return true;
    const emailStr = Array.isArray(t.email) ? t.email.join(' ') : (t.email || '');
    if ((t.name || '').toLowerCase().includes(s) || emailStr.toLowerCase().includes(s)) return true;
    if (t.members) return t.members.some(m => {
      const memEmail = Array.isArray(m.email) ? m.email.join(' ') : (m.email || '');
      return (m.name || '').toLowerCase().includes(s) || memEmail.toLowerCase().includes(s);
    });
    return false;
  };
  const matchesFormat = (t) => {
    if (formatFilter === 'All') return true;
    if (formatFilter === 'Online') return t.format === 'Online Client';
    if (formatFilter === 'Gym · Single') return t.format === 'Gym, Single';
    if (formatFilter === 'Gym · Couple') return t.format === 'Gym, Couple';
    if (formatFilter === 'Bnei Herzliya') return t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya';
    return true;
  };
  // Alert-flag predicates. Payment due = billable + overdue/never-paid.
  // Dormant = no completed workout in 30+ days (or never). Low sessions =
  // sessionsRemaining set and <= 2.
  const flagPay = (t) => { const s = getPaymentStatus(t, payments); return !!s && (s.label.startsWith('OVERDUE') || s.label === 'NEVER PAID'); };
  const flagDormant = (t) => { const ms = getLastWorkoutMs(t, workouts, clientWorkouts); return !ms || (Date.now() - ms) >= OVERDUE_DAYS * 86400000; };
  const flagLow = (t) => t.sessionsRemaining != null && t.sessionsRemaining <= 2;
  const flagNoProgram = (t) => (planCounts?.[t.id] || 0) === 0;

  // --- base pools + live counts ------------------------------------------
  // Status-scoped pool = the base for FORMAT counts. Non-archived statuses
  // filter the active pool; Archived swaps to the archived pool.
  const statusScoped = showArchived ? archived
    : (statusFilter === 'All' ? active : active.filter(t => t.status === statusFilter));
  const statusCounts = {
    All: active.length,
    Active: active.filter(t => t.status === 'Active').length,
    'On Hold': active.filter(t => t.status === 'On Hold').length,
    Inactive: active.filter(t => t.status === 'Inactive').length,
    Trial: active.filter(t => t.status === 'Trial').length,
    Archived: archived.length,
  };
  const formatCounts = {
    All: statusScoped.length,
    Online: statusScoped.filter(t => t.format === 'Online Client').length,
    'Gym · Single': statusScoped.filter(t => t.format === 'Gym, Single').length,
    'Gym · Couple': statusScoped.filter(t => t.format === 'Gym, Couple').length,
    'Bnei Herzliya': statusScoped.filter(t => t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya').length,
  };
  // Flag counts over the status+format-scoped pool (each flag independent of
  // the others), so a count reflects what turning that one flag on would show.
  const flagPool = statusScoped.filter(matchesFormat);
  const flagCounts = {
    pay: flagPool.filter(flagPay).length,
    dormant: flagPool.filter(flagDormant).length,
    lowSessions: flagPool.filter(flagLow).length,
    noProgram: flagPool.filter(flagNoProgram).length,
  };
  const anyFilterActive = statusFilter !== 'All' || formatFilter !== 'All' || search !== '' || attnFlags.pay || attnFlags.dormant || attnFlags.lowSessions || attnFlags.noProgram;
  const clearFilters = () => { setStatusFilter('All'); setFormatFilter('All'); setSearch(''); setAttnFlags({ pay: false, dormant: false, lowSessions: false, noProgram: false }); };

  const filteredUnsorted = statusScoped.filter(t =>
    matchesSearch(t) && matchesFormat(t)
    && (!attnFlags.pay || flagPay(t))
    && (!attnFlags.dormant || flagDormant(t))
    && (!attnFlags.lowSessions || flagLow(t))
    && (!attnFlags.noProgram || flagNoProgram(t))
  );

  // Sort comparator. Language priority is the primary key (HE block first or
  // EN block first), then the chosen sort dimension within that block.
  // Couples are scored by family name (last token); singles by full name.
  const sortNameKey = (t) => {
    const raw = (t.name || '').trim();
    if (!raw) return '';
    // Family name = last whitespace-delimited token. Lets couples like
    // "נטע ותום רונן" sort under "רונן" alongside other "רונן" families.
    const tokens = raw.split(/\s+/);
    return (tokens[tokens.length - 1] || raw).toLowerCase();
  };
  // Name compare carries the HE/EN language split (HE block before/after EN per
  // langOrder), then locale collation within a block.
  const nameCmp = (a, b) => {
    const aHeb = hasHebrew(a.name), bHeb = hasHebrew(b.name);
    if (aHeb !== bHeb) return langOrder === 'he-first' ? (aHeb ? -1 : 1) : (aHeb ? 1 : -1);
    return sortNameKey(a).localeCompare(sortNameKey(b), aHeb ? 'he' : 'en', { sensitivity: 'base' });
  };
  const STATUS_RANK = { Active: 0, Trial: 1, 'On Hold': 2, Inactive: 3, Archived: 4 };
  const keyCmp = (key, a, b) => {
    if (key === 'status') return (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
    if (key === 'name') return nameCmp(a, b);
    if (key === 'lastTrained') return getLastWorkoutMs(a, workouts, clientWorkouts) - getLastWorkoutMs(b, workouts, clientWorkouts);
    if (key === 'payment') return paymentSeverity(a, payments) - paymentSeverity(b, payments);
    return 0;
  };
  const filtered = [...filteredUnsorted].sort((a, b) => {
    // Manual drag order wins when active (Ohad arranged them by hand).
    if (manualSort) {
      const ia = athleteOrder.indexOf(a.id), ib = athleteOrder.indexOf(b.id);
      const ra = ia < 0 ? Infinity : ia, rb = ib < 0 ? Infinity : ib;
      return ra !== rb ? ra - rb : nameCmp(a, b);
    }
    // Apply each active sort key in priority (click) order; first non-tie wins.
    for (const key of sortKeys) {
      const cmp = keyCmp(key, a, b);
      if (cmp !== 0) return (sortDirs[key] === 'desc' ? -1 : 1) * cmp;
    }
    return nameCmp(a, b);   // stable tie-break
  });
  const reorderAthlete = (targetId) => {
    const d = draggedAthleteRef.current; draggedAthleteRef.current = null; setDropOnAthlete(null);
    if (!d || d === targetId) return;
    const allIds = filtered.map(t => t.id);
    let order = (athleteOrder || []).filter(id => allIds.includes(id));
    for (const id of allIds) if (!order.includes(id)) order.push(id);
    order = order.filter(id => id !== d);
    const ti = order.indexOf(targetId);
    if (ti < 0) order.push(d); else order.splice(ti, 0, d);
    persistOrder(order);
    setManualSort(true);
  };
  const dragProps = (t) => ({
    draggable: !showArchived,
    onDragStart: (e) => { draggedAthleteRef.current = t.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.id); } catch { /* noop */ } },
    onDragEnd: () => { draggedAthleteRef.current = null; setDropOnAthlete(null); },
    onDragOver: (e) => { if (draggedAthleteRef.current && draggedAthleteRef.current !== t.id) { e.preventDefault(); if (dropOnAthlete !== t.id) setDropOnAthlete(t.id); } },
    onDrop: (e) => { e.preventDefault(); reorderAthlete(t.id); },
    dropActive: dropOnAthlete === t.id,
  });

  const handleSave = () => {
    if (!form.name) return;
    const toSave = { ...form, email: emailsToStore(form._emails || emailsToArr(form.email)) };
    delete toSave._emails;
    if (toSave._members) {
      toSave.members = toSave._members.map(m => {
        const email = emailsToStore(m._emails || emailsToArr(m.email));
        const { _emails, ...rest } = m;
        return { ...rest, email };
      });
      delete toSave._members;
    }
    if (editId) setTrainees(prev => prev.map(t => t.id === editId ? toSave : t));
    else setTrainees(prev => [...prev, toSave]);
    setForm(defaultTrainee()); setEditId(null); setShowForm(false);
  };
  const handleArchive = (id) => {
    setTrainees(prev => prev.map(t => t.id === id ? {...t, status: "Archived", archivedAt: new Date().toISOString()} : t));
    setArchiveConfirm(null); setShowForm(false); setEditId(null);
  };
  const handleRestore = (id) => {
    setTrainees(prev => prev.map(t => t.id === id ? {...t, status: "Inactive", archivedAt: undefined} : t));
  };
  const handlePermanentDelete = async (id) => {
    // Optional hard purge of every history table keyed to this trainee id
    // (and couple sub-ids) via the owner-gated SECURITY DEFINER RPC. Runs
    // BEFORE the roster removal so a mid-way failure leaves the row intact.
    if (purgeHistory) {
      setPurging(true);
      const { error } = await supabase.rpc('purge_trainee_data', { p_trainee_id: id });
      setPurging(false);
      if (error) { toast('History purge failed — nothing was deleted: ' + error.message, 'error'); return; }
    }
    setTrainees(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null); setDeleteTyped(""); setPurgeHistory(false);
  };

  return (
    <div>
      {/* Mobile: stack the rail ABOVE the cards (full-width each) — a fixed 210px
          side column crushes the athlete cards off-screen on phones (Ohad). */}
      <style>{`
        @media (max-width: 760px) {
          .athletes-rail { width: 100% !important; position: static !important; top: auto !important; max-height: none !important; overflow: visible !important; }
        }
      `}</style>
      {/* Two-column layout: left filter RAIL + cards (design demo — mirrors the
          Tasks page's left sidebar). Search / SHOW / SORT BY / Add all live in
          the slim persistent left column; the cards grid fills the right. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* LEFT: filter rail — sticky so the controls stay pinned as the (long)
            cards grid scrolls. Fixed 210px; wraps to full-width when the
            viewport can't fit both columns. */}
        <aside className="athletes-rail" style={{
          width: 210, flexShrink: 0, alignSelf: 'flex-start',
          position: 'sticky', top: 12,
          maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 4,
          display: 'flex', flexDirection: 'column', gap: (narrow && !railOpen) ? 0 : 14,
          ...(narrow ? { background: 'var(--c-sf2)', border: `1px solid ${C.cardBd}`, padding: (railOpen ? '12px' : '0'), boxSizing: 'border-box' } : null),
        }}>
          {/* FILTERS toggle — narrow only. Collapses the whole rail so the athlete
              CARDS are front-and-centre; tap to reveal Search / Status / Format /
              Needs-Attention / Sort / +Add. Mirrors the programs-page collapsed rail.
              Desktop skips this and renders the rail open. */}
          {narrow && (
            <div onClick={() => setRailOpen(o => !o)}
              style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', color: C.ac, textTransform: 'uppercase', padding: railOpen ? '0 0 10px' : '11px 12px', borderBottom: railOpen ? `1px solid ${C.cardBd}` : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>Filters</span>
              <span aria-hidden style={{ fontSize: 11, lineHeight: 1, transform: railOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>▾</span>
            </div>
          )}
          {(!narrow || railOpen) && (<>
          {/* SEARCH — full-width in the rail. */}
          <div>
            <input placeholder="Search athletes..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...baseInput, width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', fontSize: 13, border: `1px solid ${C.ac}` }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, minHeight: 14 }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.td }}>{filtered.length} {filtered.length === 1 ? 'ATHLETE' : 'ATHLETES'}</span>
              {anyFilterActive && (
                <button onClick={clearFilters} title="Clear all filters"
                  style={{ background: 'transparent', border: 'none', color: C.tm, cursor: 'pointer', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', padding: 0, whiteSpace: 'nowrap' }}>
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* STATUS — single-select. Archived swaps the pool to the dashed,
              drag-off archived cards (via showArchived derived above). */}
          <div>
            <RailLabel>Status</RailLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['All', 'Active', 'On Hold', 'Inactive', 'Trial', 'Archived'].map(s => (
                <RailOption key={s} label={s} count={statusCounts[s]}
                  active={statusFilter === s} onClick={() => setStatusFilter(s)}
                  accent={s === 'Archived' ? C.rd : C.ac}
                  tint={s === 'Archived' ? 'rgba(255,77,79,0.10)' : 'rgba(57,189,255,0.094)'} />
              ))}
            </div>
          </div>

          {/* FORMAT — single-select. Counts reflect the current status pool. */}
          <div>
            <RailLabel>Format</RailLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['All', 'Online', 'Gym · Single', 'Gym · Couple', 'Bnei Herzliya'].map(f => (
                <RailOption key={f} label={f} count={formatCounts[f]}
                  active={formatFilter === f} onClick={() => setFormatFilter(f)} />
              ))}
            </div>
          </div>

          {/* NEEDS ATTENTION — multi-toggle alert flags (AND-combined). Active
              flags read amber so the rail doubles as a triage list. */}
          <div>
            <RailLabel>Needs Attention</RailLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { key: 'pay', label: '⚠ Payment due' },
                { key: 'dormant', label: '💤 Dormant' },
                { key: 'lowSessions', label: '⏳ Low sessions' },
                { key: 'noProgram', label: '📋 No program' },
              ].map(o => (
                <RailOption key={o.key} label={o.label} count={flagCounts[o.key]}
                  active={attnFlags[o.key]} accent={C.or} tint="rgba(255,159,10,0.12)"
                  onClick={() => setAttnFlags(m => ({ ...m, [o.key]: !m[o.key] }))} />
              ))}
            </div>
          </div>

          {/* SORT BY — kept but compact + clearly secondary (Ohad: sort alone is
              not enough). Same multi-key toggle + per-key direction logic. */}
          <div>
            <RailLabel>Sort</RailLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { id: 'name',        label: 'NAME' },
                { id: 'status',      label: 'STATUS' },
                { id: 'lastTrained', label: 'LAST TRAINED' },
                { id: 'payment',     label: 'PAYMENT' },
              ].map(o => {
                const on = sortKeys.includes(o.id);
                const toggleKey = () => { setManualSort(false); setSortKeys(ks => {
                  if (ks.includes(o.id)) return ks.length > 1 ? ks.filter(k => k !== o.id) : ks;
                  setSortDirs(m => (m[o.id] ? m : { ...m, [o.id]: 'asc' }));
                  return [...ks, o.id];
                }); };
                const desc = sortDirs[o.id] === 'desc';
                const dirLbl = o.id === 'name' ? (desc ? 'ת→א' : 'א→ת')
                  : o.id === 'status' ? (desc ? '↑ INACTIVE' : '↓ ACTIVE')
                  : o.id === 'lastTrained' ? (desc ? '↓ NEWEST' : '↑ OLDEST')
                  : (desc ? '↑ OVERDUE' : '↓ PAID');
                return (
                  <div key={o.id} style={{ display: 'flex', gap: 5, alignItems: 'stretch' }}>
                    <button onClick={toggleKey} style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', flex: 1, minWidth: 0, boxSizing: 'border-box',
                      minHeight: 24, height: 24, padding: '0 9px', borderRadius: 0, cursor: 'pointer',
                      border: `1px solid ${on ? C.ac : C.cardBd}`, background: on ? 'rgba(57,189,255,0.094)' : 'transparent',
                      color: on ? C.ac : C.td, fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{o.label}</button>
                    {on && (
                      <button onClick={() => setSortDirs(m => ({ ...m, [o.id]: desc ? 'asc' : 'desc' }))}
                        title={`Flip ${o.id} direction`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box',
                          minHeight: 24, height: 24, padding: '0 7px', borderRadius: 0, cursor: 'pointer',
                          border: `1px dashed ${C.ac}`, background: 'rgba(57,189,255,0.06)', color: C.ac,
                          ...(o.id === 'name'
                            ? { fontFamily: `Heebo, ${FN}`, fontSize: 11, letterSpacing: 0, lineHeight: 1 }
                            : { fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em' }),
                        }}>
                        {(() => { const mm = /^([↑↓])\s+(.*)$/.exec(dirLbl); if (!mm) return dirLbl; return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                            <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1 }}>{mm[1]}</span>
                            <span>{mm[2]}</span>
                          </span>
                        ); })()}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ADD ATHLETE — pinned to the very bottom of the rail. */}
          <div ref={addMenuRef} style={{position:'relative', marginTop:'auto'}}>
            <Btn onClick={() => setAddMenuOpen(!addMenuOpen)} style={{ width: '100%', boxSizing: 'border-box', padding: '0 14px', height: 38 }}>+ Add Athlete ▾</Btn>
            {addMenuOpen && <div style={{position:'absolute',left:0,right:0,top:'100%',marginTop:4,background:C.bg,border:`1px solid ${C.cardBd}`,borderRadius:0,overflow:'hidden',zIndex:50,boxShadow:'0 8px 24px rgba(0,0,0,0.6)'}}>
              {[['Online Athlete','Online Client'],['Gym, Single','Gym, Single'],['Gym, Couple','Gym, Couple'],['Bnei Herzliya','Bnei Herzliya']].map(([label,format])=>(
                <button key={format} onClick={()=>{
                  const f = {...defaultTrainee(), format};
                  // Use _members (the edit-form shape the modal + handleSave read)
                  // so a NEW couple actually shows the two member field-sets. Setting
                  // `members` here left the modal on the solo layout → unnamed members. (audit)
                  if(format==='Gym, Couple') f._members=[{name:'',email:'',phone:'',age:'',weight:'',height:'',injuries:'',goals:'',notes:'',_emails:['']},{name:'',email:'',phone:'',age:'',weight:'',height:'',injuries:'',goals:'',notes:'',_emails:['']}];
                  setForm(f); setEditId(null); setShowForm(true); setAddMenuOpen(false);
                }} style={{display:'block',width:'100%',padding:'10px 16px',background:'transparent',border:'none',borderBottom:`1px solid ${C.bd}`,color:C.tx,fontFamily:FB,fontSize:13,fontWeight:500,cursor:'pointer',textAlign:'left'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.sf2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {label}
                </button>
              ))}
            </div>}
          </div>
          </>)}
        </aside>

        {/* RIGHT: cards column. */}
        <div style={{ flex: 1, minWidth: 0 }}>

      {/* Count moved into the rail (under Search) so the first card top-aligns
          with the search box (Ohad OCD). */}
      {filtered.length === 0 ? <EmptyState icon={showArchived ? "📦" : "👥"} message={showArchived ? "No archived athletes." : "No athletes yet. Add your first one."} /> : (
        // gridAutoRows:1fr equalises EVERY row to the tallest card so all athlete
        // cards are the same height (the action row's marginTop:auto absorbs the
        // slack consistently, keeping internal dividers aligned across the row).
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gridAutoRows: "1fr", gap: 12 }}>
          {filtered.map(t => {
            const couple = isCouple(t);
            const mpc = getMemberPlanCounts(t, planCounts);
            // Extract family name for couple cards (shared surname after ו)
            const familyName = (couple && typeof t.name === 'string') ? (t.name.match(/\s+(\S+)$/)?.[1] || '') : '';

            if (couple) {
              // couple detection is members.length===2; a null member element (or
              // a non-string name above) would throw on m.name/.phone and blank
              // the roster grid. Default to {} so a corrupt member renders empty.
              const m0 = (t.members && t.members[0]) || {};
              const m1 = (t.members && t.members[1]) || {};
              const online = isOnline(t.id, presence);
              const pay = getPaymentStatus(t, payments);
              const lastWk = getLastWorkoutLabel(t, workouts, clientWorkouts);
              // Per-member BW for couples — sub-IDs (parent__0 / __1) so each
              // member's curve is their own, not the household average.
              const bwM0 = (bwLog || [])
                .filter(b => b.clientId === subMemberId(t.id, 0) && Number.isFinite(parseFloat(b.bw)))
                .map(b => ({ ...b, bw: parseFloat(b.bw) }))
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(-8);
              const bwM1 = (bwLog || [])
                .filter(b => b.clientId === subMemberId(t.id, 1) && Number.isFinite(parseFloat(b.bw)))
                .map(b => ({ ...b, bw: parseFloat(b.bw) }))
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(-8);
              // Programs assigned to the parent ID are shared between both
              // members; sub-IDs are per-member. For the shared TRAINING block
              // we report the union (max of the two member counts) so we
              // don't double-count the shared programs.
              const sharedProgramsCount = Math.max(mpc[0] || 0, mpc[1] || 0);
              return (
                <Card key={t.id} {...dragProps(t)} onClick={() => showArchived ? null : onSelect(t.id)}
                  header={<span style={{display:'inline-flex',alignItems:'center',gap:6,fontWeight:700,fontSize: hasHebrew(t.name) ? hebSize(14) : 14,letterSpacing:'0.04em',textTransform:'uppercase'}}>{t.name}{online && <OnlineDot />}{(t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya') && <span title="Bnei Herzliya" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:'50%',background:'#0E1A2B',flexShrink:0}}><img src="/bnei-herzliya-logo-w.png" alt="" style={{height:18,width:'auto',objectFit:'contain'}}/></span>}</span>}
                  headerRight={showArchived ? <Badge color={statusColor[t.status] || C.tm} style={isRefined5b()?{background:'#FFFFFF'}:undefined}>{t.status}</Badge> : <CardStatusMenu status={t.status} onChange={s => setTrainees(prev => prev.map(x => x.id === t.id ? {...x, status: s} : x))} />}
                  style={{height:'100%',display:'flex',flexDirection:'column',boxSizing:'border-box',border:`1px solid ${C.divider}`,borderLeft:`1px solid ${C.divider}`,...(showArchived ? {opacity: 0.7, borderStyle: "dashed"} : {})}}>
                  {/* IDENTITY: name + status badge live in the card header
                      (Card's header + headerRight props). No duplicate body
                      banner — Ohad called the inner repeat useless 2026-05-12. */}
                  {/* FIXED 80px + vertically centered — same as the single-card
                      identity block, so a couple card's first row (name +
                      WhatsApp) and its section dividers line up with single
                      cards across the grid, always. */}
                  <div style={{display:'flex',width:'100%',alignSelf:'stretch',height:80,paddingTop:4,boxSizing:'border-box'}}>
                    {[m0, m1].map((m, mi) => (
                      <React.Fragment key={mi}>
                        {mi === 1 && <div style={{width:1,background:C.bd,margin:'0 12px',alignSelf:'stretch'}} />}
                        <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',gap:4,textAlign:'center',overflow:'hidden'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'center',minHeight:28}}>
                            <div style={{
                              fontWeight:600,fontSize:13,color:C.tx,textAlign:'center',
                              minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                            }}>{m.name || `Member ${mi+1}`}</div>
                            <WhatsAppCheckInButton name={m.name || t.name} phone={m.phone} gender={m.gender} />
                          </div>
                          {m.phone && (
                            <div style={{
                              fontFamily:FN,fontSize:11,color:C.tm,letterSpacing:0.5,textAlign:'center',width:'100%',
                              whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                            }}>{m.phone}</div>
                          )}
                          <EmailsCell email={m.email} style={{ fontSize:12, color:C.tm, textAlign:'center', width:'100%' }} />
                        </div>
                      </React.Fragment>
                    ))}
                  </div>

                  <FinancialsBlock pay={pay} monthly={t.monthly} center />
                  <TrainingBlock format={t.format} sessionsRemaining={t.sessionsRemaining} programs={sharedProgramsCount} lastWk={lastWk} center />

                  {/* BODYWEIGHT — per-member, since each has their own curve.
                      Centered, two mini-blocks under one shared label. */}
                  <CardSection label="Bodyweight" center>
                    {[m0, m1].map((m, mi) => {
                      const memberBw = mi === 0 ? bwM0 : bwM1;
                      const hasData = memberBw.length >= 2;
                      const W = 96, H = 22;
                      const memberLabel = (m.name || `Member ${mi+1}`).split(' ')[0].toUpperCase();
                      return (
                        <div key={mi} style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                          <div style={{fontFamily:FN,fontSize:9,color:C.tm,letterSpacing:1,fontWeight:700}}>{memberLabel}</div>
                          <div style={{width:'100%',maxWidth:160}}>
                            {hasData ? (
                              <CardBWSparkline entries={memberBw} />
                            ) : (
                              <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0,opacity:0.55}}>
                                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                                  style={{display:'block',height:H,width:'100%',maxWidth:W,minWidth:32,flexShrink:1}}
                                  aria-label="Bodyweight trend (no data)">
                                  <line x1="2" y1={H/2} x2={W-2} y2={H/2} stroke={C.tm} strokeWidth="1" strokeDasharray="2 3" />
                                </svg>
                                <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:1,color:C.tm,flexShrink:0}}>
                                  NO LOGS
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardSection>

                  {!showArchived && (
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:'auto',paddingTop:8,gap:8}}>
                      {onPreview ? <button onClick={e => {e.stopPropagation(); onPreview(t.id)}} title="Preview this athlete's portal" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${isRefined5b() ? C.ac : C.cardBd}`,color: isRefined5b() ? C.ac : C.tm,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'0 14px',height:26,boxSizing:'border-box',borderRadius:0,display:'inline-flex',alignItems:'center',gap:6}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>PORTAL</button> : <span/>}
                      <button onClick={e => {e.stopPropagation(); const f = {...t, _emails: emailsToArr(t.email)}; if(t.members) f._members = t.members.map(m=>({...m, _emails: emailsToArr(m.email)})); setForm(f); setEditId(t.id); setShowForm(true)}} style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'0 14px',height:26,boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:0}}>EDIT</button>
                    </div>
                  )}
                  {showArchived && <div style={{display:'flex',gap:6,marginTop:'auto',paddingTop:10}}>
                    <Btn variant="ghost" onClick={e => {e.stopPropagation(); handleRestore(t.id)}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
                    <Btn variant="danger" onClick={e => {e.stopPropagation(); setDeleteConfirm(t)}} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
                  </div>}
                </Card>
              );
            }

            // Solo trainee card — 4-block layout (IDENTITY / TRAINING /
            // BODYWEIGHT / FINANCIALS), with edit + archive controls outside
            // the blocks.
            const online = isOnline(t.id, presence);
            const pay = getPaymentStatus(t, payments);
            const lastWk = getLastWorkoutLabel(t, workouts, clientWorkouts);
            const bwEntries = getBwEntries(t, bwLog);
            const programs = planCounts?.[t.id] || 0;
            return (
            <Card key={t.id} {...dragProps(t)} onClick={() => showArchived ? null : onSelect(t.id)}
              header={<span style={{display:'inline-flex',alignItems:'center',gap:6,fontWeight:700,fontSize: hasHebrew(t.name) ? hebSize(14) : 14,letterSpacing:'0.04em',textTransform:'uppercase'}}>{t.name}{online && <OnlineDot />}{(t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya') && <span title="Bnei Herzliya" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:'50%',background:'#0E1A2B',flexShrink:0}}><img src="/bnei-herzliya-logo-w.png" alt="" style={{height:18,width:'auto',objectFit:'contain'}}/></span>}</span>}
              headerRight={showArchived ? <Badge color={statusColor[t.status] || C.tm} style={isRefined5b()?{background:'#FFFFFF'}:undefined}>{t.status}</Badge> : <CardStatusMenu status={t.status} onChange={s => setTrainees(prev => prev.map(x => x.id === t.id ? {...x, status: s} : x))} />}
              style={{height:'100%',display:'flex',flexDirection:'column',boxSizing:'border-box',border:`1px solid ${C.divider}`,borderLeft:`1px solid ${C.divider}`,...(showArchived ? {opacity: 0.7, borderStyle: "dashed"} : {})}}>
              {/* IDENTITY: name + status badge live in the card header — no
                  body duplicate. Same shape in both themes; OnlineDot moves
                  into the header span via the {online && <OnlineDot />} above. */}
              {/* FIXED height (not minHeight) + centered: the WhatsApp icon
                  and phone line are present on some athletes and absent on
                  others, which made this block's height — and therefore the
                  first divider below it — float card-to-card. A fixed slot
                  sized for the worst case (icon + 2-line email + phone) keeps
                  every card's dividers on the same horizontal lines. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: 80, justifyContent: 'flex-start', paddingTop: 4, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 28 }}>
                  <WhatsAppCheckInButton name={t.name} phone={t.phone} gender={t.gender} />
                </div>
                {t.phone && (
                  <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 0.5, textAlign: 'center' }}>{t.phone}</div>
                )}
                <EmailsCell email={t.email} style={{ fontSize: 12, color: C.tm, textAlign: 'center', maxWidth: '100%' }} />
              </div>

              <FinancialsBlock pay={pay} monthly={t.monthly} center />
              <TrainingBlock format={t.format} sessionsRemaining={t.sessionsRemaining} programs={programs} lastWk={lastWk} center />
              <BodyweightBlock entries={bwEntries} center />

              {showArchived && <div style={{ display: "flex", gap: 6, marginTop: 'auto', paddingTop: 10 }}>
                <Btn variant="ghost" onClick={(e) => {e.stopPropagation(); handleRestore(t.id)}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
                <Btn variant="danger" onClick={(e) => {e.stopPropagation(); setDeleteConfirm(t)}} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
              </div>}
              {!showArchived && <div style={{display:'flex',justifyContent:'space-between',marginTop:'auto',paddingTop:8,gap:8}}>
                {onPreview ? <button onClick={(e) => {e.stopPropagation(); onPreview(t.id)}} title="Preview this athlete's portal" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${isRefined5b() ? C.ac : C.cardBd}`,color: isRefined5b() ? C.ac : C.tm,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'0 14px',height:26,boxSizing:'border-box',borderRadius:0,display:'inline-flex',alignItems:'center',gap:6}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>PORTAL</button> : <span/>}
                <button onClick={(e) => {e.stopPropagation(); setForm({...t, _emails: emailsToArr(t.email)}); setEditId(t.id); setShowForm(true)}} style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'0 14px',height:26,boxSizing:'border-box',display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:0}}>EDIT</button>
              </div>}
            </Card>);
          })}
        </div>)}
        </div>{/* /RIGHT cards column */}
      </div>{/* /two-column flex row */}

      {/* Edit/Create Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? "Edit Athlete" : "New Athlete"} wide>
        {form._members ? <>
          {/* COUPLE EDIT */}
          <div style={{fontSize:11,fontFamily:FN,color:C.td,textTransform:'uppercase',marginBottom:8}}>Shared</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <Input label="Couple Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Select label="Format" options={TRAINING_FORMATS} value={form.format} onChange={v => setForm({...form, format: v})} />
            <Select label="Status" options={TRAINEE_STATUSES.filter(s => s !== "Archived")} value={form.status} onChange={v => setForm({...form, status: v})} />
            <Select label="Package" options={PACKAGE_TYPES} value={form.package} onChange={v => setForm({...form, package: v})} />
            <Input label="Sessions Remaining" type="number" value={form.sessionsRemaining} onChange={e => setForm({...form, sessionsRemaining: parseInt(e.target.value)||0})} />
            <Input label="Start Date" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
            <Input label="Package Price (₪)" type="number" value={form.packagePrice||""} onChange={e => setForm({...form, packagePrice: e.target.value})} />
          </div>
          <div style={{display:'flex',gap:16}}>
            {form._members.map((m, mi) => {
              const upd = (field, val) => {
                const next = [...form._members];
                next[mi] = {...next[mi], [field]: val};
                setForm({...form, _members: next});
              };
              return (
                <div key={mi} style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontFamily:FN,color:C.ac,textTransform:'uppercase',marginBottom:8}}>Member {mi+1}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    <Input label="Name" value={m.name||""} onChange={e=>upd('name',e.target.value)} />
                    <EmailsInput label="Email" value={m._emails || emailsToArr(m.email)} onChange={next=>upd('_emails',next)} />
                    <Input label="Phone" value={m.phone||""} onChange={e=>upd('phone',e.target.value)} placeholder="+972..." autoComplete="off" />
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                      <Input label="Age" type="number" value={m.age||""} onChange={e=>upd('age',e.target.value)} />
                      <Input label="Weight" type="number" value={m.weight||""} onChange={e=>upd('weight',e.target.value)} />
                      <Input label="Height" type="number" value={m.height||""} onChange={e=>upd('height',e.target.value)} />
                    </div>
                    <TextArea label="Injuries" value={m.injuries||""} onChange={e=>upd('injuries',e.target.value)} />
                    <TextArea label="Goals" value={m.goals||""} onChange={e=>upd('goals',e.target.value)} />
                    <TextArea label="Notes" value={m.notes||""} onChange={e=>upd('notes',e.target.value)} />
                  </div>
                </div>
              );
            })}
          </div>
        </> : <>
          {/* SOLO EDIT */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FN }}>Email(s)</label>
            {(form._emails || emailsToArr(form.email)).map((em, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <input value={em} onChange={e => {
                  const next = [...(form._emails || emailsToArr(form.email))];
                  next[i] = e.target.value;
                  setForm({...form, _emails: next});
                }} placeholder="email@example.com" style={{ ...baseInput, flex: 1 }} />
                {arr.length > 1 && <button onClick={() => {
                  const next = [...arr]; next.splice(i, 1);
                  setForm({...form, _emails: next});
                }} style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: '0 8px', color: C.rd, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>}
              </div>
            ))}
            {(form._emails || emailsToArr(form.email)).length < 3 && (
              <button onClick={() => {
                const next = [...(form._emails || emailsToArr(form.email)), ''];
                setForm({...form, _emails: next});
              }} style={{ background: 'var(--c-sf)', border: `0.25px dashed ${C.cardBd}`, borderRadius: 0, padding: '6px 10px', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>+ Add Email</button>
            )}
          </div>
          <Input label="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+972..." autoComplete="off" />
          <Input label="Age" type="number" value={form.age} onChange={e => setForm({...form, age: e.target.value})} />
          <Input label="Weight (kg)" type="number" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} />
          <Input label="Height (cm)" type="number" value={form.height} onChange={e => setForm({...form, height: e.target.value})} />
          <Select label="Format" options={TRAINING_FORMATS} value={form.format} onChange={v => setForm({...form, format: v})} />
          <Select label="Status" options={TRAINEE_STATUSES.filter(s => s !== "Archived")} value={form.status} onChange={v => setForm({...form, status: v})} />
          <Select label="Package" options={PACKAGE_TYPES} value={form.package} onChange={v => setForm({...form, package: v})} />
          <Input label="Sessions Remaining" type="number" value={form.sessionsRemaining} onChange={e => setForm({...form, sessionsRemaining: parseInt(e.target.value)||0})} />
          <Input label="Start Date" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
          <Input label="Package Price (₪)" type="number" value={form.packagePrice||""} onChange={e => setForm({...form, packagePrice: e.target.value})} />
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Injuries / Conditions" value={form.injuries} onChange={e => setForm({...form, injuries: e.target.value})} placeholder="L4/L5 disc bulge, R shoulder impingement..." /></div>
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Goals" value={form.goals} onChange={e => setForm({...form, goals: e.target.value})} /></div>
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
        </div>
        </>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          {editId && <Btn variant="danger" onClick={() => setArchiveConfirm(editId)} style={{ marginRight: "auto" }}>📦 Archive Athlete</Btn>}
          <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
          <Btn onClick={handleSave}>{editId ? "Update" : "Create"}</Btn>
        </div>
      </Modal>

      {/* Archive confirmation */}
      <ConfirmDialog open={!!archiveConfirm} title="Archive This Athlete?"
        message="Athlete will be moved to the archive. You can restore them anytime. Their plans, workouts, and payments will be preserved."
        onConfirm={() => handleArchive(archiveConfirm)}
        onCancel={() => setArchiveConfirm(null)} />

      {/* Permanent delete — type DELETE to confirm */}
      {deleteConfirm && createPortal(<div role="dialog" aria-modal="true" aria-label="Permanent deletion" style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: C.scrim }} onClick={() => {setDeleteConfirm(null);setDeleteTyped("");setPurgeHistory(false)}}>
        <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.rd}`, borderRadius: 0, width: 440, maxWidth: 'calc(100vw - 24px)', padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontFamily: FN, fontSize: 15, color: C.rd, textAlign: "center" }}>⚠ Permanent Deletion</h3>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: C.tm, textAlign: "center" }}>This will permanently remove <strong style={{color:C.tx}}>{deleteConfirm.name}</strong> from the roster. By default their programs, workout history and payment records are kept (just no longer reachable).</p>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: C.rd, fontWeight: 600, textAlign: "center" }}>This cannot be undone.</p>
          {/* Opt-in hard purge — separate, deliberate choice. Erases revenue
              history too, so it's never the default. */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, padding: "10px 12px", border: `1px solid ${purgeHistory ? C.rd : C.cardBd}`, background: purgeHistory ? C.rdD : 'transparent', cursor: "pointer" }}>
            <input type="checkbox" checked={purgeHistory} onChange={e => setPurgeHistory(e.target.checked)} style={{ marginTop: 2, accentColor: C.rd, cursor: "pointer" }} />
            <span style={{ fontSize: 12, color: purgeHistory ? C.rd : C.tm, lineHeight: 1.45 }}>
              Also <strong>erase all their history</strong> — programs, workouts, payments, messages, evaluations. This wipes their revenue from your reports and is not recoverable.
            </span>
          </label>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: "uppercase", fontFamily: FN, display: "block", marginBottom: 4, textAlign: "center" }}>Type "DELETE" to confirm</label>
            <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} style={{ background: 'var(--c-sf2)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: "8px 12px", color: C.tx, fontFamily: FN, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: "0.1em", textAlign: "center" }} placeholder="DELETE" autoComplete="off" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => {setDeleteConfirm(null);setDeleteTyped("");setPurgeHistory(false)}}>Cancel</Btn>
            <Btn variant="danger" disabled={purging} onClick={() => { if (deleteTyped.trim().toUpperCase() === "DELETE") handlePermanentDelete(deleteConfirm.id); }}
              style={{ opacity: (deleteTyped.trim().toUpperCase() === "DELETE" && !purging) ? 1 : 0.3, pointerEvents: (deleteTyped.trim().toUpperCase() === "DELETE" && !purging) ? "auto" : "none" }}>
              {purging ? 'Purging…' : (purgeHistory ? 'Delete + Erase History' : 'Delete Permanently')}</Btn>
          </div>
        </div>
      </div>, document.body)}
    </div>
  );
}
