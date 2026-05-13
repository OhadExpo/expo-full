import React, { useState, useEffect, useRef } from 'react';
import { C, FN, FB, uid, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES } from './theme';
import { Btn, Input, Select, TextArea, Badge, Card, Modal, ConfirmDialog, EmptyState, EmailsInput, baseInput, isRefined5b } from './ui';
import { emailsToArr, emailsToStore, subMemberId, traineeIdsFor } from './traineeUtils';
import { WhatsAppCheckInButton } from './whatsappButton';

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
        ? { wordBreak: 'break-all' }
        : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }
      }>{visible.join(', ')}</span>
      <span
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        style={{ color: C.ac, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1 }}
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
  if (days >= OVERDUE_DAYS) return { label: `OVERDUE · ${days}D`, color: C.rd, sub: latestDate.toLocaleDateString() };
  return { label: `PAID · ${days}D AGO`, color: C.gn, sub: latestDate.toLocaleDateString() };
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
  const span = (max - min) || 1;
  const xStep = (W - PAD * 2) / (entries.length - 1);
  const polyline = entries.map((e, i) => {
    const x = PAD + i * xStep;
    const y = PAD + (1 - (e.bw - min) / span) * (H - PAD * 2);
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
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.divider}` }}>
      <div style={{
        fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 1.5, fontWeight: 700,
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
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(format || hasSessions) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', justifyContent: justify }}>
            {format && (
              <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' }}>{format}</span>
            )}
            {format && hasSessions && <MidDot />}
            {hasSessions && (
              <span style={{ fontFamily: FN, fontSize: 11, color: sessionsRemaining <= 2 ? C.rd : C.gn, fontWeight: 700 }}>{sessionsRemaining} SESSIONS LEFT</span>
            )}
          </div>
        )}
        {programs > 0 && (
          <div style={{ display: 'flex', justifyContent: justify }}>
            <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700 }}>{programs} PROGRAMS</span>
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
    <span key="mo" style={{ fontFamily: FN, fontSize: 11, color: C.td, fontWeight: 700, letterSpacing: 1 }}>₪{monthly}/MO</span>
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
  const shared = planCounts?.[t.id] || 0;
  return [
    shared + (planCounts?.[subMemberId(t.id, 0)] || 0),
    shared + (planCounts?.[subMemberId(t.id, 1)] || 0),
  ];
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

export default function TraineesView({ trainees, setTrainees, planCounts, payments, workouts, clientWorkouts, bwLog, portalVis, presence, onSelect, onPreview }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultTrainee());
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);
  // Sort state — initialized from localStorage so the coach's last choice
  // sticks across sessions. Defaults: by NAME, ascending, Hebrew first
  // (matches Ohad's mostly-Hebrew roster).
  const _initialSort = loadSortPrefs() || {};
  const [sortBy, setSortBy] = useState(_initialSort.sortBy || 'name');
  const [sortDir, setSortDir] = useState(_initialSort.sortDir || 'asc');
  const [langOrder, setLangOrder] = useState(_initialSort.langOrder || 'he-first');
  useEffect(() => {
    saveSortPrefs({ sortBy, sortDir, langOrder });
  }, [sortBy, sortDir, langOrder]);
  useEffect(()=>{
    if(!addMenuOpen) return;
    const close = (e)=>{ if(addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false); };
    document.addEventListener('mousedown',close);
    return ()=>document.removeEventListener('mousedown',close);
  },[addMenuOpen]);         // step 3: type name to confirm

  const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac, Archived: C.rd };
  const active = trainees.filter(t => t.status !== "Archived");
  const archived = trainees.filter(t => t.status === "Archived");
  const filteredUnsorted = (showArchived ? archived : active).filter(t => {
    const s = search.toLowerCase();
    const emailStr = Array.isArray(t.email) ? t.email.join(' ') : (t.email || '');
    if (t.name.toLowerCase().includes(s) || emailStr.toLowerCase().includes(s)) return true;
    if (t.members) return t.members.some(m => (m.name||'').toLowerCase().includes(s) || (m.email||'').toLowerCase().includes(s));
    return false;
  });

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
  const filtered = [...filteredUnsorted].sort((a, b) => {
    const aHeb = hasHebrew(a.name);
    const bHeb = hasHebrew(b.name);
    if (aHeb !== bHeb) {
      // HE-first: HE block sorts BEFORE EN block. EN-first: opposite.
      if (langOrder === 'he-first') return aHeb ? -1 : 1;
      return aHeb ? 1 : -1;
    }
    let cmp = 0;
    if (sortBy === 'name') {
      const ak = sortNameKey(a);
      const bk = sortNameKey(b);
      // localeCompare gives correct ordering for both Hebrew and Latin
      // within each language block (Hebrew block uses Hebrew collation).
      cmp = ak.localeCompare(bk, aHeb ? 'he' : 'en', { sensitivity: 'base' });
    } else if (sortBy === 'lastTrained') {
      const am = getLastWorkoutMs(a, workouts, clientWorkouts);
      const bm = getLastWorkoutMs(b, workouts, clientWorkouts);
      cmp = am - bm;
    } else if (sortBy === 'payment') {
      const as = paymentSeverity(a, payments);
      const bs = paymentSeverity(b, payments);
      cmp = as - bs;
    }
    if (cmp === 0) {
      // Stable tie-breaker — name within the same block.
      cmp = sortNameKey(a).localeCompare(sortNameKey(b), aHeb ? 'he' : 'en', { sensitivity: 'base' });
    }
    return sortDir === 'desc' ? -cmp : cmp;
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
  const handlePermanentDelete = (id) => {
    setTrainees(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null); setDeleteTyped("");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <div style={{ flex: 1 }}><input placeholder="Search athletes..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...baseInput, paddingLeft: 12, height: 40, padding: '0 14px' }} /></div>
        <button onClick={() => setShowArchived(!showArchived)} style={{ background: isRefined5b() ? 'transparent' : 'var(--c-sf)', border: `${showArchived?'1px':'0.25px'} solid ${showArchived ? C.rd : C.cardBd}`, borderRadius: 0, height: 40, padding: "0 18px", color: showArchived ? C.rd : C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: "pointer", display: 'inline-flex', alignItems: 'center' }}>
          {showArchived ? `Archive (${archived.length})` : `Archive (${archived.length})`}
        </button>
        <div ref={addMenuRef} style={{position:'relative'}}>
          <Btn onClick={() => setAddMenuOpen(!addMenuOpen)} style={{ height: 40, padding: '0 18px' }}>+ Add Athlete ▾</Btn>
          {addMenuOpen && <div style={{position:'absolute',right:0,top:'100%',marginTop:4,background:C.bg,border:`1px solid ${C.cardBd}`,borderRadius:0,overflow:'hidden',zIndex:50,minWidth:180,boxShadow:'0 8px 24px rgba(0,0,0,0.6)'}}>
            {[['Online Athlete','Online Client'],['Gym, Single','Gym, Single'],['Gym, Couple','Gym, Couple']].map(([label,format])=>(
              <button key={format} onClick={()=>{
                const f = {...defaultTrainee(), format};
                if(format==='Gym, Couple') f.members=[{name:'',email:'',phone:'',age:'',weight:'',height:'',injuries:'',goals:'',notes:''},{name:'',email:'',phone:'',age:'',weight:'',height:'',injuries:'',goals:'',notes:''}];
                setForm(f); setEditId(null); setShowForm(true); setAddMenuOpen(false);
              }} style={{display:'block',width:'100%',padding:'10px 16px',background:'transparent',border:'none',borderBottom:`1px solid ${C.bd}`,color:C.tx,fontFamily:FB,fontSize:13,fontWeight:500,cursor:'pointer',textAlign:'left'}}
                onMouseEnter={e=>e.currentTarget.style.background=C.sf2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                {label}
              </button>
            ))}
          </div>}
        </div>
      </div>

      {/* Sort bar — sits between the search row and the cards grid.
          Mirrors the toggle-button rhythm used elsewhere on /coach (sort
          buttons in TraineeDetail's Assigned Programs, header pills on
          NotesWidget). Three controls: SORT BY (3 modes) + DIR (↑↓) +
          LANG (HE/EN priority block). State persists across sessions. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 14,
        padding: '8px 10px',
        background: isRefined5b() ? 'transparent' : 'var(--c-sf)',
        border: `1px solid ${C.cardBd}`, borderRadius: 0,
      }}>
        <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginRight: 6 }}>SORT</span>
        {[
          { id: 'name',        label: 'NAME' },
          { id: 'lastTrained', label: 'LAST TRAINED' },
          { id: 'payment',     label: 'PAYMENT' },
        ].map(o => {
          const active = sortBy === o.id;
          return (
            <button key={o.id} onClick={() => setSortBy(o.id)}
              style={{
                padding: '5px 12px', borderRadius: 0,
                border: `1px solid ${active ? C.ac : C.cardBd}`,
                background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
                color: active ? C.ac : C.tm,
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                cursor: 'pointer',
              }}>{o.label}</button>
          );
        })}
        <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          title={
            sortBy === 'name' ? (sortDir === 'asc' ? 'A → Z' : 'Z → A')
            : sortBy === 'lastTrained' ? (sortDir === 'asc' ? 'Oldest first' : 'Newest first')
            : (sortDir === 'asc' ? 'Paid → Overdue' : 'Overdue → Paid')
          }
          style={{
            padding: '5px 12px', borderRadius: 0,
            border: `1px solid ${C.ac}`,
            background: 'transparent', color: C.ac,
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            marginLeft: 6,
          }}>{
            sortBy === 'name' ? (sortDir === 'asc' ? '↓ A→Z' : '↑ Z→A')
            : sortBy === 'lastTrained' ? (sortDir === 'asc' ? '↑ OLDEST' : '↓ NEWEST')
            : (sortDir === 'asc' ? '↓ PAID' : '↑ OVERDUE')
          }</button>
        <span style={{ width: 1, alignSelf: 'stretch', background: C.cardBd, margin: '0 4px' }} />
        <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>LANG</span>
        {[
          { id: 'he-first', label: 'עב' },
          { id: 'en-first', label: 'EN' },
        ].map(o => {
          const active = langOrder === o.id;
          return (
            <button key={o.id} onClick={() => setLangOrder(o.id)}
              title={o.id === 'he-first' ? 'Hebrew names first' : 'English names first'}
              style={{
                padding: '5px 10px', borderRadius: 0,
                border: `1px solid ${active ? C.ac : C.cardBd}`,
                background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
                color: active ? C.ac : C.tm,
                fontFamily: o.id === 'he-first' ? 'Heebo,'+FN : FN,
                fontSize: o.id === 'he-first' ? 13 : 10,
                fontWeight: 700, letterSpacing: o.id === 'he-first' ? 0 : '0.12em',
                cursor: 'pointer', lineHeight: 1.2,
              }}>{o.label}</button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.08em' }}>
          {filtered.length} {filtered.length === 1 ? 'athlete' : 'athletes'}
        </span>
      </div>

      {filtered.length === 0 ? <EmptyState icon={showArchived ? "📦" : "👥"} message={showArchived ? "No archived athletes." : "No athletes yet. Add your first one."} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map(t => {
            const couple = isCouple(t);
            const mpc = getMemberPlanCounts(t, planCounts);
            // Extract family name for couple cards (shared surname after ו)
            const familyName = couple ? (t.name.match(/\s+(\S+)$/)?.[1] || '') : '';

            if (couple) {
              const [m0, m1] = t.members;
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
                <Card key={t.id} onClick={() => showArchived ? null : onSelect(t.id)}
                  header={<span style={{display:'inline-flex',alignItems:'center',gap:6,fontWeight:700,fontSize: hasHebrew(t.name) ? hebSize(14) : 14,letterSpacing:'0.04em',textTransform:'uppercase'}}>{t.name}{online && <OnlineDot />}</span>}
                  headerRight={<Badge color={statusColor[t.status] || C.tm} style={isRefined5b()?{background:'#FFFFFF'}:undefined}>{t.status}</Badge>}
                  style={{height:'100%',display:'flex',flexDirection:'column',boxSizing:'border-box',...(showArchived ? {opacity: 0.7, borderStyle: "dashed"} : {})}}>
                  {/* IDENTITY: name + status badge live in the card header
                      (Card's header + headerRight props). No duplicate body
                      banner — Ohad called the inner repeat useless 2026-05-12. */}
                  <div style={{display:'flex',marginTop:8,width:'100%',alignSelf:'stretch'}}>
                    {[m0, m1].map((m, mi) => (
                      <React.Fragment key={mi}>
                        {mi === 1 && <div style={{width:1,background:C.bd,margin:'0 12px',alignSelf:'stretch'}} />}
                        <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
                            <div style={{
                              fontWeight:600,fontSize:13,color:C.tx,textAlign:'center',
                              minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                            }}>{m.name || `Member ${mi+1}`}</div>
                            <WhatsAppCheckInButton name={m.name || t.name} phone={m.phone} />
                          </div>
                          <EmailsCell email={m.email} style={{ fontSize:12, color:C.tm, marginTop:2, textAlign:'center', width:'100%' }} />
                          {m.phone && (
                            <div style={{
                              fontFamily:FN,fontSize:10,color:C.tm,marginTop:2,letterSpacing:0.5,textAlign:'center',width:'100%',
                              whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                            }}>{m.phone}</div>
                          )}
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
                      {onPreview ? <button onClick={e => {e.stopPropagation(); onPreview(t.id)}} title="Preview this athlete's portal" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${isRefined5b() ? C.ac : C.cardBd}`,color: isRefined5b() ? C.ac : C.tm,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'4px 12px',borderRadius:0,display:'inline-flex',alignItems:'center',gap:6}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>PORTAL</button> : <span/>}
                      <button onClick={e => {e.stopPropagation(); const f = {...t, _emails: emailsToArr(t.email)}; if(t.members) f._members = t.members.map(m=>({...m, _emails: emailsToArr(m.email)})); setForm(f); setEditId(t.id); setShowForm(true)}} style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'4px 12px',borderRadius:0}}>EDIT</button>
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
            <Card key={t.id} onClick={() => showArchived ? null : onSelect(t.id)}
              header={<span style={{display:'inline-flex',alignItems:'center',gap:6,fontWeight:700,fontSize: hasHebrew(t.name) ? hebSize(14) : 14,letterSpacing:'0.04em',textTransform:'uppercase'}}>{t.name}{online && <OnlineDot />}</span>}
              headerRight={<Badge color={statusColor[t.status] || C.tm} style={isRefined5b()?{background:'#FFFFFF'}:undefined}>{t.status}</Badge>}
              style={{height:'100%',display:'flex',flexDirection:'column',boxSizing:'border-box',...(showArchived ? {opacity: 0.7, borderStyle: "dashed"} : {})}}>
              {/* IDENTITY: name + status badge live in the card header — no
                  body duplicate. Same shape in both themes; OnlineDot moves
                  into the header span via the {online && <OnlineDot />} above. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <WhatsAppCheckInButton name={t.name} phone={t.phone} />
                </div>
                <EmailsCell email={t.email} style={{ fontSize: 12, color: C.tm, textAlign: 'center', maxWidth: '100%' }} />
                {t.phone && (
                  <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 0.5, textAlign: 'center' }}>{t.phone}</div>
                )}
              </div>

              <FinancialsBlock pay={pay} monthly={t.monthly} center />
              <TrainingBlock format={t.format} sessionsRemaining={t.sessionsRemaining} programs={programs} lastWk={lastWk} center />
              <BodyweightBlock entries={bwEntries} center />

              {showArchived && <div style={{ display: "flex", gap: 6, marginTop: 'auto', paddingTop: 10 }}>
                <Btn variant="ghost" onClick={(e) => {e.stopPropagation(); handleRestore(t.id)}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
                <Btn variant="danger" onClick={(e) => {e.stopPropagation(); setDeleteConfirm(t)}} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
              </div>}
              {!showArchived && <div style={{display:'flex',justifyContent:'space-between',marginTop:'auto',paddingTop:8,gap:8}}>
                {onPreview ? <button onClick={(e) => {e.stopPropagation(); onPreview(t.id)}} title="Preview this athlete's portal" style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${isRefined5b() ? C.ac : C.cardBd}`,color: isRefined5b() ? C.ac : C.tm,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'4px 14px',borderRadius:0,display:'inline-flex',alignItems:'center',gap:6}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>PORTAL</button> : <span/>}
                <button onClick={(e) => {e.stopPropagation(); setForm({...t, _emails: emailsToArr(t.email)}); setEditId(t.id); setShowForm(true)}} style={{background: isRefined5b() ? 'transparent' : 'var(--c-sf)',border:`1px solid ${C.ac}`,color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.15em',padding:'4px 14px',borderRadius:0}}>EDIT</button>
              </div>}
            </Card>);
          })}
        </div>)}

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
                    <Input label="Phone" value={m.phone||""} onChange={e=>upd('phone',e.target.value)} placeholder="+972..." />
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
                }} style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: '0 8px', color: C.rd, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
              </div>
            ))}
            {(form._emails || emailsToArr(form.email)).length < 3 && (
              <button onClick={() => {
                const next = [...(form._emails || emailsToArr(form.email)), ''];
                setForm({...form, _emails: next});
              }} style={{ background: 'var(--c-sf)', border: `0.25px dashed ${C.cardBd}`, borderRadius: 0, padding: '6px 10px', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>+ Add Email</button>
            )}
          </div>
          <Input label="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+972..." />
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
      {deleteConfirm && <div style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: C.scrim }} onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>
        <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.rd}`, borderRadius: 0, width: 420, padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontFamily: FN, fontSize: 15, color: C.rd, textAlign: "center" }}>⚠ Permanent Deletion</h3>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: C.tm, textAlign: "center" }}>This will permanently delete <strong style={{color:C.tx}}>{deleteConfirm.name}</strong> and ALL their data (plans, workouts, payments).</p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.rd, fontWeight: 600, textAlign: "center" }}>This cannot be undone.</p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: "uppercase", fontFamily: FN, display: "block", marginBottom: 4, textAlign: "center" }}>Type "DELETE" to confirm</label>
            <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: "8px 12px", color: C.tx, fontFamily: FN, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: "0.1em", textAlign: "center" }} placeholder="DELETE" autoComplete="off" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={() => { if (deleteTyped.trim().toUpperCase() === "DELETE") handlePermanentDelete(deleteConfirm.id); }}
              style={{ opacity: deleteTyped.trim().toUpperCase() === "DELETE" ? 1 : 0.3, pointerEvents: deleteTyped.trim().toUpperCase() === "DELETE" ? "auto" : "none" }}>
              Delete Permanently</Btn>
          </div>
        </div>
      </div>}
    </div>
  );
}
