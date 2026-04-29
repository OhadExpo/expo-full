import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { C, FN, FB, EXPO_ICON } from './theme';
import { Badge, baseInput } from './ui';
import { traineeIdsFor } from './traineeUtils';
import { supabase } from './supabase';
import { WhatsAppCheckInButton, normalizePhoneIL } from './whatsappButton';

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

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Active Clients', value: active, total: trainees.filter(t=>t.status!=='Archived').length, color: C.gn },
          { label: 'Low Sessions', value: lowSessions, color: lowSessions > 0 ? C.or : C.gn },
          { label: 'Estimated Monthly', value: `₪${monthlyRate.toLocaleString()}`, color: C.ac },
          { label: 'Collected This Month', value: `₪${thisMonthPaid.toLocaleString()}`, sub: revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta}% vs last month` : null, subColor: revDelta >= 0 ? C.gn : C.rd, color: thisMonthPaid>0?C.gn:C.td },
        ].map((s, i) => (
          <div key={i} style={{ background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FN, color: s.color }}>{s.value}
              {s.total !== undefined && <span style={{ fontSize: 12, color: C.td, fontWeight: 400 }}> / {s.total}</span>}</div>
            {s.sub && <div style={{ fontSize: 10, fontFamily: FN, color: s.subColor, marginTop: 4 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Alert sections (above table: online + expiring + overdue payments + dormant + leads) */}
      {(onlineNow.length > 0 || expiring.length > 0 || overduePayment.length > 0 || dropoutRisk.length > 0 || (leads && leads.length > 0)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          {onlineNow.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.gn}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.gn, textTransform: 'uppercase', marginBottom: 8 }}>🟢 Online Now ({onlineNow.length})</div>
              {onlineNow.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', color: C.tx, fontSize: 13 }}>
                  <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:C.gn,boxShadow:`0 0 4px ${C.gn}`}} />
                  {t.name}
                </div>
              ))}
            </div>
          )}
          {expiring.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.or}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.or, textTransform: 'uppercase', marginBottom: 8 }}>⚠ Expiring Packages ({expiring.length})</div>
              {expiring.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: C.tx }}>{t.name}</span>
                  <span style={{ fontFamily: FN, fontWeight: 700, color: C.rd, fontSize: 12 }}>{t.sessionsRemaining} LEFT</span>
                </div>
              ))}
            </div>
          )}
          {overduePayment.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.rd}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.rd, textTransform: 'uppercase', marginBottom: 8 }}>💰 Overdue Payment ({overduePayment.length})</div>
              {overduePayment.map(t => (
                <div key={t.id} onClick={() => onSelectTrainee(t.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: C.tx }}>{t.name}</span>
                  <span style={{ fontFamily: FN, color: C.rd, fontSize: 11 }}>{t.neverPaid ? 'Never paid' : `${t.daysOverdue}d overdue`}</span>
                </div>
              ))}
            </div>
          )}
          {leads && leads.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.ac}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.ac, textTransform: 'uppercase', marginBottom: 8 }}>📩 New Leads ({leads.length})</div>
              {leads.map(l => {
                const ageMs = now - new Date(l.created_at);
                const days = Math.floor(ageMs / 86400000);
                const hours = Math.floor(ageMs / 3600000);
                const ago = days >= 1 ? `${days}d` : hours >= 1 ? `${hours}h` : 'just now';
                const mailto = `mailto:${l.email}?subject=${encodeURIComponent('היי מ-EXPO')}&body=${encodeURIComponent('היי, ראיתי שהשארת מייל ב-expo-il.co.il.\n')}`;
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
                    <a href={mailto} style={{ color: C.tx, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${l.context} · ${l.source}`}>{l.email}</a>
                    <span style={{ fontFamily: FN, color: C.td, fontSize: 10 }}>{ago}</span>
                    <button onClick={() => markLeadContacted(l.id)} title="Mark contacted" style={{ background: `${C.gn}20`, border: `1px solid ${C.gn}55`, color: C.gn, borderRadius: 6, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                    <button onClick={() => deleteLead(l.id)} title="Delete" style={{ background: `${C.rd}20`, border: `1px solid ${C.rd}55`, color: C.rd, borderRadius: 6, padding: '4px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
          {dropoutRisk.length > 0 && (
            <div style={{ background: C.sf, border: `1px solid ${C.or}30`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: FN, color: C.or, textTransform: 'uppercase', marginBottom: 8 }}>💤 Dormant ({dropoutRisk.length})</div>
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
        <input placeholder="Filter clients..." value={filter} onChange={e => setFilter(e.target.value)}
          style={{ ...baseInput, maxWidth: 300, paddingLeft: 12, textAlign: 'center' }} />
      </div>

      {/* Client table */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.td }}>No clients yet. Import your trainee list.</div>
      ) : (
        <div style={{ overflowX: 'auto', background: C.sf, border: `0.25px solid ${C.ac}4D`, borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.bd}` }}>
                <SH k="name" label="Client" />
                <SH k="status" label="Status" />
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Format</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Package</th>
                <SH k="sessions" label="Sessions" />
                <SH k="paid" label="Total Paid" />
                <SH k="lastPay" label="Last Payment" />
                <SH k="workouts" label="Workouts" />
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>Programs</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id} onClick={() => onSelectTrainee(t.id)}
                  style={{ borderBottom: `1px solid ${C.bd}`, cursor: 'pointer', transition: 'background 0.1s' }}
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
        <div style={{ marginTop: 20, background: C.sf, border: `1px solid ${C.rd}30`, borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: FN, color: C.rd, textTransform: 'uppercase', marginBottom: 8 }}>🔻 Dropout Risk — 14+ days ({dropoutRisk.length})</div>
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
        <div style={{background:C.sf,border:`0.25px solid ${C.ac}4D`,borderRadius:10,padding:"14px 20px",maxWidth:300,textAlign:'center'}}>
          <div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase",marginBottom:4}}>Total Collected (All Time)</div>
          <div style={{fontSize:18,fontWeight:700,fontFamily:FN,color:C.ac}}>₪{totalAllPaid.toLocaleString()}</div>
        </div>
      </div>}
    </div>
  );
}
