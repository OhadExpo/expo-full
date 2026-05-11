import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { C, FN, FB, EXPO_ICON } from './theme';
import { Badge, baseInput, SectionLabel } from './ui';
import { traineeIdsFor } from './traineeUtils';
import { supabase } from './supabase';
import { WhatsAppCheckInButton, normalizePhoneIL } from './whatsappButton';

// Refined dashboard (theme=5b): replace emoji section icons with inline
// stroke SVGs so the icon vocabulary matches the header's stroke icons.
// Default (theme=5): emoji unchanged. Detection happens once at render.
const isRefined5b = () => {
  if (typeof document === 'undefined') return false;
  const dt = document.documentElement.getAttribute('data-theme');
  return dt === '5b' || dt === 'light';
};

// RefinedHeaderStrip — cyan bg + white text strip that extends to the
// card edges via negative margins. Mirrors the active "DASHBOARD" pill
// in the top nav (cyan-filled, white text), giving every card a
// headline zone in light mode. Body of the card stays white below.
// Dark mode does not use this; cards there are single-zone surfaces.
function RefinedHeaderStrip({ children, padY = 14, padX = 18 }) {
  return (
    <div style={{
      background: 'var(--c-sf)',
      margin: `-${padY}px -${padX}px 12px`,
      padding: `8px ${padX}px`,
      borderBottom: '1px solid rgba(0,0,0,0.10)',
    }}>{children}</div>
  );
}

function SectionIcon({ kind, color, size = 14 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { verticalAlign: '-2px', marginRight: 6, flexShrink: 0 } };
  switch (kind) {
    case 'alert': return <svg {...common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'dollar': return <svg {...common}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case 'moon': return <svg {...common}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case 'trendingDown': return <svg {...common}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>;
    case 'mail': return <svg {...common}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
    case 'dot': return <svg {...common} fill={color}><circle cx="12" cy="12" r="5"/></svg>;
    default: return null;
  }
}

// Dormant alert action: opens WhatsApp with a prefilled Hebrew check-in.
// For couples we pick the member whose phone is set; if both have phones,
// message the first member only (two conversations would duplicate the nudge).
function DormantWhatsAppButton({ trainee, days }) {
  const target = (() => {
    if (trainee.members && trainee.members.length === 2) {
      const m = trainee.members.find(mm => normalizePhoneIL(mm?.phone));
      return m ? { name: m.name || trainee.name, phone: m.phone } : null;
    }
    return trainee.phone ? { name: trainee.name, phone: trainee.phone } : null;
  })();
  if (!target) return null;
  return <WhatsAppCheckInButton name={target.name} phone={target.phone} days={days} />;
}

export default function DashboardView({ trainees, planCounts, workouts, clientWorkouts, payments, presence, onSelectTrainee }) {
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
    const totalPaid = tPay.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const lastPay = tPay.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const lastWorkout = tWork.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return { ...t, totalPaid, lastPay, lastWorkout, workoutCount: tWork.length, planCount: planCounts[t.id] || 0 };
  }), [trainees, payments, workouts, clientWorkouts, planCounts]);

  const filtered = enriched.filter(t => !filter || t.name.toLowerCase().includes(filter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name) * dir;
    if (sort === 'status') return a.status.localeCompare(b.status) * dir;
    if (sort === 'sessions') return ((Number.isFinite(a.sessionsRemaining) ? a.sessionsRemaining : 0) - (Number.isFinite(b.sessionsRemaining) ? b.sessionsRemaining : 0)) * dir;
    if (sort === 'paid') return (a.totalPaid - b.totalPaid) * dir;
    if (sort === 'lastPay') return ((a.lastPay ? new Date(a.lastPay.date).getTime() : 0) - (b.lastPay ? new Date(b.lastPay.date).getTime() : 0)) * dir;
    if (sort === 'workouts') return (a.workoutCount - b.workoutCount) * dir;
    return 0;
  });

  const toggleSort = (key) => { if (sort === key) setDir(d => d * -1); else { setSort(key); setDir(1); } };
  const SH = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ textAlign: 'center', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: sort === k ? C.ac : C.td, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {sort === k ? (dir === 1 ? '↑' : '↓') : ''}
    </th>
  );

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
    if (!confirm('Delete this lead?')) return;
    setLeads(curr => (curr || []).filter(l => l.id !== id));
    try { await supabase.from('leads').delete().eq('id', id); } catch {}
  };

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

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Active Athletes', value: active, total: trainees.filter(t=>t.status!=='Archived').length, color: C.gn },
          { label: 'Low Sessions', value: lowSessions, color: lowSessions > 0 ? C.or : C.gn },
          { label: 'Estimated Monthly', value: `₪${monthlyRate.toLocaleString()}`, color: C.ac },
          { label: 'Collected This Month', value: `₪${thisMonthPaid.toLocaleString()}`, sub: revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta}% vs last month` : null, subColor: revDelta >= 0 ? C.gn : C.rd, color: thisMonthPaid>0?C.gn:C.td },
        ].map((s, i) => {
          const refined = isRefined5b();
          return (
            <div key={i} className="alert-card" style={{ background: refined ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '16px 20px', boxShadow: C.cardShadow }}>
              {refined ? (
                <RefinedHeaderStrip padY={16} padX={20}>
                  <SectionLabel style={{ color: '#FFFFFF', fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>{s.label}</SectionLabel>
                </RefinedHeaderStrip>
              ) : (
                <SectionLabel style={{ marginBottom: 8 }}>{s.label}</SectionLabel>
              )}
              <div style={{ fontSize: C.kpiNumberSize, fontWeight: refined ? 800 : 700, fontFamily: FN, color: s.color, lineHeight: 1.05, letterSpacing: '-0.015em' }}>{s.value}
                {s.total !== undefined && <span style={{ fontSize: 13, color: refined ? 'rgba(0,0,0,0.55)' : C.td, fontWeight: 400, letterSpacing: 0 }}> / {s.total}</span>}</div>
              {s.sub && <div style={{ fontSize: 10, fontFamily: FN, color: s.subColor, marginTop: 6, letterSpacing: '0.04em' }}>{s.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* Alert sections — Overdue + New Leads stack as one cell so leads
          sits directly beneath overdue (Ohad's eye-tracks money first, then
          the inbound funnel). Dormant + online + expiring fill remaining
          tracks via auto-fit so the dashboard stays a single visual scan. */}
      {(onlineNow.length > 0 || expiring.length > 0 || overduePayment.length > 0 || dropoutRisk.length > 0 || (leads && leads.length > 0)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20, alignItems: 'start' }}>
          {onlineNow.length > 0 && (
            <div className="alert-card" style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.gn}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
              {isRefined5b() ? (
                <RefinedHeaderStrip>
                  <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="dot" color="#FFFFFF"/>Online Now ({onlineNow.length})</SectionLabel>
                </RefinedHeaderStrip>
              ) : (
                <SectionLabel color={C.gn} style={{ marginBottom: 8, fontSize: C.alertLabelSize }}>{`🟢 Online Now (${onlineNow.length})`}</SectionLabel>
              )}
              {onlineNow.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', color: C.tx, fontSize: 13 }}>
                  <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:C.gn,boxShadow:`0 0 4px ${C.gn}`}} />
                  {t.name}
                </div>
              ))}
            </div>
          )}
          {expiring.length > 0 && (
            <div className="alert-card" style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.or}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
              {isRefined5b() ? (
                <RefinedHeaderStrip>
                  <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="alert" color="#FFFFFF"/>Expiring Packages ({expiring.length})</SectionLabel>
                </RefinedHeaderStrip>
              ) : (
                <SectionLabel color={C.or} as="div" style={{ marginBottom: 8, fontSize: C.alertLabelSize }}>{`⚠ Expiring Packages (${expiring.length})`}</SectionLabel>
              )}
              {expiring.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: C.tx }}>{t.name}</span>
                  <span style={{ fontFamily: FN, fontWeight: 700, color: C.rd, fontSize: 12 }}>{t.sessionsRemaining} LEFT</span>
                </div>
              ))}
            </div>
          )}
          {(overduePayment.length > 0 || (leads && leads.length > 0)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {overduePayment.length > 0 && (
                <div className="alert-card" style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.rd}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
                  {isRefined5b() ? (
                    <RefinedHeaderStrip>
                      <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="dollar" color="#FFFFFF"/>Overdue Payment ({overduePayment.length})</SectionLabel>
                    </RefinedHeaderStrip>
                  ) : (
                    <SectionLabel color={C.rd} style={{ marginBottom: 8, fontSize: C.alertLabelSize }}>{`💰 Overdue Payment (${overduePayment.length})`}</SectionLabel>
                  )}
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
                <div style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '14px 18px' }}>
                  {isRefined5b() ? (
                    <RefinedHeaderStrip>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <SectionLabel as="span" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="mail" color="#FFFFFF"/>New Leads ({leads.length})</SectionLabel>
                        <span title={gateOpen ? 'Gate open — apply multi-tenant migration' : `Multi-tenant migration applies once ${COACH_GATE} serious coach signups arrive`}
                          style={{ fontFamily: FN, fontSize: 9, color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.55)', background: 'transparent', borderRadius: 0, padding: '2px 6px', letterSpacing: '0.04em' }}>
                          🎯 {coachLeads}/{COACH_GATE} {gateOpen ? 'OPEN' : 'GATE'}
                        </span>
                      </div>
                    </RefinedHeaderStrip>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <SectionLabel as="span" color={C.ac} style={{ fontSize: C.alertLabelSize }}>{`📩 New Leads (${leads.length})`}</SectionLabel>
                      <span title={gateOpen ? 'Gate open — apply multi-tenant migration' : `Multi-tenant migration applies once ${COACH_GATE} serious coach signups arrive`}
                        style={{ fontFamily: FN, fontSize: 9, color: gateColor, border: `1px solid ${gateColor}`, background: 'transparent', borderRadius: 0, padding: '2px 6px', letterSpacing: '0.04em' }}>
                        🎯 {coachLeads}/{COACH_GATE} {gateOpen ? 'OPEN' : 'GATE'}
                      </span>
                    </div>
                  )}
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
            <div className="alert-card" style={{ background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.or}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
              {isRefined5b() ? (
                <RefinedHeaderStrip>
                  <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="moon" color="#FFFFFF"/>Dormant ({dropoutRisk.length})</SectionLabel>
                </RefinedHeaderStrip>
              ) : (
                <SectionLabel color={C.or} as="div" style={{ marginBottom: 8, fontSize: C.alertLabelSize }}>{`💤 Dormant (${dropoutRisk.length})`}</SectionLabel>
              )}
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

      {/* /coaches funnel tile — only renders when there's any signal to show.
          Visits row is intentionally absent here: the denominator lives in
          Vercel Analytics. The numbers below are first-party counts from
          chat_logs + leads, so they keep working even if Analytics isn't
          enabled. */}
      {funnel && (funnel.sessions || funnel.messages || funnel.total) ? (
        <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>/COACHES FUNNEL · 30D</span>
            <span style={{ fontSize: 10, fontFamily: FN, color: C.td, letterSpacing: '0.06em' }}>VISITS in Vercel Analytics</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'CHAT SESSIONS', value: funnel.sessions, color: C.tm },
              { label: 'MESSAGES SENT', value: funnel.messages, color: C.tm },
              { label: 'EMAIL CAPTURES', value: funnel.captures, color: funnel.captures > 0 ? C.gn : C.td },
              { label: 'WAITLIST', value: funnel.total, color: funnel.total > 0 ? C.ac : C.td },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FN, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Search */}
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
        <input placeholder="Filter athletes..." value={filter} onChange={e => setFilter(e.target.value)}
          style={{ ...baseInput, maxWidth: 300, paddingLeft: 12, textAlign: 'center' }} />
      </div>

      {/* Client table */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.td }}>No clients yet. Import your trainee list.</div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>
                <SH k="name" label="Athlete" />
                <SH k="status" label="Status" />
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>Format</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>Package</th>
                <SH k="sessions" label="Sessions" />
                <SH k="paid" label="Total Paid" />
                <SH k="lastPay" label="Last Payment" />
                <SH k="workouts" label="Workouts" />
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>Programs</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id} onClick={() => onSelectTrainee(t.id)}
                  style={{ borderBottom: `1px solid ${C.cardBd}`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.sf2}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px', fontWeight: 600, color: C.tx }}>{t.name}</td>
                  <td style={{ padding: '12px' }}><Badge color={statusColor[t.status] || C.td}>{t.status}</Badge></td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>{t.format}</td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>{t.package}{t.packagePrice ? ` · ₪${parseInt(t.packagePrice).toLocaleString()}` : ''}</td>
                  <td style={{ padding: '12px' }}>
                    {t.sessionsRemaining > 0 ? (
                      <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 14, color: t.sessionsRemaining <= 2 ? C.rd : C.gn }}>{t.sessionsRemaining}</span>
                    ) : <span style={{ color: C.td, fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px', fontFamily: FN, fontWeight: 600, color: parseFloat(t.monthly) > 0 ? C.gn : C.td }}>
                    {parseFloat(t.monthly) > 0 ? `₪${parseInt(t.monthly).toLocaleString()}/MO` : '—'}
                  </td>
                  <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>
                    {t.lastPayment ? new Date(t.lastPayment).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td style={{ padding: '12px', fontFamily: FN, color: t.workoutCount > 0 ? C.ac : C.td }}>
                    {t.workoutCount || '—'}
                  </td>
                  <td style={{ padding: '12px', fontFamily: FN, color: t.planCount > 0 ? C.ac : C.td }}>
                    {t.planCount || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dropout risk — below the client list */}
      {dropoutRisk.length > 0 && (
        <div className="alert-card" style={{ marginTop: 20, background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.rd}`, borderRadius: 0, padding: '14px 18px', boxShadow: C.cardShadow }}>
          {isRefined5b() ? (
            <RefinedHeaderStrip>
              <SectionLabel style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}><SectionIcon kind="trendingDown" color="#FFFFFF"/>Dropout Risk — 14+ days ({dropoutRisk.length})</SectionLabel>
            </RefinedHeaderStrip>
          ) : (
            <SectionLabel color={C.rd} style={{ marginBottom: 8, fontSize: C.alertLabelSize }}>{`🔻 Dropout Risk — 14+ days (${dropoutRisk.length})`}</SectionLabel>
          )}
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
      )}

      {/* Payment summary */}
      {totalAllPaid>0&&<div style={{marginTop:24,display:'flex',justifyContent:'center'}}>
        <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:"14px 20px",maxWidth:300,textAlign:'center'}}>
          <div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700,marginBottom:4}}>Total Collected (All Time)</div>
          <div style={{fontSize:18,fontWeight:700,fontFamily:FN,color:C.ac}}>₪{totalAllPaid.toLocaleString()}</div>
        </div>
      </div>}
    </div>
  );
}
