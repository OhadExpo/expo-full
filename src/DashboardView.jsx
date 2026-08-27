import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { C, FN, FB, EXPO_ICON } from './theme';
import { Badge, baseInput, SectionLabel, isRefined5b, RefinedHeaderStrip, SectionIcon, confirmToast, CollapsibleSection, usePersistentState, asButton } from './ui';
import { traineeIdsFor, parseTraineeId } from './traineeUtils';
import { supabase } from './supabase';
import { WhatsAppCheckInButton, normalizePhoneIL } from './whatsappButton';
import NotesWidget from './NotesWidget';
import MessagesCard from './MessagesCard';
import { syncAutoTasks } from './autoTasks';

// A Bnei Herzliya athlete is a CLUB athlete: the club pays, so there is no
// package and no session balance. Stripping the values at save time was not
// enough — every record created before that still carries the old default, so
// the dashboard was raising EXPIRING PACKAGES and LOW SESSIONS for athletes
// who have neither. Any of the three markers counts (format / branch / team).
const isClubAthlete = (t) => !!t && (t.format === 'Bnei Herzliya' || t.branch === 'Bnei Herzliya' || t.team === 'BHBC');

// Dormant alert action: opens WhatsApp with a prefilled Hebrew check-in.
// For couples we pick the member whose phone is set; if both have phones,
// message the first member only (two conversations would duplicate the nudge).
function DormantWhatsAppButton({ trainee, days }) {
  const target = (() => {
    if (trainee.members && trainee.members.length === 2) {
      // Address whichever member we can actually reach, in their own gender.
      const m = trainee.members.find(mm => normalizePhoneIL(mm?.phone));
      return m ? { name: m.name || trainee.name, phone: m.phone, gender: m.gender } : null;
    }
    return trainee.phone ? { name: trainee.name, phone: trainee.phone, gender: trainee.gender } : null;
  })();
  if (!target) return null;
  return <WhatsAppCheckInButton name={target.name} phone={target.phone} gender={target.gender} days={days} />;
}

export default function DashboardView({ isOwner = true, trainees = [], planCounts, workouts = [], clientWorkouts = [], payments = [], presence, onSelectTrainee, onOpenTraineeMessages, onOpenTasksTab, onCreatePlanForTask, onOpenIntakeTab, onOpenWaitlist, onOpenReviewWorkout }) {
  // Staff (non-owner, e.g. Yuval a masseur) share Ohad's clients but not his
  // money: every revenue / pricing / leads surface below is gated on isOwner.
  // What stays: client-engagement signals (active count, low sessions, online,
  // dormant/dropout, expiring packages), Tasks, and Messages.
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState(1);
  const [filter, setFilter] = useState('');

  const statusColor = { Active: C.ac, "On Hold": C.or, Inactive: C.td, Trial: C.ac };

  const enriched = useMemo(() => (trainees || []).map(t => {
    // Workouts and payments for couple trainees may be recorded under sub-member IDs
    // (tr_xxx__0 / __1). Roll everything up to the parent for dashboard display.
    const ids = new Set(traineeIdsFor(t.id));
    const tPay = (payments || []).filter(p => ids.has(p.traineeId));
    const tWorkInPerson = (workouts || []).filter(w => ids.has(w.traineeId) && w.status === 'completed');
    // Trainee-portal logged workouts (client-side) — counted alongside in-
    // person sessions for "last activity" so the dropout signal doesn't
    // false-positive on clients who train solo through the portal.
    const tWorkPortal = (clientWorkouts || []).filter(w => ids.has(w.clientId));
    const tWork = [...tWorkInPerson, ...tWorkPortal];
    // Only PAID rows count as collected money / "last payment". A pending or
    // canceled Bit request must not inflate totals or (via lastPay.date below)
    // silently clear the overdue signal. Mirrors thisMonthPaid/totalAllPaid.
    const tPaidOnly = tPay.filter(p => p.status === 'Paid');
    const totalPaid = tPaidOnly.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const lastPay = tPaidOnly.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const lastWorkout = tWork.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return { ...t, totalPaid, lastPay, lastWorkout, workoutCount: tWork.length, planCount: (planCounts || {})[t.id] || 0 };
  }), [trainees, payments, workouts, clientWorkouts, planCounts]);

  const filtered = enriched.filter(t => !filter || (t.name || '').toLowerCase().includes(filter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '') * dir;
    if (sort === 'status') return (a.status || '').localeCompare(b.status || '') * dir;
    // parseFloat (not Number.isFinite, which doesn't coerce) so an imported string
    // sessionsRemaining like "5" sorts as 5, matching how every other use of the
    // field reads it (lowSessions/expiring/the table cell all coerce). (#123)
    if (sort === 'sessions') return ((parseFloat(a.sessionsRemaining) || 0) - (parseFloat(b.sessionsRemaining) || 0)) * dir;
    if (sort === 'paid') return (a.totalPaid - b.totalPaid) * dir;
    if (sort === 'lastPay') return ((a.lastPay ? new Date(a.lastPay.date).getTime() : 0) - (b.lastPay ? new Date(b.lastPay.date).getTime() : 0)) * dir;
    if (sort === 'workouts') return (a.workoutCount - b.workoutCount) * dir;
    return 0;
  });

  const toggleSort = (key) => { if (sort === key) setDir(d => d * -1); else { setSort(key); setDir(1); } };
  // SH (sortable header) — in refined mode the thead row is the cyan
  // strip, so the cell text becomes white. Otherwise falls back to the
  // legacy cyan-active / gray-inactive scheme.
  const SH = ({ k, label }) => {
    const refined = isRefined5b();
    const color = refined ? '#FFFFFF' : (sort === k ? C.ac : C.td);
    return (
      <th onClick={() => toggleSort(k)} style={{ textAlign: 'center', padding: '10px 12px', fontSize: 9, fontFamily: FN, color, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {label} {sort === k ? (dir === 1 ? '↑' : '↓') : ''}
      </th>
    );
  };

  // Summary stats
  const active = trainees.filter(t => t.status === 'Active').length;
  const archivedCount = trainees.filter(t => t.status === 'Archived').length;
  const monthlyRate = trainees.filter(t=>t.status==='Active').reduce((a,t) => a + (parseFloat(t.monthly)||0), 0);
  const now = new Date();
  const thisMonthPaid = payments.filter(p => { const d=new Date(p.date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() && p.status==='Paid'; }).reduce((a,p) => a + (parseFloat(p.amount)||0), 0);
  const totalAllPaid = payments.filter(p=>p.status==='Paid').reduce((a,p) => a + (parseFloat(p.amount)||0), 0);
  const lowSessions = enriched.filter(t => !isClubAthlete(t) && t.sessionsRemaining > 0 && t.sessionsRemaining <= 2).length;

  // Last month's income for comparison
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Compare like-for-like: this-month-to-date vs the SAME slice of last month
  // (up to today's day-of-month). Comparing partial MTD against a full prior
  // month read hugely negative early in every month even when pace was fine,
  // and was shown as "% vs last month". (logic audit)
  const lastMonthToDatePaid = payments.filter(p => { const d=new Date(p.date); return d.getMonth()===lastMonth.getMonth() && d.getFullYear()===lastMonth.getFullYear() && d.getDate() <= now.getDate() && p.status==='Paid'; }).reduce((a,p) => a + (parseFloat(p.amount)||0), 0);
  const revDelta = lastMonthToDatePaid > 0 ? Math.round(((thisMonthPaid - lastMonthToDatePaid) / lastMonthToDatePaid) * 100) : null;

  // F-36 — Revenue dashboard card. Trailing 30/90d collected + outstanding
  // (pending Bit payment requests) + average client LTV + 6-month bar
  // sparkline. Keeps every metric pulled from the same payments array
  // the rest of the dashboard already loads, so no extra query cost.
  const ms30 = 30 * 86400000;
  const ms90 = 90 * 86400000;
  const paidPayments = payments.filter(p => p.status === 'Paid');
  const collected30 = paidPayments.filter(p => (now - new Date(p.date)) <= ms30).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
  // The 30D tile's own like-for-like basis: the PRIOR rolling 30 days (days 31-60).
  // The MTD-vs-last-MTD revDelta is only valid on the "Collected MTD" KPI, not here —
  // pairing it with a trailing-30d number captioned a scary wrong % early in a month (#123).
  const collectedPrev30 = paidPayments.filter(p => { const age = now - new Date(p.date); return age > ms30 && age <= ms30 * 2; }).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
  const delta30 = collectedPrev30 > 0 ? Math.round(((collected30 - collectedPrev30) / collectedPrev30) * 100) : null;
  const collected90 = paidPayments.filter(p => (now - new Date(p.date)) <= ms90).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
  const avgTicket = paidPayments.length ? Math.round(totalAllPaid / paidPayments.length) : 0;
  // Normalize couple sub-member ids (tr__0/__1) to the household parent so a couple
  // paying under both members counts as ONE client, not two (avgLtv was diluted).
  const everPaidClientIds = new Set(paidPayments.map(p => { const par = parseTraineeId(p.traineeId); return par ? par.parentId : p.traineeId; }).filter(Boolean));
  const avgLtv = everPaidClientIds.size ? Math.round(totalAllPaid / everPaidClientIds.size) : 0;
  // 6-month bar chart of collected revenue per month (oldest → newest).
  const monthBars = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const total = paidPayments
        .filter(p => { const pd = new Date(p.date); return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear(); })
        .reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
      out.push({ label: d.toLocaleString('en-US', { month: 'short' }), value: total });
    }
    return out;
  // Depend on `payments` itself — keying on .length kept the chart stale
  // when a pending request flipped to Paid (status change, same count).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments]);
  const maxBar = Math.max(1, ...monthBars.map(b => b.value));

  // Outstanding — sum of pending payment requests.
  const [outstanding, setOutstanding] = useState({ amount: 0, count: 0 });
  const [allAthletesOpen, setAllAthletesOpen] = usePersistentState('dash-all-athletes', true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Ordered + a headroom cap, and truncation is NOTICED. This total is
        // money owed: an unordered .limit(500) takes an arbitrary 500 rows, so
        // the moment pending requests pass the cap the figure silently
        // UNDERSTATES what is owed, with nothing anywhere saying so.
        const OUTSTANDING_CAP = 2000;
        const { data } = await supabase
          .from('bit_payment_requests')
          .select('amount, status')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(OUTSTANDING_CAP);
        if (cancelled) return;
        const arr = data || [];
        if (arr.length >= OUTSTANDING_CAP) console.warn('[dashboard] outstanding total hit the row cap — the figure is understated');
        setOutstanding({
          amount: arr.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0),
          count: arr.length,
        });
      } catch {
        if (!cancelled) setOutstanding({ amount: 0, count: 0 });
      }
    })();
    return () => { cancelled = true; };
    // Re-fetch when the realtime-driven payments array changes (e.g. a pending
    // request flips to paid) — with [] the tile stayed stale until remount while
    // the rest of the revenue card updated live.
  }, [payments]);

  // Dropout risk: active clients who haven't trained in 14+ days
  const DROPOUT_DAYS = 14;
  const dropoutRisk = enriched.filter(t => {
    if (t.status !== 'Active') return false;
    if (!t.lastWorkout) return true; // never trained
    const daysSince = Math.floor((now - new Date(t.lastWorkout.date)) / 86400000);
    return daysSince >= DROPOUT_DAYS;
  });

  // Expiring packages: active with ≤2 sessions
  const expiring = enriched.filter(t => !isClubAthlete(t) && t.status === 'Active' && t.sessionsRemaining > 0 && t.sessionsRemaining <= 2);

  // Online now
  const ONLINE_MS = 2 * 60 * 1000;
  const onlineNow = enriched.filter(t => traineeIdsFor(t.id).some(id => presence?.[id] && (now.getTime() - presence[id]) < ONLINE_MS));

  // Overdue payment: active clients whose last payment (from payments array OR legacy lastPayment field) is >30 days ago,
  // OR active clients with a monthly rate but no payment record at all.
  const OVERDUE_DAYS = 30;
  const overduePayment = enriched.map(t => {
    if (t.status !== 'Active') return null;
    const monthly = parseFloat(t.monthly) || 0;
    if (monthly <= 0) return null; // not a recurring-billing client, skip
    const latestPayDate = t.lastPay ? new Date(t.lastPay.date) : (t.lastPayment ? new Date(t.lastPayment) : null);
    if (!latestPayDate || isNaN(latestPayDate.getTime())) {
      return { ...t, daysOverdue: null, neverPaid: true };
    }
    const days = Math.floor((now - latestPayDate) / 86400000);
    if (days >= OVERDUE_DAYS) return { ...t, daysOverdue: days, neverPaid: false };
    return null;
  }).filter(Boolean).sort((a, b) => (b.daysOverdue || 9999) - (a.daysOverdue || 9999));

  // Drag-to-reorder the three alert cards (Expiring / Overdue / Dormant) — Ohad:
  // drag one card left/right past another to swap their positions. Order is a
  // coach-local display preference, so it's persisted, not synced.
  //
  // The rail these cards live in ALREADY has a custom click-and-drag-to-SCROLL
  // gesture (onAlertDown/Move/Up below, plain mousedown/mousemove — not native
  // HTML5 drag). Native `draggable` on the cards would fight that: mousedown
  // fires before dragstart, so the rail's scroll-drag would arm at the same
  // time as a reorder-drag, and native DnD suppresses mousemove inconsistently
  // across browsers once it takes over. So reordering reuses the SAME plain-
  // mouse-event model as the rail, and separates the two purely by origin: a
  // press on a card's HEADER starts a reorder-drag (via stopPropagation, so
  // the rail's own onMouseDown never sees it); a press anywhere else on the
  // rail still scrolls exactly as before. Nothing else on the page is touched.
  const [alertOrder, setAlertOrder] = usePersistentState('dash-alert-order', ['expiring', 'overdue', 'dormant']);
  const alertReorderRef = useRef(null); // { key, moved } while a reorder-drag is live
  const [draggingAlertKey, setDraggingAlertKey] = useState(null);
  const [dragOverAlertKey, setDragOverAlertKey] = useState(null);
  const reorderAlertCards = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setAlertOrder(prev => {
      const next = prev.includes(fromKey) && prev.includes(toKey) ? [...prev] : ['expiring', 'overdue', 'dormant'];
      const fromIdx = next.indexOf(fromKey), toIdx = next.indexOf(toKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromKey);
      return next;
    });
  };
  // Document-level listeners while a reorder-drag is active, so dragging past
  // the rail's edge doesn't lose tracking (standard robust custom-DnD pattern).
  useEffect(() => {
    if (!draggingAlertKey) return;
    const onMove = (e) => {
      if (!alertReorderRef.current) return; // ref nulled on mouseup; ignore stray moves (audit)
      alertReorderRef.current.moved = true;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cardEl = el && el.closest('[data-alert-key]');
      const overKey = cardEl ? cardEl.getAttribute('data-alert-key') : null;
      setDragOverAlertKey(overKey && overKey !== draggingAlertKey ? overKey : null);
    };
    const onUp = () => {
      if (dragOverAlertKey) reorderAlertCards(draggingAlertKey, dragOverAlertKey);
      setDraggingAlertKey(null);
      setDragOverAlertKey(null);
      alertReorderRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingAlertKey, dragOverAlertKey]);
  const alertHeaderDragProps = (key) => ({
    onMouseDown: (e) => {
      e.stopPropagation(); // keep the rail's own onAlertDown (scroll-drag) from also arming
      alertReorderRef.current = { key, moved: false };
      setDraggingAlertKey(key);
    },
    style: { cursor: 'grab' },
  });
  const alertCardWrapStyle = (key) => ({
    opacity: draggingAlertKey === key ? 0.4 : 1,
    outline: dragOverAlertKey === key ? `2px solid ${C.ac}` : 'none',
    outlineOffset: -2,
    transition: 'opacity 120ms',
  });

  // Inbound landing-site leads (expo-il LeadCapture form). Only show
  // unconsumed rows — once Ohad clicks "mark contacted" we set consumed_at
  // and drop the row from the panel.
  const [leads, setLeads] = useState(null);
  const reloadLeads = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id,email,source,context,created_at')
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error) setLeads(data || []);
    } catch {}
  }, []);
  useEffect(() => { reloadLeads(); }, [reloadLeads]);

  const markLeadContacted = async (id) => {
    setLeads(curr => (curr || []).filter(l => l.id !== id));
    try { await supabase.from('leads').update({ consumed_at: new Date().toISOString() }).eq('id', id); } catch {}
  };
  const deleteLead = async (id) => {
    // confirmToast — iOS PWA blocks the native confirm() dialog.
    if (!(await confirmToast('Delete this lead?', { okLabel: 'Delete', cancelLabel: 'Cancel' }))) return;
    setLeads(curr => (curr || []).filter(l => l.id !== id));
    try { await supabase.from('leads').delete().eq('id', id); } catch {}
  };

  // Storage usage probe — list the form-videos bucket and sum byte sizes.
  // form-videos is the only bucket that matters for capacity (meal-photos +
  // coach-voice + coaching-contracts are negligible). Runs once per dashboard
  // mount.
  //
  // The bucket's SELECT policy (`auth_read_form_videos`) is TO authenticated:
  // is_trainer() OR own-folder. An anon listing isn't denied — it returns an
  // empty array, which used to render here as a false "0 MB / 0 form videos".
  // So the probe MUST send the coach's session JWT as Bearer; if there's no
  // session token we bail and leave the tile in its loading state rather
  // than misreport capacity.
  // Supabase Pro tier = 100 GB (upgraded 2026-08-14). Free tier was 1 GB.
  const STORAGE_CAP_MB = 100 * 1024;
  const STORAGE_CAP_LABEL = STORAGE_CAP_MB >= 1024 ? `${(STORAGE_CAP_MB / 1024).toFixed(0)} GB` : `${STORAGE_CAP_MB} MB`;
  const [storage, setStorage] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
      const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
      const authHead = (token) => ({ 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
      // Page through a prefix so a folder with >1000 objects isn't silently
      // truncated (Supabase list caps a page at 1000). Accumulate until a short
      // page arrives; a maxPages backstop prevents a runaway if the API ever
      // keeps returning full pages.
      const listRaw = async (bucket, prefix, token) => {
        const PAGE = 1000, maxPages = 500;
        let offset = 0, all = [];
        for (let p = 0; p < maxPages; p++) {
          const r = await fetch(`${SUPA_URL}/storage/v1/object/list/${bucket}`, {
            method: 'POST',
            headers: authHead(token),
            body: JSON.stringify({ prefix, limit: PAGE, offset }),
          });
          if (!r.ok) throw new Error(`list failed at "${bucket}/${prefix}" (${r.status})`);
          const page = await r.json();
          if (!Array.isArray(page) || page.length === 0) break;
          all = all.concat(page);
          if (page.length < PAGE) break;
          offset += PAGE;
        }
        return all;
      };
      try {
        const { data: { session } = {} } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('no session token — authenticated listing required');
        // Discover every bucket so the bar reflects TOTAL Supabase file storage
        // (not just form-videos). Fall back to the known buckets if the bucket
        // listing is RLS-denied. A per-bucket walk failure is swallowed so one
        // inaccessible bucket can't blank the whole signal.
        let buckets = [];
        try {
          const br = await fetch(`${SUPA_URL}/storage/v1/bucket`, { headers: authHead(token) });
          if (br.ok) {
            const arr = await br.json();
            if (Array.isArray(arr)) buckets = arr.map(b => b.name || b.id).filter(Boolean);
          }
        } catch { /* fall through to fallback */ }
        if (buckets.length === 0) buckets = ['form-videos', 'coach-voice'];
        let total = 0, formVideoFiles = 0;
        const walk = async (bucket, prefix) => {
          const data = await listRaw(bucket, prefix, token);
          if (!Array.isArray(data)) return;
          for (const it of data) {
            // Folders come back with id===null + no metadata. Files have a
            // UUID + a metadata object with `size` (bytes).
            if (it.id === null) {
              await walk(bucket, prefix ? `${prefix}/${it.name}` : it.name);
            } else {
              total += it.metadata?.size || 0;
              if (bucket === 'form-videos') formVideoFiles++;
            }
          }
        };
        for (const bucket of buckets) {
          try { await walk(bucket, ''); }
          catch (be) { console.warn(`Storage: bucket "${bucket}" skipped:`, be?.message || be); }
        }
        if (cancelled) return;
        const usedMB = total / 1024 / 1024;
        const pct = Math.round((usedMB / STORAGE_CAP_MB) * 100);
        setStorage({ usedMB, pct, files: formVideoFiles });
      } catch (e) {
        console.warn('Storage probe failed:', e?.message || e);
        // Don't render the tile as a stale "0 / 0%" — leave it loading so
        // the visual absence tells the coach something is wrong rather
        // than misreporting capacity.
        if (!cancelled) setStorage(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // /coaches funnel — last 30 days. Pulls counts from chat_logs (sessions
  // + messages) and leads (waitlist signups) since those are the only
  // first-party signals we own. Visit-count denominator lives in Vercel
  // Analytics; the dashboard tile shows the absolute funnel-stage counts.
  // Renders gracefully if chat_logs migration hasn't been applied yet.
  const [funnel, setFunnel] = useState(null); // null = loading; {sessions, messages, captures, waitlist}

  // Drag-to-pan for the alert-blocks rail (Ohad: "drag-able left and right").
  // Click-vs-drag: if the pointer moved >4px it was a pan, so the trailing click
  // (which would open an athlete) is swallowed in the capture phase.
  const alertRailRef = React.useRef(null);
  const alertDrag = React.useRef({ down: false, moved: false, startX: 0, startScroll: 0 });
  const onAlertDown = (e) => { const el = alertRailRef.current; if (!el) return; alertDrag.current = { down: true, moved: false, startX: e.pageX, startScroll: el.scrollLeft }; };
  const onAlertMove = (e) => { const st = alertDrag.current; if (!st.down || !alertRailRef.current) return; const dx = e.pageX - st.startX; if (Math.abs(dx) > 4) st.moved = true; alertRailRef.current.scrollLeft = st.startScroll - dx; };
  const onAlertUp = () => { alertDrag.current.down = false; };
  const onAlertClickCapture = (e) => { if (alertDrag.current.moved) { e.preventDefault(); e.stopPropagation(); alertDrag.current.moved = false; } };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      try {
        const [chatRes, leadsRes] = await Promise.all([
          supabase.from('chat_logs').select('session_id, error', { count: 'exact' }).gte('created_at', since),
          supabase.from('leads').select('id, source, context', { count: 'exact' }).eq('context', 'coach_waitlist').gte('created_at', since),
        ]);
        if (cancelled) return;
        const chatRows = chatRes.data || [];
        const sessions = new Set(chatRows.map(r => r.session_id).filter(Boolean)).size;
        const messages = chatRows.length;
        const leadsRows = leadsRes.data || [];
        const captures = leadsRows.filter(l => l.source === 'expo-app-chat').length;
        const formSubmits = leadsRows.filter(l => l.source === 'expo-app').length;
        setFunnel({ sessions, messages, captures, formSubmits, total: leadsRows.length });
      } catch {
        if (!cancelled) setFunnel({ sessions: 0, messages: 0, captures: 0, formSubmits: 0, total: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-task sync — runs once when the dashboard mounts (with throttle
  // inside syncAutoTasks so re-mounts within 30s don't re-hit the DB).
  // Inserts coach_notes rows for any condition the system detects;
  // resolves any open auto-task whose condition no longer applies.
  useEffect(() => {
    const tList = Array.isArray(trainees) ? trainees : [];
    // The full plan list comes via App.jsx; if it's not in props here we
    // do a lightweight read for the rules that need it.
    // Earlier shape aliased `data:weeks` which collided with the real
    // `weeks` JSONB key, causing the next_block_due / week_missed rules to
    // think every plan was 4 weeks regardless of actual length. Read raw
    // `data` instead and project the two keys the rule consumers need.
    let cancelled = false;
    (async () => {
      // Newest first: the rules reason about CURRENT blocks, so if the cap is
      // ever reached it must bite on the oldest plans, not on an arbitrary set.
      // Unordered, a plan count past the cap would silently hide live programs
      // from every rule and spawn (or miss) tasks with no signal at all.
      const PLAN_CAP = 2000;
      const { data: plans, error: plansErr } = await supabase
        .from('plans')
        .select('id, name, trainee_id, data, created_at')
        .order('created_at', { ascending: false })
        .limit(PLAN_CAP);
      if ((plans || []).length >= PLAN_CAP) console.warn('[autoTasks] plan read hit the row cap — rules are seeing a subset');
      // A failed read would make the no-plan rule fire for every trainee —
      // one transient error must not spawn ~20 spurious auto-tasks.
      if (plansErr) { console.warn('autoTasks: plans read failed, skipping sync', plansErr); return; }
      const planList = (plans || []).map(p => ({
        id: p.id,
        name: p.name,
        traineeId: p.trainee_id,
        weeks: p.data?.weeks || 4,
        days: p.data?.days || [],
        createdAt: p.created_at,
      }));
      if (cancelled) return;
      try {
        await syncAutoTasks({
          trainees: tList,
          plans: planList,
          workouts: clientWorkouts || [],
          payments: payments || [],
        });
      } catch (e) {
        console.warn('autoTasks sync threw:', e);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainees.length]);

  // Staff (e.g. Yuval) — Athletes and every athlete-derived surface (KPIs,
  // roster table, alert cards, messages, revenue) are removed for now per Ohad.
  // Their dashboard is just the task queue: their own tasks + shared. Athlete
  // navigation from tasks is suppressed (no Athletes tab to land on).
  if (!isOwner) {
    return (
      <div>
        <NotesWidget compact
          viewerOwner="yuval"
          trainees={trainees}
          onOpenFullTasks={onOpenTasksTab}
          onNavigate={() => {}} />
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Active Athletes', value: active, total: trainees.filter(t=>t.status!=='Archived').length, color: C.gn },
          { label: 'Low Sessions', value: lowSessions, color: lowSessions > 0 ? C.or : C.gn },
          // Money KPIs — owner-only.
          ...(isOwner ? [
            { label: 'Estimated Monthly', value: `₪${monthlyRate.toLocaleString()}`, color: C.ac },
            // Label shortened from "Collected This Month" → "Collected MTD"
            // so the cyan title strip matches the height of the other 3
            // KPI tiles (the long form wrapped to two lines on common
            // viewport widths). MTD = month-to-date, finance standard.
            { label: 'Collected MTD', value: `₪${thisMonthPaid.toLocaleString()}`, sub: revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta}% vs last month` : null, subColor: revDelta >= 0 ? C.gn : C.rd, color: thisMonthPaid>0?C.gn:C.td },
          ] : []),
        ].map((s, i) => {
          const refined = isRefined5b();
          return (
            <div key={i} className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '16px 20px', boxShadow: C.cardShadow }}>
              {/* Always render the strip in BOTH themes for layout parity
                  (Ohad 2026-05-23). Dark mode strip uses --c-stripBg=#000
                  with cyan-30% bottom hairline; light mode is brand cyan. */}
              <RefinedHeaderStrip padY={16} padX={20}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 30 }}>
                  <span title="status" style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0, boxShadow: `0 0 5px ${s.color}66` }} />
                  <SectionLabel style={{ color: '#FFFFFF', fontSize: 13, letterSpacing: '0.08em', fontWeight: 700 }}>{s.label}</SectionLabel>
                </span>
              </RefinedHeaderStrip>
              <div style={{ fontSize: C.kpiNumberSize, fontWeight: 800, fontFamily: FN, color: C.tx, lineHeight: 1.05, letterSpacing: '-0.015em', direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'left' }}>{s.value}
                {s.total !== undefined && <span style={{ fontSize: 13, color: refined ? 'rgba(0,0,0,0.55)' : C.td, fontWeight: 400, letterSpacing: 0 }}> / {s.total}</span>}</div>
              {s.sub && <div style={{ fontSize: 10, fontFamily: FN, color: s.subColor, marginTop: 6, letterSpacing: '0.04em' }}>{s.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* INCOMING — top-of-funnel acquisition counts (chat / messages /
          captures / waitlist) over the last 30 days. Moved 2026-05-16
          above Revenue so the "what's coming IN" question reads before
          the "what's coming THROUGH" revenue numbers. Only renders when
          there's signal. */}
      {isOwner && funnel && (funnel.sessions || funnel.messages || funnel.total) ? (() => {
        const refined = isRefined5b();
        return (
          <CollapsibleSection title="Incoming · 30D" storageKey="dash-incoming" style={{ marginBottom: 14 }}
            right={<span style={{ fontSize: 10, fontFamily: FN, color: 'rgba(255,255,255,0.78)', letterSpacing: '0.06em' }}>VISITS in Vercel Analytics</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {[
                { label: 'CHAT SESSIONS', value: funnel.sessions, color: refined ? C.tx : C.tm },
                { label: 'MESSAGES SENT', value: funnel.messages, color: refined ? C.tx : C.tm },
                { label: 'EMAIL CAPTURES', value: funnel.captures, color: funnel.captures > 0 ? C.gn : C.td },
                { label: 'WAITLIST', value: funnel.total, color: funnel.total > 0 ? C.ac : C.td },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FN, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        );
      })() : null}

      {/* F-36 — Revenue detail card. Slots between Incoming + alert
          cards so the eye-track follows: what's coming IN → what's
          coming THROUGH (money) → what NEEDS attention (alerts).
          Six secondary metrics (LTV, avg ticket, 30/90d collected,
          outstanding, MRR) plus a 6-month bar chart. */}
      {isOwner && <RevenueCard
        monthlyRate={monthlyRate}
        thisMonthPaid={thisMonthPaid}
        delta30={delta30}
        collected30={collected30}
        collected90={collected90}
        avgLtv={avgLtv}
        avgTicket={avgTicket}
        outstanding={outstanding}
        monthBars={monthBars}
        maxBar={maxBar}
      />}

      {/* STORAGE — slim ops indicator, placed directly under Revenue/billing
          (Ohad) so the money block reads first, then the ops footnote. Color
          flips orange at 80% / red at 95% of the Supabase plan ceiling (100 GB
          on Pro). Hides while loading and on probe failure (silent-fail is
          safer than a broken/misreported bar). */}
      {isOwner && storage && (() => {
        const pct = Math.min(100, storage.pct);
        const tone = pct >= 95 ? C.rd : pct >= 80 ? C.or : C.gn;
        const usedTxt = storage.usedMB >= 1024
          ? `${(storage.usedMB / 1024).toFixed(2)} GB`
          : `${storage.usedMB.toFixed(0)} MB`;
        return (
          <div style={{
            background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
            borderRadius: 0, padding: '8px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: FN, fontSize: 13, color: C.tm, letterSpacing: '0.08em',
              fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
            }}>Storage</span>
            <div style={{ flex: '1 1 200px', minWidth: 140, height: 6, background: 'var(--c-sf2)', border: `0.25px solid ${C.cardBd}`, borderRadius: 0, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: tone, transition: 'width 200ms' }} />
            </div>
            <span style={{ fontFamily: FN, fontSize: 12, color: tone, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>
              {usedTxt} / {STORAGE_CAP_LABEL} · {pct}%
            </span>
            <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.08em', flexShrink: 0 }}>
              {storage.files} form videos
            </span>
          </div>
        );
      })()}

      {/* TASKS — moved 2026-05-16 to sit beneath Revenue. The KPI
          tiles + Revenue card form the "where is the business at?"
          glance; Tasks is the "what do I do next?" surface that
          follows. */}
      <div style={{ marginTop: 14, marginBottom: 14 }}>
        <NotesWidget compact
          viewerOwner={isOwner ? 'ohad' : 'yuval'}
          trainees={trainees}
          onOpenFullTasks={onOpenTasksTab}
          onCreatePlanForTask={onCreatePlanForTask}
          onOpenIntakeTab={onOpenIntakeTab}
          onOpenWaitlist={onOpenWaitlist}
          onNavigate={(kind, id) => {
            if (kind === 'trainee') onSelectTrainee?.(id);
            else if (kind === 'review' && id) {
              try { sessionStorage.setItem('expo-pendingReviewWorkout', id); } catch {}
              onOpenReviewWorkout?.(id);
            }
          }} />
      </div>

      {/* PushToggle moved from here to the ⋯ MoreMenu (Push Notifications
          ON/OFF item above Change Password) per Ohad 2026-05-23. */}

      {/* ONLINE NOW — lifted OUT of the alerts grid and up under Tasks
          (Ohad 2026-08-26: "the online now should be higher up top"). Who is
          training RIGHT NOW is the most perishable thing on this screen: it is
          worth acting on for minutes, while an expiring package or an overdue
          payment keeps. It was sitting below the inbox, off the first screen on
          a phone. Messages stays its own full-width row below it, never inside
          the alerts grid. */}
          {onlineNow.length > 0 && (
        <div className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.gn}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
          <RefinedHeaderStrip>
            <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="dot" color="#FFFFFF"/>Online Now ({onlineNow.length})</SectionLabel>
          </RefinedHeaderStrip>
          {onlineNow.map(t => (
            <div key={t.id} {...asButton(() => onSelectTrainee(t.id))} aria-label={`Open ${t.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', color: C.tx, fontSize: 13 }}>
              <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:C.gn,boxShadow:`0 0 4px ${C.gn}`}} />
              {t.name}
            </div>
          ))}
        </div>
      )}

      {/* MESSAGES — full-width inbox card, slotted between Tasks
          ("what should I do?") and the alerts grid ("what is the system
          flagging?"). Always renders so the dashboard has a permanent
          home for athlete↔coach communication. */}
      <MessagesCard trainees={trainees} onSelectTrainee={onSelectTrainee} onOpenMessages={onOpenTraineeMessages} />

      {/* Alert sections — Overdue + New Leads stack as one cell so leads
          sits directly beneath overdue (Ohad's eye-tracks money first, then
          the inbound funnel). Dormant + online + expiring fill remaining
          tracks via auto-fit so the dashboard stays a single visual scan. */}
      {(onlineNow.length > 0 || expiring.length > 0 || overduePayment.length > 0 || dropoutRisk.length > 0 || (leads && leads.length > 0)) && (
        <div ref={alertRailRef} className="alert-rail" onMouseDown={onAlertDown} onMouseMove={onAlertMove} onMouseUp={onAlertUp} onMouseLeave={onAlertUp} onClickCapture={onAlertClickCapture}
          style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'stretch', overflowX: 'auto', cursor: 'grab', paddingBottom: 4 }}>
          {(() => {
            // Expiring / Overdue / Dormant are drag-reorderable (alertOrder) —
            // see the hook block above. Each card's HEADER is the drag handle
            // (data-alert-key marks the drop target; alertCardWrapStyle/
            // alertHeaderDragProps drive the visuals + gesture).
            const cardsByKey = {
              expiring: expiring.length > 0 && (
                <div key="expiring" data-alert-key="expiring" className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.or}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow, ...alertCardWrapStyle('expiring') }}>
                  <div {...alertHeaderDragProps('expiring')}>
                    <RefinedHeaderStrip>
                      <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="alert" color="#FFFFFF"/>Expiring Packages ({expiring.length})</SectionLabel>
                    </RefinedHeaderStrip>
                  </div>
                  {expiring.map(t => (
                    <div key={t.id} {...asButton(() => onSelectTrainee(t.id))} aria-label={`Open ${t.name}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                      <span style={{ color: C.tx }}>{t.name}</span>
                      <span style={{ fontFamily: FN, fontWeight: 700, color: C.rd, fontSize: 12 }}>{t.sessionsRemaining} LEFT</span>
                    </div>
                  ))}
                </div>
              ),
              overdue: isOwner && overduePayment.length > 0 && (
                <div key="overdue" data-alert-key="overdue" className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.rd}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow, ...alertCardWrapStyle('overdue') }}>
                  <div {...alertHeaderDragProps('overdue')}>
                    <RefinedHeaderStrip>
                      <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="dollar" color="#FFFFFF"/>Overdue Payment ({overduePayment.length})</SectionLabel>
                    </RefinedHeaderStrip>
                  </div>
                  {overduePayment.map(t => (
                    <div key={t.id} {...asButton(() => onSelectTrainee(t.id))} aria-label={`Open ${t.name}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                      <span style={{ color: C.tx, flex: 1 }}>{t.name}</span>
                      <span style={{ fontFamily: FN, color: C.rd, fontSize: 11 }}>{t.neverPaid ? 'Never paid' : `${t.daysOverdue}d overdue`}</span>
                    </div>
                  ))}
                </div>
              ),
              dormant: dropoutRisk.length > 0 && (
                <div key="dormant" data-alert-key="dormant" className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.or}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow, ...alertCardWrapStyle('dormant') }}>
                  <div {...alertHeaderDragProps('dormant')}>
                    <RefinedHeaderStrip>
                      <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="moon" color="#FFFFFF"/>Dormant ({dropoutRisk.length})</SectionLabel>
                    </RefinedHeaderStrip>
                  </div>
                  {dropoutRisk.map(t => {
                    const days = t.lastWorkout ? Math.floor((now - new Date(t.lastWorkout.date)) / 86400000) : null;
                    return (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
                        <span {...asButton(() => onSelectTrainee(t.id))} aria-label={`Open ${t.name}`} style={{ color: C.tx, cursor: 'pointer', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        <span style={{ fontFamily: FN, color: C.or, fontSize: 11, flexShrink: 0, textAlign: 'right' }}>{days == null ? 'Never trained' : `${days}d ago`}</span>
                        {/* Reserved slot so the status right-edge aligns whether or not the
                            athlete has a phone (WhatsApp button renders null without one). */}
                        <span style={{ width: 26, display: 'inline-flex', justifyContent: 'flex-end', flexShrink: 0, marginLeft: 8 }}><DormantWhatsAppButton trainee={t} days={days} /></span>
                      </div>
                    );
                  })}
                </div>
              ),
            };
            return alertOrder.map(k => cardsByKey[k]).filter(Boolean);
          })()}
          {/* New Leads — not part of the drag-reorder set (Ohad named only
              Expiring/Overdue/Dormant); fixed position after them. */}
          {isOwner && leads && leads.length > 0 && (() => {
            // Multi-tenant gate-open counter — track only coach_waitlist
            // contexts (intake form leads on expo-il are athletes, not coaches).
            const COACH_GATE = 5;
            const coachLeads = leads.filter(l => l.context === 'coach_waitlist').length;
            const gateOpen = coachLeads >= COACH_GATE;
            const gateColor = gateOpen ? C.gn : (coachLeads > 0 ? C.or : C.td);
            return (
            <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '14px 18px' }}>
              <RefinedHeaderStrip>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <SectionLabel as="span" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="mail" color="#FFFFFF"/>New Leads ({leads.length})</SectionLabel>
                  <span title={gateOpen ? 'Gate open — apply multi-tenant migration' : `Multi-tenant migration applies once ${COACH_GATE} serious coach signups arrive`}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.55)', background: 'transparent', borderRadius: 0, padding: '2px 6px', letterSpacing: '0.04em' }}>
                    🎯 {coachLeads}/{COACH_GATE} {gateOpen ? 'OPEN' : 'GATE'}
                  </span>
                </div>
              </RefinedHeaderStrip>
              {leads.map(l => {
                const ageMs = now - new Date(l.created_at);
                const days = Math.floor(ageMs / 86400000);
                const hours = Math.floor(ageMs / 3600000);
                const ago = days >= 1 ? `${days}d` : hours >= 1 ? `${hours}h` : 'just now';
                const mailto = `mailto:${l.email}?subject=${encodeURIComponent('היי מ-EXPO')}&body=${encodeURIComponent('היי, ראיתי שהשארת מייל ב-expo-il.co.il.\n')}`;
                const isCoach = l.context === 'coach_waitlist';
                return (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
                    {isCoach && (
                      <span title="Coach waitlist signup" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.ac, background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '2px 5px', flexShrink: 0 }}>COACH</span>
                    )}
                    <a href={mailto} style={{ color: C.tx, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={`${l.context} · ${l.source}`}>{l.email}</a>
                    <span style={{ fontFamily: FN, color: C.td, fontSize: 10 }}>{ago}</span>
                    <button onClick={() => markLeadContacted(l.id)} title="Mark contacted" style={{ background: 'var(--c-sf)', border: `1px solid ${C.gn}`, color: C.gn, borderRadius: 0, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                    <button onClick={() => deleteLead(l.id)} title="Delete" style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, color: C.rd, borderRadius: 0, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      )}


      {/* Search */}
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
        <input placeholder="Filter athletes..." value={filter} onChange={e => setFilter(e.target.value)}
          style={{ ...baseInput, maxWidth: 300, paddingLeft: 12, textAlign: 'center', border: `1px solid ${C.tx}` }} />
      </div>

      {/* Client table */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.td }}>No clients yet. Import your trainee list.</div>
      ) : (() => {
        const refined = isRefined5b();
        const plainHeadStyle = { textAlign: 'center', padding: '10px 12px', fontSize: 9, fontFamily: FN, color: refined ? '#FFFFFF' : C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 };
        return (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
          {/* Canonical cyan strip-header + title, matching every other card on
              this page (RefinedHeaderStrip pattern). */}
          <div onClick={() => setAllAthletesOpen(o => !o)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAllAthletesOpen(o => !o); } }}
            style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: allAthletesOpen ? '1px solid var(--c-cardBd)' : 'none', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
            <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>All Athletes — {sorted.length}</SectionLabel>
            <span aria-hidden style={{ color: '#FFFFFF', fontSize: 12, lineHeight: 1, transform: allAthletesOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease' }}>▾</span>
          </div>
          <div style={{ display: 'grid', gridTemplateRows: allAthletesOpen ? '1fr' : '0fr', transition: 'grid-template-rows 260ms ease' }}><div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ background: refined ? 'var(--c-sf)' : 'transparent', borderBottom: `1px solid ${refined ? 'rgba(0,0,0,0.10)' : C.cardBd}` }}>
                <SH k="name" label="Athlete" />
                <SH k="status" label="Status" />
                <th style={plainHeadStyle}>Format</th>
                <th style={plainHeadStyle}>Package</th>
                <SH k="sessions" label="Sessions" />
                {isOwner && <SH k="paid" label="Total Paid" />}
                {isOwner && <SH k="lastPay" label="Last Payment" />}
                <SH k="workouts" label="Workouts" />
                <th style={plainHeadStyle}>Programs</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id} {...asButton(() => onSelectTrainee(t.id))} aria-label={`Open ${t.name}`}
                  style={{ borderBottom: `1px solid ${C.cardBd}`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = refined ? 'rgba(0,0,0,0.04)' : C.sf2}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px', fontWeight: 600, color: C.tx, textAlign: 'center' }}>{t.name}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}><Badge color={statusColor[t.status] || C.td}>{t.status}</Badge></td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12, textAlign: 'center' }}>{t.format}</td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12, textAlign: 'center' }}>{t.package}{isOwner && Number.isFinite(parseInt(t.packagePrice)) ? ` · ₪${parseInt(t.packagePrice).toLocaleString()}` : ''}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {t.sessionsRemaining > 0 ? (
                      <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 14, color: t.sessionsRemaining <= 2 ? C.rd : C.gn }}>{t.sessionsRemaining}</span>
                    ) : <span style={{ color: C.td, fontSize: 12 }}>—</span>}
                  </td>
                  {isOwner && <td style={{ padding: '12px', fontFamily: FN, fontWeight: 600, color: t.totalPaid > 0 ? C.gn : C.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {/* Show what the header says + what the sort orders by: TOTAL PAID
                        (sum of this athlete's payments), not the monthly rate — else
                        clicking the TOTAL PAID sort reorders by an invisible metric
                        and reads as "nothing changed" (Ohad). */}
                    {t.totalPaid > 0 ? `₪${Math.round(t.totalPaid).toLocaleString()}` : '—'}
                  </td>}
                  {isOwner && <td style={{ padding: '12px', color: C.tm, fontSize: 12, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {(() => { const d = t.lastPay?.date || t.lastPayment; return d ? new Date(d).toLocaleDateString('en-GB') : '—'; })()}
                  </td>}
                  <td style={{ padding: '12px', fontFamily: FN, color: t.workoutCount > 0 ? C.tx : C.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {t.workoutCount || '—'}
                  </td>
                  {/* Programs count recedes to muted grey (like the Format/Package
                      cells — "gym single" / "monthly"), not bright primary — it's a
                      reference number, not a headline metric (Ohad 2026-08-12). */}
                  <td style={{ padding: '12px', fontFamily: FN, fontSize: 12, color: t.planCount > 0 ? C.tm : C.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {t.planCount || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </div></div>
        </div>
        );
      })()}

      {/* (Removed the standalone "Dropout Risk — 14+ days" collapsible — it
          rendered the exact same dropoutRisk list as the "Dormant" rail card
          above, just in red. One list, one place. — OCD audit) */}

      {/* Payment summary — single theme-independent structure (was a refined?…:…
          split rendering a strip+22px card in light vs a plain 18px card in dark,
          i.e. different height/font/padding per theme). Now uses the canonical
          RefinedHeaderStrip (geometry constant across themes; only the strip BG
          color flips via --c-stripBg), so the card is identical in light & dark. */}
      {isOwner && totalAllPaid>0 && (
        <div style={{marginTop:24,display:'flex',justifyContent:'center'}}>
          <div style={{background:'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius:0, padding:'14px 20px', maxWidth:300, textAlign:'center', overflow:'hidden'}}>
            <RefinedHeaderStrip padY={14} padX={20} marginBottom={12}>
              <div style={{fontSize:10, fontFamily:FN, color:'#FFFFFF', textTransform:'uppercase', letterSpacing:'0.10em', fontWeight:700}}>Total Collected · All Time</div>
            </RefinedHeaderStrip>
            <div style={{fontSize:22, fontWeight:800, fontFamily:FN, color:C.tx, letterSpacing:'-0.01em'}}><span style={{color:C.ac}}>₪</span>{totalAllPaid.toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// F-36 — RevenueCard. Six-metric grid + 6-month bar chart, slotted into
// the dashboard between KPI tiles and alert cards. Designed to read at
// a glance without an analytics tab.
function RevenueCard({ monthlyRate, thisMonthPaid, delta30, collected30, collected90, avgLtv, avgTicket, outstanding, monthBars, maxBar }) {
  const refined = isRefined5b();
  const PAD = 18;
  const metricStyle = {
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '10px 14px',
    border: `1px solid ${C.cardBd}`,
    background: 'var(--c-sf)',
  };
  const labelStyle = { fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 };
  const numStyle = { fontFamily: FN, fontSize: 18, fontWeight: 800, color: C.tx, letterSpacing: '-0.01em' };
  const subStyle = { fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.04em', marginTop: 2 };

  return (
    <CollapsibleSection title="Revenue" storageKey="dash-revenue" style={{ marginBottom: 20 }}
      right={<span style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.12em', fontWeight: 700 }}>INCL. VAT · 6 MO TREND</span>}>
      <div>
        {/* Top row — 6 metric tiles. responsive auto-fit so it collapses
            to 3 / 2 / 1 column at narrower viewports. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
          <div style={metricStyle}>
            <span style={labelStyle}>MRR (ACTIVE)</span>
            <span style={numStyle}>₪{Math.round(monthlyRate).toLocaleString()}</span>
            <span style={subStyle}>recurring committed</span>
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>30D COLLECTED</span>
            <span style={numStyle}>₪{Math.round(collected30).toLocaleString()}</span>
            {delta30 !== null && (
              <span style={{ ...subStyle, color: delta30 >= 0 ? C.gn : C.rd }}>
                {delta30 >= 0 ? '+' : ''}{delta30}% vs prev 30d
              </span>
            )}
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>90D COLLECTED</span>
            <span style={numStyle}>₪{Math.round(collected90).toLocaleString()}</span>
            <span style={subStyle}>trailing 3 months</span>
          </div>
          <div style={metricStyle}>
            {/* OUTSTANDING carries a real status (overdue money) — per the
                first-row principle the number stays calm and the signal moves
                to a small amber dot beside the label, exactly like LOW SESSIONS. */}
            <span style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {outstanding.amount > 0 && <span title="outstanding balance" style={{ width: 6, height: 6, borderRadius: '50%', background: C.or, flexShrink: 0, boxShadow: `0 0 5px ${C.or}66` }} />}
              OUTSTANDING
            </span>
            <span style={numStyle}>₪{Math.round(outstanding.amount).toLocaleString()}</span>
            <span style={subStyle}>{outstanding.count} pending request{outstanding.count === 1 ? '' : 's'}</span>
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>AVG LTV</span>
            <span style={numStyle}>₪{avgLtv.toLocaleString()}</span>
            <span style={subStyle}>per paying client</span>
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>AVG TICKET</span>
            <span style={numStyle}>₪{avgTicket.toLocaleString()}</span>
            <span style={subStyle}>per payment row</span>
          </div>
        </div>

        {/* 6-month bar chart — collected revenue per month. Pure SVG-
            free implementation (just divs) so it stays under 2kb of
            DOM and inherits theme colors. */}
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>LAST 6 MONTHS · COLLECTED</div>
          {/* With nothing collected in any of the six months every bar renders at
              its 2% floor in the hairline colour, so the chart reads as an empty
              axis — i.e. as BROKEN rather than as "nothing came in yet". Say it
              instead. (Ohad: make it honest; empty is empty.) */}
          {monthBars.every((b) => !(b.value > 0)) ? (
            <div style={{
              height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px dashed var(--c-cardBd)`,
              fontFamily: FN, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--c-td)', textAlign: 'center', padding: '0 12px',
            }}>
              No payments marked collected in the last 6 months
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, alignItems: 'end', height: 90 }}>
            {monthBars.map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, height: '100%' }}>
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'flex-end',
                }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(2, Math.round((b.value / maxBar) * 100))}%`,
                    background: b.value > 0 ? C.ac : 'var(--c-cardBd)',
                    transition: 'height 200ms',
                  }} title={`${b.label} · ₪${Math.round(b.value).toLocaleString()}`} />
                </div>
                <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.08em', fontWeight: 700 }}>
                  {b.label}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

