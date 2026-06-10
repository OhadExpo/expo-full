import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { C, FN, FB, EXPO_ICON } from './theme';
import { Badge, baseInput, SectionLabel, isRefined5b, RefinedHeaderStrip, SectionIcon, confirmToast, CollapsibleSection, usePersistentState } from './ui';
import { traineeIdsFor } from './traineeUtils';
import { supabase } from './supabase';
import { WhatsAppCheckInButton, normalizePhoneIL } from './whatsappButton';
import NotesWidget from './NotesWidget';
import MessagesCard from './MessagesCard';
import { syncAutoTasks } from './autoTasks';

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

export default function DashboardView({ isOwner = true, trainees, planCounts, workouts, clientWorkouts, payments, presence, onSelectTrainee, onOpenTasksTab, onCreatePlanForTask, onOpenIntakeTab, onOpenWaitlist, onOpenReviewWorkout }) {
  // Staff (non-owner, e.g. Yuval a masseur) share Ohad's clients but not his
  // money: every revenue / pricing / leads surface below is gated on isOwner.
  // What stays: client-engagement signals (active count, low sessions, online,
  // dormant/dropout, expiring packages), Tasks, and Messages.
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState(1);
  const [filter, setFilter] = useState('');

  const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac };

  const enriched = useMemo(() => trainees.map(t => {
    // Workouts and payments for couple trainees may be recorded under sub-member IDs
    // (tr_xxx__0 / __1). Roll everything up to the parent for dashboard display.
    const ids = new Set(traineeIdsFor(t.id));
    const tPay = payments.filter(p => ids.has(p.traineeId));
    const tWorkInPerson = workouts.filter(w => ids.has(w.traineeId) && w.status === 'completed');
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
    return { ...t, totalPaid, lastPay, lastWorkout, workoutCount: tWork.length, planCount: planCounts[t.id] || 0 };
  }), [trainees, payments, workouts, clientWorkouts, planCounts]);

  const filtered = enriched.filter(t => !filter || (t.name || '').toLowerCase().includes(filter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '') * dir;
    if (sort === 'status') return (a.status || '').localeCompare(b.status || '') * dir;
    if (sort === 'sessions') return ((Number.isFinite(a.sessionsRemaining) ? a.sessionsRemaining : 0) - (Number.isFinite(b.sessionsRemaining) ? b.sessionsRemaining : 0)) * dir;
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
  const lowSessions = enriched.filter(t => t.sessionsRemaining > 0 && t.sessionsRemaining <= 2).length;

  // Last month's income for comparison
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthPaid = payments.filter(p => { const d=new Date(p.date); return d.getMonth()===lastMonth.getMonth() && d.getFullYear()===lastMonth.getFullYear() && p.status==='Paid'; }).reduce((a,p) => a + (parseFloat(p.amount)||0), 0);
  const revDelta = lastMonthPaid > 0 ? Math.round(((thisMonthPaid - lastMonthPaid) / lastMonthPaid) * 100) : null;

  // F-36 — Revenue dashboard card. Trailing 30/90d collected + outstanding
  // (pending Bit payment requests) + average client LTV + 6-month bar
  // sparkline. Keeps every metric pulled from the same payments array
  // the rest of the dashboard already loads, so no extra query cost.
  const ms30 = 30 * 86400000;
  const ms90 = 90 * 86400000;
  const paidPayments = payments.filter(p => p.status === 'Paid');
  const collected30 = paidPayments.filter(p => (now - new Date(p.date)) <= ms30).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
  const collected90 = paidPayments.filter(p => (now - new Date(p.date)) <= ms90).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
  const avgTicket = paidPayments.length ? Math.round(totalAllPaid / paidPayments.length) : 0;
  const everPaidClientIds = new Set(paidPayments.map(p => p.traineeId).filter(Boolean));
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

  // Outstanding — sum of pending Bit payment requests.
  const [outstanding, setOutstanding] = useState({ amount: 0, count: 0 });
  const [dropoutExpanded, setDropoutExpanded] = usePersistentState('dash-dropout', false);
  const [allAthletesOpen, setAllAthletesOpen] = usePersistentState('dash-all-athletes', true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('bit_payment_requests')
          .select('amount, status')
          .eq('status', 'pending')
          .limit(500);
        if (cancelled) return;
        const arr = data || [];
        setOutstanding({
          amount: arr.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0),
          count: arr.length,
        });
      } catch {
        if (!cancelled) setOutstanding({ amount: 0, count: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Dropout risk: active clients who haven't trained in 14+ days
  const DROPOUT_DAYS = 14;
  const dropoutRisk = enriched.filter(t => {
    if (t.status !== 'Active') return false;
    if (!t.lastWorkout) return true; // never trained
    const daysSince = Math.floor((now - new Date(t.lastWorkout.date)) / 86400000);
    return daysSince >= DROPOUT_DAYS;
  });

  // Expiring packages: active with ≤2 sessions
  const expiring = enriched.filter(t => t.status === 'Active' && t.sessionsRemaining > 0 && t.sessionsRemaining <= 2);

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
  // mount. Public read works because form-videos has a `public_read` policy.
  //
  // Probe is two-pass: (1) supabase-js `list()` first, which has historically
  // mis-returned 0 results when the storage RLS policy is permissive only to
  // anon (the SDK attaches the user's JWT and the request gets evaluated
  // against a per-user policy that doesn't exist). (2) Fall back to a raw
  // REST call with just the anon key, which always works against the
  // public_read policy. Either path that returns data short-circuits the
  // other. Errors are surfaced to the tile (showing a small "?" + last
  // error message in the console) instead of silently rendering as 0.
  const STORAGE_CAP_MB = 1024;
  const [storage, setStorage] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
      const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
      // Use the raw REST endpoint with just the anon key. The bucket's
      // public_read policy explicitly allows this; the SDK path was
      // returning 0 results under certain auth contexts. The REST endpoint
      // is the more reliable read path for capacity probes.
      const listRaw = async (prefix) => {
        const r = await fetch(`${SUPA_URL}/storage/v1/object/list/form-videos`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, limit: 1000 }),
        });
        if (!r.ok) throw new Error(`list failed at "${prefix}" (${r.status})`);
        return r.json();
      };
      try {
        let total = 0, files = 0;
        const walk = async (prefix) => {
          const data = await listRaw(prefix);
          if (!Array.isArray(data)) return;
          for (const it of data) {
            // Folders come back with id===null + no metadata. Files have a
            // UUID + a metadata object with `size` (bytes).
            if (it.id === null) {
              await walk(prefix ? `${prefix}/${it.name}` : it.name);
            } else {
              total += it.metadata?.size || 0;
              files++;
            }
          }
        };
        await walk('');
        if (cancelled) return;
        const usedMB = total / 1024 / 1024;
        const pct = Math.round((usedMB / STORAGE_CAP_MB) * 100);
        setStorage({ usedMB, pct, files });
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
      const { data: plans, error: plansErr } = await supabase
        .from('plans')
        .select('id, name, trainee_id, data, created_at')
        .limit(500);
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
                <SectionLabel style={{ color: '#FFFFFF', fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>{s.label}</SectionLabel>
              </RefinedHeaderStrip>
              <div style={{ fontSize: C.kpiNumberSize, fontWeight: 800, fontFamily: FN, color: s.color, lineHeight: 1.05, letterSpacing: '-0.015em' }}>{s.value}
                {s.total !== undefined && <span style={{ fontSize: 13, color: refined ? 'rgba(0,0,0,0.55)' : C.td, fontWeight: 400, letterSpacing: 0 }}> / {s.total}</span>}</div>
              {s.sub && <div style={{ fontSize: 10, fontFamily: FN, color: s.subColor, marginTop: 6, letterSpacing: '0.04em' }}>{s.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* STORAGE — slim ops indicator. Color flips orange at 80% / red at
          95% of the 1 GB Supabase free-tier ceiling so the coach has a
          chance to clean up before the wall. Hides entirely while loading
          and on probe failure (anon read could 403 if the public_read
          policy ever changes — silent failure is safer than a broken UI). */}
      {isOwner && storage && (() => {
        const refined = isRefined5b();
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
              fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em',
              fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
            }}>Storage</span>
            <div style={{ flex: '1 1 200px', minWidth: 140, height: 6, background: 'var(--c-sf2)', border: `0.25px solid ${C.cardBd}`, borderRadius: 0, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: tone, transition: 'width 200ms' }} />
            </div>
            <span style={{ fontFamily: FN, fontSize: 12, color: tone, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>
              {usedTxt} / 1 GB · {pct}%
            </span>
            <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.08em', flexShrink: 0 }}>
              {storage.files} form videos
            </span>
          </div>
        );
      })()}

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
        revDelta={revDelta}
        collected30={collected30}
        collected90={collected90}
        avgLtv={avgLtv}
        avgTicket={avgTicket}
        outstanding={outstanding}
        monthBars={monthBars}
        maxBar={maxBar}
      />}

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

      {/* MESSAGES — full-width inbox card, slotted between Tasks
          ("what should I do?") and the alerts grid ("what is the system
          flagging?"). Always renders so the dashboard has a permanent
          home for athlete↔coach communication. */}
      <MessagesCard trainees={trainees} onSelectTrainee={onSelectTrainee} />

      {/* Alert sections — Overdue + New Leads stack as one cell so leads
          sits directly beneath overdue (Ohad's eye-tracks money first, then
          the inbound funnel). Dormant + online + expiring fill remaining
          tracks via auto-fit so the dashboard stays a single visual scan. */}
      {(onlineNow.length > 0 || expiring.length > 0 || overduePayment.length > 0 || dropoutRisk.length > 0 || (leads && leads.length > 0)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20, alignItems: 'start' }}>
          {onlineNow.length > 0 && (
            <div className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.gn}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
              <RefinedHeaderStrip>
                <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="dot" color="#FFFFFF"/>Online Now ({onlineNow.length})</SectionLabel>
              </RefinedHeaderStrip>
              {onlineNow.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', color: C.tx, fontSize: 13 }}>
                  <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:C.gn,boxShadow:`0 0 4px ${C.gn}`}} />
                  {t.name}
                </div>
              ))}
            </div>
          )}
          {expiring.length > 0 && (
            <div className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.or}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
              <RefinedHeaderStrip>
                <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="alert" color="#FFFFFF"/>Expiring Packages ({expiring.length})</SectionLabel>
              </RefinedHeaderStrip>
              {expiring.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: C.tx }}>{t.name}</span>
                  <span style={{ fontFamily: FN, fontWeight: 700, color: C.rd, fontSize: 12 }}>{t.sessionsRemaining} LEFT</span>
                </div>
              ))}
            </div>
          )}
          {isOwner && (overduePayment.length > 0 || (leads && leads.length > 0)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {overduePayment.length > 0 && (
                <div className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.rd}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
                  <RefinedHeaderStrip>
                    <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="dollar" color="#FFFFFF"/>Overdue Payment ({overduePayment.length})</SectionLabel>
                  </RefinedHeaderStrip>
                  {overduePayment.map(t => (
                    <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                      <span style={{ color: C.tx, flex: 1 }}>{t.name}</span>
                      <span style={{ fontFamily: FN, color: C.rd, fontSize: 11 }}>{t.neverPaid ? 'Never paid' : `${t.daysOverdue}d overdue`}</span>
                    </div>
                  ))}
                </div>
              )}
              {leads && leads.length > 0 && (() => {
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
                        style={{ fontFamily: FN, fontSize: 9, color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.55)', background: 'transparent', borderRadius: 0, padding: '2px 6px', letterSpacing: '0.04em' }}>
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
                          <span title="Coach waitlist signup" style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.ac, background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '2px 5px', flexShrink: 0 }}>COACH</span>
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
          {dropoutRisk.length > 0 && (
            <div className="alert-card" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.or}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
              <RefinedHeaderStrip>
                <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="moon" color="#FFFFFF"/>Dormant ({dropoutRisk.length})</SectionLabel>
              </RefinedHeaderStrip>
              {dropoutRisk.map(t => {
                const days = t.lastWorkout ? Math.floor((now - new Date(t.lastWorkout.date)) / 86400000) : null;
                return (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
                    <span onClick={() => onSelectTrainee(t.id)} style={{ color: C.tx, cursor: 'pointer', flex: 1 }}>{t.name}</span>
                    <span style={{ fontFamily: FN, color: C.or, fontSize: 11, marginRight: 8 }}>{days == null ? 'Never trained' : `${days}d ago`}</span>
                    <DormantWhatsAppButton trainee={t} days={days} />
                  </div>
                );
              })}
            </div>
          )}
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
                <tr key={t.id} onClick={() => onSelectTrainee(t.id)}
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
                  {isOwner && <td style={{ padding: '12px', fontFamily: FN, fontWeight: 600, color: parseFloat(t.monthly) > 0 ? C.gn : C.td, textAlign: 'center' }}>
                    {parseFloat(t.monthly) > 0 ? `₪${parseInt(t.monthly).toLocaleString()}/MO` : '—'}
                  </td>}
                  {isOwner && <td style={{ padding: '12px', color: C.tm, fontSize: 12, textAlign: 'center' }}>
                    {t.lastPayment ? new Date(t.lastPayment).toLocaleDateString('he-IL') : '—'}
                  </td>}
                  <td style={{ padding: '12px', fontFamily: FN, color: t.workoutCount > 0 ? C.ac : C.td, textAlign: 'center' }}>
                    {t.workoutCount || '—'}
                  </td>
                  <td style={{ padding: '12px', fontFamily: FN, color: t.planCount > 0 ? C.ac : C.td, textAlign: 'center' }}>
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

      {/* Dropout risk — fully collapsed by default. Header is the only
          visible row when closed (shows count + chevron); click to expand. */}
      {dropoutRisk.length > 0 && (
        <div className="alert-card" style={{ marginTop: 20, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.rd}`, borderRadius: 0, padding: '0 18px', boxShadow: C.cardShadow }}>
          {/* Keep card padding + header strip static (always the collapsed
              geometry) so the strip's -18px bleed always lands on the card
              edge. All expand/collapse motion lives in the height-animating
              list wrapper below — no padding/margin toggle to fight the
              animation. The strip's -18px bleed needs the 18px h-padding. */}
          <RefinedHeaderStrip padY={0} marginBottom={0}>
            <div onClick={() => setDropoutExpanded(o => !o)}
              role="button" tabIndex={0} aria-expanded={dropoutExpanded}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDropoutExpanded(o => !o); } }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', width: '100%' }}
              title={dropoutExpanded ? 'Click to collapse' : 'Click to expand'}>
              <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="trendingDown" color="#FFFFFF"/>Dropout Risk — 14+ days ({dropoutRisk.length})</SectionLabel>
              <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.08em',
                transition: 'transform 280ms ease',
                transform: dropoutExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
            </div>
          </RefinedHeaderStrip>
          {/* grid 0fr→1fr animates to the list's natural height without a
              hardcoded max-height; inner overflow:hidden clips during motion. */}
          <div style={{ display: 'grid', gridTemplateRows: dropoutExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 280ms ease' }}>
            <div style={{ overflow: 'hidden', minHeight: 0 }}>
              <div style={{ paddingTop: 12, paddingBottom: 14 }}>
                {dropoutRisk.map(t => {
                  const days = t.lastWorkout ? Math.floor((now - new Date(t.lastWorkout.date)) / 86400000) : null;
                  const daysLabel = days == null ? 'Never trained' : `${days}d ago`;
                  return (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
                      <span onClick={() => onSelectTrainee(t.id)} style={{ color: C.tx, cursor: 'pointer', flex: 1 }}>{t.name}</span>
                      <span style={{ fontFamily: FN, color: C.rd, fontSize: 11, marginRight: 8 }}>{daysLabel}</span>
                      <DormantWhatsAppButton trainee={t} days={days} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment summary */}
      {isOwner && totalAllPaid>0&&(()=>{
        const refined = isRefined5b();
        return <div style={{marginTop:24,display:'flex',justifyContent:'center'}}>
          <div style={{background: 'var(--c-sf)', border:`1px solid ${C.cardBd}`, borderRadius:0, padding: refined ? 0 : '14px 20px', maxWidth:300, textAlign:'center', overflow:'hidden'}}>
            {refined ? (
              <>
                <div style={{background:'var(--c-sf)', padding:'8px 20px', borderBottom:'1px solid rgba(0,0,0,0.10)'}}>
                  <div style={{fontSize:10, fontFamily:FN, color:'#FFFFFF', textTransform:'uppercase', letterSpacing:'0.10em', fontWeight:700}}>Total Collected · All Time</div>
                </div>
                <div style={{padding:'14px 20px'}}>
                  <div style={{fontSize:22, fontWeight:800, fontFamily:FN, color:C.tx, letterSpacing:'-0.01em'}}><span style={{color:C.ac}}>₪</span>{totalAllPaid.toLocaleString()}</div>
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize:9, fontFamily:FN, color:C.tm, textTransform:"uppercase", letterSpacing:'0.18em', fontWeight:700, marginBottom:4}}>Total Collected (All Time)</div>
                <div style={{fontSize:18, fontWeight:700, fontFamily:FN, color:C.ac}}>₪{totalAllPaid.toLocaleString()}</div>
              </>
            )}
          </div>
        </div>;
      })()}
    </div>
  );
}

// F-36 — RevenueCard. Six-metric grid + 6-month bar chart, slotted into
// the dashboard between KPI tiles and alert cards. Designed to read at
// a glance without an analytics tab.
function RevenueCard({ monthlyRate, thisMonthPaid, revDelta, collected30, collected90, avgLtv, avgTicket, outstanding, monthBars, maxBar }) {
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
            <span style={numStyle}><span style={{ color: C.ac }}>₪</span>{Math.round(monthlyRate).toLocaleString()}</span>
            <span style={subStyle}>recurring committed</span>
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>30D COLLECTED</span>
            <span style={numStyle}><span style={{ color: C.gn }}>₪</span>{Math.round(collected30).toLocaleString()}</span>
            {revDelta !== null && (
              <span style={{ ...subStyle, color: revDelta >= 0 ? C.gn : C.rd }}>
                {revDelta >= 0 ? '+' : ''}{revDelta}% vs prev month
              </span>
            )}
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>90D COLLECTED</span>
            <span style={numStyle}><span style={{ color: C.gn }}>₪</span>{Math.round(collected90).toLocaleString()}</span>
            <span style={subStyle}>trailing 3 months</span>
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>OUTSTANDING</span>
            <span style={{ ...numStyle, color: outstanding.amount > 0 ? C.or : C.tx }}>
              <span style={{ color: outstanding.amount > 0 ? C.or : C.ac }}>₪</span>{Math.round(outstanding.amount).toLocaleString()}
            </span>
            <span style={subStyle}>{outstanding.count} pending Bit request{outstanding.count === 1 ? '' : 's'}</span>
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>AVG LTV</span>
            <span style={numStyle}><span style={{ color: C.ac }}>₪</span>{avgLtv.toLocaleString()}</span>
            <span style={subStyle}>per paying client</span>
          </div>
          <div style={metricStyle}>
            <span style={labelStyle}>AVG TICKET</span>
            <span style={numStyle}><span style={{ color: C.ac }}>₪</span>{avgTicket.toLocaleString()}</span>
            <span style={subStyle}>per payment row</span>
          </div>
        </div>

        {/* 6-month bar chart — collected revenue per month. Pure SVG-
            free implementation (just divs) so it stays under 2kb of
            DOM and inherits theme colors. */}
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>LAST 6 MONTHS · COLLECTED</div>
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
        </div>
      </div>
    </CollapsibleSection>
  );
}

